// Captures real app screens (UI included) for the store screenshots.
import {launch,openApp,store,settle} from './lib.mjs';
import {scene,ALL_ON} from './scene.mjs';
const [out,device,only]=process.argv.slice(2);
const DEV={iphone:{w:440,h:956,dpr:3},ipad:{w:1032,h:1376,dpr:2}}[device];
const pad=device==='ipad';
const select=async(p,id)=>{await closePanel(p);return store(p,(m,id)=>{const s=m.useAtlas.getState();const part=s.index.atlas.parts.find(x=>x.path.includes(id));s.selectConcept(id,part.path);},id).then(()=>settle(p,1400));};
async function closePanel(p){if(await p.$eval('.lp-toggle',el=>el.getAttribute('aria-expanded'))==='true'){await p.click('.lp-toggle');await settle(p,400);}}
async function openPanel(p){
 if(await p.$eval('.lp-toggle',el=>el.getAttribute('aria-expanded'))!=='true'){await p.click('.lp-toggle');await settle(p,400);}
}
const shots={
 heart:{run:p=>select(p,'FMA7088')},
 brain:{run:p=>select(p,'FMA50801')},
 layers:{run:async p=>{
  await store(p,m=>{const s=m.useAtlas.getState();s.showAllLayers();s.toggleLayer('muscles');});
  await openPanel(p);
  await scene(p,{layers:{...ALL_ON,muscular:'faded'},frame:[.5,1],yaw:.4,zoom:pad?.62:.5,shift:[pad?-.1:-.08,-.02,0]});
 }},
 female:{body:'female',run:async p=>{
  await scene(p,{layers:{...ALL_ON,muscular:'off',integumentary:'faded'},alpha:{integumentary:.22},tint:{integumentary:'#4DD0E1'},frame:[.45,1],yaw:-.45,zoom:pad?.62:.52});
 }},
 skeleton:{run:async p=>{
  await store(p,m=>m.useAtlas.getState().isolateLayer('bones'));
  await openPanel(p);
  await scene(p,{layers:{skeletal:'on'},frame:[.05,1],yaw:.5,zoom:pad?.8:.72,shift:[pad?-.18:-.14,.05,0]});
 }},
 vessels:{run:async p=>{
  await scene(p,{layers:{arterial:'on',venous:'on',cardiac:'on',nervous:'on',integumentary:'faded'},alpha:{integumentary:.18},tint:{integumentary:'#4DD0E1'},frame:[.35,1],yaw:.3,zoom:pad?.68:.58});
 }},
};
const b=await launch();
for(const [name,shot] of Object.entries(shots)){
 if(only&&!only.split(',').includes(name))continue;
 const p=await openApp(b,{...DEV,body:shot.body??'male'});
 await shot.run(p);await settle(p,900);
 await p.screenshot({path:`${out}/${device}-${name}.jpg`,quality:92});
 await p.close();
}
await b.close();
