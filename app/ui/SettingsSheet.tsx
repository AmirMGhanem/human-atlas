import {useEffect, useId, useRef, type ReactNode} from 'react';
import {ChevronRight, Settings, X} from 'lucide-react';
import {useAtlas, type BodyId, type MotionPref, type Quality} from '../store';
import {haptic} from './haptics';
import './settings.css';

const BODY_OPTIONS:{value:BodyId;label:string}[]=[{value:'male',label:'Male'},{value:'female',label:'Female'}];
const MOTION_OPTIONS:{value:MotionPref;label:string}[]=[
 {value:'system',label:'System'},{value:'reduce',label:'Reduced'},{value:'full',label:'Full'},
];
const QUALITY_OPTIONS:{value:Quality;label:string}[]=[
 {value:'battery',label:'Battery'},{value:'balanced',label:'Balanced'},{value:'high',label:'High'},
];
const FEMALE_HELP='The female model comes from a different open reference set. Its organs, brain and nerves are detailed, but its bones cover only the spine, pelvis and legs, and its muscles only the eyes and front thighs.';

function Section({title,children}:{title:string;children:ReactNode}){
 const id=useId();
 return (
  <section className="st-section" aria-labelledby={id}>
   <h3 id={id} className="st-h">{title}</h3>
   <div className="st-card">{children}</div>
  </section>
 );
}

function SwitchRow({label,description,checked,onChange}:{label:string;description?:string;checked:boolean;onChange:(v:boolean)=>void}){
 const labelId=useId();
 const descId=useId();
 return (
  <div className="st-row">
   <div className="st-row-text">
    <span id={labelId} className="st-label">{label}</span>
    {description&&<p id={descId} className="st-desc">{description}</p>}
   </div>
   <button
    type="button"
    role="switch"
    className="st-switch"
    aria-checked={checked}
    aria-labelledby={labelId}
    aria-describedby={description?descId:undefined}
    onClick={()=>{onChange(!checked);haptic.light();}}
   />
  </div>
 );
}

interface SegmentedRowProps<T extends string>{
 label:string;
 description?:string;
 help?:string;
 value:T;
 options:{value:T;label:string}[];
 onChange:(v:T)=>void;
}

function SegmentedRow<T extends string>({label,description,help,value,options,onChange}:SegmentedRowProps<T>){
 const labelId=useId();
 const descId=useId();
 const helpId=useId();
 const describedBy=[description?descId:'',help?helpId:''].filter(Boolean).join(' ')||undefined;
 return (
  <div className="st-row is-stack">
   <div className="st-row-text">
    <span id={labelId} className="st-label">{label}</span>
    {description&&<p id={descId} className="st-desc">{description}</p>}
   </div>
   <div className="st-seg" role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
    {options.map(o=>(
     <button
      key={o.value}
      type="button"
      className="st-seg-btn"
      aria-pressed={value===o.value}
      onClick={()=>{if(o.value!==value){onChange(o.value);haptic.light();}}}
     >
      {o.label}
     </button>
    ))}
   </div>
   {help&&<p id={helpId} className="st-help">{help}</p>}
  </div>
 );
}

export default function SettingsSheet(){
 const settings=useAtlas(s=>s.settings);
 const setSetting=useAtlas(s=>s.setSetting);
 const resetSettings=useAtlas(s=>s.resetSettings);
 const sheet=useAtlas(s=>s.sheet);
 const openSheet=useAtlas(s=>s.openSheet);

 const open=sheet==='settings';
 const titleId=useId();
 const gearRef=useRef<HTMLButtonElement>(null);
 const sheetRef=useRef<HTMLDivElement>(null);

 // Escape closes; focus moves into the sheet on open and returns to the gear on close.
 useEffect(()=>{
  if(!open)return;
  sheetRef.current?.focus();
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')openSheet(null);};
  document.addEventListener('keydown',onKey);
  return ()=>{
   document.removeEventListener('keydown',onKey);
   gearRef.current?.focus({preventScroll:true});
  };
 },[open,openSheet]);

 return (
  <>
   <button
    ref={gearRef}
    type="button"
    className="st-gear"
    aria-label="Settings"
    onClick={()=>openSheet('settings')}
   >
    <Settings size={22} strokeWidth={1.75}/>
   </button>

   {open&&(
    <>
     <button type="button" className="st-backdrop" aria-label="Close settings" tabIndex={-1} onClick={()=>openSheet(null)}/>
     <div ref={sheetRef} className="st-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="st-head">
       <h2 id={titleId} className="st-title">Settings</h2>
       <button type="button" className="st-icon-btn" aria-label="Close settings" onClick={()=>openSheet(null)}>
        <X size={22}/>
       </button>
      </header>

      <div className="st-body">
       <Section title="Body">
        <SegmentedRow
         label="Model"
         value={settings.body}
         options={BODY_OPTIONS}
         help={settings.body==='female'?FEMALE_HELP:undefined}
         onChange={v=>setSetting('body',v)}
        />
       </Section>

       <Section title="Anatomy">
        <SwitchRow
         label="Show intimate anatomy"
         description="External genitalia. Hidden by default."
         checked={settings.showIntimate}
         onChange={v=>setSetting('showIntimate',v)}
        />
        <SwitchRow
         label="Latin terms"
         description="Show the formal Latin name under each structure."
         checked={settings.showLatin}
         onChange={v=>setSetting('showLatin',v)}
        />
       </Section>

       <Section title="Experience">
        <SwitchRow label="Haptics" checked={settings.haptics} onChange={v=>setSetting('haptics',v)}/>
        <SegmentedRow
         label="Motion"
         value={settings.motion}
         options={MOTION_OPTIONS}
         onChange={v=>setSetting('motion',v)}
        />
        <SegmentedRow
         label="Graphics"
         description="High uses full screen resolution; Battery saves power on older devices."
         value={settings.quality}
         options={QUALITY_OPTIONS}
         onChange={v=>setSetting('quality',v)}
        />
       </Section>

       <Section title="About">
        <button type="button" className="st-link" onClick={()=>openSheet('credits')}>
         Credits &amp; Licenses
         <ChevronRight size={18} aria-hidden="true"/>
        </button>
        <button
         type="button"
         className="st-link is-muted"
         onClick={()=>{resetSettings();haptic.light();}}
        >
         Reset settings
        </button>
       </Section>

       <p className="st-foot">Body Explorer is an educational reference, not a diagnostic or clinical tool.</p>
      </div>
     </div>
    </>
   )}
  </>
 );
}
