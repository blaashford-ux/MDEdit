import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.blaashford.mdedit',
  appName: 'MDEdit',
  webDir: 'dist-mobile',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
  // fetch() goes through the native HTTP stack (no browser CORS rules), which is what the Google Drive calls want.
  plugins: { CapacitorHttp: { enabled: true } },
};

export default config;
