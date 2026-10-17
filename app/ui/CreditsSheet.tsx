import {useEffect, useId, useRef, useState, type ReactNode} from 'react';
import {ChevronDown, ChevronLeft, X} from 'lucide-react';
import {useAtlas} from '../store';
import {DATA_SOURCES} from '../credits';
import {useT} from '../i18n';
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
 const t=useT();
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
   <button type="button" className="st-backdrop" aria-label={t('credits.close')} tabIndex={-1} onClick={()=>openSheet(null)}/>
   <div ref={sheetRef} className="st-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
    <header className="st-head">
     <button type="button" className="st-icon-btn" aria-label={t('credits.back')} onClick={()=>openSheet('settings')}>
      <ChevronLeft size={22} className="ico-flip"/>
     </button>
     <h2 id={titleId} className="st-title">{t('credits.title')}</h2>
     <button type="button" className="st-icon-btn" aria-label={t('credits.close')} onClick={()=>openSheet(null)}>
      <X size={22}/>
     </button>
    </header>

    <div className="st-body">
     <Section title={t('credits.anatomyData')}>
      {DATA_SOURCES.map(src=>(
       <article key={src.id} className="st-src">
        <h4 className="st-src-title"><bdi dir="ltr">{src.title}</bdi></h4>
        <p className="st-credit"><bdi dir="ltr">{src.credit}</bdi></p>
        <p className="st-meta">{t('credits.license')} <bdi dir="ltr">{src.license}</bdi><br/><span className="st-url" dir="ltr">{src.licenseUrl}</span></p>
        <p className="st-meta">{t('credits.source')} <span className="st-url" dir="ltr">{src.url}</span></p>
        <p className="st-muted">{src.usedFor}</p>
        {src.changes&&<p className="st-muted">{t('credits.changes')} {src.changes}</p>}
       </article>
      ))}
     </Section>

     <Section title={t('credits.oss')}>
      {licenses.status==='loading'&&<p className="st-status">{t('status.loading')}</p>}
      {licenses.status==='error'&&<p className="st-status">{t('credits.unavailable')}</p>}
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
          <span className="st-lic-name" dir="ltr">{`${lic.name} ${lic.version} — ${lic.license}`}</span>
          <ChevronDown size={18} className="st-chev" aria-hidden="true"/>
         </button>
         {isOpen&&<pre id={panelId} className="st-lic-text" dir="ltr">{lic.text}</pre>}
        </div>
       );
      })}
     </Section>
    </div>
   </div>
  </>
 );
}
