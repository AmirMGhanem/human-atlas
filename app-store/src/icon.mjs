// Composes the 1024 px App Store icon from renders/icon-art.png and copies it into the Xcode asset catalog.
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {launch} from './lib.mjs';
const here=p=>fileURLToPath(new URL(p,import.meta.url));
const b=await launch(),page=await b.newPage();
await page.setViewport({width:1024,height:1024,deviceScaleFactor:1});
await page.goto('file://'+here('icon.html'),{waitUntil:'load'});
const out=here('../icon/AppIcon-1024.png');
await page.screenshot({path:out});await b.close();
// No alpha channel: App Store Connect rejects icons with one.
execFileSync('python3',['-c',`from PIL import Image\nImage.open('${out}').convert('RGB').save('${out}')`]);
