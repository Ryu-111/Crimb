import { LM } from './geometry'
import type { PoseTrack } from './types'

/** 写真から拾った 1 つのホールド（正規化画像座標。w, h は外接枠、area は画面に占める割合） */
export interface Hold {
  x: number
  y: number
  w: number
  h: number
  area: number
}

export type RouteLimb = '左手' | '右手' | '左足' | '右足'

/** 手足がホールドに触れていた区間 */
export interface Contact {
  limb: RouteLimb
  hold: number
  t: number
  dur: number
}

export interface Hsv {
  h: number
  s: number
  v: number
}

/** 同じ色とみなす色相の幅（度） */
export const HUE_TOLERANCE = 20
/** これより彩度が低い色（白・灰・黒）は色相が安定しないので扱わない */
export const MIN_SATURATION = 0.25
/** これより小さい塊はホールドとみなさない（画面に占める割合） */
export const MIN_HOLD_AREA = 0.00008
/** 手足の位置からホールドの縁までこの距離（画面幅に対する割合）以内なら触れている */
export const CONTACT_DISTANCE = 0.035
/** この秒数以上触れていたら、そのホールドを使ったとみなす */
export const MIN_CONTACT_SEC = 0.4

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max / 255 }
}

/** タップした位置の周り 5×5 ピクセルの平均色。彩度が低すぎる（白・灰・黒）ときは null */
export function pickColor(data: Uint8ClampedArray, width: number, height: number, px: number, py: number): Hsv | null {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = Math.max(0, py - 2); y <= Math.min(height - 1, py + 2); y++) {
    for (let x = Math.max(0, px - 2); x <= Math.min(width - 1, px + 2); x++) {
      const i = (y * width + x) * 4
      r += data[i]!
      g += data[i + 1]!
      b += data[i + 2]!
      n++
    }
  }
  if (!n) return null
  const c = rgbToHsv(r / n, g / n, b / n)
  return c.s >= MIN_SATURATION ? c : null
}

/**
 * 写真から指定した色のホールドを拾う。色相が近く、彩度・明るさが基準色に近いピクセルの塊を 1 つのホールドとする。
 * 画面の縁に接する塊は、壁の帯や画面外にはみ出したものなので除く。
 * shortcut: 色相だけで判定するので白・灰・黒のホールドは扱えない。必要になったら色差（Lab）で判定する
 */
export function findHolds(data: Uint8ClampedArray, width: number, height: number, color: Hsv): Hold[] {
  const n = width * height
  const mask = new Uint8Array(n)
  const minS = Math.max(MIN_SATURATION, color.s * 0.4)
  const minV = color.v * 0.35
  for (let i = 0; i < n; i++) {
    const c = rgbToHsv(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!)
    const dh = Math.abs(c.h - color.h)
    if (Math.min(dh, 360 - dh) <= HUE_TOLERANCE && c.s >= minS && c.v >= minV) mask[i] = 1
  }
  const holds: Hold[] = []
  const queue = new Int32Array(n)
  const minPixels = Math.max(20, n * MIN_HOLD_AREA)
  for (let start = 0; start < n; start++) {
    if (mask[start] !== 1) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    mask[start] = 2
    let sx = 0
    let sy = 0
    let x0 = width
    let x1 = 0
    let y0 = height
    let y1 = 0
    while (head < tail) {
      const i = queue[head++]!
      const x = i % width
      const y = (i - x) / width
      sx += x
      sy += y
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
      const next = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]
      for (const j of next) {
        if (j >= 0 && mask[j] === 1) {
          mask[j] = 2
          queue[tail++] = j
        }
      }
    }
    const touchesEdge = x0 === 0 || y0 === 0 || x1 === width - 1 || y1 === height - 1
    if (tail < minPixels || touchesEdge) continue
    holds.push({
      x: sx / tail / width,
      y: sy / tail / height,
      w: (x1 - x0 + 1) / width,
      h: (y1 - y0 + 1) / height,
      area: tail / n,
    })
  }
  return holds
}

/** 手は手首と人差し指の中点、足は足首とつま先の中点で見る */
const LIMB_POINTS: [RouteLimb, number, number][] = [
  ['左手', LM.leftWrist, LM.leftIndex],
  ['右手', LM.rightWrist, LM.rightIndex],
  ['左足', LM.leftAnkle, LM.leftFootIndex],
  ['右足', LM.rightAnkle, LM.rightFootIndex],
]

/**
 * 手足がどのホールドに何秒触れていたか（時刻順）。
 * 距離はホールドの大きさを差し引いた縁までの距離で、画面の縦横比を考慮して画面幅を基準にする。
 * カメラを固定して撮った動画が前提（カメラが動くとホールドと手足の位置がずれる）
 */
export function holdContacts(track: PoseTrack, holds: Hold[]): Contact[] {
  const aspect = track.height / track.width
  const nearest = (x: number, y: number): number | null => {
    let best: number | null = null
    let bestD = CONTACT_DISTANCE
    holds.forEach((h, i) => {
      const d = Math.hypot(x - h.x, (y - h.y) * aspect) - Math.max(h.w, h.h * aspect) / 2
      if (d < bestD) {
        best = i
        bestD = d
      }
    })
    return best
  }
  const out: Contact[] = []
  for (const [limb, a, b] of LIMB_POINTS) {
    let cur: number | null = null
    let start = 0
    let count = 0
    const flush = () => {
      if (cur !== null && count / track.fps >= MIN_CONTACT_SEC) out.push({ limb, hold: cur, t: start, dur: count / track.fps })
    }
    for (const f of track.frames) {
      const p = f.lm?.[a]
      const q = f.lm?.[b]
      const hold = p && q && Math.min(p.v, q.v) >= 0.3 ? nearest((p.x + q.x) / 2, (p.y + q.y) / 2) : null
      if (hold !== null && hold === cur) {
        count++
        continue
      }
      flush()
      cur = hold
      start = f.t
      count = 1
    }
    flush()
  }
  return out.sort((x, y) => x.t - y.t)
}

/** ホールドを最初に触れた順に並べる（課題の番号） */
export function routeOrder(contacts: Contact[]): number[] {
  const order: number[] = []
  for (const c of contacts) if (!order.includes(c.hold)) order.push(c.hold)
  return order
}

/** 壁角度の表記から、垂直に対する傾き（度。手前に被るほど正） */
export function wallTilt(angle: string | undefined): number {
  if (!angle) return 0
  if (angle.includes('スラブ')) return -10
  if (angle.includes('ルーフ')) return 60
  const deg = Number.parseInt(angle, 10)
  return Number.isFinite(deg) ? Math.min(60, Math.max(-20, deg - 90)) : 0
}
