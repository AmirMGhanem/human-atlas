// Builds the store screenshots: lays out one wide strip per device in compose.html, then cuts it into panels.
// Usage: node compose.mjs   (reads renders/, writes ../screenshots/ and ../icon/)
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {launch} from './lib.mjs';

const here=p=>fileURLToPath(new URL(p,import.meta.url));
const r=name=>`renders/${name}`;

// Order matters: the first three show in search results.
const PANELS=[
 {id:'01-hero',title:'See inside\nthe human body.',sub:'More than 2,000 structures in 3D. Turn it, zoom in, take it apart.'},
 {id:'02-tap',shot:'heart',title:'Tap any part\nto learn it.',sub:'Names, Latin terms and what each structure does.'},
 {id:'03-layers',shot:'layers',title:'Peel back the body,\nlayer by layer.',sub:'Fade skin, muscle or bone to see what lies beneath.'},
 {id:'04-female',shot:'female',title:'Male and\nfemale anatomy.',sub:'Switch bodies any time in Settings.'},
 {id:'05-brain',shot:'brain',title:'From whole systems\nto single parts.',sub:'Step in and out of the anatomy, region by region.'},
 {id:'06-isolate',shot:'skeleton',title:'One system\nat a time.',sub:'Long-press a layer to see it on its own.'},
 {id:'07-offline',shot:'vessels',title:'Offline\nand private.',sub:'No account, no ads, nothing collected. Works anywhere.'},
];

const DEVICES={
 'iphone-6.9':{W:1320,H:2868,prefix:'iphone',
  type:{x:110,y:210,h:172,p:50,pw:1040},
  device:{w:1000,h:Math.round(1000*956/440)+52,top:880,r:150,b:26,island:[300,88,34]},
  hero:{src:r('hero.png'),x:-260,y:720,w:Math.round(2350*3300/4500),h:2350,brain:[.515,.2]},
  signalY:[2380,1640,2460,1560,2300,1720,2200]},
 'ipad-13':{W:2064,H:2752,prefix:'ipad',
  type:{x:170,y:180,h:190,p:58,pw:1500},
  device:{w:1640,h:Math.round(1640*1376/1032)+60,top:720,r:84,b:30},
  hero:{src:r('hero.png'),x:330,y:640,w:Math.round(2280*3300/4500),h:2280,brain:[.515,.2]},
  signalY:[2300,1500,2380,1450,2250,1600,2150]},
};

const b=await launch();
for(const [dir,cfg] of Object.entries(DEVICES)){
 const page=await b.newPage();
 await page.setViewport({width:cfg.W*PANELS.length,height:cfg.H,deviceScaleFactor:1});
 await page.goto('file://'+here('compose.html'),{waitUntil:'networkidle0'});
 const panels=PANELS.map(p=>({...p,shot:p.shot&&r(`${cfg.prefix}-${p.shot}.jpg`)}));
 await page.evaluate(c=>window.build(c),{...cfg,panels});
 await page.evaluate(()=>Promise.all([document.fonts.ready,...[...document.images].map(i=>i.decode())]));
 for(const [i,p] of PANELS.entries()){
  const out=here(`../screenshots/${dir}/${p.id}.png`);
  await page.screenshot({path:out,clip:{x:i*cfg.W,y:0,width:cfg.W,height:cfg.H}});
 }
 await page.close();
}
await b.close();
// App Store Connect rejects screenshots with an alpha channel.
execFileSync('python3',['-c',`import glob
from PIL import Image
for f in glob.glob('${here('../screenshots')}/*/*.png'): Image.open(f).convert('RGB').save(f)`]);
