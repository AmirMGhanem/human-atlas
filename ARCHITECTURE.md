# Architecture — Body Explorer

Living document — updated as each piece lands.

## Shape

- **Web app**: Vite + React 19 + TypeScript + three.js 0.159, entry `web/main.tsx` → `app/page.tsx`.
- **Native shell**: Capacitor 8, iOS only (`ios/`), iPhone + iPad (`TARGETED_DEVICE_FAMILY = 1,2`), iOS 15+.
  - Swift Package Manager, not CocoaPods. `cap sync ios` runs locally without Xcode.
  - Offline-only: `capacitor.config.ts` has no `server.url`; the WebView loads bundled `dist/` from `capacitor://localhost`.
- **State**: Zustand (selection, layers) — being introduced.

## Local commands

```sh
nvm use            # Node 22 (.nvmrc); Capacitor 8 CLI requires >= 22
npm ci
npm run build && npx cap sync ios
```

## CI / TestFlight (Codemagic)

`codemagic.yaml`, workflow `ios-testflight`: `npm ci` → `npm run build` → `cap sync ios` →
`xcode-project use-profiles` → `xcode-project build-ipa` → publish to TestFlight.

- Signing: `ios_signing` (`app_store`) picks identities from Codemagic → Team settings → codemagic.yaml settings →
  Code signing identities: certificate "Apple Distribution: Amir Ghanem (P99B8PPLB7)" (.p12) and its app_store profile for
  com.burrowcode.bodyexplorer, both expiring 2027-10-16. Renew both before then. Publishing uses the App Store
  Connect API key integration `burrowcode` (key X47F4HH3N7). No Xcode on the dev machine.
- Build number: latest TestFlight build + 1, passed as `CURRENT_PROJECT_VERSION` at archive time.
- `APP_STORE_APPLE_ID` = 6823626044 (App Store Connect app record "Body Explorer: 3D Anatomy", SKU bodyexplorer).

## On-device debugging

TestFlight builds set `webContentsDebuggingEnabled` (iOS 16.4+), so Safari's Web Inspector can attach
over USB: iPhone Settings → Safari → Advanced → Web Inspector on; Mac Safari → Develop → [device] → Body Explorer.
Release builds (`CAP_RELEASE=1`) turn it off. A dev stats overlay (fps, frame time, draw calls) is planned
for reading numbers without a Mac attached.

## Asset pipeline

```
data/bp3d/mesh/        manifest.json + body-*.bin   committed source geometry (BodyParts3D 4.0, simplified per structure)
data/bp3d/tables/      IS-A / PART-OF tables          committed, from DBCLS (scripts/fetch-metadata.mjs)
data/wikidata/         fma-latin.tsv                  committed, Latin labels by FMA id (scripts/fetch-metadata.mjs)
        │
        ▼  scripts/build-atlas.mjs   (offline, deterministic, ~3 s; runs inside `npm run build`, so in CI too)
public/atlas/          <system>.glb ×15 + atlas.json  generated, gitignored, bundled into the app
        │
        ▼  scripts/validate-atlas.mjs  (decodes every .glb and compares against the source)
```

- **One merged mesh per system → 15 draw calls** (the fork drew 69). Each system's geometry is one glTF
  primitive with `POSITION`, `NORMAL` and `_MESHID`.
- **`_MESHID`** is a per-vertex `UNSIGNED_SHORT` holding the global part index (0–2233, the order of
  `atlas.parts`). It's what GPU picking renders and what the per-part state textures are indexed by.
- **Compression**: `reorder` (meshopt vertex cache), `KHR_mesh_quantization` (14-bit positions, 10-bit normals;
  `_MESHID` excluded), then `EXT_meshopt_compression` with filters. Decoded at runtime by three.js's bundled
  `MeshoptDecoder`, so the app gains no new runtime dependency. `@gltf-transform/*` is dev-only.
- **Measured** (validate-atlas): 2,288,268 triangles, 1,782,519 vertices, max position error 0.104 mm, normals within
  1.2°, no triangle spans two meshIds, **13.0 MB of geometry** + 1.1 MB metadata (the fork shipped 31 MB gzip + 59 MB raw).
- **Hierarchy** (`part.path`, root → leaf concept ids): PART-OF (spatial) chain when the concept is in that tree
  (1,257 parts); otherwise `Body → System → IS-A tail`, keeping only IS-A ancestors that sit in one system and cover
  at most half of it (drops "anatomical entity … organ region"). Synthetic concepts `body` and `system:<id>`.
- **Latin** (`concept.latin`): Wikidata `rdfs:label@la` by FMA id (P1402). Terminologia Anatomica terms are
  unsided, so a "left X"/"right X" concept inherits the Latin of its IS-A parent "X" — only across that
  pure laterality step. Covers 960 / 2,234 parts (muscles 71%, arteries 43%, bones 35%). No Latin is invented.
- **Regenerating from raw BodyParts3D OBJ** (optional, upstream path): `scripts/convert-anatomy.py` →
  `scripts/optimize-anatomy.mjs` rewrite `data/bp3d/mesh/`. They need the DBCLS OBJ archive plus the concept and
  system maps used by the original fork, which were never committed upstream.

## Rendering

- `app/viewer.ts` (no React): one `THREE.Mesh` per system per LOD, all sharing one material per system.
- **Part state** is an RGBA8 `DataTexture`, 4096×1, indexed by meshId: R = visibility, G = selected. Shaders read
  it in the vertex stage via `_meshid`. A system whose parts are all hidden is skipped entirely (`mesh.visible = false`),
  so hidden layers cost no draw calls. Three.js would otherwise draw a transparent double-sided mesh twice.
- **LOD**: LOD 0 loads first; LOD 1 (`<system>.lod1.glb`, 934k triangles, each part simplified separately with a 1% error bound)
  streams in after first paint. Mode `auto` draws LOD 1 while the camera moves (and up to 120 ms after it settles),
  LOD 0 at rest. Picking always uses LOD 0.
- **GPU picking** (`app/picker.ts`): a second scene re-uses the same geometries with a flat id shader
  (meshId + 1 packed into R/G; parts with visibility < 0.5 discard). On tap, `camera.setViewOffset` narrows the frustum to a
  9×9 CSS-pixel patch around the finger, which renders into a 9×9 target. `readRenderTargetPixels` returns the id nearest the centre
  (fat-finger tolerance). No CPU raycasting. Measured in desktop Chrome: ~4 ms including readback.
- Rendering is on demand (dirty flag), except while spinning.

## Selection, dimming and layers

- **State** (`app/store.ts`, Zustand): layer state per group (`on` | `faded` | `off`), isolated group, selection
  (`concept` + the hierarchy `path` it was reached by), UI insets, and frame/reset nonces. `app/page.tsx` pushes the store
  into the viewer; the viewer never reads the store.
- **Layer groups** (peel order): Skin, Muscles, Arteries, Veins, Nerves, Bones, Ligaments & cartilage, Organs (8 organ systems).
  Tap: on ↔ faded (14% opacity, not tappable, so taps reach what's behind it). Long-press: isolate (others off). Skin starts off.
- **Part state texture** channels: R visible · G selected · B opacity · A pickable.
- **Selecting** a structure selects its concept (all its meshes). Everything else visible drops to 35% opacity but stays tappable,
  so you can hop between neighbours. The selection turns cyan (`--accent`) with a cyan Fresnel rim.
- **Translucency without sorting**: per system, opaque parts draw in the normal pass (discarding translucent ones). Translucent
  parts draw twice on LOD 1: a depth-only pre-pass, then colour with `depthFunc: LessEqual`, so only the nearest translucent
  surface blends once. Merged meshes can't be depth-sorted, and this avoids the smeared look of unsorted transparency. A system with
  nothing in a pass skips it (draw calls range from 14 at rest to about 29 with a selection).
- **Hierarchy navigation**: the breadcrumb, "Part of", "Includes", "Step out" and two-finger double-tap all select a concept
  along the path. Selecting the root resets the view.

## Camera (`app/camera-rig.ts`)

Replaces OrbitControls. Pose = target + yaw/pitch/distance.
- Touch: 1 finger orbits (with momentum), 2 fingers pan + pinch-zoom about the fingers, tap selects, double-tap resets,
  two-finger double-tap steps out one hierarchy level.
- Mouse: drag orbits, right/shift-drag pans, wheel zooms at the cursor. Trackpad: two-finger scroll pans, pinch zooms
  (ctrl+wheel; Safari `gesture*` events).
- Limits (pitch ±83°, distance, target box = body bounds + 15 cm) are rubber-banded: resisted past the edge, then sprung back.
- `flyTo`: 450 ms ease-out cubic, distance interpolated in log space. `fit` frames a bounding sphere inside the area not covered
  by panels, and `setViewOffset` shifts the projection centre into that area (the picker composes with that offset).

## Bodies, modesty and settings

- **Two bodies**, built by `scripts/build-atlas.mjs` into `public/atlas/<body>/` plus `public/atlas/bodies.json`:
  - `male`: BodyParts3D 4.0. 2,236 parts (2,234 source plus 2 modesty parts), 2.29M triangles, 19.8 MB with LOD.
  - `female`: HRA 3D Reference Organ Set for Female v1.5. 882 parts (880 source, pregnancy excluded, plus 2), 1.77M triangles,
    9.9 MB with LOD. The hierarchy comes from HRA concept containment (parent = next concept in (size, id) order that contains it).
    Unnamed meshes are named from their ids (`Allen_head_of_caudate_L` → "Left head of caudate"). Latin comes from Wikidata via
    UBERON (P1554) or FMA. Skeleton and muscle coverage is partial in the source data.
- **Modesty** (`part.intimate`), default on (`settings.showIntimate = false`):
  - `hide`: external genitalia (male: penis corpora, glans, testes, epididymides, penile dorsal vessels, pubic hair, which is a ring
    around the penis base). Never drawn or tappable while hidden, even inside a selection.
  - `mask`: tubes that run out of the body (male urethra, deferent ducts, testicular vessels). Fragments inside
    `atlas.modesty.boxes` are discarded in every pass, including picking.
  - Skin split (pipeline): the skin triangles in the genital region (male: an ellipsoid around the genitalia; female: a box over
    the vulva) become a `hide` part. The opening is spanned by a generated `cover` part: R=10 concentric rings from the boundary
    loop, Laplacian-relaxed with the loop fixed, plus boundary normals taken from the skin. A `cover` part shows only while intimate
    anatomy is hidden. BodyParts3D's male skin is double-layered there, so only the largest loop (and loops > 3 cm from it) is covered.
- **Settings** (`store.settings`, persisted to localStorage by Zustand `persist`): body, showIntimate, showLatin, haptics,
  motion (system/reduce/full → camera animation 0 ms and no momentum when reduced), quality (high/balanced/battery → DPR 3/2/1.5;
  battery forces LOD 1). Settings sheet (gear, top-right) and Credits & Licenses sheet: `app/ui/SettingsSheet.tsx`, `app/ui/CreditsSheet.tsx`.
- **Credits**: data sources with verbatim credit strings in `app/credits.ts`. Bundled third-party licences are generated by
  `scripts/build-licenses.mjs` into `public/licenses.json` (runtime dependency tree, 23 packages) during `npm run build`.

## Stats overlay (dev builds)

On by default; `VITE_STATS=0` removes it for release. It shows fps (rendered frames per second), frame-time p50/p95 from rAF
deltas on consecutive rendered frames, JS-side `render()` submit time, draw calls and triangles from `renderer.info`,
DPR, canvas size, cold start (`performance.now()` at first full paint, i.e. since the WebView started loading) and pick time.
Buttons: **Spin** (continuous rendering for sustained fps), **DPR** 1/2/3, **LOD** full/auto/low.
iOS WebKit has no GPU timer queries, so sustained fps while spinning is the number that matters.
