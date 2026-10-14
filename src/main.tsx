import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { reloadWhenIdle } from './lib/swUpdate'
import './index.css'

// Capacitor (APK) 内では Service Worker 不要。更新時のリロードは未保存の撮影・解析を消さないよう遅らせる
if (!('Capacitor' in window)) registerSW({ immediate: true, onNeedReload: reloadWhenIdle })

// 記録（IndexedDB）がストレージ逼迫時に消されないよう永続化を要求する。拒否されても続行
navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
