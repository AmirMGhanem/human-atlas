import {useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent} from 'react';
import {Layers} from 'lucide-react';
import {LAYER_GROUPS, useAtlas, type LayerGroup, type LayerState} from '../store';
import {haptic} from './haptics';
import './ui.css';

const LONG_PRESS_MS=450;
const MOVE_TOLERANCE_PX=10;

interface RowProps {group:LayerGroup;state:LayerState;isolated:boolean}

function LayerRow({group,state,isolated}:RowProps){
 const toggleLayer=useAtlas(s=>s.toggleLayer);
 const isolateLayer=useAtlas(s=>s.isolateLayer);
 const timer=useRef<number|undefined>(undefined);
 const start=useRef({x:0,y:0});
 // Set when a long press fires, so the click that follows the release does not also toggle.
 const longPressed=useRef(false);

 const cancelTimer=()=>{
  if(timer.current!==undefined){window.clearTimeout(timer.current);timer.current=undefined;}
 };
 useEffect(()=>cancelTimer,[]);

 const onPointerDown=(e:PointerEvent<HTMLButtonElement>)=>{
  if(e.pointerType==='mouse'&&e.button!==0)return;
  longPressed.current=false;
  start.current={x:e.clientX,y:e.clientY};
  cancelTimer();
  timer.current=window.setTimeout(()=>{
   timer.current=undefined;
   longPressed.current=true;
   isolateLayer(group.id);
   haptic.medium();
  },LONG_PRESS_MS);
 };
 const onPointerMove=(e:PointerEvent<HTMLButtonElement>)=>{
  if(timer.current===undefined)return;
  if(Math.hypot(e.clientX-start.current.x,e.clientY-start.current.y)>MOVE_TOLERANCE_PX)cancelTimer();
 };
 const onClick=()=>{
  if(longPressed.current){longPressed.current=false;return;}
  toggleLayer(group.id);
  haptic.light();
 };

 const style={'--c':group.color} as CSSProperties;
 const short=group.name.split(/\s+/)[0];

 return (
  <button
   type="button"
   className={`lp-row${isolated?' is-isolated':''}`}
   style={style}
   data-state={state}
   aria-pressed={state==='on'}
   aria-label={group.name}
   title="Tap to show or hide · long-press to isolate"
   onPointerDown={onPointerDown}
   onPointerMove={onPointerMove}
   onPointerUp={cancelTimer}
   onPointerCancel={cancelTimer}
   onPointerLeave={cancelTimer}
   onClick={onClick}
  >
   <span className="lp-dot" aria-hidden="true"/>
   <span className="lp-name lp-name-full">{group.name}</span>
   <span className="lp-name lp-name-short" aria-hidden="true">{short}</span>
  </button>
 );
}

const isWideViewport=()=>typeof window!=='undefined'&&window.innerWidth>=768;

export default function LayerPanel(){
 const layers=useAtlas(s=>s.layers);
 const isolated=useAtlas(s=>s.isolated);
 const showAllLayers=useAtlas(s=>s.showAllLayers);
 const [open,setOpen]=useState(isWideViewport);
 const listId=useId();

 return (
  <div className="lp">
   <button
    type="button"
    className="lp-toggle lp-glass"
    aria-label={open?'Hide layers':'Show layers'}
    aria-expanded={open}
    aria-controls={open?listId:undefined}
    onClick={()=>setOpen(o=>!o)}
   >
    <Layers size={22} strokeWidth={1.75}/>
   </button>
   {open&&(
    <div id={listId} className="lp-stack lp-glass" role="group" aria-label="Anatomical layers">
     {LAYER_GROUPS.map(g=>(
      <LayerRow key={g.id} group={g} state={layers[g.id]} isolated={isolated===g.id}/>
     ))}
     {isolated!==null&&(
      <button type="button" className="lp-show-all" onClick={showAllLayers}>Show all</button>
     )}
    </div>
   )}
  </div>
 );
}
