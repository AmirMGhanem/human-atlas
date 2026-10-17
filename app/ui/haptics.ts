import {Haptics, ImpactStyle} from '@capacitor/haptics';
import {useAtlas} from '../store';

// Fire-and-forget impacts. On the web (or any failure) the call is a no-op; callers never await.
const impact=(style:ImpactStyle)=>{
 if(!useAtlas.getState().settings.haptics)return;
 try{Haptics.impact({style}).catch(()=>{});}catch{/* unsupported platform */}
};

export const haptic={
 light:()=>impact(ImpactStyle.Light),
 medium:()=>impact(ImpactStyle.Medium),
};
