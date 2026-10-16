// Refreshes the committed metadata inputs of the asset pipeline. Network access; run by hand, never in CI.
//   node scripts/fetch-metadata.mjs
// Writes:
//   data/bp3d/tables/*.txt   BodyParts3D 4.0 IS-A / PART-OF tables (DBCLS, CC BY 4.0)
//   data/wikidata/fma-latin.tsv  FMA id -> Latin label and TA98 id (Wikidata, CC0)
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const BP3D='https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/';
const TABLES=['isa_parts_list_e.txt','partof_parts_list_e.txt','isa_inclusion_relation_list.txt','partof_inclusion_relation_list.txt','isa_element_parts.txt','partof_element_parts.txt'];
const UA='BodyExplorerAssetPipeline/0.1 (build-time metadata fetch)';

const get=async url=>{const r=await fetch(url,{headers:{'User-Agent':UA,Accept:'text/tab-separated-values,text/plain'}});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.text();};

fs.mkdirSync(new URL('data/bp3d/tables/',root),{recursive:true});
for(const name of TABLES){fs.writeFileSync(new URL(`data/bp3d/tables/${name}`,root),await get(BP3D+name));console.log('bp3d',name);}

// Every Wikidata item carrying an FMA id (P1402), with its Latin label and TA98 id (P1323) when present.
const query='SELECT ?item ?fma ?la ?ta98 WHERE { ?item wdt:P1402 ?fma . OPTIONAL { ?item rdfs:label ?la FILTER(LANG(?la)="la") } OPTIONAL { ?item wdt:P1323 ?ta98 } }';
const tsv=await get('https://query.wikidata.org/sparql?query='+encodeURIComponent(query));
const literal=s=>s?.match(/^"(.*)"(@\w+)?$/)?.[1]??'';
const rows=new Map();
for(const line of tsv.trim().split('\n').slice(1)){
 const [item,fma,la,ta98]=line.split('\t');const latin=literal(la);if(!latin)continue;
 const id='FMA'+literal(fma).replace(/\D/g,'');
 // Keep one row per FMA id: the lowest QID, so reruns are deterministic.
 const qid=item.match(/Q\d+/)[0],prev=rows.get(id);
 if(!prev||+qid.slice(1)<+prev.qid.slice(1))rows.set(id,{qid,latin,ta98:literal(ta98)});
}
const out=['fma\tqid\tlatin\tta98',...[...rows].sort(([a],[b])=>a.localeCompare(b)).map(([id,r])=>`${id}\t${r.qid}\t${r.latin}\t${r.ta98}`)];
fs.mkdirSync(new URL('data/wikidata/',root),{recursive:true});
fs.writeFileSync(new URL('data/wikidata/fma-latin.tsv',root),out.join('\n')+'\n');
console.log('wikidata',rows.size,'FMA ids with Latin labels');
