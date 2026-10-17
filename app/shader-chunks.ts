import * as T from 'three';

// GLSL shared by every pass (opaque, ghost depth, ghost colour, pick) so state and modesty behave identically
// everywhere: a structure that is hidden or masked is also untappable.
//
// partState (RGBA8, one texel per meshId): R visible · G selected · B opacity · A pickable
// partFlags (RGBA8, static per body):     R masked by the modesty boxes
// Modesty boxes are world-space AABBs; masked parts discard fragments inside them while modesty is on.

export const MAX_MODESTY_BOXES=2;

export interface SharedUniforms {
 partState:{value:T.Texture};partFlags:{value:T.Texture};stateWidth:{value:number};
 modesty:{value:number};modestyMin:{value:T.Vector3[]};modestyMax:{value:T.Vector3[]};modestyCount:{value:number};
}

export const VERTEX_HEAD=`
attribute float _meshid;
uniform sampler2D partState;
uniform sampler2D partFlags;
uniform float stateWidth;
varying vec4 vPart;
varying float vMasked;
varying vec3 vModestyPos;
`;
/** After `local` (a vec3 in model space) is final. */
export const vertexBody=(local:string)=>`
{vec2 uvS=vec2((_meshid+.5)/stateWidth,.5);vPart=texture2D(partState,uvS);vMasked=texture2D(partFlags,uvS).r;
 vModestyPos=(modelMatrix*vec4(${local},1.)).xyz;}
`;
export const FRAGMENT_HEAD=`
varying vec4 vPart;
varying float vMasked;
varying vec3 vModestyPos;
uniform float modesty;
uniform vec3 modestyMin[${MAX_MODESTY_BOXES}];
uniform vec3 modestyMax[${MAX_MODESTY_BOXES}];
uniform int modestyCount;
bool modestyHidden(){
 if(modesty<.5||vMasked<.5)return false;
 for(int i=0;i<${MAX_MODESTY_BOXES};i++){
  if(i>=modestyCount)break;
  if(all(greaterThanEqual(vModestyPos,modestyMin[i]))&&all(lessThanEqual(vModestyPos,modestyMax[i])))return true;
 }
 return false;
}
`;
export const MODESTY_DISCARD='if(modestyHidden())discard;';
