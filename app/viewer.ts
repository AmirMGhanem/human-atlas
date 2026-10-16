import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {SYSTEMS,type SystemId} from './anatomy';
import {loadSystem,type Atlas} from './atlas';
import {Picker} from './picker';
import {PointerTap} from './pointer-tap';
import {Stats} from './stats';

const ACCENT=new T.Color('#4DD0E1');
export const DEFAULT_HIDDEN:SystemId[]=['integumentary'];

export interface ViewerEvents {onPick:(part:number)=>void;onProgress:(loaded:number,total:number)=>void;onReady:(ms:number)=>void;onError:(message:string)=>void}

/** Bare viewer: merged system meshes, orbit, GPU tap picking, stats. No UI policy lives here. */
export class Viewer {
 readonly renderer:T.WebGLRenderer;
 readonly camera=new T.PerspectiveCamera(34,1,.01,50);
 private scene=new T.Scene();
 private controls:OrbitControls;
 private stateWidth:number;private stateData:Uint8Array<ArrayBuffer>;private stateTexture:T.DataTexture;
 private picker:Picker;private tap=new PointerTap();private stats:Stats|null=null;
 private materials:T.Material[]=[];private disposed=false;private dirty=true;private frame=0;private ready=false;
 private observer:ResizeObserver;private selected=-1;
 private systemMeshes=new Map<SystemId,{full:T.Mesh;low?:T.Mesh;pick:T.Mesh}>();
 private visibleSystems=new Set<SystemId>();private lastMotion=0;
 /** full = LOD 0 always; low = LOD 1 always; auto = LOD 1 while the camera moves, LOD 0 at rest. */
 lod:'full'|'low'|'auto'='full';
 spin=false;

 constructor(private host:HTMLElement,private atlas:Atlas,private events:ViewerEvents,opts:{stats:boolean;dpr:number}){
  this.renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  const r=this.renderer;r.setPixelRatio(Math.min(devicePixelRatio,opts.dpr));r.outputColorSpace=T.SRGBColorSpace;r.toneMapping=T.ACESFilmicToneMapping;r.toneMappingExposure=1.05;r.setClearColor('#1A1A1A');
  host.appendChild(r.domElement);Object.assign(r.domElement.style,{display:'block',width:'100%',height:'100%',touchAction:'none'});

  this.stateWidth=T.MathUtils.ceilPowerOfTwo(atlas.parts.length);
  this.stateData=new Uint8Array(this.stateWidth*4);
  this.stateTexture=new T.DataTexture(this.stateData,this.stateWidth,1,T.RGBAFormat,T.UnsignedByteType);
  this.stateTexture.minFilter=this.stateTexture.magFilter=T.NearestFilter;
  atlas.parts.forEach((p,i)=>{this.stateData[i*4]=DEFAULT_HIDDEN.includes(p.system)?0:255;});
  this.stateTexture.needsUpdate=true;
  this.picker=new Picker(this.stateTexture,this.stateWidth);

  const pmrem=new T.PMREMGenerator(r),room=new RoomEnvironment();this.scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
  this.scene.add(new T.HemisphereLight(0xffffff,0x3a3d42,.9));
  const key=new T.DirectionalLight(0xfffaf4,2.2);key.position.set(-2,4,3);this.scene.add(key);
  const fill=new T.DirectionalLight(0xdfe8ff,.8);fill.position.set(3,1.5,2);this.scene.add(fill);
  const rim=new T.DirectionalLight(0xe9f0ff,1.6);rim.position.set(1.5,2.5,-3);this.scene.add(rim);

  this.controls=new OrbitControls(this.camera,r.domElement);
  const c=this.controls;c.enableDamping=true;c.dampingFactor=.09;c.minDistance=.08;c.maxDistance=8;c.target.set(0,.86,0);c.addEventListener('change',()=>{this.dirty=true;this.lastMotion=performance.now();});
  this.camera.position.set(.9,1.05,4.2);

  if(opts.stats){this.stats=new Stats(host);this.stats.extra.dpr=`${r.getPixelRatio()}`;}
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.resize();

  const el=r.domElement;
  el.addEventListener('pointerdown',this.down);el.addEventListener('pointermove',this.move);el.addEventListener('pointerup',this.up);el.addEventListener('pointercancel',this.cancel);
  el.addEventListener('webglcontextlost',e=>{e.preventDefault();events.onError('The 3D view was paused by the system. Reopen the app to continue.');});
  this.load();this.loop(performance.now());
 }

 private material(system:SystemId){
  const color=SYSTEMS.find(s=>s.id===system)?.color??'#aebbb8';
  const m=new T.MeshStandardMaterial({color,metalness:.05,roughness:.55,side:T.DoubleSide,transparent:system==='integumentary',opacity:system==='integumentary'?.12:1,depthWrite:system!=='integumentary'});
  m.onBeforeCompile=shader=>{
   shader.uniforms.partState={value:this.stateTexture};shader.uniforms.stateWidth={value:this.stateWidth};shader.uniforms.accent={value:ACCENT};
   shader.vertexShader='attribute float _meshid;\nuniform sampler2D partState;\nuniform float stateWidth;\nvarying float vVisible;\nvarying float vSelected;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvec4 partS=texture2D(partState,vec2((_meshid+.5)/stateWidth,.5));vVisible=partS.r;vSelected=partS.g;');
   shader.fragmentShader='uniform vec3 accent;\nvarying float vVisible;\nvarying float vSelected;\n'+shader.fragmentShader
    .replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(vVisible<.5)discard;')
    .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,accent,step(.5,vSelected)*.85);');
  };
  this.materials.push(m);return m;
 }

 private async load(){
  const t0=performance.now(),systems=[...this.atlas.systems];let done=0;
  try{
   await Promise.all(Array.from({length:4},async()=>{
    while(systems.length){
     const s=systems.shift()!;const loaded=await loadSystem(s);if(this.disposed)return;
     const material=this.material(s.id),mesh=this.addMesh(loaded.geometry,loaded.matrix,material,s.id);
     this.systemMeshes.set(s.id,{full:mesh,pick:this.picker.add(loaded.geometry,loaded.matrix)});this.syncSystemVisibility();
     done++;this.events.onProgress(done,this.atlas.systems.length);this.dirty=true;
    }
   }));
   if(this.disposed)return;
   this.ready=true;this.dirty=true;
   // Cold start = time since the WebView began loading the page (performance.timeOrigin) until geometry is resident.
   requestAnimationFrame(()=>{const ms=performance.now();this.events.onReady(ms);if(this.stats){this.stats.extra.ready=`${(ms/1000).toFixed(2)} s since launch (load ${((ms-t0)/1000).toFixed(2)} s)`;}});
   // Motion LOD streams in after first paint so it never delays cold start.
   for(const s of this.atlas.systems){
    const low=await loadSystem({...s,file:s.lod1.file});if(this.disposed)return;
    const entry=this.systemMeshes.get(s.id)!;entry.low=this.addMesh(low.geometry,low.matrix,entry.full.material as T.Material,s.id);this.syncSystemVisibility();
   }
   if(this.stats)this.stats.extra.lod1='loaded';
  }catch(e){if(!this.disposed)this.events.onError(e instanceof Error?e.message:'Could not load the anatomy.');}
 }

 private resize=()=>{const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);if(this.stats)this.stats.extra.canvas=`${Math.round(w*this.renderer.getPixelRatio())}×${Math.round(h*this.renderer.getPixelRatio())}`;this.dirty=true;};

 private down=(e:PointerEvent)=>this.tap.down(e.pointerId,e.clientX,e.clientY,e.pointerType==='touch'?10:5);
 private move=(e:PointerEvent)=>this.tap.move(e.pointerId,e.clientX,e.clientY);
 private cancel=(e:PointerEvent)=>this.tap.cancel(e.pointerId);
 private up=(e:PointerEvent)=>{
  if(!this.tap.up(e.pointerId,e.clientX,e.clientY)||!this.ready)return;
  const rect=this.renderer.domElement.getBoundingClientRect(),t0=performance.now();
  const part=this.picker.pick(this.renderer,this.camera,e.clientX-rect.left,e.clientY-rect.top,rect.width,rect.height);
  if(this.stats)this.stats.extra.pick=`${(performance.now()-t0).toFixed(1)} ms (incl. readback)`;
  this.select(part);this.events.onPick(part);
 };

 private addMesh(geometry:T.BufferGeometry,matrix:T.Matrix4,material:T.Material,system:SystemId){
  const mesh=new T.Mesh(geometry,material);mesh.matrixAutoUpdate=false;mesh.matrix.copy(matrix);mesh.matrixWorldNeedsUpdate=true;mesh.frustumCulled=false;mesh.renderOrder=system==='integumentary'?1:0;
  this.scene.add(mesh);return mesh;
 }

 /** A system with no visible part is skipped entirely (no draw call, no pick cost) instead of discarding every fragment. */
 private syncSystemVisibility(){
  this.visibleSystems.clear();
  this.atlas.parts.forEach((p,i)=>{if(this.stateData[i*4]>0)this.visibleSystems.add(p.system);});
  for(const [id,m] of this.systemMeshes)m.pick.visible=this.visibleSystems.has(id);
  this.applyLod(false);
 }

 private applyLod(moving:boolean){
  let changed=false;
  for(const [id,m] of this.systemMeshes){
   const on=this.visibleSystems.has(id),useLow=!!m.low&&(this.lod==='low'||(this.lod==='auto'&&moving));
   if(m.full.visible!==(on&&!useLow)){m.full.visible=on&&!useLow;changed=true;}
   if(m.low&&m.low.visible!==(on&&useLow)){m.low.visible=on&&useLow;changed=true;}
  }
  if(changed)this.dirty=true;
 }

 select(part:number){
  if(this.selected>=0)this.stateData[this.selected*4+1]=0;
  this.selected=part;if(part>=0)this.stateData[part*4+1]=255;
  this.stateTexture.needsUpdate=true;this.dirty=true;
 }
 setPixelRatio(dpr:number){this.renderer.setPixelRatio(Math.min(devicePixelRatio,dpr));if(this.stats)this.stats.extra.dpr=`${this.renderer.getPixelRatio()}`;this.resize();}

 private loop=(now:number)=>{
  if(this.disposed)return;this.frame=requestAnimationFrame(this.loop);
  this.controls.autoRotate=this.spin;this.controls.autoRotateSpeed=2;this.controls.update();
  // Treat the damping tail as motion; return to LOD 0 120 ms after the camera settles.
  this.applyLod(this.spin||now-this.lastMotion<120);
  if(this.stats)this.stats.extra.lod=`${this.lod}${this.lod==='auto'?' → '+([...this.systemMeshes.values()].some(m=>m.low?.visible)?'low':'full'):''}`;
  const render=this.dirty||this.spin;let cpu=0;
  if(render){const t=performance.now();this.renderer.render(this.scene,this.camera);cpu=performance.now()-t;this.dirty=false;}
  this.stats?.frame(now,render,cpu,this.renderer);
 };

 dispose(){
  this.disposed=true;cancelAnimationFrame(this.frame);this.observer.disconnect();this.controls.dispose();
  const el=this.renderer.domElement;el.removeEventListener('pointerdown',this.down);el.removeEventListener('pointermove',this.move);el.removeEventListener('pointerup',this.up);el.removeEventListener('pointercancel',this.cancel);
  this.scene.traverse(o=>{if((o as T.Mesh).isMesh)(o as T.Mesh).geometry.dispose();});
  this.materials.forEach(m=>m.dispose());this.picker.dispose();this.stateTexture.dispose();this.scene.environment?.dispose();this.stats?.dispose();
  this.renderer.dispose();el.remove();
 }
}
