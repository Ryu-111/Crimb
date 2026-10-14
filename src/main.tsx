import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

// Capacitor (APK) 内では Service Worker 不要
if (!('Capacitor' in window)) registerSW({ immediate: true })

// 記録（IndexedDB）がストレージ逼迫時に消されないよう永続化を要求する。拒否されても続行
navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
