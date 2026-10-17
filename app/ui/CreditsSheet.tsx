import {useEffect, useId, useRef, useState, type ReactNode} from 'react';
import {ChevronDown, ChevronLeft, X} from 'lucide-react';
import {useAtlas} from '../store';
import {DATA_SOURCES} from '../credits';
import './settings.css';

interface OssLicense {name:string;version:string;license:string;text:string}
type LicenseState={status:'loading'}|{status:'ready';items:OssLicense[]}|{status:'error'};

// Fetched once per app session; a failed fetch is forgotten so the next open retries.
let licensesCache:Promise<OssLicense[]>|null=null;
function loadLicenses():Promise<OssLicense[]>{
 if(!licensesCache){
  licensesCache=fetch('licenses.json')
   .then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json() as Promise<unknown>;})
   .then(data=>{if(!Array.isArray(data))throw new Error('licenses.json is not an array');return data as OssLicense[];})
   .catch(err=>{licensesCache=null;throw err;});
 }
 return licensesCache;
}

function Section({title,children}:{title:string;children:ReactNode}){
 const id=useId();
 return (
  <section className="st-section" aria-labelledby={id}>
   <h3 id={id} className="st-h">{title}</h3>
   <div className="st-card">{children}</div>
  </section>
 );
}

export default function CreditsSheet(){
 const sheet=useAtlas(s=>s.sheet);
 const openSheet=useAtlas(s=>s.openSheet);
 const open=sheet==='credits';

 const titleId=useId();
 const listBase=useId();
 const sheetRef=useRef<HTMLDivElement>(null);
 const [licenses,setLicenses]=useState<LicenseState>({status:'loading'});
 const [expanded,setExpanded]=useState<ReadonlySet<string>>(()=>new Set());

 useEffect(()=>{
  if(!open)return;
  sheetRef.current?.focus();
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')openSheet(null);};
  document.addEventListener('keydown',onKey);
  return ()=>document.removeEventListener('keydown',onKey);
 },[open,openSheet]);

 // Load the bundled licence list when the sheet opens.
 useEffect(()=>{
  if(!open)return;
  let alive=true;
  setLicenses(s=>s.status==='ready'?s:{status:'loading'});
  loadLicenses()
   .then(items=>{if(alive)setLicenses({status:'ready',items});})
   .catch(()=>{if(alive)setLicenses({status:'error'});});
  return ()=>{alive=false;};
 },[open]);

 if(!open)return null;

 const toggle=(key:string)=>setExpanded(prev=>{
  const next=new Set(prev);
  if(next.has(key))next.delete(key);else next.add(key);
  return next;
 });

 return (
  <>
   <button type="button" className="st-backdrop" aria-label="Close credits" tabIndex={-1} onClick={()=>openSheet(null)}/>
   <div ref={sheetRef} className="st-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
    <header className="st-head">
     <button type="button" className="st-icon-btn" aria-label="Back to settings" onClick={()=>openSheet('settings')}>
      <ChevronLeft size={22}/>
     </button>
     <h2 id={titleId} className="st-title">Credits &amp; Licenses</h2>
     <button type="button" className="st-icon-btn" aria-label="Close credits" onClick={()=>openSheet(null)}>
      <X size={22}/>
     </button>
    </header>

    <div className="st-body">
     <Section title="Anatomy data">
      {DATA_SOURCES.map(src=>(
       <article key={src.id} className="st-src">
        <h4 className="st-src-title">{src.title}</h4>
        <p className="st-credit">{src.credit}</p>
        <p className="st-meta">License: {src.license}<br/><span className="st-url">{src.licenseUrl}</span></p>
        <p className="st-meta">Source: <span className="st-url">{src.url}</span></p>
        <p className="st-muted">{src.usedFor}</p>
        {src.changes&&<p className="st-muted">Changes: {src.changes}</p>}
       </article>
      ))}
     </Section>

     <Section title="Open-source software">
      {licenses.status==='loading'&&<p className="st-status">Loading…</p>}
      {licenses.status==='error'&&<p className="st-status">License texts unavailable.</p>}
      {licenses.status==='ready'&&licenses.items.map((lic,i)=>{
       const key=`${lic.name}@${lic.version}`;
       const isOpen=expanded.has(key);
       const panelId=`${listBase}-${i}`;
       return (
        <div key={key} className="st-lic">
         <button
          type="button"
          className="st-lic-btn"
          aria-expanded={isOpen}
          aria-controls={isOpen?panelId:undefined}
          onClick={()=>toggle(key)}
         >
          <span className="st-lic-name">{`${lic.name} ${lic.version} — ${lic.license}`}</span>
          <ChevronDown size={18} className="st-chev" aria-hidden="true"/>
         </button>
         {isOpen&&<pre id={panelId} className="st-lic-text">{lic.text}</pre>}
        </div>
       );
      })}
     </Section>
    </div>
   </div>
  </>
 );
}
