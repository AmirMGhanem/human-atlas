import {useEffect,useRef,useState} from 'react';
import {loadAtlas,type Atlas} from './atlas';
import {Viewer} from './viewer';

// Checkpoint-2 bare build: load, orbit, tap → name. Stats overlay stays on until the release build sets VITE_STATS=0.
const STATS=import.meta.env.VITE_STATS!=='0';
const DPRS=[1,2,3];

export default function Home(){
 const host=useRef<HTMLDivElement>(null),viewer=useRef<Viewer|null>(null);
 const [atlas,setAtlas]=useState<Atlas|null>(null),[progress,setProgress]=useState('Loading…'),[error,setError]=useState('');
 const [picked,setPicked]=useState<number>(-1),[spin,setSpin]=useState(false),[dpr,setDpr]=useState(2),[lod,setLod]=useState<'full'|'low'|'auto'>('full');
 useEffect(()=>{loadAtlas().then(setAtlas,e=>setError(String(e?.message??e)));},[]);
 useEffect(()=>{
  if(!atlas||!host.current)return;
  const v=new Viewer(host.current,atlas,{
   onPick:i=>{setPicked(i);const p=atlas.parts[i];console.log('[pick]',i<0?'nothing':`${i} ${p.id} ${p.name}`);},
   onProgress:(n,t)=>setProgress(n<t?`Loading ${n}/${t} systems…`:''),
   onReady:ms=>console.log('[ready]',(ms/1000).toFixed(2),'s since launch'),
   onError:setError,
  },{stats:STATS,dpr});
  viewer.current=v;return()=>{v.dispose();viewer.current=null;};
  // dpr changes are applied live below, not by rebuilding the viewer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[atlas]);
 useEffect(()=>{if(viewer.current)viewer.current.spin=spin;},[spin]);
 useEffect(()=>{viewer.current?.setPixelRatio(dpr);},[dpr]);
 useEffect(()=>{if(viewer.current)viewer.current.lod=lod;},[lod,atlas]);

 const part=atlas&&picked>=0?atlas.parts[picked]:null;
 const concept=part?atlas!.concepts.find(c=>c.id===part.concept):null;
 const byId=(id:string)=>atlas!.concepts.find(c=>c.id===id)?.name??id;
 return <main className="bare">
  <div className="viewport" ref={host}/>
  {(progress||error)&&<div className="bare-status">{error||progress}</div>}
  {STATS&&<div className="bare-tools">
   <button onClick={()=>setSpin(s=>!s)}>{spin?'Stop spin':'Spin'}</button>
   <button onClick={()=>setDpr(d=>DPRS[(DPRS.indexOf(d)+1)%DPRS.length])}>DPR {dpr}</button>
   <button onClick={()=>setLod(l=>l==='full'?'auto':l==='auto'?'low':'full')}>LOD {lod}</button>
  </div>}
  <div className="bare-pick">{part?<>
   <div className="name">{part.name}</div>
   {concept?.latin&&<div className="latin"><i>{concept.latin}</i></div>}
   <div className="meta">#{picked} · {part.id} · {part.system}</div>
   <div className="meta">{part.path.map(byId).join(' › ')}</div>
  </>:<div className="meta">{atlas?'Tap a structure':''}</div>}</div>
 </main>;
}
