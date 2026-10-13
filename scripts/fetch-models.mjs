// MediaPipe の wasm とポーズ推定モデルを public/mediapipe/ に配置する。
// wasm は node_modules からコピー、モデルはダウンロード（失敗してもビルドは止めず、実行時に CDN へフォールバック）。
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const outDir = join(root, 'public/mediapipe')
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

async function exists(p) {
  try {
    return (await stat(p)).size > 0
  } catch {
    return false
  }
}

await mkdir(join(outDir, 'wasm'), { recursive: true })
await mkdir(join(outDir, 'models'), { recursive: true })

for (const f of [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]) {
  await copyFile(join(wasmSrc, f), join(outDir, 'wasm', f))
}
console.log('[fetch-models] wasm copied')

const modelPath = join(outDir, 'models/pose_landmarker_lite.task')
if (await exists(modelPath)) {
  console.log('[fetch-models] model already present')
} else {
  try {
    const res = await fetch(MODEL_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await writeFile(modelPath, Buffer.from(await res.arrayBuffer()))
    console.log('[fetch-models] model downloaded')
  } catch (e) {
    console.warn(`[fetch-models] model download failed (${e.message}); the app will fall back to the CDN at runtime`)
  }
}
