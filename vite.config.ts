/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// base は相対パス: GitHub Pages（/Crimb/ や /Crimb/pr-12/）と Capacitor の両方で同じビルドを使えるようにする
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'Crimb — ボルダリング解析',
        short_name: 'Crimb',
        description: 'クライミング動画からムーブを解析して改善案と成長を記録',
        lang: 'ja',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 姿勢推定の wasm (約13MB) とモデル（MediaPipe、YOLO-pose 約 11MB）もプリキャッシュしてジムの圏外でも解析できるようにする
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}', 'mediapipe/wasm/vision_wasm_internal.*', 'mediapipe/models/*.task', 'models/*.onnx'],
        // 本番の SW が /Crimb/pr-preview/pr-N/ への遷移に本番 index.html を返して白画面にしないように
        navigateFallbackDenylist: [/\/pr-preview\//],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/mediapipe/'),
            handler: 'CacheFirst',
            options: { cacheName: 'mediapipe-runtime' },
          },
          // 壁の凹凸推定（押したときだけ使う）のモデルと実行環境。大きいのでプリキャッシュせず、初回に取得したものを使い回す
          {
            urlPattern: ({ url }) => url.hostname === 'huggingface.co' && url.pathname.endsWith('.onnx'),
            handler: 'CacheFirst',
            options: { cacheName: 'depth-model', cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/assets/ort-') && url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: { cacheName: 'depth-runtime' },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: { reporter: ['text', 'json-summary'], include: ['src/analysis/**', 'src/pose/smoothing.ts'] },
  },
})
