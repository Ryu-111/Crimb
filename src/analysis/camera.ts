/**
 * カメラの動き。動画から間引いたコマ同士のずれ（平行移動）を、壁の模様の重なりで求める。
 * - 解析前のチェック: 大きく動いていたら撮り直しを勧める
 * - 解析中の追跡: コマごとのずれを記録し、手足とホールドの位置合わせ（課題の 3D 表示）で打ち消す
 */

/** ずれを調べる画像の幅（ピクセル）。小さいほど速い */
export const CAMERA_CHECK_WIDTH = 96
/** 調べるずれの最大（画像の幅に対する割合） */
export const MAX_SHIFT = 0.12
/**
 * 間引いたコマの半分以上が、最初のコマからこれ以上ずれていたらカメラが動いたとみなす（画像の幅に対する割合）。
 * 手持ちでゆっくりずれた sample0・garrett（中央値 0.06 以下）は通し、人を追いかけて撮った eric・w1・w2（0.12 以上）は止める
 */
export const CAMERA_SHIFT_LIMIT = 0.1

import type { PoseTrack } from './types'

/** 灰色画像（行優先、0..255） */
export interface Gray {
  width: number
  height: number
  data: Uint8Array
}

export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Uint8Array(width * height)
  for (let i = 0; i < data.length; i++) data[i] = (rgba[i * 4]! * 77 + rgba[i * 4 + 1]! * 150 + rgba[i * 4 + 2]! * 29) >> 8
  return { width, height, data }
}

/**
 * b が a に対してどれだけずれているか（ピクセル。a の (x, y) が b の (x + dx, y + dy) に写る）。重なる部分の差の平均が最も小さいずれを総当たりで探す。
 * 登っている人の動きは画面の一部なので、壁の模様（ホールド）のずれが勝つ
 */
export function estimateShift(a: Gray, b: Gray, maxShift = Math.round(a.width * MAX_SHIFT)): { dx: number; dy: number } {
  return searchShift(a, b, 0, 0, maxShift).shift
}

/**
 * (cx, cy) の周り ±r でずれを探す。mask（b と同じ大きさ、0 の画素は使わない）で人の写っている範囲を除ける。
 * cost は重なる部分の差の平均（重なりが半分未満なら Infinity）
 */
export function searchShift(a: Gray, b: Gray, cx: number, cy: number, r: number, mask?: Uint8Array): { shift: { dx: number; dy: number }; cost: number } {
  const { width: w, height: h } = a
  let best = { dx: cx, dy: cy }
  let bestCost = Infinity
  for (let dy = cy - r; dy <= cy + r; dy++) {
    for (let dx = cx - r; dx <= cx + r; dx++) {
      const x0 = Math.max(0, -dx)
      const x1 = Math.min(w, w - dx)
      const y0 = Math.max(0, -dy)
      const y1 = Math.min(h, h - dy)
      if ((x1 - x0) * 2 < w || (y1 - y0) * 2 < h) continue
      let sum = 0
      let n = 0
      for (let y = y0; y < y1; y++) {
        const ra = y * w
        const rb = (y + dy) * w + dx
        for (let x = x0; x < x1; x++) {
          if (mask && !mask[rb + x]) continue
          sum += Math.abs(a.data[ra + x]! - b.data[rb + x]!)
          n++
        }
      }
      if (n * 4 < w * h) continue
      // 重なりが小さいずれほど偶然一致しやすいので、探し始めた位置から遠いずれを少しだけ不利にする
      const cost = sum / n + 0.02 * Math.hypot(dx - cx, dy - cy)
      if (cost < bestCost) {
        bestCost = cost
        best = { dx, dy }
      }
    }
  }
  return { shift: best, cost: bestCost }
}

/** 縦横半分に縮める（端の 1 画素は捨てる） */
export function halve(g: Gray): Gray {
  const width = g.width >> 1
  const height = g.height >> 1
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = 2 * y * g.width + 2 * x
      data[y * width + x] = (g.data[i]! + g.data[i + 1]! + g.data[i + g.width]! + g.data[i + g.width + 1]!) >> 2
    }
  }
  return { width, height, data }
}

/** 基準のコマとの差（画素の差の平均）がこれを超えたら、基準を今のコマに取り替える */
const REKEY_COST = 25

/**
 * コマごとの、最初のコマからのカメラのずれ（ピクセル）。
 * 1 コマ前との差を足し合わせると小さな誤差がたまるので、基準のコマ（キーフレーム）と直接比べる。
 * 半分の解像度で広く探してから、元の解像度で詰める。基準から離れて重なりが減ったら、基準を取り替える
 */
export function trackCamera(frames: Gray[], masks: (Uint8Array | undefined)[] = []): { dx: number; dy: number }[] {
  const out: { dx: number; dy: number }[] = []
  let key = -1
  let rel = { dx: 0, dy: 0 }
  const half = frames.map(halve)
  const halfMasks = masks.map((m, i) => (m ? halveMask(m, frames[i]!) : undefined))
  frames.forEach((f, i) => {
    if (key < 0) {
      key = 0
      out.push({ dx: 0, dy: 0 })
      return
    }
    const coarse = searchShift(half[key]!, half[i]!, Math.round(rel.dx / 2), Math.round(rel.dy / 2), 6, halfMasks[i])
    const fine = searchShift(frames[key]!, f, coarse.shift.dx * 2, coarse.shift.dy * 2, 2, masks[i])
    rel = fine.cost < Infinity ? fine.shift : rel
    out.push({ dx: out[key]!.dx + rel.dx, dy: out[key]!.dy + rel.dy })
    if (fine.cost > REKEY_COST || Math.abs(rel.dx) > f.width * MAX_SHIFT || Math.abs(rel.dy) > f.height * MAX_SHIFT) {
      key = i
      rel = { dx: 0, dy: 0 }
    }
  })
  return out
}

function halveMask(m: Uint8Array, g: Gray): Uint8Array {
  const width = g.width >> 1
  const out = new Uint8Array(width * (g.height >> 1))
  for (let i = 0; i < out.length; i++) {
    const x = i % width
    const y = (i - x) / width
    out[i] = m[2 * y * g.width + 2 * x]!
  }
  return out
}

/**
 * 間引いたコマの、最初のコマからのずれの中央値（画像の幅に対する割合）。
 * 最大値ではなく中央値を見る。手持ちでゆっくりずれたり、撮り終わりにスマホを持ち上げたりした一時のずれでは警告せず、人を追いかけて撮ったときだけ大きくなる
 * shortcut: 平行移動だけを見る（ズーム・回転は見ない）。スマホを手で持って撮ると主に平行移動になるため。ズームの誤検出が出たら拡大率も探す
 */
export function medianCameraShift(frames: Gray[]): number {
  const [first, ...rest] = frames
  if (!first) return 0
  const shifts = rest
    .map((f) => {
      const { dx, dy } = estimateShift(first, f)
      return Math.hypot(dx, dy) / first.width
    })
    .sort((a, b) => a - b)
  return shifts[shifts.length >> 1] ?? 0
}

/**
 * 手足の位置を、時刻 t のコマ（壁の写真）の座標に直す。カメラが動いても、同じホールドの上の手足は同じ位置になる。
 * カメラのずれを記録していない古い記録はそのまま返す
 */
export function stabilize(track: PoseTrack, t: number): PoseTrack {
  const cam = track.camera
  if (!cam || cam.length !== track.frames.length) return track
  let ref = 0
  track.frames.forEach((f, i) => {
    if (Math.abs(f.t - t) < Math.abs(track.frames[ref]!.t - t)) ref = i
  })
  const r = cam[ref]!
  return {
    ...track,
    frames: track.frames.map((f, i) => {
      const c = cam[i]!
      return f.lm ? { ...f, lm: f.lm.map((p) => ({ ...p, x: p.x - c.dx + r.dx, y: p.y - c.dy + r.dy })) } : f
    }),
  }
}
