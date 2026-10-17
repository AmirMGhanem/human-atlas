import * as T from 'three';

// Touch-first orbit camera. Replaces OrbitControls: momentum, rubber-band limits, pinch/pan about the fingers,
// trackpad scroll = pan, pinch = zoom, animated framing with UI insets, and tap / double-tap recognition.
//
//   touch  1 finger drag → orbit · 2 fingers → pan + pinch zoom · tap → onTap · double tap → onDoubleTap
//          two-finger double tap → onTwoFingerDoubleTap
//   mouse  left drag → orbit · right/middle or shift drag → pan · wheel → zoom at cursor
//   trackpad  two-finger scroll → pan · pinch (ctrl+wheel, Safari gesture events) → zoom at cursor

export interface Pose {target:T.Vector3;yaw:number;pitch:number;distance:number}
export interface RigEvents {onTap:(x:number,y:number)=>void;onDoubleTap:()=>void;onTwoFingerDoubleTap:()=>void}
export interface Insets {left:number;right:number;bottom:number}

const TAP_MOVE=10,TAP_MS=320,DOUBLE_MS=320,DOUBLE_PX=30;
const PITCH=[-1.45,1.45] as const,RUBBER=.3,SPRING=14,FRICTION=6.5;
const easeOut=(t:number)=>1-(1-t)**3;
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));

interface Pointer {x:number;y:number;sx:number;sy:number;t0:number;type:string;button:number;moved:boolean}

export class CameraRig {
 readonly pose:Pose={target:new T.Vector3(0,.88,0),yaw:.3,pitch:.05,distance:4};
 home:Pose={target:new T.Vector3(0,.88,0),yaw:.3,pitch:.05,distance:4};
 private bounds=new T.Box3(new T.Vector3(-1,0,-1),new T.Vector3(1,2,1));
 private minDistance=.05;private maxDistance=10;
 private insets:Insets={left:0,right:0,bottom:0};
 private width=1;private height=1;
 private pointers=new Map<number,Pointer>();
 private velocity={yaw:0,pitch:0};private lastMoveAt=0;
 private pinch:{dist:number;cx:number;cy:number}|null=null;
 private anim:{from:Pose;to:Pose;t0:number;dur:number}|null=null;
 private lastTap={t:0,x:0,y:0};private twoTap={downAt:0,count:0,lastAt:0,valid:false};
 private gestureScale=1;
 private changed=true;private lastActive=0;
 spin=false;
 /** Release momentum after an orbit; off for reduced motion. */
 momentum=true;

 constructor(private camera:T.PerspectiveCamera,private el:HTMLElement,private events:RigEvents){
  el.addEventListener('pointerdown',this.down);el.addEventListener('pointermove',this.move);
  el.addEventListener('pointerup',this.up);el.addEventListener('pointercancel',this.cancel);
  el.addEventListener('wheel',this.wheel,{passive:false});el.addEventListener('contextmenu',this.noMenu);
  el.addEventListener('gesturestart',this.gestureStart as EventListener);el.addEventListener('gesturechange',this.gestureChange as EventListener);
 }

 /** True while anything moves the camera, and for 120 ms after it settles (LOD switching uses this). */
 get moving(){return performance.now()-this.lastActive<120;}

 setSize(w:number,h:number){this.width=w;this.height=h;this.changed=true;}
 setInsets(i:Insets){this.insets=i;this.changed=true;}
 setBounds(box:T.Box3){this.bounds.copy(box).expandByScalar(.15);this.maxDistance=Math.max(4,box.getSize(new T.Vector3()).length()*3);}

 /** Pose that fits a box in the area left free by UI insets, keeping the current viewing direction. */
 fit(box:T.Box3,yaw=this.pose.yaw,pitch=this.pose.pitch):Pose{
  const sphere=box.getBoundingSphere(new T.Sphere()),tanV=Math.tan(T.MathUtils.degToRad(this.camera.fov/2));
  const fw=Math.max(80,this.width-this.insets.left-this.insets.right),fh=Math.max(80,this.height-this.insets.bottom);
  const tan=Math.min(tanV*fh/this.height,tanV*this.camera.aspect*fw/this.width);
  return {target:sphere.center.clone(),yaw,pitch,distance:T.MathUtils.clamp(sphere.radius/tan*1.55,this.minDistance,this.maxDistance)};
 }
 flyTo(to:Pose,dur=450){
  const from={...this.pose,target:this.pose.target.clone()};
  to={...to,yaw:from.yaw+wrap(to.yaw-from.yaw)};
  this.velocity.yaw=this.velocity.pitch=0;
  if(dur<=0){Object.assign(this.pose,to,{target:to.target.clone()});this.anim=null;this.changed=true;return;}
  this.anim={from,to,t0:performance.now(),dur};
 }
 goHome(dur=450){this.flyTo(this.home,dur);}

 /** Advance momentum, springs and animation; apply to the camera. Returns true if the view changed. */
 update(dt:number):boolean{
  const p=this.pose,dragging=this.pointers.size>0;let active=dragging;
  if(this.anim){
   const t=Math.min(1,(performance.now()-this.anim.t0)/this.anim.dur),e=easeOut(t),{from,to}=this.anim;
   p.target.lerpVectors(from.target,to.target,e);p.yaw=from.yaw+(to.yaw-from.yaw)*e;p.pitch=from.pitch+(to.pitch-from.pitch)*e;
   // Interpolate distance in log space so zooming feels uniform.
   p.distance=Math.exp(Math.log(from.distance)+(Math.log(to.distance)-Math.log(from.distance))*e);
   if(t>=1)this.anim=null;active=true;this.changed=true;
  }else if(!dragging){
   if(this.spin){p.yaw+=dt*.55;active=this.changed=true;}
   const v=this.velocity;
   if(Math.abs(v.yaw)+Math.abs(v.pitch)>1e-3){p.yaw+=v.yaw*dt;p.pitch+=v.pitch*dt;const f=Math.exp(-FRICTION*dt);v.yaw*=f;v.pitch*=f;active=this.changed=true;}else v.yaw=v.pitch=0;
   // Rubber band back inside the limits.
   const k=1-Math.exp(-SPRING*dt),pc=T.MathUtils.clamp(p.pitch,PITCH[0],PITCH[1]),dc=T.MathUtils.clamp(p.distance,this.minDistance,this.maxDistance),tc=this.bounds.clampPoint(p.target,new T.Vector3());
   if(Math.abs(pc-p.pitch)>1e-4){p.pitch+=(pc-p.pitch)*k;if(Math.abs(pc-p.pitch)<1e-4)p.pitch=pc;else active=true;this.changed=true;v.pitch=0;}
   if(Math.abs(dc-p.distance)>1e-5){p.distance+=(dc-p.distance)*k;if(Math.abs(dc-p.distance)<1e-5)p.distance=dc;else active=true;this.changed=true;}
   if(tc.distanceToSquared(p.target)>1e-10){p.target.lerp(tc,k);active=true;this.changed=true;}
  }
  if(active)this.lastActive=performance.now();
  if(!this.changed)return false;
  this.changed=false;this.apply();return true;
 }

 private apply(){
  const p=this.pose,c=this.camera,cp=Math.cos(p.pitch);
  c.position.set(p.target.x+p.distance*cp*Math.sin(p.yaw),p.target.y+p.distance*Math.sin(p.pitch),p.target.z+p.distance*cp*Math.cos(p.yaw));
  c.up.set(0,1,0);c.lookAt(p.target);
  c.near=Math.max(.002,p.distance*.02);c.far=p.distance+6;
  // Shift the projection centre into the area not covered by panels, so framed content is centred in what's visible.
  const {left,right,bottom}=this.insets;
  if(left||right||bottom)c.setViewOffset(this.width,this.height,(right-left)/2,bottom/2,this.width,this.height);else c.clearViewOffset();
  c.updateProjectionMatrix();c.updateMatrixWorld();
 }

 // ---------- gesture math ----------
 private worldPerPixel(){return 2*this.pose.distance*Math.tan(T.MathUtils.degToRad(this.camera.fov/2))/this.height;}
 private pan(dx:number,dy:number){
  const s=this.worldPerPixel(),right=new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0),up=new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1);
  const next=this.pose.target.clone().addScaledVector(right,-dx*s).addScaledVector(up,dy*s);
  // Past the bounds, motion is resisted (rubber band); update() springs it back on release.
  const clamped=this.bounds.clampPoint(next,new T.Vector3());
  this.pose.target.copy(clamped.lerp(next,RUBBER));
  if(this.bounds.containsPoint(next))this.pose.target.copy(next);
  this.changed=true;
 }
 private orbit(dx:number,dy:number){
  const dyaw=-dx*Math.PI/Math.max(320,this.width),dpitch=dy*Math.PI/Math.max(320,this.height);
  this.pose.yaw+=dyaw;
  const next=this.pose.pitch+dpitch,over=next<PITCH[0]||next>PITCH[1];
  this.pose.pitch+=over?dpitch*RUBBER:dpitch;
  this.changed=true;return {dyaw,dpitch};
 }
 /** Zoom by factor (<1 = closer) keeping the world point under (x,y) fixed on screen. */
 private zoomAt(factor:number,x:number,y:number){
  const p=this.pose,raw=p.distance*factor;
  const over=raw<this.minDistance||raw>this.maxDistance,next=over?p.distance*(1+(factor-1)*RUBBER):raw;
  const s=this.worldPerPixel(),{left,right,bottom}=this.insets;
  const cx=(this.width-left-right)/2+left,cy=(this.height-bottom)/2;
  const rightV=new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0),upV=new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1);
  const offset=rightV.multiplyScalar((x-cx)*s).addScaledVector(upV,-(y-cy)*s);
  p.target.addScaledVector(offset,1-next/p.distance);p.distance=next;this.changed=true;
 }
 private interrupt(){this.anim=null;this.velocity.yaw=this.velocity.pitch=0;}

 // ---------- input ----------
 private local(e:{clientX:number;clientY:number}){const r=this.el.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 private down=(e:PointerEvent)=>{
  this.el.setPointerCapture?.(e.pointerId);this.interrupt();
  const {x,y}=this.local(e),now=performance.now();
  this.pointers.set(e.pointerId,{x,y,sx:x,sy:y,t0:now,type:e.pointerType,button:e.button,moved:false});
  if(this.pointers.size===2){
   const [a,b]=[...this.pointers.values()];this.pinch={dist:Math.hypot(a.x-b.x,a.y-b.y),cx:(a.x+b.x)/2,cy:(a.y+b.y)/2};
   this.twoTap.downAt=now;this.twoTap.valid=a.type==='touch';
  }else if(this.pointers.size>2)this.twoTap.valid=false;
 };
 private move=(e:PointerEvent)=>{
  const pt=this.pointers.get(e.pointerId);if(!pt)return;
  const {x,y}=this.local(e),dx=x-pt.x,dy=y-pt.y;pt.x=x;pt.y=y;
  if(!pt.moved&&Math.hypot(x-pt.sx,y-pt.sy)>TAP_MOVE){pt.moved=true;this.twoTap.valid=false;}
  if(this.pointers.size===1){
   if(!pt.moved)return;
   if(pt.type==='mouse'&&(pt.button===1||pt.button===2||e.shiftKey))this.pan(dx,dy);
   else{
    const now=performance.now(),dt=Math.max(1,now-this.lastMoveAt)/1000,{dyaw,dpitch}=this.orbit(dx,dy);
    // Exponentially smoothed angular velocity for release momentum.
    const a=Math.min(1,dt*30);this.velocity.yaw+= (dyaw/dt-this.velocity.yaw)*a;this.velocity.pitch+=(dpitch/dt-this.velocity.pitch)*a;this.lastMoveAt=now;
   }
  }else if(this.pointers.size===2&&this.pinch){
   const [a,b]=[...this.pointers.values()],dist=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
   this.pan(cx-this.pinch.cx,cy-this.pinch.cy);this.zoomAt(this.pinch.dist/dist,cx,cy);
   this.pinch={dist,cx,cy};
  }
 };
 private up=(e:PointerEvent)=>{
  const pt=this.pointers.get(e.pointerId);if(!pt)return;
  const count=this.pointers.size,now=performance.now();this.pointers.delete(e.pointerId);
  if(count===2){
   // Two-finger tap: both fingers down and up quickly without moving.
   const quick=now-this.twoTap.downAt<TAP_MS&&!pt.moved&&this.twoTap.valid;
   // The finger left behind continues as an orbit, never as a tap.
   if(this.pointers.size===1){const other=[...this.pointers.values()][0];other.moved=true;other.sx=-1e6;}
   if(quick){if(now-this.twoTap.lastAt<DOUBLE_MS+150){this.twoTap.lastAt=0;this.events.onTwoFingerDoubleTap();}else this.twoTap.lastAt=now;}
   this.pinch=null;this.velocity.yaw=this.velocity.pitch=0;return;
  }
  if(count!==1)return;
  if(pt.moved){if(now-this.lastMoveAt>60||!this.momentum)this.velocity.yaw=this.velocity.pitch=0;return;}
  if(now-pt.t0>TAP_MS||pt.sx<-1e5)return;
  this.velocity.yaw=this.velocity.pitch=0;
  if(now-this.lastTap.t<DOUBLE_MS&&Math.hypot(pt.x-this.lastTap.x,pt.y-this.lastTap.y)<DOUBLE_PX){this.lastTap.t=0;this.events.onDoubleTap();return;}
  this.lastTap={t:now,x:pt.x,y:pt.y};this.events.onTap(pt.x,pt.y);
 };
 private cancel=(e:PointerEvent)=>{this.pointers.delete(e.pointerId);this.pinch=null;this.twoTap.valid=false;};
 private wheel=(e:WheelEvent)=>{
  e.preventDefault();this.interrupt();const {x,y}=this.local(e);
  const px=e.deltaMode===1?16:e.deltaMode===2?this.height:1,dx=e.deltaX*px,dy=e.deltaY*px;
  // ctrl+wheel = trackpad pinch (Chrome/Firefox). Trackpad scrolls are fractional or two-axis; mouse wheels are coarse single-axis steps.
  const trackpad=!e.ctrlKey&&e.deltaMode===0&&(dx!==0||!Number.isInteger(e.deltaY)||Math.abs(e.deltaY)<40);
  if(e.ctrlKey)this.zoomAt(Math.exp(dy*.012),x,y);
  else if(trackpad)this.pan(-dx,-dy);
  else this.zoomAt(Math.exp(dy*.0015),x,y);
  this.lastActive=performance.now();
 };
 private noMenu=(e:Event)=>e.preventDefault();
 // Safari (macOS) reports trackpad pinch as gesture events, not ctrl+wheel. On iOS touch pinch also emits these: ignore, pointers handle it.
 private gestureStart=(e:Event&{scale:number;clientX:number;clientY:number})=>{e.preventDefault();this.gestureScale=1;};
 private gestureChange=(e:Event&{scale:number;clientX:number;clientY:number})=>{
  e.preventDefault();if(this.pointers.size)return;
  const {x,y}=this.local(e);this.zoomAt(this.gestureScale/e.scale,x,y);this.gestureScale=e.scale;this.lastActive=performance.now();
 };

 dispose(){
  const el=this.el;el.removeEventListener('pointerdown',this.down);el.removeEventListener('pointermove',this.move);el.removeEventListener('pointerup',this.up);el.removeEventListener('pointercancel',this.cancel);
  el.removeEventListener('wheel',this.wheel);el.removeEventListener('contextmenu',this.noMenu);
  el.removeEventListener('gesturestart',this.gestureStart as EventListener);el.removeEventListener('gesturechange',this.gestureChange as EventListener);
 }
}
