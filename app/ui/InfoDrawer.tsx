import {useEffect, useId, useRef, useState, type CSSProperties} from 'react';
import {ArrowUpLeft, Focus, X} from 'lucide-react';
import {useAtlas, type Selection} from '../store';
import {SYSTEMS, type SystemId} from '../anatomy';
import {breadcrumb, displayName, explanationFor, systemsOf, type Crumb} from '../atlas-index';
import {haptic} from './haptics';
import './ui.css';

// Wide = side drawer (tablet, landscape phone). Everything else = bottom sheet.
const WIDE_QUERY='(min-width: 768px), (min-width: 600px) and (max-height: 500px)';
const EXIT_MS=260;
const GAP_PX=10;
const CHILD_LIMIT=12;
const CRUMB_COLLAPSE_AT=5;

const systemById=(id:SystemId)=>SYSTEMS.find(s=>s.id===id);

function useWide(){
 const [wide,setWide]=useState(()=>typeof window!=='undefined'&&window.matchMedia(WIDE_QUERY).matches);
 useEffect(()=>{
  const mq=window.matchMedia(WIDE_QUERY);
  const onChange=()=>setWide(mq.matches);
  mq.addEventListener('change',onChange);
  return ()=>mq.removeEventListener('change',onChange);
 },[]);
 return wide;
}

export default function InfoDrawer(){
 const index=useAtlas(s=>s.index);
 const selection=useAtlas(s=>s.selection);
 const selectConcept=useAtlas(s=>s.selectConcept);
 const clearSelection=useAtlas(s=>s.clearSelection);
 const stepOut=useAtlas(s=>s.stepOut);
 const frame=useAtlas(s=>s.frame);
 const setInsets=useAtlas(s=>s.setInsets);
 const showLatin=useAtlas(s=>s.settings.showLatin);
 const showIntimate=useAtlas(s=>s.settings.showIntimate);

 const wide=useWide();
 const titleId=useId();
 const drawerRef=useRef<HTMLElement>(null);
 const [held,setHeld]=useState<Selection|null>(selection);
 const [leaving,setLeaving]=useState(false);
 const [compact,setCompact]=useState(false);
 const [crumbsOpen,setCrumbsOpen]=useState(false);

 // Keep the last selection mounted for the exit animation, then drop it.
 useEffect(()=>{
  if(selection){setHeld(selection);setLeaving(false);return;}
  if(!held)return;
  setLeaving(true);
  const t=window.setTimeout(()=>{setHeld(null);setLeaving(false);},EXIT_MS);
  return ()=>window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to selection changes; held is read as the last shown value.
 },[selection]);

 const shown=selection??held;
 const open=selection!==null;
 const activeConcept=shown?.concept;

 // Report covered space to the camera so it frames selections in what remains visible.
 useEffect(()=>{
  const el=drawerRef.current;
  if(!open||!el){setInsets({right:0,bottom:0});return;}
  const apply=()=>{
   if(wide)setInsets({right:el.offsetWidth+GAP_PX,bottom:0});
   else setInsets({right:0,bottom:el.offsetHeight+GAP_PX});
  };
  const ro=new ResizeObserver(apply);
  ro.observe(el);
  apply();
  return ()=>ro.disconnect();
 },[open,wide,setInsets,activeConcept]);
 useEffect(()=>()=>setInsets({right:0,bottom:0}),[setInsets]);

 // A light tap whenever a new concept is selected.
 useEffect(()=>{if(activeConcept)haptic.light();},[activeConcept]);

 // Long breadcrumbs collapse again when the selection moves.
 useEffect(()=>{setCrumbsOpen(false);},[activeConcept]);

 if(!shown||!index)return null;
 const concept=index.concept(shown.concept);
 if(!concept)return null;

 const path=shown.path;
 const systems=systemsOf(index,concept);
 const primary=systems[0];
 const explanation=explanationFor(concept.name,(primary??'') as SystemId);
 const primarySystem=primary?systemById(primary):undefined;
 const parentId=path.length>=2?path[path.length-2]:undefined;
 const parent=parentId&&parentId!=='body'?parentId:undefined;
 const parentName=parent?displayName(index.concept(parent)?.name??parent):'';

 const crumbs=breadcrumb(index,path);
 const collapseCrumbs=!crumbsOpen&&crumbs.length>CRUMB_COLLAPSE_AT;
 const crumbItems:(Crumb|'more')[]=collapseCrumbs?[crumbs[0],'more',...crumbs.slice(-3)]:crumbs;

 // Structures that are hidden for modesty are not offered as children either.
 const children=index.children(concept.id).filter(id=>showIntimate||!(index.concept(id)?.parts.every(i=>index.atlas.parts[i].intimate==='hide')));
 const shownChildren=children.slice(0,CHILD_LIMIT);

 const classes=['id',wide?'is-wide':'is-sheet',leaving?'is-leaving':'',!wide&&compact?'is-compact':''].filter(Boolean).join(' ');

 return (
  <aside ref={drawerRef} className={classes} aria-labelledby={titleId}>
   {!wide&&(
    <button
     type="button"
     className="id-grab"
     aria-label={compact?'Expand details':'Collapse details'}
     aria-expanded={!compact}
     onClick={()=>setCompact(c=>!c)}
    >
     <span className="id-grab-bar" aria-hidden="true"/>
    </button>
   )}

   <header className="id-head">
    <h2 id={titleId} className="id-title">{displayName(concept.name)}</h2>
    <button type="button" className="id-close" aria-label="Close details" onClick={()=>clearSelection()}>
     <X size={22}/>
    </button>
   </header>

   <div className="id-body">
    {showLatin&&concept.latin&&<p className="id-latin">{concept.latin}</p>}

    {systems.length>0&&(
     <div className="id-chips">
      {systems.slice(0,3).map(s=>{
       const sys=systemById(s);
       if(!sys)return null;
       return (
        <span key={s} className="id-chip">
         <span className="id-dot" style={{'--c':sys.color} as CSSProperties} aria-hidden="true"/>
         {sys.name}
        </span>
       );
      })}
     </div>
    )}

    <nav className="id-crumbs" aria-label="Hierarchy">
     {crumbItems.map((item,i)=>{
      const sep=i>0?<span className="id-sep" aria-hidden="true">›</span>:null;
      if(item==='more'){
       return (
        <span key="more" className="id-crumb-item">
         {sep}
         <button type="button" className="id-crumb" aria-label={`Show all ${crumbs.length} levels`} onClick={()=>setCrumbsOpen(true)}>…</button>
        </span>
       );
      }
      const isLast=i===crumbItems.length-1;
      return (
       <span key={`${item.id}-${i}`} className="id-crumb-item">
        {sep}
        {isLast
         ?<span className="id-crumb" aria-current="step">{item.name}</span>
         :<button type="button" className="id-crumb" onClick={()=>selectConcept(item.id,path)}>{item.name}</button>}
       </span>
      );
     })}
    </nav>

    {explanation.text&&(
     <section>
      <h3 className="id-h">
       {explanation.kind==='system'?`About the ${primarySystem?.name??'system'}`:'About'}
      </h3>
      <p className="id-text">{explanation.text}</p>
     </section>
    )}

    {parent&&(
     <section>
      <h3 className="id-h">Part of</h3>
      <button type="button" className="id-link" onClick={()=>selectConcept(parent,path)}>{parentName}</button>
     </section>
    )}

    {children.length>0&&(
     <section>
      <h3 className="id-h">Includes</h3>
      {shownChildren.map(childId=>(
       <button key={childId} type="button" className="id-link" onClick={()=>selectConcept(childId,[...path,childId])}>
        {displayName(index.concept(childId)?.name??childId)}
       </button>
      ))}
      {children.length>CHILD_LIMIT&&<p className="id-more">+{children.length-CHILD_LIMIT} more</p>}
     </section>
    )}
   </div>

   <footer className="id-foot">
    <button type="button" className="id-action" onClick={()=>frame()}>
     <Focus size={18}/>Frame
    </button>
    {parent&&(
     <button type="button" className="id-action" onClick={()=>stepOut()}>
      <ArrowUpLeft size={18}/>Step out
     </button>
    )}
   </footer>
  </aside>
 );
}
