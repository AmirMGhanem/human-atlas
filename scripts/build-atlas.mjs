// Offline, deterministic asset pipeline. Runs locally and in CI from committed inputs only.
//   node scripts/build-atlas.mjs
// Two bodies, each an adapter that yields parts (+ source geometry), concepts, hierarchy paths, Latin and modesty rules:
//   male    data/bp3d/mesh (BodyParts3D 4.0) + data/bp3d/tables (IS-A / PART-OF) + data/wikidata/fma-latin.tsv
//   female  data/hra/mesh (HRA 3D Reference Organ Set for Female v1.5) + data/wikidata/{uberon,fma}-latin.tsv
// Outputs (generated, gitignored), per body in public/atlas/<body>/:
//   <system>.glb       one merged mesh per anatomical system: POSITION, NORMAL, _MESHID (uint16 = part index)
//                      quantized (KHR_mesh_quantization) + EXT_meshopt_compression
//   <system>.lod1.glb  motion fallback, each part simplified independently (same attributes)
//   atlas.json         parts, concepts, hierarchy paths, Latin terms, modesty rules, per-system stats
import fs from 'node:fs';
import {Document,Logger,NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {quantize,reorder} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';

const root=new URL('../',import.meta.url),at=p=>new URL(p,root);
const SYSTEM_NAMES={skeletal:'Skeleton',muscular:'Muscles',cardiac:'Heart',sensory:'Sensory organs',arterial:'Arteries',venous:'Veins',nervous:'Nervous system',respiratory:'Respiratory',digestive:'Digestive',urinary:'Urinary',lymphatic:'Lymphatic',endocrine:'Endocrine',reproductive:'Reproductive',integumentary:'Body surface',connective:'Connective tissue'};
const readChunks=(dir,manifest)=>manifest.chunks.map(c=>{const b=fs.readFileSync(at(dir+c.url.split('/').pop()));if(b.length!==c.bytes)throw new Error('chunk size mismatch '+c.url);return b;});
const latinTable=file=>new Map(fs.readFileSync(at('data/wikidata/'+file),'utf8').trim().split('\n').slice(1).map(l=>{const [id,,latin]=l.split('\t');return [id,latin];}));
const latinByFma=latinTable('fma-latin.tsv'),latinByUberon=latinTable('uberon-latin.tsv');

// Modesty: `hide` parts are external genitalia (and nipples on the female model), removed entirely unless the user
// opts in. `mask` parts are single meshes that pass through that region (skin, urethra, ducts, vessels): only their
// fragments inside `boxes` are discarded. Boxes are world-space [min,max], in meters, Y up, +Z forward.

// ---------- male: BodyParts3D ----------
function bodyParts3D(){
 const manifest=JSON.parse(fs.readFileSync(at('data/bp3d/mesh/manifest.json'),'utf8'));
 const chunks=readChunks('data/bp3d/mesh/',manifest);
 const table=name=>fs.readFileSync(at('data/bp3d/tables/'+name),'utf8').trim().split('\n').slice(1).map(l=>l.replace(/\r$/,'').split('\t'));
 const tree=kind=>{const parent=new Map(),name=new Map();for(const [a,an,b,bn] of table(`${kind}_inclusion_relation_list.txt`)){parent.set(b,a);name.set(a,an);name.set(b,bn);}return {parent,name};};
 const isa=tree('isa'),partof=tree('partof');
 const parts=manifest.parts.map(p=>({...p,concept:p.conceptId,source:chunks[p.chunk]})),partIndex=new Map(parts.map((p,i)=>[p.id,i]));
 const concepts=new Map(manifest.concepts.map(c=>[c.id,{id:c.id,name:c.name,parts:c.elements.map(e=>partIndex.get(e)).filter(i=>i!==undefined).sort((a,b)=>a-b)}]));

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

 // Breadcrumb root → leaf as concept ids. PART-OF (spatial) when the concept is in that tree; otherwise
 // Body → System → the specific tail of its IS-A chain (ancestors spanning one system and at most half of it).
 const systemParts=groupBySystem(parts);
 concepts.set('body',{id:'body',name:'Body',parts:parts.map((_,i)=>i)});
 for(const [s,list] of systemParts)concepts.set('system:'+s,{id:'system:'+s,name:SYSTEM_NAMES[s],parts:list});
 const chain=(t,id)=>{const out=[id];let c=id;while(t.parent.has(c)){c=t.parent.get(c);out.push(c);}return out.reverse();};
 const paths=parts.map(p=>{
  if(partof.parent.has(p.concept)){const c=chain(partof,p.concept);c[0]='body';return c;}
  const limit=systemParts.get(p.system).length*.5;
  const tail=chain(isa,p.concept).filter(id=>{const c=concepts.get(id);return c&&c.parts.length<=limit&&c.parts.every(i=>parts[i].system===p.system);});
  if(tail.at(-1)!==p.concept)tail.push(p.concept);
  return ['body','system:'+p.system,...tail];
 });
 return {
  id:'male',version:manifest.version,
  source:'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
  parts,concepts,paths,latinFor,
  modesty:{
   // Pubic hair is a ring around the base of the penis: with the penis hidden its hole shows, so it goes too.
   hide:/^(corpus cavernosum of penis|corpus spongiosum of penis|glans penis|(left |right )?(testis|epididymis)|.*dorsal (artery|vein) of penis|pubic hair)$/i,
   // Tubes that run from inside the body into the genitals: only their external stretch is clipped.
   mask:/^(urethra|(left |right )?(deferent duct|testicular artery|testicular vein))$/i,
   boxes:[[[-.045,.755,.03],[.045,.875,.125]]],
   // Penile and scrotal skin: an ellipsoid around the external genitalia (from the measured part bounds: penis tip
   // z≈.10, scrotum bottom y≈.768). A smooth region cuts both skin layers cleanly; a distance test gave jagged edges.
   skin:{name:'Skin',label:'Skin of external genitalia',select:()=>c=>((c[0])/.05)**2+((c[1]-.815)/.064)**2+((c[2]-.058)/.062)**2<=1},
  },
 };
}

// ---------- female: HRA 3D Reference Organ Set ----------
function hraFemale(){
 const manifest=JSON.parse(fs.readFileSync(at('data/hra/mesh/manifest.json'),'utf8'));
 const chunks=readChunks('data/hra/mesh/',manifest);
 // Pregnancy reference structures (placenta, umbilical cord) are not part of a non-pregnant reference body.
 const kept=manifest.parts.filter(p=>p.system!=='pregnancy');
 // 210 source meshes are unnamed ("-"); their ids are descriptive (Allen_head_of_caudate_L → Left head of caudate).
 const humanize=id=>{
  let s=id.replace(/^HRA:/,'').replace(/^(VH_F_|Allen_)/,'');const side=/_L$/.test(s)?'Left ':/_R$/.test(s)?'Right ':'';
  s=s.replace(/_[LR]$/,'').replace(/_/g,' ').trim();return side?side+s:s.charAt(0).toUpperCase()+s.slice(1);
 };
 const named=(name,id)=>name&&name.trim()!=='-'?name:humanize(id);
 const partIndex=new Map(kept.map((p,i)=>[p.id,i]));
 // HRA concepts nest by containment. Each part's own concept is the single-element concept holding just it.
 const raw=manifest.concepts.map(c=>({id:c.id,name:c.id==='HRA:VH_F'?'Body':named(c.name,c.id),parts:c.elements.map(e=>partIndex.get(e)).filter(i=>i!==undefined).sort((a,b)=>a-b)})).filter(c=>c.parts.length);
 const own=new Map();for(const c of raw)if(c.parts.length===1&&!own.has(c.parts[0]))own.set(c.parts[0],c.id);
 const parts=kept.map((p,i)=>({...p,name:named(p.name,p.id),concept:own.get(i)??`part:${p.id}`,source:chunks[p.chunk],sourceConcept:p.conceptId}));
 for(const [i,p] of parts.entries())if(!own.has(i))raw.push({id:p.concept,name:p.name,parts:[i]});
 // Parent = the next concept in (size, id) order whose part set contains this one: deterministic and acyclic.
 const order=[...raw].sort((a,b)=>a.parts.length-b.parts.length||a.id.localeCompare(b.id)),sets=new Map(raw.map(c=>[c.id,new Set(c.parts)]));
 const parent=new Map();
 order.forEach((c,k)=>{for(let j=k+1;j<order.length;j++){const s=sets.get(order[j].id);if(c.parts.every(x=>s.has(x))){parent.set(c.id,order[j].id);break;}}});
 const concepts=new Map(raw.map(c=>[c.id==='HRA:VH_F'?'body':c.id,{...c,id:c.id==='HRA:VH_F'?'body':c.id}]));
 const paths=parts.map(p=>{const out=[p.concept];let c=p.concept;while(parent.has(c)){c=parent.get(c);out.push(c==='HRA:VH_F'?'body':c);}return out.reverse();});
 const sourceLatin=new Map(parts.map(p=>[p.concept,p.sourceConcept]));
 const latinFor=id=>{const src=sourceLatin.get(id);if(!src)return;return src.startsWith('UBERON:')?latinByUberon.get(src):src.startsWith('FMA')?latinByFma.get(src.replace(':','')):undefined;};
 return {
  id:'female',version:manifest.version,
  // Verified against the source: no skull, ribs, sternum, arm or hand bones; muscles = 12 extra-ocular + both rectus
  // femoris (+ tendons); no connective tissue at all. The UI labels these layers as partial (empty layers are hidden).
  partial:['skeletal','muscular'],
  source:'Kristen Browne and Heidi Schlehlein, Human Reference Atlas / HuBMAP, 3D Reference Organ Set for Female v1.5 (2023). CC BY 4.0.',
  parts,concepts,paths,latinFor,
  modesty:{
   // The HRA female set has no separate external genital meshes: the vulva is part of the skin (split below).
   hide:/^$/,
   mask:/^$/,
   boxes:[],
   skin:{name:'skin of body',label:'Skin of external genitalia',select:()=>c=>c[0]>-.05&&c[0]<.03&&c[1]>.69&&c[1]<.785&&c[2]>-.115&&c[2]<-.015},
  },
 };
}

// ---------- modesty: cut external-genital skin out and close the opening ----------
// The skin is one mesh, so the genital surface can't simply be hidden. Triangles chosen by `select(centroid)` move to
// a new part (intimate: hide). A "cover" part (intimate: cover), a smooth membrane spanning the opening, takes their
// place while intimate anatomy is hidden.
const sourceArrays=p=>({position:new Float32Array(p.source.buffer,p.source.byteOffset+p.positions,p.vertexCount*3),normal:new Int16Array(p.source.buffer,p.source.byteOffset+p.normals,p.vertexCount*3),index:new Uint32Array(p.source.buffer,p.source.byteOffset+p.indices,p.indexCount)});
function compact(position,normal,tris){
 const map=new Map(),pos=[],nor=[],idx=[];
 for(const v of tris){let n=map.get(v);if(n===undefined){n=pos.length/3;map.set(v,n);pos.push(position[v*3],position[v*3+1],position[v*3+2]);nor.push(normal[v*3],normal[v*3+1],normal[v*3+2]);}idx.push(n);}
 return {position:Float32Array.from(pos),normal:Int16Array.from(nor),index:Uint32Array.from(idx)};
}
const boundsOf=pos=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<pos.length;i+=3)for(let a=0;a<3;a++){min[a]=Math.min(min[a],pos[i+a]);max[a]=Math.max(max[a],pos[i+a]);}return [min,max];};
function splitSkin(body,skinName,select,label){
 const k=body.parts.findIndex(p=>p.name===skinName);if(k<0)throw new Error(`${body.id}: no ${skinName}`);
 const skin=body.parts[k],{position,normal,index}=sourceArrays(skin);
 const keep=[],cut=[];
 for(let t=0;t<index.length;t+=3){
  const a=index[t]*3,b=index[t+1]*3,c=index[t+2]*3;
  const centroid=[0,1,2].map(i=>(position[a+i]+position[b+i]+position[c+i])/3);
  (select(centroid)?cut:keep).push(index[t],index[t+1],index[t+2]);
 }
 if(!cut.length)throw new Error(`${body.id}: modesty selection is empty`);
 // Weld by position so UV/normal seams don't break boundary loops.
 const key=v=>`${position[v*3].toFixed(6)},${position[v*3+1].toFixed(6)},${position[v*3+2].toFixed(6)}`;
 const weld=new Map(),canon=v=>{const kk=key(v);if(!weld.has(kk))weld.set(kk,v);return weld.get(kk);};
 // Clean the selection into one smooth patch: (1) close the jagged edge, cutting kept triangles that border the cut on
 // two or more edges; (2) absorb islands of kept skin enclosed by the cut (anything but the main kept component).
 {
  const T=index.length/3,isCut=new Uint8Array(T),edgeTris=new Map(),ek=(a,b)=>a<b?`${a}|${b}`:`${b}|${a}`;
  const triOf=new Map();for(let t=0;t<T;t++){const k3=`${index[t*3]},${index[t*3+1]},${index[t*3+2]}`;triOf.set(k3,t);}
  for(let t=0;t<cut.length;t+=3)isCut[triOf.get(`${cut[t]},${cut[t+1]},${cut[t+2]}`)]=1;
  for(let t=0;t<T;t++)for(let e=0;e<3;e++){const kk=ek(canon(index[t*3+e]),canon(index[t*3+(e+1)%3]));if(!edgeTris.has(kk))edgeTris.set(kk,[]);edgeTris.get(kk).push(t);}
  const neighbours=t=>{const out=[];for(let e=0;e<3;e++)for(const u of edgeTris.get(ek(canon(index[t*3+e]),canon(index[t*3+(e+1)%3]))))if(u!==t)out.push(u);return out;};
  for(let pass=0;pass<3;pass++){const add=[];for(let t=0;t<T;t++)if(!isCut[t]&&neighbours(t).filter(u=>isCut[u]).length>=2)add.push(t);for(const t of add)isCut[t]=1;}
  const comp=new Int32Array(T).fill(-1),sizes=[];
  for(let t=0;t<T;t++){if(isCut[t]||comp[t]>=0)continue;const id=sizes.length;let n=0;const stack=[t];comp[t]=id;while(stack.length){const u=stack.pop();n++;for(const w of neighbours(u))if(!isCut[w]&&comp[w]<0){comp[w]=id;stack.push(w);}}sizes.push(n);}
  const main=sizes.indexOf(Math.max(...sizes));
  for(let t=0;t<T;t++)if(!isCut[t]&&comp[t]!==main)isCut[t]=1;
  keep.length=0;cut.length=0;
  for(let t=0;t<T;t++)(isCut[t]?cut:keep).push(index[t*3],index[t*3+1],index[t*3+2]);
 }
 const cutEdges=new Set();for(let t=0;t<cut.length;t+=3)for(let e=0;e<3;e++)cutEdges.add(`${canon(cut[t+e])}>${canon(cut[t+(e+1)%3])}`);
 // Cover = a fresh membrane over each opening (not the cut triangles: genital skin has inner sheets that would show through).
 // Boundary loop = kept edges a→b whose reverse b→a belongs to a cut triangle. Each loop is filled with R concentric rings
 // closing to its centroid, then the interior is relaxed (uniform Laplacian, loop fixed) into a smooth minimal-like surface.
 const next=new Map();
 for(let t=0;t<keep.length;t+=3)for(let e=0;e<3;e++){const a=canon(keep[t+e]),b=canon(keep[t+(e+1)%3]);if(cutEdges.has(`${b}>${a}`))next.set(a,b);}
 const loops=[],seen=new Set();
 for(const start of next.keys()){if(seen.has(start))continue;const loop=[];let v=start;while(v!==undefined&&!seen.has(v)){seen.add(v);loop.push(v);v=next.get(v);}if(loop.length>=3)loops.push(loop);}
 // BodyParts3D's male skin is double-layered around the genitals (an inner sheet ~3 mm under the outer one), so one
 // opening yields several nested loops. Covering the inner ones makes covers z-fight. Keep the largest loop and any
 // loop more than 3 cm from it (a genuinely separate opening).
 const centroidOf=l=>[0,1,2].map(i=>l.reduce((t,v)=>t+position[v*3+i],0)/l.length);
 loops.sort((a,b)=>b.length-a.length);
 if(loops.length>1){const c0=centroidOf(loops[0]);for(let i=loops.length-1;i>0;i--)if(Math.hypot(...centroidOf(loops[i]).map((x,k)=>x-c0[k]))<.03)loops.splice(i,1);}
 const R=10,cpos=[],cnor=[],cidx=[];
 for(const loop of loops){
  const n=loop.length,base=cpos.length/3,c=[0,0,0];
  for(const v of loop)for(let i=0;i<3;i++)c[i]+=position[v*3+i]/n;
  const P=[];// P[r][i] → [x,y,z]; ring 0 is the loop, ring R is the single centre point
  for(let r=0;r<R;r++)P.push(loop.map(v=>[0,1,2].map(i=>position[v*3+i]+(c[i]-position[v*3+i])*r/R)));
  const centre=[...c];
  for(let it=0;it<300;it++){
   for(let r=1;r<R;r++)for(let i=0;i<n;i++){
    const nb=[P[r][(i+1)%n],P[r][(i+n-1)%n],P[r-1][i],r+1<R?P[r+1][i]:centre];
    for(let a=0;a<3;a++)P[r][i][a]=(nb[0][a]+nb[1][a]+nb[2][a]+nb[3][a])/4;
   }
   for(let a=0;a<3;a++)centre[a]=P[R-1].reduce((s,q)=>s+q[a],0)/n;
  }
  const at=(r,i)=>base+r*n+(i%n);
  for(let r=0;r<R;r++)for(let i=0;i<n;i++)cpos.push(...P[r][i]);
  cpos.push(...centre);const C=base+R*n;
  for(let r=0;r+1<R;r++)for(let i=0;i<n;i++)cidx.push(at(r,i+1),at(r,i),at(r+1,i),at(r,i+1),at(r+1,i),at(r+1,i+1));
  for(let i=0;i<n;i++)cidx.push(at(R-1,i+1),at(R-1,i),C);
 }
 // Smooth normals from the new triangles; on the loop itself use the skin's normals so shading is continuous.
 const vn=new Float32Array(cpos.length);
 for(let t=0;t<cidx.length;t+=3){
  const [a,b,c]=[cidx[t]*3,cidx[t+1]*3,cidx[t+2]*3];
  const u=[cpos[b]-cpos[a],cpos[b+1]-cpos[a+1],cpos[b+2]-cpos[a+2]],w=[cpos[c]-cpos[a],cpos[c+1]-cpos[a+1],cpos[c+2]-cpos[a+2]];
  const nn=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
  for(const v of [a,b,c])for(let i=0;i<3;i++)vn[v+i]+=nn[i];
 }
 // Orient to agree with the skin at the boundary (winding follows the kept skin, but be explicit).
 let agree=0,o=0;for(const loop of loops){for(let i=0;i<loop.length;i++){const v=loop[i];agree+=vn[(o+i)*3]*normal[v*3]+vn[(o+i)*3+1]*normal[v*3+1]+vn[(o+i)*3+2]*normal[v*3+2];}o+=loop.length*R+1;}
 const flip=agree<0?-1:1;
 const cn=new Int16Array(cpos.length);
 for(let v=0;v<cpos.length/3;v++){const l=Math.hypot(vn[v*3],vn[v*3+1],vn[v*3+2])||1;for(let i=0;i<3;i++)cn[v*3+i]=Math.round(flip*vn[v*3+i]/l*32767);}
 o=0;for(const loop of loops){loop.forEach((v,i)=>{for(let a=0;a<3;a++)cn[(o+i)*3+a]=normal[v*3+a];});o+=loop.length*R+1;}
 const stats={loops:loops.length,loopSizes:loops.map(l=>l.length),coverTriangles:cidx.length/3,loopInfo:loops.map(l=>{const c=centroidOf(l),ext=[0,1,2].map(i=>{const v=l.map(x=>position[x*3+i]);return +(Math.max(...v)-Math.min(...v)).toFixed(3);});return {c:c.map(x=>+x.toFixed(3)),ext};})};
 const kept=compact(position,normal,keep),removed=compact(position,normal,cut),cover={position:Float32Array.from(cpos),normal:cn,index:Uint32Array.from(cidx)};
 const geo=(g,extra)=>({...skin,...extra,geometry:g,vertexCount:g.position.length/3,indexCount:g.index.length,bounds:boundsOf(g.position),derived:true});
 body.parts[k]=geo(kept,{});
 const add=(g,suffix,name,intimate)=>{const id=`${skin.id}-${suffix}`,concept=`${body.id}:${suffix}`;body.parts.push(geo(g,{id,name,concept,intimate}));body.concepts.set(concept,{id:concept,name,parts:[body.parts.length-1]});body.paths.push([...body.paths[k],concept]);return body.parts.length-1;};
 const hidden=add(removed,'genital',label,'hide'),covered=add(cover,'cover',`${displaySkin(skinName)} (covered)`,'cover');
 // Selecting the skin selects all of it, whichever pieces are currently shown.
 const sc=body.concepts.get(skin.concept);if(sc)sc.parts=[...sc.parts,hidden,covered].sort((a,b)=>a-b);
 return {cut:cut.length/3,...stats};
}
const displaySkin=n=>n.charAt(0).toUpperCase()+n.slice(1);
// Nearest-distance test against a vertex cloud, bucketed on a grid of `cell` meters.
function nearCloud(points,cell){ // kept for future modesty selections
 const grid=new Map(),k=(x,y,z)=>`${Math.floor(x/cell)},${Math.floor(y/cell)},${Math.floor(z/cell)}`;
 for(let i=0;i<points.length;i+=3){const kk=k(points[i],points[i+1],points[i+2]);if(!grid.has(kk))grid.set(kk,[]);grid.get(kk).push(i);}
 return (p,r)=>{const [x,y,z]=p;for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){const b=grid.get(`${Math.floor(x/cell)+dx},${Math.floor(y/cell)+dy},${Math.floor(z/cell)+dz}`);if(b)for(const i of b)if(Math.hypot(points[i]-x,points[i+1]-y,points[i+2]-z)<=r)return true;}return false;};
}

function groupBySystem(parts){const m=new Map();parts.forEach((p,i)=>{if(!m.has(p.system))m.set(p.system,[]);m.get(p.system).push(i);});return m;}

// ---------- geometry ----------
// LOD 0 is the committed source geometry unchanged. LOD 1 is the motion fallback: every part simplified on its own
// (so meshIds survive and no part disappears), drawn only while the camera moves; picking always uses LOD 0.
const LOD1={ratio:.3,error:.01,minIndices:48};
await Promise.all([MeshoptEncoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});

const partGeometry=(p,lod)=>{
 const {position,normal,index}=p.geometry??sourceArrays(p);
 if(lod===0)return {position,normal,index};
 const target=Math.max(LOD1.minIndices,Math.floor(p.indexCount*LOD1.ratio/3)*3);
 const [simplified]=MeshoptSimplifier.simplify(index,position,3,Math.min(index.length,target),LOD1.error);
 const [remap,count]=MeshoptSimplifier.compactMesh(simplified);
 const pos=new Float32Array(count*3),nor=new Int16Array(count*3);
 for(let old=0;old<remap.length;old++){const n=remap[old];if(n===0xffffffff)continue;pos.set(position.subarray(old*3,old*3+3),n*3);nor.set(normal.subarray(old*3,old*3+3),n*3);}
 return {position:pos,normal:nor,index:simplified};
};

const writeSystem=async(OUT,body,system,list,lod)=>{
 const geos=list.map(i=>partGeometry(body.parts[i],lod));
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
 return {file:`atlas/${body.id}/${file}`,triangles:indices/3,vertices,bytes:glb.length};
};

async function writeBody(body){
 const OUT=at(`public/atlas/${body.id}/`);fs.mkdirSync(OUT,{recursive:true});
 const {parts,concepts,paths,latinFor,modesty}=body;
 if(modesty.skin){const r=splitSkin(body,modesty.skin.name,modesty.skin.select(parts),modesty.skin.label);console.log(`${body.id}: modesty skin split`,JSON.stringify(r));}
 for(const path of paths)for(const id of path)if(!concepts.has(id))throw new Error(`${body.id}: path references unknown concept ${id}`);
 const systems=[];let totalTriangles=0,totalBytes=0,lodTriangles=0;
 for(const [system,list] of [...groupBySystem(parts)].sort(([a],[b])=>a.localeCompare(b))){
  if(!SYSTEM_NAMES[system])throw new Error(`${body.id}: unknown system ${system}`);
  if(list.length>65535)throw new Error('meshId exceeds uint16');
  const full=await writeSystem(OUT,body,system,list,0),low=await writeSystem(OUT,body,system,list,1);
  totalTriangles+=full.triangles;lodTriangles+=low.triangles;totalBytes+=full.bytes+low.bytes;
  systems.push({id:system,name:SYSTEM_NAMES[system],file:full.file,parts:list.length,triangles:full.triangles,vertices:full.vertices,bytes:full.bytes,lod1:low});
 }
 const intimate=p=>p.intimate??(modesty.hide.test(p.name)?'hide':modesty.mask.test(p.name)?'mask':undefined);
 const conceptList=[...concepts.values()].map(c=>{const latin=latinFor(c.id);return latin?{...c,latin}:c;});
 const atlas={
  body:body.id,version:body.version,source:body.source,triangles:totalTriangles,systems,partial:body.partial??[],
  modesty:{boxes:modesty.boxes},
  parts:parts.map((p,i)=>{const out={id:p.id,name:p.name,concept:p.concept,system:p.system,bounds:p.bounds,path:paths[i]};const m=intimate(p);if(m)out.intimate=m;if(p.derived)out.derived=true;return out;}),
  concepts:conceptList,
 };
 fs.writeFileSync(new URL('atlas.json',OUT),JSON.stringify(atlas));
 const count=k=>atlas.parts.filter(p=>p.intimate===k).length;
 console.log(JSON.stringify({body:body.id,covers:count('cover'),systems:systems.length,parts:parts.length,concepts:conceptList.length,triangles:totalTriangles,lod1Triangles:lodTriangles,glbMB:+(totalBytes/1e6).toFixed(2),metaMB:+(fs.statSync(new URL('atlas.json',OUT)).size/1e6).toFixed(2),latinParts:parts.filter(p=>latinFor(p.concept)).length,hidden:count('hide'),masked:count('mask')}));
 return atlas;
}

fs.rmSync(at('public/atlas/'),{recursive:true,force:true});
const bodies=[bodyParts3D(),hraFemale()];
for(const body of bodies)await writeBody(body);
// Index of bodies for the app's model switcher.
fs.writeFileSync(at('public/atlas/bodies.json'),JSON.stringify(bodies.map(b=>({id:b.id,file:`atlas/${b.id}/atlas.json`,source:b.source}))));
