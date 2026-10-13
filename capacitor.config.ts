import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.crimb.climb',
  appName: 'Crimb',
  webDir: 'dist',
  android: {
    // 解析中にバックグラウンドへ回されても WebView を止めにくくする
    backgroundColor: '#0f172a',
  },
}

export default config
