import {useEffect,useRef,useState} from 'react';
import {loadAtlas} from './atlas';
import {buildIndex} from './atlas-index';
import {groupOfSystem,selectionParts,useAtlas} from './store';
import InfoDrawer from './ui/InfoDrawer';
import LayerPanel from './ui/LayerPanel';
import {Viewer} from './viewer';

// Dev stats + perf toggles stay on until the release build sets VITE_STATS=0.
const STATS=import.meta.env.VITE_STATS!=='0';
const DPRS=[1,2,3];

export default function Home(){
 const host=useRef<HTMLDivElement>(null),viewer=useRef<Viewer|null>(null);
 const index=useAtlas(s=>s.index),layers=useAtlas(s=>s.layers),selection=useAtlas(s=>s.selection),insets=useAtlas(s=>s.insets);
 const frameNonce=useAtlas(s=>s.frameNonce),resetNonce=useAtlas(s=>s.resetNonce);
 const [progress,setProgress]=useState('Loading…'),[error,setError]=useState('');
 const [spin,setSpin]=useState(false),[dpr,setDpr]=useState(2),[lod,setLod]=useState<'full'|'low'|'auto'>('auto');

 useEffect(()=>{loadAtlas().then(a=>useAtlas.getState().setIndex(buildIndex(a)),e=>setError(String(e?.message??e)));},[]);
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
  viewer.current=v;if(STATS)(window as unknown as {__viewer?:Viewer}).__viewer=v;
  return()=>{v.dispose();viewer.current=null;};
  // dpr and lod are applied live below rather than rebuilding the viewer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[index]);

 // Store → viewer.
 useEffect(()=>{
  const parts=selectionParts({index,selection});
  viewer.current?.setView({layer:sys=>layers[groupOfSystem(sys)],selected:parts?new Set(parts):null});
 },[index,layers,selection]);
 // Frame on selection change, and again when the drawer opening changes the free screen area.
 useEffect(()=>{viewer.current?.setInsets(insets);},[insets]);
 useEffect(()=>{const parts=selectionParts(useAtlas.getState());if(parts)viewer.current?.frameParts(parts);},[frameNonce,insets.right,insets.bottom]);
 useEffect(()=>{if(resetNonce)viewer.current?.resetView();},[resetNonce]);
 useEffect(()=>{if(viewer.current)viewer.current.spin=spin;},[spin]);
 useEffect(()=>{viewer.current?.setPixelRatio(dpr);},[dpr]);
 useEffect(()=>{viewer.current?.setLod(lod);},[lod,index]);

 return <main className="app">
  <div className="viewport" ref={host}/>
  {(progress||error)&&<div className="app-status" role="status">{error||progress}</div>}
  {index&&<LayerPanel/>}
  {index&&<InfoDrawer/>}
  {STATS&&<div className="dev-tools">
   <button onClick={()=>setSpin(s=>!s)}>{spin?'Stop':'Spin'}</button>
   <button onClick={()=>setDpr(d=>DPRS[(DPRS.indexOf(d)+1)%DPRS.length])}>DPR {dpr}</button>
   <button onClick={()=>setLod(l=>l==='auto'?'full':l==='full'?'low':'auto')}>LOD {lod}</button>
  </div>}
 </main>;
}
