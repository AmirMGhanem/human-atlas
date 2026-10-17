// Data sources shown in Settings → Credits & Licenses. Credit strings are verbatim from the licensors; do not edit them.
// Software licences come from public/licenses.json, generated at build time by scripts/build-licenses.mjs.

export interface DataSource {
 id:string;
 title:string;
 /** Required attribution, verbatim. */
 credit:string;
 license:string;licenseUrl:string;
 url:string;
 usedFor:string;
 /** What we changed (CC BY requires indicating changes). */
 changes?:string;
}

export const DATA_SOURCES:DataSource[]=[
 {
  id:'bp3d',title:'BodyParts3D 4.0',
  credit:'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
  license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
  url:'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/',
  usedFor:'Male model geometry, English names and the IS-A / PART-OF hierarchy. Mitsuhashi et al. (2009), Nucleic Acids Research, doi:10.1093/nar/gkn613.',
  changes:'Converted to meters / Y-up; simplified with meshoptimizer (0.2% error per structure, plus a lighter motion level of detail); merged into one mesh per system with a per-vertex structure index; quantized and compressed. Display systems and colors curated for this app.',
 },
 {
  id:'hra-female',title:'Human Reference Atlas — 3D Reference Organ Set for Female v1.5',
  credit:'Kristen Browne and Heidi Schlehlein, Human Reference Atlas / HuBMAP, 3D Reference Organ Set for Female v1.5 (2023). CC BY 4.0.',
  license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
  url:'https://doi.org/10.48539/HBM352.BTSQ.586',
  usedFor:'Female model geometry and names. The source set has partial skeleton and muscle coverage.',
  changes:'Coincident vertices welded; simplified with meshoptimizer (0.2% error per structure, plus a motion level of detail); merged per system with a per-vertex structure index; quantized and compressed. Pregnancy reference structures are not included.',
 },
 {
  id:'wikidata',title:'Wikidata',
  credit:'Latin anatomical terms from Wikidata (wikidata.org), linked by FMA and UBERON identifiers.',
  license:'CC0 1.0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',
  url:'https://www.wikidata.org',
  usedFor:'Latin terms shown under structure names.',
 },
 {
  id:'human-atlas',title:'Human Atlas (upstream project)',
  credit:'Copyright (c) 2026 ashemag',
  license:'MIT',licenseUrl:'https://github.com/ashemag/human-atlas/blob/main/LICENSE',
  url:'https://github.com/ashemag/human-atlas',
  usedFor:'Original viewer this app was built from.',
 },
];
