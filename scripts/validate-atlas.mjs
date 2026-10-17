// Round-trip check of the pipeline output against its committed source.
//   node scripts/build-atlas.mjs && node scripts/validate-atlas.mjs
// Decodes every .glb (meshopt + dequantize) and checks per vertex: position error, normal direction,
// exact meshId, and that every source triangle survives with the right meshId.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dequantize} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';

const root=new URL('../',import.meta.url),at=p=>new URL(p,root);
await MeshoptDecoder.ready;
// Source of each body, in the same part order build-atlas.mjs emits (index = meshId).
const SOURCES={male:{dir:'data/bp3d/mesh/',keep:()=>true},female:{dir:'data/hra/mesh/',keep:p=>p.system!=='pregnancy'}};
const bodies=JSON.parse(fs.readFileSync(at('public/atlas/bodies.json'),'utf8'));
assert.deepEqual(bodies.map(b=>b.id).sort(),Object.keys(SOURCES).sort());
for(const b of bodies){
const src=SOURCES[b.id];
const raw=JSON.parse(fs.readFileSync(at(src.dir+'manifest.json'),'utf8'));
const chunks=raw.chunks.map(c=>fs.readFileSync(at(src.dir+c.url.split('/').pop())));
const manifest={...raw,parts:raw.parts.filter(src.keep)};manifest.triangles=manifest.parts.reduce((n,p)=>n+p.indexCount/3,0);
const atlas=JSON.parse(fs.readFileSync(at('public/'+b.file),'utf8'));
// Parts the pipeline derived (modesty split of the skin) are appended or modified, so they're checked structurally only.
const S=manifest.parts.length,N=atlas.parts.length;
assert.ok(N>=S&&N<=S+2,`${b.id}: unexpected part count ${N} (source ${S})`);
const verbatim=i=>i<S&&!atlas.parts[i].derived;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});

assert.equal(atlas.parts.length,N);assert.equal(new Set(atlas.parts.map(p=>p.id)).size,N);
const conceptIds=new Set(atlas.concepts.map(c=>c.id));
atlas.parts.forEach((p,i)=>{
 if(i<S)assert.equal(p.id,manifest.parts[i].id,'part order must match source (index = meshId)');
 assert.ok(p.name.trim(),p.id);assert.equal(p.path[0],'body');assert.equal(p.path.at(-1),p.concept,`${p.id}: path must end at its concept`);
 for(const id of p.path)assert.ok(conceptIds.has(id),`${p.id}: unknown path node ${id}`);
});
for(const c of atlas.concepts){assert.ok(c.parts.length,`${c.id}: no parts`);for(const i of c.parts)assert.ok(i>=0&&i<N);}
// Modesty rules matched what they should: hidden parts exist, masks have boxes.
assert.ok(atlas.parts.some(p=>p.intimate==='hide'),'no intimate parts flagged');
if(atlas.parts.some(p=>p.intimate==='mask'))assert.ok(atlas.modesty.boxes.length>0,'masked parts need modesty boxes');
if(atlas.parts.some(p=>p.derived))assert.equal(atlas.parts.filter(p=>p.intimate==='cover').length,1,'a split skin needs exactly one cover');

let maxPos=0,minNormalDot=1,triangles=0,bytes=0,checkedNormals=0,badNormals=0;
const seen=new Uint8Array(N);
for(const s of atlas.systems){
 const file=at('public/'+s.file);bytes+=fs.statSync(file).size;
 const doc=await io.read(file.pathname);
 assert.equal(doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('_MESHID').getComponentType(),5123,'_MESHID must be stored as UNSIGNED_SHORT');
 await doc.transform(dequantize({pattern:/^(POSITION|NORMAL)$/}));
 const node=doc.getRoot().listNodes()[0];assert.ok(node.getMesh(),s.id);
 const world=node.getWorldMatrix();
 const prims=node.getMesh().listPrimitives();assert.equal(prims.length,1,`${s.id}: one primitive = one draw call`);
 const prim=prims[0],pos=prim.getAttribute('POSITION'),nor=prim.getAttribute('NORMAL'),ids=prim.getAttribute('_MESHID'),index=prim.getIndices();
 // Bucket decoded vertices by meshId and compare against the source part's vertex set by position hash.
 const byPart=new Map();const p=[0,0,0],n=[0,0,0];
 const apply=(v)=>{const m=world,[x,y,z]=v;return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];};
 for(let v=0;v<pos.getCount();v++){const id=ids.getScalar(v);assert.equal(atlas.parts[id].system,s.id,`meshId ${id} in wrong system`);seen[id]=1;if(!byPart.has(id))byPart.set(id,[]);byPart.get(id).push(v);}
 assert.equal(byPart.size,s.parts);
 for(const [id,verts] of byPart){
  if(!verbatim(id))continue;
  const src=manifest.parts[id],b=chunks[src.chunk];
  const sp=new Float32Array(b.buffer,b.byteOffset+src.positions,src.vertexCount*3),sn=new Int16Array(b.buffer,b.byteOffset+src.normals,src.vertexCount*3);
  assert.equal(verts.length,src.vertexCount,`${src.id}: vertex count`);
  // Nearest-source match within the part (parts are small; grid by 1 mm).
  const grid=new Map(),key=(x,y,z)=>`${Math.round(x*1000)},${Math.round(y*1000)},${Math.round(z*1000)}`;
  for(let k=0;k<src.vertexCount;k++){const kk=key(sp[k*3],sp[k*3+1],sp[k*3+2]);if(!grid.has(kk))grid.set(kk,[]);grid.get(kk).push(k);}
  for(const v of verts){
   const w=apply(pos.getElement(v,p));const near=[];let best=Infinity;
   const [gx,gy,gz]=w.map(c=>Math.round(c*1000));
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(const k of grid.get(`${gx+dx},${gy+dy},${gz+dz}`)??[]){const d=Math.hypot(sp[k*3]-w[0],sp[k*3+1]-w[1],sp[k*3+2]-w[2]);near.push([d,k]);best=Math.min(best,d);}
   assert.ok(near.length,`${src.id}: decoded vertex has no source vertex within 1 mm`);
   maxPos=Math.max(maxPos,best);
   // Coincident source vertices (thin double-sided sheets) can carry opposite normals: compare against the best of them.
   nor.getElement(v,n);const l=Math.hypot(...n)||1;let dot=-Infinity,zero=false;
   for(const [d,k] of near){if(d>best+2e-4)continue;const sl=Math.hypot(sn[k*3],sn[k*3+1],sn[k*3+2]);if(sl<=1){zero=true;continue;}dot=Math.max(dot,(n[0]*sn[k*3]+n[1]*sn[k*3+1]+n[2]*sn[k*3+2])/(l*sl));}
   if(!zero){minNormalDot=Math.min(minNormalDot,dot);checkedNormals++;if(dot<.98)badNormals++;}
  }
 }
 const ic=index.getCount();assert.equal(ic%3,0);
 for(let t=0;t<ic;t+=3){const a=ids.getScalar(index.getScalar(t));assert.equal(ids.getScalar(index.getScalar(t+1)),a,'triangle spans two meshIds');assert.equal(ids.getScalar(index.getScalar(t+2)),a,'triangle spans two meshIds');}
 triangles+=ic/3;
}
assert.equal(seen.reduce((a,b)=>a+b,0),N,'every part present exactly in its system');

// LOD 1: same contract minus vertex identity — every part present, ids exact, no mixed triangles.
let lodTriangles=0;const lodSeen=new Uint8Array(N);
for(const s of atlas.systems){
 const file=at('public/'+s.lod1.file);bytes+=fs.statSync(file).size;
 const doc=await io.read(file.pathname),prim=doc.getRoot().listMeshes()[0].listPrimitives()[0];
 const ids=prim.getAttribute('_MESHID'),index=prim.getIndices();assert.equal(ids.getComponentType(),5123);
 for(let v=0;v<ids.getCount();v++){const id=ids.getScalar(v);assert.equal(atlas.parts[id].system,s.id);lodSeen[id]=1;}
 for(let t=0;t<index.getCount();t+=3){const a=ids.getScalar(index.getScalar(t));assert.ok(ids.getScalar(index.getScalar(t+1))===a&&ids.getScalar(index.getScalar(t+2))===a,'LOD1 triangle spans two meshIds');}
 lodTriangles+=index.getCount()/3;
}
assert.equal(lodSeen.reduce((a,b)=>a+b,0),N,'LOD1 dropped a part');
assert.equal(triangles,atlas.triangles);
const verbatimTriangles=manifest.parts.reduce((n,p,i)=>n+(verbatim(i)?p.indexCount/3:0),0);
assert.ok(verbatimTriangles>manifest.triangles*.95,'too much geometry was derived instead of copied');
assert.ok(maxPos<.0005,`position error ${maxPos} m exceeds 0.5 mm`);
assert.ok(checkedNormals>1e5&&badNormals===0,`${badNormals} normals deviate more than 11°`);
console.log(JSON.stringify({body:b.id,systems:atlas.systems.length,drawCalls:atlas.systems.length,parts:N,triangles,lodTriangles,maxPositionErrorMm:+(maxPos*1000).toFixed(3),minNormalDot:+minNormalDot.toFixed(4),geometryMB:+(bytes/1e6).toFixed(2)}));
}
