import {useEffect,useRef,useState} from 'react';
import {loadAtlas} from './atlas';
import {buildIndex} from './atlas-index';
import {groupOfSystem,selectionParts,useAtlas,type Quality} from './store';
import CreditsSheet from './ui/CreditsSheet';
import InfoDrawer from './ui/InfoDrawer';
import LayerPanel from './ui/LayerPanel';
import SettingsSheet from './ui/SettingsSheet';
import {Viewer} from './viewer';

// Dev stats + perf toggles stay on until the release build sets VITE_STATS=0.
const STATS=import.meta.env.VITE_STATS!=='0';
const DPRS=[1,1.5,2,3];
const QUALITY:Record<Quality,{dpr:number;lod:'auto'|'low'}>={high:{dpr:3,lod:'auto'},balanced:{dpr:2,lod:'auto'},battery:{dpr:1.5,lod:'low'}};

function usePrefersReducedMotion(){
 const q='(prefers-reduced-motion: reduce)';
 const [reduce,setReduce]=useState(()=>matchMedia(q).matches);
 useEffect(()=>{const m=matchMedia(q),on=()=>setReduce(m.matches);m.addEventListener('change',on);return()=>m.removeEventListener('change',on);},[]);
 return reduce;
}

export default function Home(){
 const host=useRef<HTMLDivElement>(null),viewer=useRef<Viewer|null>(null);
 const index=useAtlas(s=>s.index),layers=useAtlas(s=>s.layers),selection=useAtlas(s=>s.selection),insets=useAtlas(s=>s.insets);
 const frameNonce=useAtlas(s=>s.frameNonce),resetNonce=useAtlas(s=>s.resetNonce),settings=useAtlas(s=>s.settings);
 const [progress,setProgress]=useState('Loading…'),[error,setError]=useState('');
 const systemReduce=usePrefersReducedMotion(),reduceMotion=settings.motion==='reduce'||(settings.motion==='system'&&systemReduce);
 // Dev overrides for measuring; they follow the Graphics setting until touched.
 const [spin,setSpin]=useState(false),[dpr,setDpr]=useState(QUALITY[settings.quality].dpr),[lod,setLod]=useState<'full'|'low'|'auto'>(QUALITY[settings.quality].lod);
 useEffect(()=>{setDpr(QUALITY[settings.quality].dpr);setLod(QUALITY[settings.quality].lod);},[settings.quality]);

 // (Re)load the anatomy whenever the body changes; the store drops the old index on switch.
 useEffect(()=>{
  let live=true;setError('');setProgress('Loading…');
  loadAtlas(settings.body).then(a=>{if(live)useAtlas.getState().setIndex(buildIndex(a));},e=>{if(live)setError(String(e?.message??e));});
  return()=>{live=false;};
 },[settings.body]);
 useEffect(()=>{
  if(!index||!host.current)return;
  const s=useAtlas.getState;
  const v=new Viewer(host.current,index.atlas,{
   // Haptics fire in InfoDrawer whenever the selected concept changes.
   onTap:part=>{if(part<0)s().clearSelection();else s().selectPart(part);},
   onDoubleTap:()=>s().resetView(),
   onTwoFingerDoubleTap:()=>s().stepOut(),
   onProgress:(n,t)=>setProgress(n<t?`Loading anatomy ${Math.round(n/t*100)}%`:''),
   onReady:ms=>console.log('[ready]',(ms/1000).toFixed(2),'s since launch'),
   onError:setError,
  },{stats:STATS,dpr});
  viewer.current=v;
  // Dev builds only: handles for the browser test scripts.
  if(STATS)Object.assign(window as object,{__viewer:v,__store:useAtlas});
  return()=>{v.dispose();viewer.current=null;};
  // dpr, lod and motion are applied live below rather than rebuilding the viewer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[index]);

 // Store → viewer.
 useEffect(()=>{
  const parts=selectionParts({index,selection});
  viewer.current?.setView({layer:sys=>layers[groupOfSystem(sys)],selected:parts?new Set(parts):null,showIntimate:settings.showIntimate});
 },[index,layers,selection,settings.showIntimate]);
 // Frame on selection change, and again when the drawer opening changes the free screen area.
 useEffect(()=>{viewer.current?.setInsets(insets);},[insets,index]);
 useEffect(()=>{const parts=selectionParts(useAtlas.getState());if(parts)viewer.current?.frameParts(parts);},[frameNonce,insets.right,insets.bottom]);
 useEffect(()=>{if(resetNonce)viewer.current?.resetView();},[resetNonce]);
 useEffect(()=>{viewer.current?.setReducedMotion(reduceMotion);},[reduceMotion,index]);
 useEffect(()=>{if(viewer.current)viewer.current.spin=spin;},[spin,index]);
 useEffect(()=>{viewer.current?.setPixelRatio(dpr);},[dpr,index]);
 useEffect(()=>{viewer.current?.setLod(lod);},[lod,index]);

 return <main className="app">
  <div className="viewport" ref={host} key={settings.body}/>
  {(progress||error)&&<div className="app-status" role="status">{error||progress}</div>}
  {index&&<LayerPanel/>}
  {index&&<InfoDrawer/>}
  <SettingsSheet/>
  <CreditsSheet/>
  {STATS&&<div className="dev-tools">
   <button onClick={()=>setSpin(s=>!s)}>{spin?'Stop':'Spin'}</button>
   <button onClick={()=>setDpr(d=>DPRS[(DPRS.indexOf(d)+1)%DPRS.length])}>DPR {dpr}</button>
   <button onClick={()=>setLod(l=>l==='auto'?'full':l==='full'?'low':'auto')}>LOD {lod}</button>
  </div>}
 </main>;
}
