/**
 * 写真 1 枚の奥行き推定（Depth Anything V2）の出力から、壁の凹凸（ホールド・ハリボテの出っ張り）を取り出す。
 * モデルの出力は相対的な「近さ」（大きいほど手前）で、カメラが壁を斜めに見ていると全体が傾いて出る。
 * 傾きは壁角度で別に付けているので、平面を当てはめて引き、残りを凹凸とする
 */

/** モデルに入れる画像の長辺（ピクセル）。14 の倍数でないといけない */
export const DEPTH_INPUT_LONG_SIDE = 518
/** 凹凸の最大の高さ（壁の幅を 1 とした単位）。ハリボテでも壁幅の 1 割強 */
export const RELIEF_HEIGHT = 0.12
/** 3D の壁に使う格子の細かさ（短辺の分割数） */
export const RELIEF_GRID = 64

const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

/** 縦横比を保って長辺を long にし、両辺を 14 の倍数にそろえた入力サイズ */
export function depthInputSize(width: number, height: number, long = DEPTH_INPUT_LONG_SIDE): { width: number; height: number } {
  const s = long / Math.max(width, height)
  const round14 = (v: number) => Math.max(14, Math.round((v * s) / 14) * 14)
  return { width: round14(width), height: round14(height) }
}

/** RGBA の画像を、モデルの入力（RGB の平面ごと・平均と標準偏差で正規化した float）にする */
export function toModelInput(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const n = width * height
  const out = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) out[c * n + i] = (rgba[i * 4 + c]! / 255 - MEAN[c]!) / STD[c]!
  }
  return out
}

export interface Relief {
  /** 格子の列数・行数 */
  cols: number
  rows: number
  /** 行優先（上の行から）。壁の幅を 1 とした単位の出っ張り */
  z: Float32Array
}

/** 奥行き推定の出力（width × height、行優先）から凹凸の格子を作る */
export function reliefFromDepth(depth: Float32Array, width: number, height: number, grid = RELIEF_GRID): Relief {
  const n = width * height
  // 1 回目は全体に平面を当てはめ、2 回目は手前に出ていない画素（壁の面）だけで当てはめ直す。
  // ホールドに引っ張られて壁の面が傾くのを防ぐ
  let plane = fitPlane(depth, width, height, () => true)
  let residual = residualOf(depth, width, height, plane)
  const median = Float32Array.from(residual).sort()[Math.floor(n * 0.5)]!
  plane = fitPlane(depth, width, height, (k) => residual[k]! <= median)
  residual = residualOf(depth, width, height, plane)

  // 壁の面（中央値）を 0、手前に出ている上位 0.5% を RELIEF_HEIGHT にする。奥へのへこみは小さく抑える
  const sorted = Float32Array.from(residual).sort()
  const base = sorted[Math.floor(n * 0.5)]!
  const top = sorted[Math.min(n - 1, Math.floor(n * 0.995))]!
  const span = top - base || 1

  const cols = width >= height ? Math.round((grid * width) / height) : grid
  const rows = width >= height ? grid : Math.round((grid * height) / width)
  const z = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const v = (sample(residual, width, height, k / (cols - 1), r / (rows - 1)) - base) / span
      z[r * cols + k] = Math.min(1, Math.max(-0.25, v)) * RELIEF_HEIGHT
    }
  }
  return { cols, rows, z }
}

type Plane = [number, number, number]

/** include(k) が真の画素に、平面 d = a·x + b·y + c を最小二乗で当てはめる（x, y は 0..1） */
function fitPlane(depth: Float32Array, width: number, height: number, include: (k: number) => boolean): Plane {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sd = 0, sxd = 0, syd = 0, cnt = 0
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const k = j * width + i
      if (!include(k)) continue
      const x = i / (width - 1 || 1)
      const y = j / (height - 1 || 1)
      const d = depth[k]!
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sd += d; sxd += x * d; syd += y * d; cnt++
    }
  }
  return solve3([[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, cnt]], [sxd, syd, sd])
}

function residualOf(depth: Float32Array, width: number, height: number, [a, b, c]: Plane): Float32Array {
  const out = new Float32Array(width * height)
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      out[j * width + i] = depth[j * width + i]! - (a * (i / (width - 1 || 1)) + b * (j / (height - 1 || 1)) + c)
    }
  }
  return out
}

/** 格子の凹凸を正規化座標 (x, y は 0..1) で引く（双線形補間） */
export function reliefAt(relief: Relief, x: number, y: number): number {
  return sample(relief.z, relief.cols, relief.rows, x, y)
}

function sample(a: Float32Array, w: number, h: number, x: number, y: number): number {
  const fx = Math.min(w - 1, Math.max(0, x * (w - 1)))
  const fy = Math.min(h - 1, Math.max(0, y * (h - 1)))
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const tx = fx - x0
  const ty = fy - y0
  const top = a[y0 * w + x0]! * (1 - tx) + a[y0 * w + x1]! * tx
  const bottom = a[y1 * w + x0]! * (1 - tx) + a[y1 * w + x1]! * tx
  return top * (1 - ty) + bottom * ty
}

/** 3×3 の連立一次方程式（クラメルの公式）。解けなければ 0 */
function solve3(m: number[][], v: number[]): [number, number, number] {
  const det = (q: number[][]) =>
    q[0]![0]! * (q[1]![1]! * q[2]![2]! - q[1]![2]! * q[2]![1]!) -
    q[0]![1]! * (q[1]![0]! * q[2]![2]! - q[1]![2]! * q[2]![0]!) +
    q[0]![2]! * (q[1]![0]! * q[2]![1]! - q[1]![1]! * q[2]![0]!)
  const d = det(m)
  if (Math.abs(d) < 1e-12) return [0, 0, 0]
  const col = (k: number) => det(m.map((row, i) => row.map((x, j) => (j === k ? v[i]! : x))))
  return [col(0) / d, col(1) / d, col(2) / d]
}
