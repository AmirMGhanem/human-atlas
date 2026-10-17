// Refreshes the committed metadata inputs of the asset pipeline. Network access; run by hand, never in CI.
//   node scripts/fetch-metadata.mjs
// Writes:
//   data/bp3d/tables/*.txt   BodyParts3D 4.0 IS-A / PART-OF tables (DBCLS, CC BY 4.0)
//   data/wikidata/fma-latin.tsv     FMA id -> Latin label and TA98 id (Wikidata, CC0)
//   data/wikidata/uberon-latin.tsv  UBERON id -> Latin label (Wikidata, CC0), for the HRA female model
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const BP3D='https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/';
const TABLES=['isa_parts_list_e.txt','partof_parts_list_e.txt','isa_inclusion_relation_list.txt','partof_inclusion_relation_list.txt','isa_element_parts.txt','partof_element_parts.txt'];
const UA='BodyExplorerAssetPipeline/0.1 (build-time metadata fetch)';

const get=async url=>{const r=await fetch(url,{headers:{'User-Agent':UA,Accept:'text/tab-separated-values,text/plain'}});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.text();};

fs.mkdirSync(new URL('data/bp3d/tables/',root),{recursive:true});
for(const name of TABLES){fs.writeFileSync(new URL(`data/bp3d/tables/${name}`,root),await get(BP3D+name));console.log('bp3d',name);}

const literal=s=>s?.match(/^"(.*)"(@\w+)?$/)?.[1]??'';
/** Items carrying `property`, with their Latin label: one row per id (lowest QID wins, so reruns are deterministic). */
async function latinBy(property,prefix,file){
 const query=`SELECT ?item ?id ?la ?ta98 WHERE { ?item wdt:${property} ?id . OPTIONAL { ?item rdfs:label ?la FILTER(LANG(?la)="la") } OPTIONAL { ?item wdt:P1323 ?ta98 } }`;
 const tsv=await get('https://query.wikidata.org/sparql?query='+encodeURIComponent(query));
 const rows=new Map();
 for(const line of tsv.trim().split('\n').slice(1)){
  const [item,raw,la,ta98]=line.split('\t');const latin=literal(la);if(!latin)continue;
  const id=prefix+literal(raw).replace(/\D/g,'');
  const qid=item.match(/Q\d+/)[0],prev=rows.get(id);
  if(!prev||+qid.slice(1)<+prev.qid.slice(1))rows.set(id,{qid,latin,ta98:literal(ta98)});
 }
 const out=[`${prefix.replace(':','').toLowerCase()||'fma'}\tqid\tlatin\tta98`,...[...rows].sort(([a],[b])=>a.localeCompare(b)).map(([id,r])=>`${id}\t${r.qid}\t${r.latin}\t${r.ta98}`)];
 fs.mkdirSync(new URL('data/wikidata/',root),{recursive:true});
 fs.writeFileSync(new URL(`data/wikidata/${file}`,root),out.join('\n')+'\n');
 console.log('wikidata',file,rows.size,'ids with Latin labels');
}
// FMA ids are stored as bare numbers on Wikidata (P1402); UBERON ids as 7-digit numbers (P1554).
await latinBy('P1402','FMA','fma-latin.tsv');
await latinBy('P1554','UBERON:','uberon-latin.tsv');
