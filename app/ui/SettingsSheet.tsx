import {useEffect, useId, useRef, type ReactNode} from 'react';
import {ChevronRight, Settings, X} from 'lucide-react';
import {useAtlas, type BodyId, type Language, type MotionPref, type Quality} from '../store';
import {translate, useT} from '../i18n';
import {haptic} from './haptics';
import './settings.css';

// Each language is labelled in its own language, whatever the current UI language is.
const LANGUAGE_OPTIONS:{value:Language;label:string}[]=[
 {value:'en',label:translate('en','settings.langEn')},{value:'he',label:translate('he','settings.langHe')},
];

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

interface SegmentedButtonsProps<T extends string>{
 label:string;
 describedBy?:string;
 value:T;
 options:{value:T;label:string}[];
 onChange:(v:T)=>void;
}

function SegmentedButtons<T extends string>({label,describedBy,value,options,onChange}:SegmentedButtonsProps<T>){
 return (
  <div className="st-seg" role="group" aria-label={label} aria-describedby={describedBy}>
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
   <SegmentedButtons label={label} describedBy={describedBy} value={value} options={options} onChange={onChange}/>
   {help&&<p id={helpId} className="st-help">{help}</p>}
  </div>
 );
}

export default function SettingsSheet(){
 const t=useT();
 const settings=useAtlas(s=>s.settings);
 const setSetting=useAtlas(s=>s.setSetting);
 const resetSettings=useAtlas(s=>s.resetSettings);
 const sheet=useAtlas(s=>s.sheet);
 const openSheet=useAtlas(s=>s.openSheet);

 const open=sheet==='settings';
 const titleId=useId();
 const gearRef=useRef<HTMLButtonElement>(null);
 const sheetRef=useRef<HTMLDivElement>(null);

 const bodyOptions:{value:BodyId;label:string}[]=[{value:'male',label:t('settings.male')},{value:'female',label:t('settings.female')}];
 const motionOptions:{value:MotionPref;label:string}[]=[
  {value:'system',label:t('settings.motion.system')},{value:'reduce',label:t('settings.motion.reduce')},{value:'full',label:t('settings.motion.full')},
 ];
 const qualityOptions:{value:Quality;label:string}[]=[
  {value:'battery',label:t('settings.quality.battery')},{value:'balanced',label:t('settings.quality.balanced')},{value:'high',label:t('settings.quality.high')},
 ];

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
    aria-label={t('settings.open')}
    onClick={()=>openSheet('settings')}
   >
    <Settings size={22} strokeWidth={1.75}/>
   </button>

   {open&&(
    <>
     <button type="button" className="st-backdrop" aria-label={t('settings.close')} tabIndex={-1} onClick={()=>openSheet(null)}/>
     <div ref={sheetRef} className="st-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="st-head">
       <h2 id={titleId} className="st-title">{t('settings.title')}</h2>
       <button type="button" className="st-icon-btn" aria-label={t('settings.close')} onClick={()=>openSheet(null)}>
        <X size={22}/>
       </button>
      </header>

      <div className="st-body">
       <Section title={t('settings.language')}>
        <div className="st-row is-stack">
         <SegmentedButtons
          label={t('settings.language')}
          value={settings.language}
          options={LANGUAGE_OPTIONS}
          onChange={v=>setSetting('language',v)}
         />
        </div>
       </Section>

       <Section title={t('settings.body')}>
        <SegmentedRow
         label={t('settings.model')}
         value={settings.body}
         options={bodyOptions}
         help={settings.body==='female'?t('settings.femaleHelp'):undefined}
         onChange={v=>setSetting('body',v)}
        />
       </Section>

       <Section title={t('settings.anatomy')}>
        <SwitchRow
         label={t('settings.intimate')}
         description={t('settings.intimateDesc')}
         checked={settings.showIntimate}
         onChange={v=>setSetting('showIntimate',v)}
        />
        <SwitchRow
         label={t('settings.latin')}
         description={t('settings.latinDesc')}
         checked={settings.showLatin}
         onChange={v=>setSetting('showLatin',v)}
        />
       </Section>

       <Section title={t('settings.experience')}>
        <SwitchRow label={t('settings.haptics')} checked={settings.haptics} onChange={v=>setSetting('haptics',v)}/>
        <SegmentedRow
         label={t('settings.motion')}
         value={settings.motion}
         options={motionOptions}
         onChange={v=>setSetting('motion',v)}
        />
        <SegmentedRow
         label={t('settings.graphics')}
         description={t('settings.graphicsDesc')}
         value={settings.quality}
         options={qualityOptions}
         onChange={v=>setSetting('quality',v)}
        />
       </Section>

       <Section title={t('settings.about')}>
        <button type="button" className="st-link" onClick={()=>openSheet('credits')}>
         {t('settings.credits')}
         <ChevronRight size={18} aria-hidden="true" className="ico-flip"/>
        </button>
        <button
         type="button"
         className="st-link is-muted"
         onClick={()=>{resetSettings();haptic.light();}}
        >
         {t('settings.reset')}
        </button>
       </Section>

       <p className="st-foot">{t('settings.disclaimer')}</p>
      </div>
     </div>
    </>
   )}
  </>
 );
}
