import type * as T from 'three';

// Dev-only on-device performance overlay. Reads frame pacing from requestAnimationFrame deltas on frames that
// actually rendered, and draw calls/triangles from renderer.info. iOS WebKit exposes no GPU timer queries,
// so "cpu" is JS-side submit time for renderer.render, not GPU time; sustained fps is the honest number.
export class Stats {
 readonly el=document.createElement('div');
 private deltas:number[]=[];private cpu:number[]=[];private last=0;private rendered=0;private windowStart=performance.now();private fps=0;
 private info={calls:0,triangles:0};
 extra:Record<string,string>={};
 constructor(parent:HTMLElement){
  Object.assign(this.el.style,{position:'absolute',left:'calc(env(safe-area-inset-left) + 8px)',top:'calc(env(safe-area-inset-top) + 8px)',padding:'6px 8px',font:'11px/1.35 ui-monospace,Menlo,monospace',color:'#F5F5F5',background:'rgba(0,0,0,.62)',borderRadius:'6px',whiteSpace:'pre',pointerEvents:'none',zIndex:'10'});
  parent.appendChild(this.el);
 }
 frame(now:number,didRender:boolean,cpuMs:number,renderer:T.WebGLRenderer){
  if(didRender){
   if(this.last&&now-this.last<250){this.deltas.push(now-this.last);if(this.deltas.length>240)this.deltas.shift();}
   this.last=now;this.rendered++;this.cpu.push(cpuMs);if(this.cpu.length>240)this.cpu.shift();
   this.info={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
  }else this.last=0;
  if(now-this.windowStart>=1000){this.fps=this.rendered*1000/(now-this.windowStart);this.rendered=0;this.windowStart=now;this.draw();}
 }
 private pct(a:number[],p:number){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(s.length*p))];}
 private draw(){
  const lines=[
   `fps    ${this.fps.toFixed(0).padStart(3)}  (rendered frames/s)`,
   `frame  p50 ${this.pct(this.deltas,.5).toFixed(1)}  p95 ${this.pct(this.deltas,.95).toFixed(1)} ms`,
   `cpu    p50 ${this.pct(this.cpu,.5).toFixed(1)}  p95 ${this.pct(this.cpu,.95).toFixed(1)} ms`,
   `calls  ${this.info.calls}   tris ${(this.info.triangles/1e6).toFixed(2)}M`,
   ...Object.entries(this.extra).map(([k,v])=>`${k.padEnd(6)} ${v}`),
  ];
  this.el.textContent=lines.join('\n');
 }
 dispose(){this.el.remove();}
}
