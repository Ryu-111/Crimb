// YOLO11n-pose（Ultralytics, AGPL-3.0）で人を探す。MediaPipe が見失う後ろ向き・暗い服・小さく写る人の補助に使う（src/analysis/hybrid.ts）
import * as ort from 'onnxruntime-web/wasm'
import type { Landmark } from '../analysis/types'
import { cocoToMediapipe, decodeYolo, type YoloPerson } from '../analysis/hybrid'

/** scripts/fetch-models.mjs が public/models/ に置く */
const MODEL_PATH = 'models/yolo11n-pose.onnx'
/** 人の周りを切り抜いて推定するときの入力の一辺（ピクセル）。小さいほど速い */
export const ROI_INPUT = 320
/** 見失ったとき、画面全体を推定する入力の長辺（ピクセル）。32 の倍数 */
export const FULL_INPUT = 640
/** 見失っている間、画面全体の推定はこのコマ数に 1 回だけ行う（重いので） */
export const FULL_EVERY = 5
/** 切り抜きは人の外接枠の長辺のこの倍率の正方形 */
const ROI_SCALE = 1.6

let session: Promise<ort.InferenceSession> | null = null

function load(): Promise<ort.InferenceSession> {
  // GitHub Pages は cross-origin isolation を設定できず SharedArrayBuffer が使えないので 1 スレッド
  ort.env.wasm.numThreads = 1
  session ??= fetch(new URL(MODEL_PATH, document.baseURI).href)
    .then((res) => {
      if (!res.ok) throw new Error(`YOLO のモデルを取得できませんでした (${res.status})`)
      return res.arrayBuffer()
    })
    .then((buf) => ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'] }))
    .catch((e) => {
      session = null
      throw e
    })
  return session
}

/**
 * コマごとに人を追う。前のコマで見つけた人の周りを切り抜いて小さな入力で推定し、見失ったら画面全体から探し直す。
 * 画面に小さく写る人も、切り抜くと大きく写るので見つけやすい
 */
export class YoloTracker {
  private prev: { cx: number; cy: number; size: number } | null = null
  private lost = 0
  private readonly canvas = document.createElement('canvas')
  private readonly ctx = this.canvas.getContext('2d', { willReadFrequently: true })!

  private constructor(private readonly sess: ort.InferenceSession) {}

  /** モデルを読み込めなければ null（MediaPipe だけで解析を続ける） */
  static async create(): Promise<YoloTracker | null> {
    try {
      return new YoloTracker(await load())
    } catch {
      return null
    }
  }

  /** 今のコマの人（MediaPipe の 33 点の並び、正規化画像座標）。見つからなければ null */
  async detect(video: HTMLVideoElement): Promise<Landmark[] | null> {
    const W = video.videoWidth
    const H = video.videoHeight
    let people: YoloPerson[] = []
    if (this.prev) {
      const size = Math.min(Math.max(this.prev.size, 192), W, H)
      const x0 = Math.min(Math.max(this.prev.cx - size / 2, 0), W - size)
      const y0 = Math.min(Math.max(this.prev.cy - size / 2, 0), H - size)
      people = (await this.run(video, x0, y0, size, size, ROI_INPUT, ROI_INPUT)).map((p) => toFrame(p, x0, y0, size / ROI_INPUT))
    }
    if (!people.length && this.lost % FULL_EVERY === 0) {
      const s = FULL_INPUT / Math.max(W, H)
      const w = Math.round(W * s)
      const h = Math.round(H * s)
      people = (await this.run(video, 0, 0, W, H, w, h)).map((p) => toFrame(p, 0, 0, 1 / s))
    }
    if (!people.length) {
      this.prev = null
      this.lost++
      return null
    }
    this.lost = 0
    // 前のコマの人に近い候補を選ぶ（壁の模様を人と取り違えても、追っている人から乗り移らない）
    const prev = this.prev
    const best = prev
      ? people.reduce((a, b) => (dist(b, prev) - b.score * prev.size < dist(a, prev) - a.score * prev.size ? b : a))
      : people.reduce((a, b) => (b.score > a.score ? b : a))
    this.prev = { cx: best.box.cx, cy: best.box.cy, size: Math.max(best.box.w, best.box.h) * ROI_SCALE }
    return cocoToMediapipe(best.kp.map((p) => ({ x: p.x / W, y: p.y / H, v: p.v })))
  }

  /** 動画の (sx, sy, sw, sh) を w × h に縮めて推定する。入力は 32 の倍数に灰色で埋める */
  private async run(video: HTMLVideoElement, sx: number, sy: number, sw: number, sh: number, w: number, h: number): Promise<YoloPerson[]> {
    const pw = Math.ceil(w / 32) * 32
    const ph = Math.ceil(h / 32) * 32
    this.canvas.width = pw
    this.canvas.height = ph
    this.ctx.fillStyle = 'rgb(114,114,114)'
    this.ctx.fillRect(0, 0, pw, ph)
    this.ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h)
    const { data } = this.ctx.getImageData(0, 0, pw, ph)
    const n = pw * ph
    const input = new Float32Array(3 * n)
    for (let i = 0; i < n; i++) {
      input[i] = data[i * 4]! / 255
      input[n + i] = data[i * 4 + 1]! / 255
      input[2 * n + i] = data[i * 4 + 2]! / 255
    }
    const feeds = { [this.sess.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, ph, pw]) }
    const out = (await this.sess.run(feeds))[this.sess.outputNames[0]!]!
    return decodeYolo(out.data as Float32Array, out.dims[2]!)
  }
}

const dist = (p: YoloPerson, prev: { cx: number; cy: number }) => Math.hypot(p.box.cx - prev.cx, p.box.cy - prev.cy)

/** 切り抜き画像の座標 → 動画の座標 */
function toFrame(p: YoloPerson, x0: number, y0: number, scale: number): YoloPerson {
  return {
    score: p.score,
    box: { cx: x0 + p.box.cx * scale, cy: y0 + p.box.cy * scale, w: p.box.w * scale, h: p.box.h * scale },
    kp: p.kp.map((k) => ({ x: x0 + k.x * scale, y: y0 + k.y * scale, v: k.v })),
  }
}
