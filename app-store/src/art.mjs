// Transparent hero and icon art, rendered by the app's own viewer.
import {launch,openApp} from './lib.mjs';
import {scene} from './scene.mjs';
const out=process.argv[2];
const glow={tint:{integumentary:'#4DD0E1'},emissive:{nervous:['#4DD0E1',.55]},color:{nervous:'#bff4fa'}};
const b=await launch();
let p=await openApp(b,{w:1100,h:1500,dpr:3,transparent:true,hideUi:true});
await scene(p,{...glow,layers:{integumentary:'faded',nervous:'on',arterial:'on',venous:'on',cardiac:'on'},alpha:{integumentary:.32},frame:[.5,1],yaw:.45,pitch:.06,zoom:.5});
await p.screenshot({path:`${out}/hero.png`,omitBackground:true});
await p.close();
p=await openApp(b,{w:1024,h:1024,dpr:2,transparent:true,hideUi:true});
// Icon, in two layers so the head's rim light can be softened on its own (it shows the skin mesh's facets otherwise):
// the head as a rim of light (dark interior) and the brain glowing inside it, in pure profile.
const icon={frame:[.87,1],yaw:1.48,pitch:.04,zoom:.34,shift:[0,.012,0],
 color:{nervous:'#123a40'},emissive:{nervous:['#22c4d6',.35]},rim:{integumentary:['#6fe8f5',3.8,3.8],sensory:['#6fe8f5',2.4,2.4]}};
await scene(p,{...icon,layers:{},selected:'FMA50801'});
await p.screenshot({path:`${out}/icon-brain.png`,omitBackground:true});
await scene(p,{...icon,layers:{integumentary:'faded',sensory:'faded'}});
await p.screenshot({path:`${out}/icon-head.png`,omitBackground:true});
await b.close();
