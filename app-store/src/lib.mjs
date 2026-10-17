import puppeteer from 'puppeteer-core';

export const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch(){
 return puppeteer.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
}

/** Opens the app at a device size and resolves once all systems are loaded. */
export async function openApp(browser,{w,h,dpr,url='http://localhost:3099/',transparent=false,hideUi=false,body='male',language='en'}){
 const page=await browser.newPage();
 await page.evaluateOnNewDocument((body,language)=>localStorage.setItem('body-explorer.settings',JSON.stringify({state:{settings:{body,language}},version:1})),body,language);
 await page.setViewport({width:w,height:h,deviceScaleFactor:dpr,isMobile:true,hasTouch:true});
 const ready=new Promise(res=>page.on('console',m=>{if(m.text().startsWith('[ready]'))res();}));
 page.on('pageerror',e=>console.error('pageerror',e.message));
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await ready;
 let css='.dev-tools{display:none!important} .viewport>div:not(:first-child){display:none!important}';
 if(transparent)css+=' html,body,#root,.app,.viewport{background:transparent!important}';
 if(hideUi)css+=' .lp,.id,.st-gear{display:none!important}';
 await page.addStyleTag({content:css});
 // Hide the stats overlay (a div appended to the viewport after the canvas).
 await page.evaluate(()=>{for(const el of document.querySelectorAll('.viewport > div'))el.style.display='none';});
 await page.evaluate(()=>window.__viewer.setLod('full'));
 await settle(page);
 return page;
}

export const settle=(page,ms=900)=>new Promise(r=>setTimeout(r,ms));

/** Runs fn(useAtlas) in the page (dev builds expose the store as window.__store). */
export async function store(page,fn,arg){
 return page.evaluate((src,arg)=>new Function('m','arg',`return (${src})(m,arg)`)({useAtlas:window.__store},arg),fn.toString(),arg);
}
