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
// Icon: a full body in dark glass with a scan band across the chest that reveals what's inside.
// Two passes from one camera: the glass body (rim light only) and the inside (skeleton, organs, vessels, nerves).
const icon={frame:[0,1],yaw:.32,pitch:.04,zoom:.6};
await scene(p,{...icon,layers:{integumentary:'faded'},rim:{integumentary:['#6fe8f5',3.6,3.2]}});
await p.screenshot({path:`${out}/icon-glass.png`,omitBackground:true});
await scene(p,{...icon,layers:{skeletal:'on',cardiac:'on',respiratory:'on',digestive:'on',urinary:'on',endocrine:'on',arterial:'on',venous:'on',nervous:'on'}});
await p.screenshot({path:`${out}/icon-inside.png`,omitBackground:true});
await b.close();
