import {SYSTEMS,EXPLANATIONS,type SystemId} from './anatomy';
import type {Atlas,AtlasConcept} from './atlas';

// Read-only lookups over atlas.json, built once. UI and viewer both use these; nothing here mutates.
export interface AtlasIndex {
 atlas:Atlas;
 concept:(id:string)=>AtlasConcept|undefined;
 /** Direct children of a concept in the breadcrumb hierarchy (union over every part path). */
 children:(id:string)=>string[];
 bounds:{min:[number,number,number];max:[number,number,number]};
}

export function buildIndex(atlas:Atlas):AtlasIndex{
 const byId=new Map(atlas.concepts.map(c=>[c.id,c]));
 const kids=new Map<string,Set<string>>();
 for(const p of atlas.parts)for(let k=0;k+1<p.path.length;k++){const s=kids.get(p.path[k])??new Set();s.add(p.path[k+1]);kids.set(p.path[k],s);}
 const min:[number,number,number]=[Infinity,Infinity,Infinity],max:[number,number,number]=[-Infinity,-Infinity,-Infinity];
 for(const p of atlas.parts)for(let a=0;a<3;a++){min[a]=Math.min(min[a],p.bounds[0][a]);max[a]=Math.max(max[a],p.bounds[1][a]);}
 return {atlas,concept:id=>byId.get(id),children:id=>[...(kids.get(id)??[])].sort((a,b)=>(byId.get(a)?.name??a).localeCompare(byId.get(b)?.name??b)),bounds:{min,max}};
}

/** Source names are lower-case FMA terms ("left external oblique"); show them in sentence case. */
export const displayName=(name:string)=>name?name[0].toUpperCase()+name.slice(1):name;

// Structural FMA nodes that read as noise in a breadcrumb. They stay in the data; the UI skips them.
const NOISE=/^(body proper|body compartment|cardinal body part|zone of muscle organ|set of .*|content of .*)$/i;
export interface Crumb {id:string;name:string}
/** Breadcrumb for a selection path (root → selected concept), noise nodes removed, root shown as "Body". */
export function breadcrumb(index:AtlasIndex,path:string[]):Crumb[]{
 return path.filter((id,k)=>k===0||k===path.length-1||!NOISE.test(index.concept(id)?.name??'')).map(id=>({id,name:displayName(index.concept(id)?.name??id)}));
}

export interface Explanation {text:string;kind:'structure'|'system'}
/** Structure-specific text when we have it, otherwise the system overview (flagged so the UI can label it). */
export function explanationFor(name:string,system:SystemId):Explanation{
 const own=EXPLANATIONS[name.toLowerCase().replace(/^(left|right) /,'')];
 if(own)return {text:own,kind:'structure'};
 return {text:SYSTEMS.find(s=>s.id===system)?.description??'',kind:'system'};
}

/** Systems a concept spans, most parts first (a region like "right foot" spans several). */
export function systemsOf(index:AtlasIndex,c:AtlasConcept):SystemId[]{
 const n=new Map<SystemId,number>();for(const i of c.parts){const s=index.atlas.parts[i].system;n.set(s,(n.get(s)??0)+1);}
 return [...n].sort((a,b)=>b[1]-a[1]).map(([s])=>s);
}
