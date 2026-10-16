// Offline, deterministic asset pipeline. Runs locally and in CI from committed inputs only.
//   node scripts/build-atlas.mjs
// Inputs  (committed):
//   data/bp3d/mesh/manifest.json + body-*.bin   BodyParts3D 4.0, simplified per structure (see public/ATTRIBUTION.md)
//   data/bp3d/tables/*.txt                       BodyParts3D IS-A / PART-OF tables
//   data/wikidata/fma-latin.tsv                  Latin labels by FMA id (scripts/fetch-metadata.mjs)
// Outputs (generated, gitignored):
//   public/atlas/<system>.glb   one merged mesh per anatomical system: POSITION, NORMAL, _MESHID (uint16 = part index)
//                               quantized (KHR_mesh_quantization) + EXT_meshopt_compression
//   public/atlas/<system>.lod1.glb  motion fallback, each part simplified independently (same attributes)
//   public/atlas/atlas.json     parts, concepts, hierarchy paths, Latin terms, per-system stats
import fs from 'node:fs';
import {Document,Logger,NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {quantize,reorder} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';

const root=new URL('../',import.meta.url),at=p=>new URL(p,root);
const OUT=at('public/atlas/');
const SYSTEM_NAMES={skeletal:'Skeleton',muscular:'Muscles',cardiac:'Heart',sensory:'Sensory organs',arterial:'Arteries',venous:'Veins',nervous:'Nervous system',respiratory:'Respiratory',digestive:'Digestive',urinary:'Urinary',lymphatic:'Lymphatic',endocrine:'Endocrine',reproductive:'Reproductive',integumentary:'Body surface',connective:'Connective tissue'};

// ---------- inputs ----------
const manifest=JSON.parse(fs.readFileSync(at('data/bp3d/mesh/manifest.json'),'utf8'));
const chunks=manifest.chunks.map(c=>{const b=fs.readFileSync(at('data/bp3d/mesh/'+c.url.split('/').pop()));if(b.length!==c.bytes)throw new Error('chunk size mismatch '+c.url);return b;});
const table=name=>fs.readFileSync(at('data/bp3d/tables/'+name),'utf8').trim().split('\n').slice(1).map(l=>l.replace(/\r$/,'').split('\t'));
const tree=kind=>{const parent=new Map(),name=new Map();for(const [a,an,b,bn] of table(`${kind}_inclusion_relation_list.txt`)){parent.set(b,a);name.set(a,an);name.set(b,bn);}return {parent,name};};
const isa=tree('isa'),partof=tree('partof');
const latinByFma=new Map(fs.readFileSync(at('data/wikidata/fma-latin.tsv'),'utf8').trim().split('\n').slice(1).map(l=>{const [fma,,latin]=l.split('\t');return [fma,latin];}));

const parts=manifest.parts,partIndex=new Map(parts.map((p,i)=>[p.id,i]));
const concepts=new Map(manifest.concepts.map(c=>[c.id,{id:c.id,name:c.name,parts:c.elements.map(e=>partIndex.get(e)).filter(i=>i!==undefined).sort((a,b)=>a-b)}]));

// ---------- Latin ----------
// TA terms are unsided; BodyParts3D meshes are usually "left X"/"right X" under an IS-A parent "X".
// Inherit the parent's Latin only across such pure laterality steps, never across a real generalisation.
const unsided=n=>n.replace(/\b(left|right) /g,'').trim();
const latinFor=id=>{
 let c=id;
 for(let hops=0;hops<4&&c;hops++){
  if(latinByFma.has(c))return latinByFma.get(c);
  const p=isa.parent.get(c);if(!p||unsided(isa.name.get(c)??'')!==isa.name.get(p))return undefined;
  c=p;
 }
};

// ---------- hierarchy ----------
// Breadcrumb root → leaf as concept ids. PART-OF (spatial) when the concept is in that tree; otherwise
// Body → System → the specific tail of its IS-A chain (ancestors spanning one system and at most half of it).
const systemParts=new Map();parts.forEach((p,i)=>{if(!systemParts.has(p.system))systemParts.set(p.system,[]);systemParts.get(p.system).push(i);});
concepts.set('body',{id:'body',name:'Body',parts:parts.map((_,i)=>i)});
for(const [s,list] of systemParts)concepts.set('system:'+s,{id:'system:'+s,name:SYSTEM_NAMES[s],parts:list});
const chain=(t,id)=>{const out=[id];let c=id;while(t.parent.has(c)){c=t.parent.get(c);out.push(c);}return out.reverse();};
const pathFor=p=>{
 if(partof.parent.has(p.conceptId)){const c=chain(partof,p.conceptId);c[0]='body';return c;}
 const limit=systemParts.get(p.system).length*.5;
 const tail=chain(isa,p.conceptId).filter(id=>{const c=concepts.get(id);return c&&c.parts.length<=limit&&c.parts.every(i=>parts[i].system===p.system);});
 if(tail.at(-1)!==p.conceptId)tail.push(p.conceptId);
 return ['body','system:'+p.system,...tail];
};
const paths=parts.map(pathFor);
for(const path of paths)for(const id of path)if(!concepts.has(id))throw new Error('path references unknown concept '+id);

// ---------- geometry ----------
// LOD 0 is the committed source geometry unchanged. LOD 1 is the motion fallback: every part simplified on its own
// (so meshIds survive and no part disappears), drawn only while the camera moves; picking always uses LOD 0.
const LOD1={ratio:.3,error:.01,minIndices:48};
await Promise.all([MeshoptEncoder.ready,MeshoptSimplifier.ready]);
fs.rmSync(OUT,{recursive:true,force:true});fs.mkdirSync(OUT,{recursive:true});
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});

const partGeometry=(i,lod)=>{
 const p=parts[i],b=chunks[p.chunk];
 const position=new Float32Array(b.buffer,b.byteOffset+p.positions,p.vertexCount*3),normal=new Int16Array(b.buffer,b.byteOffset+p.normals,p.vertexCount*3),index=new Uint32Array(b.buffer,b.byteOffset+p.indices,p.indexCount);
 if(lod===0)return {position,normal,index};
 const target=Math.max(LOD1.minIndices,Math.floor(p.indexCount*LOD1.ratio/3)*3);
 const [simplified]=MeshoptSimplifier.simplify(index,position,3,Math.min(index.length,target),LOD1.error);
 const [remap,count]=MeshoptSimplifier.compactMesh(simplified);
 const pos=new Float32Array(count*3),nor=new Int16Array(count*3);
 for(let old=0;old<remap.length;old++){const n=remap[old];if(n===0xffffffff)continue;pos.set(position.subarray(old*3,old*3+3),n*3);nor.set(normal.subarray(old*3,old*3+3),n*3);}
 return {position:pos,normal:nor,index:simplified};
};

const writeSystem=async(system,list,lod)=>{
 const geos=list.map(i=>partGeometry(i,lod));
 let vertices=0,indices=0;for(const g of geos){vertices+=g.position.length/3;indices+=g.index.length;}
 const position=new Float32Array(vertices*3),normal=new Int16Array(vertices*3),meshId=new Uint16Array(vertices),index=new Uint32Array(indices);
 let v=0,x=0;
 geos.forEach((g,k)=>{
  const n=g.position.length/3;position.set(g.position,v*3);normal.set(g.normal,v*3);meshId.fill(list[k],v,v+n);
  for(let j=0;j<g.index.length;j++)index[x+j]=g.index[j]+v;
  v+=n;x+=g.index.length;
 });
 const doc=new Document().setLogger(new Logger(Logger.Verbosity.WARN)),buffer=doc.createBuffer();
 const acc=(type,array,normalized=false)=>doc.createAccessor().setType(type).setArray(array).setNormalized(normalized).setBuffer(buffer);
 const prim=doc.createPrimitive().setAttribute('POSITION',acc('VEC3',position)).setAttribute('NORMAL',acc('VEC3',normal,true)).setAttribute('_MESHID',acc('SCALAR',meshId)).setIndices(acc('SCALAR',index));
 doc.createScene(system).addChild(doc.createNode(system).setMesh(doc.createMesh(system).addPrimitive(prim)));
 await doc.transform(
  reorder({encoder:MeshoptEncoder,target:'size'}),
  // 14-bit positions ≈ 0.1 mm over a 1.8 m body; _MESHID is excluded and stays exact uint16.
  quantize({pattern:/^(POSITION|NORMAL)$/,quantizePosition:14,quantizeNormal:10}),
 );
 doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.FILTER});
 const glb=await io.writeBinary(doc),file=`${system}${lod?'.lod'+lod:''}.glb`;
 fs.writeFileSync(new URL(file,OUT),glb);
 return {file:`atlas/${file}`,triangles:indices/3,vertices,bytes:glb.length};
};

const systems=[];let totalTriangles=0,totalBytes=0,lodTriangles=0;
for(const [system,list] of [...systemParts].sort(([a],[b])=>a.localeCompare(b))){
 if(list.length>65535)throw new Error('meshId exceeds uint16');
 const full=await writeSystem(system,list,0),low=await writeSystem(system,list,1);
 totalTriangles+=full.triangles;lodTriangles+=low.triangles;totalBytes+=full.bytes+low.bytes;
 systems.push({id:system,name:SYSTEM_NAMES[system],file:full.file,parts:list.length,triangles:full.triangles,vertices:full.vertices,bytes:full.bytes,lod1:low});
}

// ---------- metadata ----------
const conceptList=[...concepts.values()].map(c=>{const latin=latinFor(c.id);return latin?{...c,latin}:c;});
const atlas={
 version:manifest.version,
 source:'BodyParts3D 4.0, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
 triangles:totalTriangles,
 systems,
 parts:parts.map((p,i)=>({id:p.id,name:p.name,concept:p.conceptId,system:p.system,bounds:p.bounds,path:paths[i]})),
 concepts:conceptList,
};
fs.writeFileSync(new URL('atlas.json',OUT),JSON.stringify(atlas));
const metaBytes=fs.statSync(new URL('atlas.json',OUT)).size;
const latinParts=parts.filter(p=>latinFor(p.conceptId)).length;
console.log(JSON.stringify({systems:systems.length,parts:parts.length,concepts:conceptList.length,triangles:totalTriangles,lod1Triangles:lodTriangles,glbMB:+(totalBytes/1e6).toFixed(2),metaMB:+(metaBytes/1e6).toFixed(2),latinParts,partofPaths:paths.filter(p=>!p[1].startsWith('system:')).length},null,1));
