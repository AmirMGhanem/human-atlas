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
await scene(p,{...glow,layers:{integumentary:'faded',nervous:'on'},alpha:{integumentary:.45},frame:[.84,1],yaw:1.25,pitch:.04,zoom:.36,shift:[0,.02,0]});
await p.screenshot({path:`${out}/icon-art.png`,omitBackground:true});
await b.close();
