import { depthInputSize, reliefFromDepth, toModelInput, type Relief } from '../analysis/relief'
import type { DepthMessage, DepthRequest } from './depthWorker'

let worker: Worker | null = null

/**
 * 壁の写真から凹凸を推定する（端末内で実行。画像は外部に送らない）。
 * onProgress にはモデルのダウンロード済みバイト数と全体のバイト数（不明なら 0）が、推定を始めたら (1, 1) が渡る
 */
export function estimateRelief(photo: HTMLCanvasElement, onProgress?: (loaded: number, total: number) => void): Promise<Relief> {
  const size = depthInputSize(photo.width, photo.height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return Promise.reject(new Error('画像を処理できませんでした'))
  ctx.drawImage(photo, 0, 0, size.width, size.height)
  const input = toModelInput(ctx.getImageData(0, 0, size.width, size.height).data, size.width, size.height)

  worker ??= new Worker(new URL('./depthWorker.ts', import.meta.url), { type: 'module' })
  const w = worker
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<DepthMessage>) => {
      const m = e.data
      if (m.type === 'progress') onProgress?.(m.loaded, m.total)
      else if (m.type === 'running') onProgress?.(1, 1)
      else if (m.type === 'error') reject(new Error(m.message))
      else {
        try {
          resolve(reliefFromDepth(m.depth, m.width, m.height))
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }
    w.onerror = (e) => reject(new Error(e.message || '奥行きの推定に失敗しました'))
    const req: DepthRequest = { input, width: size.width, height: size.height }
    w.postMessage(req, [input.buffer])
  })
}
