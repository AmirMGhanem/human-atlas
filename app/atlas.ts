import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type {SystemId} from './anatomy';

// Shape of public/atlas/atlas.json, written by scripts/build-atlas.mjs.
export interface AtlasLod {file:string;triangles:number;vertices:number;bytes:number}
export interface AtlasSystem {id:SystemId;name:string;file:string;parts:number;triangles:number;vertices:number;bytes:number;lod1:AtlasLod}
export interface AtlasPart {id:string;name:string;concept:string;system:SystemId;bounds:[number[],number[]];path:string[];
 /** hide = external genitalia, removed unless intimate anatomy is shown · mask = clipped by the modesty boxes ·
  *  cover = closes the skin where genital skin was cut out, shown only while intimate anatomy is hidden. */
 intimate?:'hide'|'mask'|'cover';
 /** Geometry was changed by the pipeline (modesty split), so it isn't a verbatim copy of a source mesh. */
 derived?:boolean}
export interface AtlasConcept {id:string;name:string;latin?:string;parts:number[]}
export interface Atlas {body:'male'|'female';version:string;source:string;triangles:number;systems:AtlasSystem[];parts:AtlasPart[];concepts:AtlasConcept[];
 modesty:{boxes:[number[],number[]][]};
 /** Systems the source data covers only partly (female: skeleton, muscles). */
 partial:SystemId[]}

export interface LoadedSystem {geometry:T.BufferGeometry;matrix:T.Matrix4}

// Bundled with the app; served from capacitor://localhost, never the network.
export async function loadAtlas(body:'male'|'female'):Promise<Atlas>{
 const r=await fetch(`atlas/${body}/atlas.json`);if(!r.ok)throw new Error('Anatomy index missing from the app bundle.');
 return r.json();
}

/** Loads one system's merged geometry. The node matrix carries KHR_mesh_quantization's dequantize transform. */
export async function loadSystem(system:Pick<AtlasSystem,'file'>&Partial<AtlasSystem>):Promise<LoadedSystem>{
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 const gltf=await loader.loadAsync(system.file);
 let found:T.Mesh|undefined;gltf.scene.traverse(o=>{if((o as T.Mesh).isMesh)found=o as T.Mesh;});
 if(!found)throw new Error(`No mesh in ${system.file}`);
 gltf.scene.updateMatrixWorld(true);
 const geometry=found.geometry;if(!geometry.getAttribute('_meshid'))throw new Error(`${system.file} has no _MESHID`);
 return {geometry,matrix:found.matrixWorld.clone()};
}
