import {Haptics, ImpactStyle} from '@capacitor/haptics';

// Fire-and-forget impacts. On the web (or any failure) the call is a no-op; callers never await.
const impact=(style:ImpactStyle)=>{
 try{Haptics.impact({style}).catch(()=>{});}catch{/* unsupported platform */}
};

export const haptic={
 light:()=>impact(ImpactStyle.Light),
 medium:()=>impact(ImpactStyle.Medium),
};
