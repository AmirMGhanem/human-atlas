import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {SYSTEMS,type SystemId} from './anatomy';
import {loadSystem,type Atlas} from './atlas';
import {CameraRig,type Insets} from './camera-rig';
import {Picker} from './picker';
import {FRAGMENT_HEAD,MAX_MODESTY_BOXES,MODESTY_DISCARD,VERTEX_HEAD,vertexBody,type SharedUniforms} from './shader-chunks';
import {Stats} from './stats';

const ACCENT=new T.Color('#4DD0E1');
/** Opacity of structures dimmed around a selection, and of layers toggled to "faded". */
export const DIM_ALPHA=.35,FADED_ALPHA=.14;

export type LayerState='on'|'faded'|'off';
export interface PartView {layer:(system:SystemId)=>LayerState;selected:ReadonlySet<number>|null;
 /** When false, parts flagged `intimate: hide` are not drawn or tappable, and `mask` parts are clipped by the modesty boxes. */
 showIntimate:boolean}
export interface ViewerEvents {
 onTap:(part:number)=>void;onDoubleTap:()=>void;onTwoFingerDoubleTap:()=>void;
 onProgress:(loaded:number,total:number)=>void;onReady:(ms:number)=>void;onError:(message:string)=>void;
}

// Each system has: LOD0 + LOD1 opaque meshes (draw parts with opacity 1), a ghost depth pre-pass and a ghost colour
// pass (both on LOD1) that draw only translucent parts. The pre-pass keeps the nearest translucent surface, so ghosts
// blend once instead of stacking unsorted layers of a merged mesh. State/modesty GLSL lives in shader-chunks.ts.
const GHOST_VERTEX=`${VERTEX_HEAD}
varying vec3 vNormalV;varying vec3 vViewPos;
void main(){
 ${vertexBody('position')}
 vec4 mv=modelViewMatrix*vec4(position,1.);vViewPos=-mv.xyz;vNormalV=normalize(normalMatrix*normal);
 gl_Position=projectionMatrix*mv;
}`;
const GHOST_DEPTH_FRAGMENT=`${FRAGMENT_HEAD}void main(){if(vPart.r<.5||vPart.b>.996)discard;${MODESTY_DISCARD}gl_FragColor=vec4(0.);}`;
const GHOST_COLOR_FRAGMENT=`${FRAGMENT_HEAD}varying vec3 vNormalV;varying vec3 vViewPos;uniform vec3 color;
void main(){
 if(vPart.r<.5||vPart.b>.996)discard;
 ${MODESTY_DISCARD}
 vec3 n=normalize(vNormalV),v=normalize(vViewPos);
 float fres=pow(1.-abs(dot(n,v)),2.);
 float light=.5+.5*abs(dot(n,normalize(vec3(-.3,.6,.75))));
 vec3 col=color*light+vec3(.9,.95,1.)*fres*.18;
 gl_FragColor=vec4(col,clamp(vPart.b*(.6+.9*fres),0.,1.));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

interface SystemMeshes {full:T.Mesh;low?:T.Mesh;ghostDepth:T.Mesh;ghostColor:T.Mesh;pick:T.Mesh;opaque:boolean;ghost:boolean;pickable:boolean}

export class Viewer {
 readonly renderer:T.WebGLRenderer;
 readonly camera=new T.PerspectiveCamera(32,1,.01,50);
 readonly rig:CameraRig;
 private scene=new T.Scene();
 private stateWidth:number;private stateData:Uint8Array<ArrayBuffer>;private stateTexture:T.DataTexture;private flagsTexture:T.DataTexture;
 private uniforms:SharedUniforms;
 private picker:Picker;private stats:Stats|null=null;
 private materials:T.Material[]=[];private ghostDepthMaterial:T.ShaderMaterial;
 private systems=new Map<SystemId,SystemMeshes>();
 private disposed=false;private dirty=true;private frame=0;private ready=false;private last=performance.now();
 private observer:ResizeObserver;private view:PartView={layer:()=>'on',selected:null,showIntimate:false};
 private body=new T.Box3();private placed=false;
 /** full = LOD 0 always; low = LOD 1 always; auto = LOD 1 while the camera moves, LOD 0 at rest. */
 lod:'full'|'low'|'auto'='auto';

 constructor(private host:HTMLElement,private atlas:Atlas,private events:ViewerEvents,opts:{stats:boolean;dpr:number}){
  this.renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  const r=this.renderer;r.setPixelRatio(Math.min(devicePixelRatio,opts.dpr));r.outputColorSpace=T.SRGBColorSpace;r.toneMapping=T.ACESFilmicToneMapping;r.toneMappingExposure=1.05;
  r.setClearColor(0x000000,0);// transparent canvas over the CSS viewport gradient
  host.appendChild(r.domElement);Object.assign(r.domElement.style,{display:'block',width:'100%',height:'100%',touchAction:'none'});

  this.stateWidth=T.MathUtils.ceilPowerOfTwo(atlas.parts.length);
  this.stateData=new Uint8Array(this.stateWidth*4);
  this.stateTexture=new T.DataTexture(this.stateData,this.stateWidth,1,T.RGBAFormat,T.UnsignedByteType);
  this.stateTexture.minFilter=this.stateTexture.magFilter=T.NearestFilter;
  // Static per-part flags: R = clipped by the modesty boxes.
  const flags=new Uint8Array(this.stateWidth*4);atlas.parts.forEach((p,i)=>{if(p.intimate==='mask')flags[i*4]=255;});
  this.flagsTexture=new T.DataTexture(flags,this.stateWidth,1,T.RGBAFormat,T.UnsignedByteType);this.flagsTexture.minFilter=this.flagsTexture.magFilter=T.NearestFilter;this.flagsTexture.needsUpdate=true;
  const boxes=atlas.modesty?.boxes??[],pad=(i:number,k:0|1)=>boxes[i]?vec(boxes[i][k]):new T.Vector3();
  this.uniforms={partState:{value:this.stateTexture},partFlags:{value:this.flagsTexture},stateWidth:{value:this.stateWidth},modesty:{value:1},
   modestyMin:{value:Array.from({length:MAX_MODESTY_BOXES},(_,i)=>pad(i,0))},modestyMax:{value:Array.from({length:MAX_MODESTY_BOXES},(_,i)=>pad(i,1))},modestyCount:{value:Math.min(boxes.length,MAX_MODESTY_BOXES)}};
  this.picker=new Picker(this.uniforms);
  this.ghostDepthMaterial=new T.ShaderMaterial({vertexShader:GHOST_VERTEX,fragmentShader:GHOST_DEPTH_FRAGMENT,uniforms:{...this.uniforms},side:T.DoubleSide,colorWrite:false});
  this.materials.push(this.ghostDepthMaterial);

  // Three-point rig plus a soft studio environment for the physically based tissue materials.
  const pmrem=new T.PMREMGenerator(r),room=new RoomEnvironment();this.scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
  this.scene.add(new T.HemisphereLight(0xffffff,0x2a2c30,.7));
  const key=new T.DirectionalLight(0xfff6ec,2.3);key.position.set(-2,3.5,3.2);this.scene.add(key);
  const fill=new T.DirectionalLight(0xdfe8ff,.75);fill.position.set(3,1.2,2.2);this.scene.add(fill);
  const back=new T.DirectionalLight(0xe9f0ff,1.5);back.position.set(1.2,2.6,-3.2);this.scene.add(back);

  for(const p of atlas.parts){this.body.expandByPoint(vec(p.bounds[0]));this.body.expandByPoint(vec(p.bounds[1]));}
  this.rig=new CameraRig(this.camera,r.domElement,{onTap:(x,y)=>this.tap(x,y),onDoubleTap:()=>events.onDoubleTap(),onTwoFingerDoubleTap:()=>events.onTwoFingerDoubleTap()});
  this.rig.setBounds(this.body);

  if(opts.stats){this.stats=new Stats(host);this.stats.extra.dpr=`${r.getPixelRatio()}`;}
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.resize();
  r.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();events.onError('The 3D view was paused by the system. Reopen the app to continue.');});
  this.load();this.frame=requestAnimationFrame(this.loop);
 }


 private opaqueMaterial(system:SystemId){
  const color=SYSTEMS.find(s=>s.id===system)?.color??'#aebbb8';
  const m=new T.MeshStandardMaterial({color,metalness:.04,roughness:.58,side:T.DoubleSide});
  m.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,this.uniforms,{accent:{value:ACCENT}});
   shader.vertexShader=VERTEX_HEAD+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+vertexBody('transformed'));
   shader.fragmentShader='uniform vec3 accent;\n'+FRAGMENT_HEAD+shader.fragmentShader
    .replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(vPart.r<.5||vPart.b<.996)discard;\n'+MODESTY_DISCARD)
    .replace('#include <color_fragment>','#include <color_fragment>\nfloat sel=step(.5,vPart.g);diffuseColor.rgb=mix(diffuseColor.rgb,accent*.42,sel*.9);')
    // Fresnel rim so overlapping structures separate; brighter and cyan on the selection.
    .replace('#include <opaque_fragment>','float rimF=pow(1.-clamp(abs(dot(normal,normalize(vViewPosition))),0.,1.),3.);\noutgoingLight+=mix(vec3(.16,.17,.19),accent*.4,sel)*rimF;\n#include <opaque_fragment>');
  };
  this.materials.push(m);return m;
 }
 private ghostMaterial(system:SystemId){
  const color=new T.Color(SYSTEMS.find(s=>s.id===system)?.color??'#aebbb8');
  const m=new T.ShaderMaterial({vertexShader:GHOST_VERTEX,fragmentShader:GHOST_COLOR_FRAGMENT,uniforms:{...this.uniforms,color:{value:color}},side:T.DoubleSide,transparent:true,depthWrite:false,depthFunc:T.LessEqualDepth});
  this.materials.push(m);return m;
 }
 private mesh(geometry:T.BufferGeometry,matrix:T.Matrix4,material:T.Material,order:number){
  const m=new T.Mesh(geometry,material);m.matrixAutoUpdate=false;m.matrix.copy(matrix);m.matrixWorldNeedsUpdate=true;m.frustumCulled=false;m.renderOrder=order;m.visible=false;this.scene.add(m);return m;
 }

 private async load(){
  const t0=performance.now(),queue=[...this.atlas.systems];let done=0;
  try{
   await Promise.all(Array.from({length:4},async()=>{
    while(queue.length){
     const s=queue.shift()!;const g=await loadSystem(s);if(this.disposed)return;
     this.systems.set(s.id,{
      full:this.mesh(g.geometry,g.matrix,this.opaqueMaterial(s.id),0),
      ghostDepth:this.mesh(g.geometry,g.matrix,this.ghostDepthMaterial,5),
      ghostColor:this.mesh(g.geometry,g.matrix,this.ghostMaterial(s.id),6),
      pick:this.picker.add(g.geometry,g.matrix),opaque:false,ghost:false,pickable:false,
     });
     this.setView(this.view);done++;this.events.onProgress(done,this.atlas.systems.length);
    }
   }));
   if(this.disposed)return;
   // Compile the pick program now so the first tap doesn't pay for it (~140 ms measured).
   this.renderer.compile(this.picker.scene,this.camera);
   this.ready=true;this.dirty=true;
   requestAnimationFrame(()=>{const ms=performance.now();this.events.onReady(ms);if(this.stats)this.stats.extra.ready=`${(ms/1000).toFixed(2)} s since launch (load ${((ms-t0)/1000).toFixed(2)} s)`;});
   // LOD 1 streams in after first paint; ghosts switch to it too (translucent context needs no full detail).
   for(const s of this.atlas.systems){
    const g=await loadSystem({file:s.lod1.file});if(this.disposed)return;
    const m=this.systems.get(s.id)!;m.low=this.mesh(g.geometry,g.matrix,m.full.material as T.Material,0);
    m.ghostDepth.geometry=g.geometry;m.ghostColor.geometry=g.geometry;this.applyVisibility();
   }
   if(this.stats)this.stats.extra.lod1='loaded';
  }catch(e){if(!this.disposed)this.events.onError(e instanceof Error?e.message:'Could not load the anatomy.');}
 }

 /** Recompute every part's state from layer states and the selection. Cheap (2,234 texels). */
 setView(view:PartView){
  this.view=view;const d=this.stateData,sel=view.selected,flags=new Map<SystemId,{opaque:boolean;ghost:boolean;pickable:boolean}>();
  this.uniforms.modesty.value=view.showIntimate?0:1;
  // An opaque skin hides everything inside it, so with skin on and nothing selected only the body surface is drawn.
  // Saves most of the GPU work, and hides any internal geometry that pokes through the skin (the female model's
  // borrowed male muscles are bulkier than her body). A selection fades the skin and brings the inside back.
  const skinSolid=!sel&&view.layer('integumentary')==='on';
  this.atlas.parts.forEach((p,i)=>{
   // Hidden intimate parts stay hidden even when a selection includes them (e.g. stepping out to a region).
   // Cover parts close the skin where the genital skin was cut out; they only exist while that skin is hidden.
   const banned=view.showIntimate?p.intimate==='cover':p.intimate==='hide';
   const layer=view.layer(p.system),selected=!banned&&!!sel?.has(i);
   const visible=!banned&&(layer!=='off'||selected)&&!(skinSolid&&p.system!=='integumentary');
   const base=layer==='on'?1:FADED_ALPHA;
   const alpha=selected?1:sel?Math.min(base,DIM_ALPHA):base;
   const pickable=!banned&&(selected||layer==='on');
   d[i*4]=visible?255:0;d[i*4+1]=selected?255:0;d[i*4+2]=Math.round(alpha*255);d[i*4+3]=pickable?255:0;
   const f=flags.get(p.system)??{opaque:false,ghost:false,pickable:false};
   if(visible&&alpha>=.996)f.opaque=true;if(visible&&alpha<.996)f.ghost=true;if(pickable)f.pickable=true;flags.set(p.system,f);
  });
  for(const [id,m] of this.systems)Object.assign(m,flags.get(id)??{opaque:false,ghost:false,pickable:false});
  this.stateTexture.needsUpdate=true;this.applyVisibility();
 }

 /** Systems with nothing to draw in a pass skip that pass entirely: no draw call, no vertex work. */
 private applyVisibility(){
  const moving=this.rig.moving;
  for(const m of this.systems.values()){
   const useLow=!!m.low&&(this.lod==='low'||(this.lod==='auto'&&moving));
   m.full.visible=m.opaque&&!useLow;if(m.low)m.low.visible=m.opaque&&useLow;
   m.ghostDepth.visible=m.ghostColor.visible=m.ghost;m.pick.visible=m.pickable;
  }
  this.dirty=true;
 }

 /** Fly the camera to fit the given parts (or the whole body), in the space not covered by UI. */
 frameParts(parts:readonly number[]|null,dur=this.motionMs){
  if(!parts?.length){this.rig.flyTo(this.homePose(),dur);return;}
  const box=new T.Box3();for(const i of parts){const b=this.atlas.parts[i].bounds;box.expandByPoint(vec(b[0]));box.expandByPoint(vec(b[1]));}
  this.rig.flyTo(this.rig.fit(box),dur);
 }
 private homePose(){return this.rig.fit(this.body,.3,.05);}
 resetView(dur=this.motionMs){this.rig.home=this.homePose();this.rig.goHome(dur);}
 setInsets(i:Insets){this.rig.setInsets(i);this.dirty=true;}
 setLod(lod:'full'|'low'|'auto'){this.lod=lod;this.applyVisibility();}
 set spin(v:boolean){this.rig.spin=v;}
 /** Camera animation length; 0 when the user prefers reduced motion (also disables orbit momentum). */
 private motionMs=450;
 setReducedMotion(reduce:boolean){this.motionMs=reduce?0:450;this.rig.momentum=!reduce;}

 private tap(x:number,y:number){
  if(!this.ready)return;
  const rect=this.renderer.domElement.getBoundingClientRect(),t0=performance.now();
  const part=this.picker.pick(this.renderer,this.camera,x,y,rect.width,rect.height);
  if(this.stats)this.stats.extra.pick=`${(performance.now()-t0).toFixed(1)} ms → ${part<0?'none':this.atlas.parts[part].name}`;
  this.dirty=true;this.events.onTap(part);
 }

 private resize=()=>{
  const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;
  this.camera.aspect=w/h;this.renderer.setSize(w,h,false);this.rig.setSize(w,h);
  this.rig.home=this.homePose();
  // First layout: start at the home pose instead of animating to it.
  if(!this.placed){this.placed=true;Object.assign(this.rig.pose,this.rig.home,{target:this.rig.home.target.clone()});}
  if(this.stats)this.stats.extra.canvas=`${Math.round(w*this.renderer.getPixelRatio())}×${Math.round(h*this.renderer.getPixelRatio())}`;
  this.dirty=true;
 };
 setPixelRatio(dpr:number){this.renderer.setPixelRatio(Math.min(devicePixelRatio,dpr));if(this.stats)this.stats.extra.dpr=`${this.renderer.getPixelRatio()}`;this.resize();}

 private wasMoving=false;
 private loop=(now:number)=>{
  if(this.disposed)return;this.frame=requestAnimationFrame(this.loop);
  const dt=Math.min(.05,(now-this.last)/1000);this.last=now;
  if(this.rig.update(dt))this.dirty=true;
  const moving=this.rig.moving;if(moving!==this.wasMoving){this.wasMoving=moving;this.applyVisibility();}
  if(this.stats)this.stats.extra.lod=`${this.lod}${this.lod==='auto'?' → '+(moving?'low':'full'):''}`;
  let cpu=0;const render=this.dirty;
  if(render){const t=performance.now();this.renderer.render(this.scene,this.camera);cpu=performance.now()-t;this.dirty=false;}
  this.stats?.frame(now,render,cpu,this.renderer);
 };

 dispose(){
  this.disposed=true;cancelAnimationFrame(this.frame);this.observer.disconnect();this.rig.dispose();
  const geos=new Set<T.BufferGeometry>();this.scene.traverse(o=>{if((o as T.Mesh).isMesh)geos.add((o as T.Mesh).geometry);});geos.forEach(g=>g.dispose());
  this.materials.forEach(m=>m.dispose());this.picker.dispose();this.stateTexture.dispose();this.flagsTexture.dispose();this.scene.environment?.dispose();this.stats?.dispose();
  this.renderer.dispose();this.renderer.domElement.remove();
 }
}

const vec=(a:number[])=>new T.Vector3(a[0],a[1],a[2]);
