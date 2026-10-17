import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import type {SystemId} from './anatomy';
import type {AtlasIndex} from './atlas-index';

// The whole app's mutable state. Viewer subscribes and renders; UI reads and calls actions. Keep it small.

export type LayerGroupId='skin'|'muscles'|'arteries'|'veins'|'nerves'|'bones'|'joints'|'organs';
/** on = solid and tappable · faded = translucent context, not tappable · off = not drawn. */
export type LayerState='on'|'faded'|'off';
export interface LayerGroup {id:LayerGroupId;name:string;systems:SystemId[];color:string}

// Peel order, outside → in (spec: skin → muscle → vascular → nervous → skeletal), then the rest.
export const LAYER_GROUPS:LayerGroup[]=[
 {id:'skin',name:'Skin',systems:['integumentary'],color:'#ba9b7d'},
 {id:'muscles',name:'Muscles',systems:['muscular'],color:'#a85b50'},
 {id:'arteries',name:'Arteries',systems:['arterial'],color:'#c05245'},
 {id:'veins',name:'Veins',systems:['venous'],color:'#527c9f'},
 {id:'nerves',name:'Nerves',systems:['nervous'],color:'#d8b565'},
 {id:'bones',name:'Bones',systems:['skeletal'],color:'#e2d9ba'},
 {id:'joints',name:'Ligaments & cartilage',systems:['connective'],color:'#aec3bb'},
 {id:'organs',name:'Organs',systems:['cardiac','respiratory','digestive','urinary','reproductive','endocrine','lymphatic','sensory'],color:'#b8916b'},
];
export const groupOfSystem=(s:SystemId)=>LAYER_GROUPS.find(g=>g.systems.includes(s))!.id;
const DEFAULT_LAYERS:Record<LayerGroupId,LayerState>={skin:'off',muscles:'on',arteries:'on',veins:'on',nerves:'on',bones:'on',joints:'on',organs:'on'};

// ---------- settings (persisted on the device) ----------
/** Only the male model ships. The female pipeline exists but is disabled (see ARCHITECTURE.md → Female hybrid). */
export type BodyId='male';
/** high: device pixel ratio up to 3 · balanced: 2 · battery: 1.5 and the lighter LOD always. */
export type Quality='high'|'balanced'|'battery';
/** system follows iOS "Reduce Motion"; reduce = instant camera moves, no momentum; full = always animate. */
export type MotionPref='system'|'reduce'|'full';
/** UI language. Hebrew switches the layout to right-to-left. Anatomy names fall back to English where no Hebrew term exists. */
export type Language='en'|'he';
export interface Settings {
 body:BodyId;
 /** External genitalia are hidden (and the skin covered over) unless this is on. */
 showIntimate:boolean;
 showLatin:boolean;
 haptics:boolean;
 motion:MotionPref;
 quality:Quality;
 language:Language;
}
// First launch follows the device language (WKWebView reports Hebrew on Hebrew devices; Info.plist declares en + he).
const deviceLanguage=():Language=>typeof navigator!=='undefined'&&navigator.language?.toLowerCase().startsWith('he')?'he':'en';
export const DEFAULT_SETTINGS:Settings={body:'male',showIntimate:false,showLatin:true,haptics:true,motion:'system',quality:'balanced',language:deviceLanguage()};

/** Selected concept plus the hierarchy path it was reached by (root 'body' → concept). */
export interface Selection {concept:string;path:string[]}
/** Screen space covered by floating UI (CSS px). The camera frames selections in what remains. */
export interface Insets {right:number;bottom:number;left:number}

interface State {
 index:AtlasIndex|null;
 layers:Record<LayerGroupId,LayerState>;
 isolated:LayerGroupId|null;
 selection:Selection|null;
 insets:Insets;
 /** Incremented to ask the viewer to re-frame the current selection (or the body when none). */
 frameNonce:number;
 /** Incremented to ask the viewer to return to the home view. */
 resetNonce:number;

 setIndex:(index:AtlasIndex)=>void;
 toggleLayer:(id:LayerGroupId)=>void;
 isolateLayer:(id:LayerGroupId)=>void;
 showAllLayers:()=>void;
 selectPart:(part:number)=>void;
 selectConcept:(concept:string,path:string[])=>void;
 stepOut:()=>void;
 clearSelection:()=>void;
 setInsets:(insets:Partial<Insets>)=>void;
 frame:()=>void;
 resetView:()=>void;

 settings:Settings;
 setSetting:<K extends keyof Settings>(key:K,value:Settings[K])=>void;
 resetSettings:()=>void;
 /** Which full-screen sheet is open over the viewer, if any. */
 sheet:'settings'|'credits'|null;
 openSheet:(sheet:'settings'|'credits'|null)=>void;
}

export const useAtlas=create<State>()(persist((set,get)=>({
 index:null,layers:{...DEFAULT_LAYERS},isolated:null,selection:null,insets:{right:0,bottom:0,left:0},frameNonce:0,resetNonce:0,

 setIndex:index=>set({index}),
 // on ↔ faded; an isolated-off layer comes back on.
 toggleLayer:id=>set(s=>({isolated:null,layers:{...s.layers,[id]:s.layers[id]==='on'?'faded':'on'}})),
 isolateLayer:id=>set(s=>s.isolated===id?{isolated:null,layers:{...DEFAULT_LAYERS}}:{isolated:id,layers:Object.fromEntries(LAYER_GROUPS.map(g=>[g.id,g.id===id?'on':'off'])) as Record<LayerGroupId,LayerState>}),
 showAllLayers:()=>set({isolated:null,layers:{...DEFAULT_LAYERS}}),

 selectPart:part=>{const p=get().index?.atlas.parts[part];if(!p)return;set(s=>({selection:{concept:p.concept,path:p.path},frameNonce:s.frameNonce+1}));},
 selectConcept:(concept,path)=>{
  if(concept==='body'){get().clearSelection();get().resetView();return;}
  const at=path.indexOf(concept);set(s=>({selection:{concept,path:at>=0?path.slice(0,at+1):[...path,concept]},frameNonce:s.frameNonce+1}));
 },
 stepOut:()=>{const sel=get().selection;if(!sel)return;const parent=sel.path.at(-2);if(!parent)get().clearSelection();else get().selectConcept(parent,sel.path);},
 clearSelection:()=>set({selection:null}),
 setInsets:insets=>set(s=>{const next={...s.insets,...insets};return next.right===s.insets.right&&next.bottom===s.insets.bottom&&next.left===s.insets.left?s:{insets:next};}),
 frame:()=>set(s=>({frameNonce:s.frameNonce+1})),
 resetView:()=>set(s=>({resetNonce:s.resetNonce+1})),

 settings:{...DEFAULT_SETTINGS},
 // Switching body invalidates the index and selection; page.tsx reloads the atlas for the new body.
 setSetting:(key,value)=>set(s=>key==='body'&&value!==s.settings.body
  ?{settings:{...s.settings,[key]:value},index:null,selection:null,isolated:null,layers:{...DEFAULT_LAYERS}}
  :{settings:{...s.settings,[key]:value}}),
 resetSettings:()=>set(s=>s.settings.body===DEFAULT_SETTINGS.body?{settings:{...DEFAULT_SETTINGS}}:{settings:{...DEFAULT_SETTINGS},index:null,selection:null,isolated:null,layers:{...DEFAULT_LAYERS}}),
 sheet:null,
 openSheet:sheet=>set({sheet}),
}),{
 name:'body-explorer.settings',version:2,
 // Only preferences persist; anatomy state starts fresh each launch.
 partialize:s=>({settings:s.settings}),
 // v1 could store body 'female', which no longer exists: always male.
 merge:(saved,current)=>({...current,settings:{...DEFAULT_SETTINGS,...(saved as {settings?:Partial<Settings>})?.settings,body:'male'}}),
 migrate:state=>state as never,
}));

/** Parts (mesh indices) of the current selection, or null. */
export const selectionParts=(s:Pick<State,'index'|'selection'>)=>s.selection&&s.index?s.index.concept(s.selection.concept)?.parts??null:null;
