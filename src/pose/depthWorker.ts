// 写真 1 枚の奥行き推定を Web Worker で行う（数秒かかるので画面を止めない）
import * as ort from 'onnxruntime-web/wasm'

/** Depth Anything V2 Small（Apache-2.0）の int8 量子化版。約 27MB。初回だけダウンロードし、以降は SW がキャッシュから返す */
export const DEPTH_MODEL_URL =
  'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx'

export interface DepthRequest {
  input: Float32Array
  width: number
  height: number
}

export type DepthMessage =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'running' }
  | { type: 'done'; depth: Float32Array; width: number; height: number }
  | { type: 'error'; message: string }

// GitHub Pages は cross-origin isolation を設定できず SharedArrayBuffer が使えないので 1 スレッド
ort.env.wasm.numThreads = 1

const post = (m: DepthMessage, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer)

let session: Promise<ort.InferenceSession> | null = null

async function load(): Promise<ort.InferenceSession> {
  const res = await fetch(DEPTH_MODEL_URL)
  if (!res.ok || !res.body) throw new Error(`モデルを取得できませんでした (${res.status})`)
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    post({ type: 'progress', loaded, total })
  }
  const model = new Uint8Array(loaded)
  let offset = 0
  for (const c of chunks) {
    model.set(c, offset)
    offset += c.length
  }
  return ort.InferenceSession.create(model, { executionProviders: ['wasm'] })
}

self.onmessage = async (e: MessageEvent<DepthRequest>) => {
  const { input, width, height } = e.data
  try {
    session ??= load().catch((err: unknown) => {
      session = null
      throw err
    })
    const s = await session
    post({ type: 'running' })
    const out = await s.run({ [s.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, height, width]) })
    const t = out[s.outputNames[0]!]!
    const dims = t.dims
    const depth = t.data as Float32Array
    post({ type: 'done', depth, width: dims[dims.length - 1]!, height: dims[dims.length - 2]! }, [depth.buffer])
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
