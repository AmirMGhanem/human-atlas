# Anatomy data attribution

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.

- License: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html (updated 2025-02-27)
- Dataset: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- License terms: https://creativecommons.org/licenses/by/4.0/
- Source geometry: `isa_BP3D_4.0_obj_99.zip`, BodyParts3D 4.0.
- English names and relationships: IS-A and PART-OF concept, element, and inclusion tables from the same archive.
- Publication: Mitsuhashi et al. (2009), BodyParts3D: 3D structure database for anatomical concepts. https://doi.org/10.1093/nar/gkn613

Adaptations: axes and units converted from millimeters/Z-up to meters/Y-up; translated to rest at the stage; geometry simplified using meshoptimizer with 0.2% relative error limit per structure; normals quantized to signed 16-bit; packed into binary chunks; curated display system groupings and colors. The source contains 2,234 individual OBJ meshes; all remain represented. The combined hierarchy contains 3,432 named FMA concepts, which may reference multiple meshes. Original source identity is preserved in the manifest.

Source OBJ comments mention an older CC BY-SA 2.1 Japan license. The official current database license linked above supersedes that legacy text and explicitly permits redistribution and adaptation under CC BY 4.0.

BodyParts3D represents an adult male reference anatomy based on TARO MRI and anatomical illustration refinements. It is not a complete model of every possible human anatomical structure or variation. This interface is educational and is not a clinical tool.

## Body Explorer adaptations and additional sources

- Hierarchy: BodyParts3D 4.0 IS-A and PART-OF inclusion tables (`isa_inclusion_relation_list.txt`, `partof_inclusion_relation_list.txt` and related tables), same source and CC BY 4.0 license as above: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- Latin anatomical terms: Wikidata (https://www.wikidata.org), Latin labels of items linked by Foundational Model of Anatomy ID (P1402). Wikidata structured data is CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
- Further adaptations: meshes merged into one mesh per display system with a per-vertex structure index; positions quantized to 14 bits and normals to 10 bits; geometry compressed with meshoptimizer (EXT_meshopt_compression). Every one of the 2,234 source meshes remains individually represented.

## Female reference anatomy (included)

The female model is: Kristen Browne and Heidi Schlehlein, Human Reference Atlas / HuBMAP, *3D Reference Organ Set for Female v1.5* (2023). CC BY 4.0. Geometry adapted for this app.

- Source DOI: https://doi.org/10.48539/HBM352.BTSQ.586
- Dataset: https://lod.humanatlas.io/ref-organ/united-female/v1.5
- Original GLB: https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.5/assets/3d-vh-f-united.glb
- License: https://creativecommons.org/licenses/by/4.0/

Adaptations: translated native meter/Y-up coordinates onto the stage; coincident vertices welded and source normals averaged; geometry simplified with a 0.2% per-structure relative error bound (plus a lighter motion level of detail); normals quantized; merged per display system with a per-vertex structure index; quantized and compressed with meshoptimizer. Colors and display systems are curated for this app. 880 of the 888 source meshes are represented. The eight placenta and umbilical structures (pregnancy reference) are not included. Unnamed source meshes are labelled from their source identifiers. This is a reference assembly with partial skeleton and muscle coverage, not a single-person scan.

## Modesty adaptation (both models)

By default the app hides external genitalia. For this, the skin mesh of each model is split: the external-genital region becomes its own structure, and a smooth generated surface spanning the opening is shown in its place. The original geometry is kept unchanged and shown when the user turns on "Show intimate anatomy".
