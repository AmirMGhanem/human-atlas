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

- Signing: Codemagic automatic signing (`ios_signing`, `app_store`), driven by the App Store Connect
  API key integration `body-explorer-asc`. No certificates or Xcode on the dev machine.
- Build number: latest TestFlight build + 1, passed as `CURRENT_PROJECT_VERSION` at archive time.
- `APP_STORE_APPLE_ID` = 6823626044 (App Store Connect app record "Body Explorer: 3D Anatomy", SKU bodyexplorer).

## On-device debugging

TestFlight builds set `webContentsDebuggingEnabled` (iOS 16.4+), so Safari's Web Inspector can attach
over USB: iPhone Settings → Safari → Advanced → Web Inspector on; Mac Safari → Develop → [device] → Body Explorer.
Release builds (`CAP_RELEASE=1`) turn it off. A dev stats overlay (fps, frame time, draw calls) is planned
for reading numbers without a Mac attached.

## Rendering (current, inherited from the fork)

- 2,234 meshes, 2,288,268 triangles, packed into 15 binary chunks; merged per (chunk, system) → 69 draw calls.
- Per-part state lives in a float DataTexture (offset xyz + visibility) and a selection texture, sampled in the vertex shader by `partIndex`.
- Picking is CPU raycasting today — to be replaced by GPU id picking.
