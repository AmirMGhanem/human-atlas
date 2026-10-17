import {useCallback} from 'react';
import {useAtlas, type Language, type LayerGroupId} from './store';
import {displayName, type Explanation} from './atlas-index';
import type {SystemId} from './anatomy';

// Tiny dictionary: English is the source of truth, Hebrew must have exactly the same keys (enforced by the type).
// Latin terms, license texts, credit strings and URLs are never translated.

const EN = {
 'layers.show': 'Show layers',
 'layers.hide': 'Hide layers',
 'layers.group': 'Anatomical layers',
 'layers.hint': 'Tap to show or hide · long-press to isolate',
 'layers.partial': 'partial',
 'layers.partialLabel': '{name} (partial in this model)',
 'layers.showAll': 'Show all',

 'status.loading': 'Loading…',
 'status.loadingPct': 'Loading anatomy {p}%',
 'status.error': '{detail}',

 'drawer.close': 'Close details',
 'drawer.expand': 'Expand details',
 'drawer.collapse': 'Collapse details',
 'drawer.hierarchy': 'Hierarchy',
 'drawer.showLevels': 'Show all {n} levels',
 'drawer.aboutSystem': 'About the {system}',
 'drawer.about': 'About',
 'drawer.systemFallback': 'system',
 'drawer.partOf': 'Part of',
 'drawer.borrowed': 'From the male reference model, fitted to this body: the open female dataset does not include this structure.',
 'drawer.includes': 'Includes',
 'drawer.more': '+{n} more',
 'drawer.frame': 'Frame',
 'drawer.stepOut': 'Step out',
 'drawer.bodyRoot': 'Body',

 'settings.title': 'Settings',
 'settings.open': 'Settings',
 'settings.close': 'Close settings',
 'settings.language': 'Language',
 'settings.langEn': 'English',
 'settings.langHe': 'עברית',
 'settings.body': 'Body',
 'settings.model': 'Model',
 'settings.male': 'Male',
 'settings.female': 'Female',
 'settings.femaleHelp': 'The female model comes from a different open reference set (organs, brain, nerves, spine, pelvis and legs). Its skull, ribs, arms, hands, feet, muscles and ligaments are borrowed from the male model and fitted to her body, and are labelled as such.',
 'settings.anatomy': 'Anatomy',
 'settings.intimate': 'Show intimate anatomy',
 'settings.intimateDesc': 'External genitalia. Hidden by default.',
 'settings.latin': 'Latin terms',
 'settings.latinDesc': 'Show the formal Latin name under each structure.',
 'settings.experience': 'Experience',
 'settings.haptics': 'Haptics',
 'settings.motion': 'Motion',
 'settings.motion.system': 'System',
 'settings.motion.reduce': 'Reduced',
 'settings.motion.full': 'Full',
 'settings.graphics': 'Graphics',
 'settings.graphicsDesc': 'High uses full screen resolution; Battery saves power on older devices.',
 'settings.quality.battery': 'Battery',
 'settings.quality.balanced': 'Balanced',
 'settings.quality.high': 'High',
 'settings.about': 'About',
 'settings.credits': 'Credits & Licenses',
 'settings.reset': 'Reset settings',
 'settings.disclaimer': 'Body Explorer is an educational reference, not a diagnostic or clinical tool.',

 'credits.back': 'Back to settings',
 'credits.close': 'Close credits',
 'credits.title': 'Credits & Licenses',
 'credits.anatomyData': 'Anatomy data',
 'credits.license': 'License:',
 'credits.source': 'Source:',
 'credits.changes': 'Changes:',
 'credits.oss': 'Open-source software',
 'credits.unavailable': 'License texts unavailable.',

} as const;

export type Key = keyof typeof EN;

const HE: Record<Key, string> = {
 'layers.show': 'הצג שכבות',
 'layers.hide': 'הסתר שכבות',
 'layers.group': 'שכבות אנטומיות',
 'layers.hint': 'הקש להצגה או להסתרה · לחיצה ארוכה לבידוד',
 'layers.partial': 'חלקי',
 'layers.partialLabel': '{name} (חלקי במודל זה)',
 'layers.showAll': 'הצג הכול',

 'status.loading': 'טוען…',
 'status.loadingPct': 'טוען אנטומיה {p}%',
 'status.error': 'שגיאה: {detail}',

 'drawer.close': 'סגור פרטים',
 'drawer.expand': 'הרחב פרטים',
 'drawer.collapse': 'צמצם פרטים',
 'drawer.hierarchy': 'היררכיה',
 'drawer.showLevels': 'הצג את כל {n} הרמות',
 'drawer.aboutSystem': 'על {system}',
 'drawer.about': 'אודות',
 'drawer.systemFallback': 'המערכת',
 'drawer.partOf': 'חלק מ',
 'drawer.borrowed': 'מבנה זה נלקח מדגם הייחוס הגברי והותאם לגוף זה, משום שמאגר הנתונים הנשי הפתוח אינו כולל אותו.',
 'drawer.includes': 'כולל',
 'drawer.more': '+{n} נוספים',
 'drawer.frame': 'מיקוד',
 'drawer.stepOut': 'רמה למעלה',
 'drawer.bodyRoot': 'הגוף',

 'settings.title': 'הגדרות',
 'settings.open': 'הגדרות',
 'settings.close': 'סגור הגדרות',
 'settings.language': 'שפה',
 'settings.langEn': 'English',
 'settings.langHe': 'עברית',
 'settings.body': 'גוף',
 'settings.model': 'דגם',
 'settings.male': 'זכר',
 'settings.female': 'נקבה',
 'settings.femaleHelp': 'דגם הנקבה מבוסס על מאגר ייחוס פתוח אחר (איברים, מוח, עצבים, עמוד שדרה, אגן ורגליים). הגולגולת, הצלעות, הזרועות, כפות הידיים והרגליים, השרירים והרצועות נלקחו מהדגם הגברי והותאמו לגופה, ומסומנים ככאלה.',
 'settings.anatomy': 'אנטומיה',
 'settings.intimate': 'הצגת אברי מין חיצוניים',
 'settings.intimateDesc': 'מוסתרים כברירת מחדל',
 'settings.latin': 'מונחים בלטינית',
 'settings.latinDesc': 'הצגת השם הלטיני הרשמי מתחת לכל מבנה.',
 'settings.experience': 'חוויה',
 'settings.haptics': 'משוב רטט',
 'settings.motion': 'תנועה',
 'settings.motion.system': 'מערכת',
 'settings.motion.reduce': 'מופחתת',
 'settings.motion.full': 'מלאה',
 'settings.graphics': 'גרפיקה',
 'settings.graphicsDesc': '"גבוה" משתמש ברזולוציה המלאה של המסך. "חיסכון בסוללה" חוסך בצריכת החשמל במכשירים ישנים.',
 'settings.quality.battery': 'חיסכון בסוללה',
 'settings.quality.balanced': 'מאוזן',
 'settings.quality.high': 'גבוה',
 'settings.about': 'אודות',
 'settings.credits': 'קרדיטים ורישיונות',
 'settings.reset': 'איפוס הגדרות',
 'settings.disclaimer': 'Body Explorer הוא מדריך חינוכי בלבד, ואינו כלי אבחון או כלי קליני.',

 'credits.back': 'חזרה להגדרות',
 'credits.close': 'סגור קרדיטים',
 'credits.title': 'קרדיטים ורישיונות',
 'credits.anatomyData': 'נתוני אנטומיה',
 'credits.license': 'רישיון:',
 'credits.source': 'מקור:',
 'credits.changes': 'שינויים:',
 'credits.oss': 'תוכנה בקוד פתוח',
 'credits.unavailable': 'נוסחי הרישיונות אינם זמינים.',

};

export const STRINGS = {en: EN, he: HE} as const;

// Layer group names (store.ts LAYER_GROUPS). Short labels on narrow phones use the first word, as in English.
export const GROUP_NAMES: Record<LayerGroupId, Record<Language, string>> = {
 skin: {en: 'Skin', he: 'עור'},
 muscles: {en: 'Muscles', he: 'שרירים'},
 arteries: {en: 'Arteries', he: 'עורקים'},
 veins: {en: 'Veins', he: 'ורידים'},
 nerves: {en: 'Nerves', he: 'עצבים'},
 bones: {en: 'Bones', he: 'עצמות'},
 joints: {en: 'Ligaments & cartilage', he: 'רצועות וסחוסים'},
 organs: {en: 'Organs', he: 'איברים'},
};

// System names and descriptions (anatomy.ts SYSTEMS). Descriptions are used for "About the {system}".
export const SYSTEM_NAMES: Record<SystemId, Record<Language, string>> = {
 skeletal: {en: 'Skeleton', he: 'מערכת השלד'},
 muscular: {en: 'Muscles', he: 'מערכת השרירים'},
 cardiac: {en: 'Heart', he: 'הלב'},
 sensory: {en: 'Sensory organs', he: 'איברי חישה'},
 arterial: {en: 'Arteries', he: 'עורקים'},
 venous: {en: 'Veins', he: 'ורידים'},
 nervous: {en: 'Nervous system', he: 'מערכת העצבים'},
 respiratory: {en: 'Respiratory', he: 'מערכת הנשימה'},
 digestive: {en: 'Digestive', he: 'מערכת העיכול'},
 urinary: {en: 'Urinary', he: 'מערכת השתן'},
 lymphatic: {en: 'Lymphatic', he: 'מערכת הלימפה'},
 endocrine: {en: 'Endocrine', he: 'המערכת האנדוקרינית'},
 reproductive: {en: 'Reproductive', he: 'מערכת הרבייה'},
 integumentary: {en: 'Body surface', he: 'פני הגוף'},
 connective: {en: 'Connective tissue', he: 'רקמת חיבור'},
};

const SYSTEM_DESCRIPTIONS_HE: Partial<Record<SystemId, string>> = {
 skeletal: 'העצמות מהוות את מסגרת התמיכה של הגוף, מגנות על איברים ומספקות נקודות אחיזה לשרירים. הרקמה הפנימית שלהן מאחסנת גם מינרלים ומייצרת תאי דם.',
 muscular: 'שרירי השלד יוצרים תנועה על ידי משיכה בנקודות ההתקשרות שלהם. יחד עם הגידים הם מניעים מפרקים, מייצבים את היציבה ומייצרים חום.',
 cardiac: 'הלב הוא משאבה שרירית בעלת ארבעה חדרים. השסתומים שלו מכוונים את הדם קדימה במחזור הריאתי ובמחזור הגופני.',
 sensory: 'מבנים אלה תורמים לחושים המיוחדים, ובהם הראייה, השמיעה והשיווי משקל. הרקמות המיוחדות שלהם קולטות גירויים ופועלות יחד עם מערכת העצבים כדי להעביר מידע.',
 arterial: 'הלב מניע את הדם במחזור. העורקים מובילים דם מהלב אל הרקמות, או במחזור הריאתי אל הריאות.',
 venous: 'הוורידים מחזירים דם אל הלב. רשתות שטחיות ועמוקות אוספות דם מהרקמות; ורידי הריאה מחזירים דם מחומצן מהריאות.',
 nervous: 'המוח, חוט השדרה והעצבים ההיקפיים נושאים ומעבדים אותות. הם תומכים בתחושה, בתנועה, בתיאום ובוויסות אוטומטי של תפקודי הגוף.',
 respiratory: 'דרכי האוויר מובילות אוויר אל הריאות, שם חמצן ופחמן דו-חמצני עוברים בין האוויר לדם. הנשימה תלויה בשינויי לחץ שנוצרים על ידי שרירי הנשימה.',
 digestive: 'מערכת העיכול מפרקת מזון, סופגת חומרים מזינים ומים, ומעבירה הלאה פסולת. איברי עזר תורמים מרה ואנזימי עיכול.',
 urinary: 'הכליות מסננות את הדם ומווסתות את איזון הנוזלים, האלקטרוליטים והחומציות בגוף. השתן עובר דרך השופכנים אל שלפוחית השתן ויוצא דרך שופכת השתן.',
 lymphatic: 'כלי הלימפה מחזירים נוזל רקמתי עודף למחזור הדם. בלוטות הלימפה ואיברים לימפואידיים אחרים תומכים בפיקוח החיסוני ובתגובות החיסוניות.',
 endocrine: 'איברים אנדוקריניים מפרישים הורמונים אל הדם כדי לתאם תהליכים כגון חילוף חומרים, צמיחה, תגובות ללחץ והתרבות.',
 reproductive: 'מבני הרבייה הגבריים המוצגים כאן תורמים לייצור זרע, להבשלתו, להובלתו ולייצור הורמוני מין.',
 integumentary: 'פני הגוף מספקים מסגרת התייחסות אנטומית חיצונית. מערכת העור מהווה מחסום מגן ותורמת לתחושה ולוויסות חום.',
 connective: 'סחוסים, רצועות ורקמות חיבור אחרות תומכים, מחברים ומפרידים בין מבנים. תפקידיהם כוללים ייצוב מפרקים וחלוקת עומסים מכניים.',
};

// Structure explanations (anatomy.ts EXPLANATIONS), keyed the same way explanationFor() looks them up.
const STRUCTURE_EXPLANATIONS_HE: Record<string, string> = {
 'heart': 'משאבה שרירית בחזה. צדה הימני שולח דם אל הריאות; צדה השמאלי שולח דם במחזור הגופני.',
 'liver': 'איבר גדול מתחת לצד הימני של הסרעפת. הוא מעבד חומרים מזינים שנספגו, מייצר מרה, ומסנתז חלבונים רבים הנישאים בדם.',
 'brain': 'האיבר המרכזי של מערכת העצבים. אזוריו המקושרים זה לזה תומכים בתפיסה, בתנועה, בזיכרון, בשפה ובוויסות תפקודי הגוף.',
 'stomach': 'תא שרירי בין הוושט למעי הדק. הוא מאחסן את המזון, מערבב אותו עם חומצה ואנזימים, ורק אז מעביר אותו לתריסריון.',
 'spleen': 'איבר לימפואידי בבטן העליונה השמאלית. הוא מסנן דם, מסיר תאי דם מזדקנים ומשתתף בתגובות חיסוניות.',
 'pancreas': 'איבר בבטן בעל תפקידים עיכוליים ואנדוקריניים. הוא מספק אנזימים למעי הדק ומפריש הורמונים, ובהם אינסולין וגלוקגון.',
 'urinary bladder': 'מאגר שרירי באגן שאוגר שתן שמגיע מהכליות דרך השופכנים.',
 'trachea': 'דרכי האוויר הראשיות המחברות את הגרון לסעפות. הסחוסים שלהן שומרים על פתיחות דרכי הנשימה במהלך הנשימה.',
 'diaphragm': 'שריר רחב המפריד בין החזה לבטן. כשהוא מתכווץ, נפח החזה גדל והוא מסייע במשיכת אוויר אל הריאות.',
};

/** Explanation text in the current language. Falls back to the English text when no Hebrew one exists. */
export function localizeExplanation(lang:Language,name:string,system:SystemId|'',en:Explanation):string{
 if(lang!=='he')return en.text;
 if(en.kind==='structure')return STRUCTURE_EXPLANATIONS_HE[name.toLowerCase().replace(/^(left|right) /,'')]??en.text;
 return (system&&SYSTEM_DESCRIPTIONS_HE[system])||en.text;
}

type Vars=Record<string,string|number>;

/** Translate a key for a language, filling {name} placeholders. */
export function translate(lang:Language,key:Key,vars?:Vars):string{
 const s=STRINGS[lang][key];
 return vars?s.replace(/\{(\w+)\}/g,(m,k:string)=>k in vars?String(vars[k]):m):s;
}

/** Current UI language from the store. */
export function useLanguage():Language{
 return useAtlas(s=>s.settings.language);
}

/** t(key, vars) for the current language; re-renders with the setting. */
export function useT(){
 const lang=useLanguage();
 return useCallback((key:Key,vars?:Vars)=>translate(lang,key,vars),[lang]);
}

/** Concept display name: Hebrew when the language is he and a Hebrew term exists, else the English name. */
export function useConceptName(){
 const lang=useLanguage();
 // The synthetic hierarchy roots ('body', 'system:<id>') are named here rather than in the data.
 return useCallback((c:{id?:string;name:string;he?:string})=>{
  if(c.id==='body')return lang==='he'?'גוף':'Body';
  const sys=c.id?.startsWith('system:')?c.id.slice(7) as SystemId:undefined;
  if(sys&&SYSTEM_NAMES[sys])return SYSTEM_NAMES[sys][lang];
  return lang==='he'&&c.he?c.he:displayName(c.name);
 },[lang]);
}

/** Localized group or system name, in the current language. */
export function useGroupName(){
 const lang=useLanguage();
 return useCallback((id:LayerGroupId)=>GROUP_NAMES[id][lang],[lang]);
}
export function useSystemName(){
 const lang=useLanguage();
 return useCallback((id:SystemId)=>SYSTEM_NAMES[id][lang],[lang]);
}
