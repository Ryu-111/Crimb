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
/** これより彩度が低い色（白・灰・黒）は色相が安定しないので、色相でなく明るさで判定する */
export const MIN_SATURATION = 0.25
/** 白・灰・黒のホールドで、同じ色とみなす色差（CIE76 の ΔE）。暗い色は彩度が揺れるので色相でなく色差で見る */
export const LAB_TOLERANCE = 12
/** 塊の周りのこの割合以上が色の濃いピクセルなら、色付きのホールドの影やふちとみなす */
export const SHADOW_RIM_RATIO = 0.2
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

export function hsvToRgb({ h, s, v }: Hsv): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))
  }
  return [f(5), f(3), f(1)]
}

/** sRGB（0..255）→ CIE L*a*b*（D65） */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => {
    const x = c / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047)
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B)
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

/** 白・灰・黒（色相で見分けられない色）か */
export function isAchromatic(c: Hsv): boolean {
  return c.s < MIN_SATURATION
}

/** タップした位置の周り 5×5 ピクセルの平均色 */
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
  return rgbToHsv(r / n, g / n, b / n)
}

/**
 * 写真から指定した色のホールドを拾う。色相が近く、彩度・明るさが基準色に近いピクセルの塊を 1 つのホールドとする。
 * 白・灰・黒は、色差（Lab）が近いピクセルを拾い、色付きのホールドの影やふち（周りが色の濃いピクセル）を除く。
 * 画面の縁に接する塊は、壁の面や帯、画面外にはみ出したものなので除く（白い壁に白いホールドでも、壁は縁に接するので残らない）
 * shortcut: 白・灰・黒では、照明で暗く見える紫・青のホールドや大きいホールドの陰も拾うことがある。触れていないホールドは番号が付かないので実害は小さい。困る例が出たら形（丸さ）でも絞る
 */
export function findHolds(data: Uint8ClampedArray, width: number, height: number, color: Hsv): Hold[] {
  const n = width * height
  const mask = new Uint8Array(n)
  const minS = Math.max(MIN_SATURATION, color.s * 0.4)
  const minV = color.v * 0.35
  const achromatic = isAchromatic(color)
  const [L0, a0, b0] = rgbToLab(...hsvToRgb(color))
  const colored = new Uint8Array(achromatic ? n : 0)
  for (let i = 0; i < n; i++) {
    const c = rgbToHsv(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!)
    if (achromatic) {
      const [L, a, b] = rgbToLab(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!)
      if (Math.hypot(L - L0, a - a0, b - b0) <= LAB_TOLERANCE) mask[i] = 1
      else if (c.s >= 0.4 && c.v >= 0.25) colored[i] = 1
      continue
    }
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
    let rim = 0
    let rimColored = 0
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
        } else if (j >= 0 && mask[j] === 0) {
          rim++
          if (colored[j]) rimColored++
        }
      }
    }
    const touchesEdge = x0 === 0 || y0 === 0 || x1 === width - 1 || y1 === height - 1
    const shadow = achromatic && rimColored > rim * SHADOW_RIM_RATIO
    if (tail < minPixels || touchesEdge || shadow) continue
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

/** 写真を重ねるための変換（拡大率と平行移動）。座標は横幅を 1 とした単位（y は縦横比を掛けたもの） */
export interface Similarity {
  s: number
  tx: number
  ty: number
  /** 対応が取れたホールドの数 */
  matched: number
}

/** 2 つの写真から拾った同じ課題のホールドを、最も近いもの同士で対応づけて、from を to に重ねる拡大率と平行移動を求める（ICP） */
export function alignHolds(from: Hold[], to: Hold[], aspectFrom: number, aspectTo: number): Similarity | null {
  if (from.length < 3 || to.length < 3) return null
  const a = from.map((h) => ({ x: h.x, y: h.y * aspectFrom }))
  const b = to.map((h) => ({ x: h.x, y: h.y * aspectTo }))
  const mean = (ps: { x: number; y: number }[]) => ({
    x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
    y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
  })
  const spread = (ps: { x: number; y: number }[], m: { x: number; y: number }) =>
    Math.sqrt(ps.reduce((s, p) => s + (p.x - m.x) ** 2 + (p.y - m.y) ** 2, 0) / ps.length)
  // 初期値: 重心と広がりをそろえる
  const ma = mean(a)
  const mb = mean(b)
  let s = spread(b, mb) / (spread(a, ma) || 1)
  let tx = mb.x - s * ma.x
  let ty = mb.y - s * ma.y
  let matched = 0
  for (let iter = 0; iter < 20; iter++) {
    const moved = a.map((p) => ({ x: s * p.x + tx, y: s * p.y + ty }))
    const dists = moved.map((p) => Math.min(...b.map((q) => Math.hypot(p.x - q.x, p.y - q.y))))
    // 遠すぎる組（片方にしかないホールド）は外す
    const limit = Math.max(0.03, [...dists].sort((x, y) => x - y)[Math.floor(dists.length * 0.7)]! * 1.5)
    const pairs = moved
      .map((p, i) => {
        const j = b.reduce((best, q, k) => (Math.hypot(p.x - q.x, p.y - q.y) < Math.hypot(p.x - b[best]!.x, p.y - b[best]!.y) ? k : best), 0)
        return { p: a[i]!, q: b[j]!, d: dists[i]! }
      })
      .filter((x) => x.d <= limit)
    if (pairs.length < 3) return null
    matched = pairs.length
    const pa = mean(pairs.map((x) => x.p))
    const pb = mean(pairs.map((x) => x.q))
    const num = pairs.reduce((acc, x) => acc + (x.p.x - pa.x) * (x.q.x - pb.x) + (x.p.y - pa.y) * (x.q.y - pb.y), 0)
    const den = pairs.reduce((acc, x) => acc + (x.p.x - pa.x) ** 2 + (x.p.y - pa.y) ** 2, 0)
    if (den === 0) return null
    s = num / den
    tx = pb.x - s * pa.x
    ty = pb.y - s * pa.y
  }
  return { s, tx, ty, matched }
}

/** 登り始め（課題のホールドに最初に触れた時刻）。触れていなければ 0 */
export function climbStart(contacts: Contact[]): number {
  return contacts.length ? Math.min(...contacts.map((c) => c.t)) : 0
}
