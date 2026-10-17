// In-page scene control: layers per system, selection, camera framing, ghost tints.
export async function scene(page,{layers={},fallback='off',selected=null,frame=null,yaw=.35,pitch=.05,zoom=1,shift=[0,0,0],tint={},clear=null,alpha={},emissive={},color={}}){
 await page.evaluate(({layers,fallback,selected,frame,yaw,pitch,zoom,shift,tint,clear,alpha,emissive,color})=>{
  const v=window.__viewer,T=v.camera.constructor;
  for(const [sys,hex] of Object.entries(tint))v.systems.get(sys).ghostColor.material.uniforms.color.value.set(hex);
  if(clear)v.renderer.setClearColor(clear,1);
  const parts=id=>v.atlas.concepts.find(c=>c.id===id).parts;
  const sel=selected?parts(selected):null;
  v.setView({layer:s=>layers[s]??fallback,selected:sel?new Set(sel):null,showIntimate:false});
  // Per-system ghost opacity override (state texture blue channel).
  v.atlas.parts.forEach((p,i)=>{if(alpha[p.system]!=null&&v.stateData[i*4])v.stateData[i*4+2]=Math.round(alpha[p.system]*255);});
  v.stateTexture.needsUpdate=true;
  for(const [sys,[hex,k]] of Object.entries(emissive)){const m=v.systems.get(sys).full.material;m.emissive.set(hex);m.emissiveIntensity=k;}
  for(const [sys,hex] of Object.entries(color))v.systems.get(sys).full.material.color.set(hex);
  v.dirty=true;
  if(frame){
   // frame = [lo,hi]: the slice of the body's height to fit (0 = feet, 1 = top of head).
   const box=v.body.clone(),h=box.max.y-box.min.y;box.min.y=v.body.min.y+frame[0]*h;box.max.y=v.body.min.y+frame[1]*h;
   const pose=v.rig.fit(box,yaw,pitch);pose.distance*=zoom;pose.target.x+=shift[0];pose.target.y+=shift[1];pose.target.z+=shift[2];
   v.rig.flyTo(pose,1);
  }
 },{layers,fallback,selected,frame,yaw,pitch,zoom,shift,tint,clear,alpha,emissive,color});
 await new Promise(r=>setTimeout(r,700));
}

/** Layer presets. Reproductive is always off in marketing shots. */
export const ALL_ON={skeletal:'on',muscular:'on',arterial:'on',venous:'on',nervous:'on',connective:'on',cardiac:'on',respiratory:'on',digestive:'on',urinary:'on',endocrine:'on',lymphatic:'on',sensory:'on',integumentary:'off',reproductive:'off'};
