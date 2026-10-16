import type {CapacitorConfig} from '@capacitor/cli';

// Offline-only shell: no server.url, so the WebView loads the bundled dist/ from capacitor://localhost.
const config:CapacitorConfig={
 appId:'com.amirmghanem.humanatlas',
 appName:'Human Atlas',
 webDir:'dist',
 ios:{
  contentInset:'never',
  backgroundColor:'#1A1A1A',
  // Lets Safari's Web Inspector attach to TestFlight builds (iOS 16.4+). Turned off for App Store release.
  webContentsDebuggingEnabled:process.env.CAP_RELEASE!=='1',
 },
};
export default config;
