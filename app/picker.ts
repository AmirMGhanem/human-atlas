import * as T from 'three';
import {FRAGMENT_HEAD,MODESTY_DISCARD,VERTEX_HEAD,vertexBody,type SharedUniforms} from './shader-chunks';

// GPU id picking. Every system mesh is re-drawn with a flat id shader into a tiny render target that covers
// only the pixels around the touch point (camera view offset), then those pixels are read back.
// Encoding: id = meshId + 1 in R (low byte) and G (high byte); 0 = nothing.
const RADIUS=4,SIZE=RADIUS*2+1;

const PICK_VERTEX=`${VERTEX_HEAD}
varying float vId;
void main(){
 vId=_meshid;
 ${vertexBody('position')}
 gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`;
const PICK_FRAGMENT=`${FRAGMENT_HEAD}
varying float vId;
void main(){
 // Only pickable parts (state alpha): faded layers and hidden parts let taps through.
 if(vPart.a<.5)discard;
 ${MODESTY_DISCARD}
 float id=floor(vId+.5)+1.;
 gl_FragColor=vec4(mod(id,256.)/255.,floor(id/256.)/255.,0.,1.);
}`;

export class Picker {
 readonly scene=new T.Scene();
 private target=new T.WebGLRenderTarget(SIZE,SIZE,{type:T.UnsignedByteType,format:T.RGBAFormat,depthBuffer:true,generateMipmaps:false,minFilter:T.NearestFilter,magFilter:T.NearestFilter,colorSpace:T.NoColorSpace});
 private pixels=new Uint8Array(SIZE*SIZE*4);
 readonly material:T.ShaderMaterial;
 constructor(uniforms:SharedUniforms){
  this.material=new T.ShaderMaterial({vertexShader:PICK_VERTEX,fragmentShader:PICK_FRAGMENT,side:T.DoubleSide,uniforms:{...uniforms}});
 }
 add(geometry:T.BufferGeometry,matrix:T.Matrix4){
  const m=new T.Mesh(geometry,this.material);m.matrixAutoUpdate=false;m.matrix.copy(matrix);m.matrixWorldNeedsUpdate=true;m.frustumCulled=false;this.scene.add(m);return m;
 }
 /** x,y in CSS pixels relative to the canvas. Returns the meshId nearest the touch point, or -1. */
 pick(renderer:T.WebGLRenderer,camera:T.PerspectiveCamera,x:number,y:number,width:number,height:number):number{
  const prevTarget=renderer.getRenderTarget(),prev=camera.view?.enabled?{...camera.view}:null,clear=renderer.getClearColor(new T.Color()),clearAlpha=renderer.getClearAlpha();
  // Compose with any existing view offset (UI insets shift the projection centre).
  const ox=prev?prev.offsetX:0,oy=prev?prev.offsetY:0;
  camera.setViewOffset(width,height,ox+x-RADIUS,oy+y-RADIUS,SIZE,SIZE);camera.updateProjectionMatrix();
  renderer.setRenderTarget(this.target);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(this.scene,camera);
  renderer.readRenderTargetPixels(this.target,0,0,SIZE,SIZE,this.pixels);
  renderer.setRenderTarget(prevTarget);renderer.setClearColor(clear,clearAlpha);
  if(prev)camera.setViewOffset(prev.fullWidth,prev.fullHeight,prev.offsetX,prev.offsetY,prev.width,prev.height);else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  // Fat-finger tolerance: nearest non-empty pixel to the centre of the patch.
  let best=-1,bestD=Infinity;
  for(let py=0;py<SIZE;py++)for(let px=0;px<SIZE;px++){
   const o=(py*SIZE+px)*4,id=this.pixels[o]+this.pixels[o+1]*256;if(!id)continue;
   const d=(px-RADIUS)**2+(py-RADIUS)**2;if(d<bestD){bestD=d;best=id-1;}
  }
  return best;
 }
 dispose(){this.target.dispose();this.material.dispose();}
}
