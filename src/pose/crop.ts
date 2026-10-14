import type { Landmark } from '../analysis/types'

/** 切り抜き範囲（ピクセル） */
export interface Box {
  x: number
  y: number
  size: number
}

/** 切り抜きは体の外接枠の長辺のこの倍率の正方形（手足を伸ばしても収まるように） */
export const CROP_SCALE = 1.6

/** 姿勢の外接枠を中心にした正方形の切り抜き範囲。画面からはみ出す分は内側へずらす */
export function cropBox(lm: Landmark[], width: number, height: number): Box {
  const pts = lm.filter((p) => p.v >= 0.3)
  const use = pts.length >= 4 ? pts : lm
  const xs = use.map((p) => p.x * width)
  const ys = use.map((p) => p.y * height)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const size = Math.min(Math.max(x1 - x0, y1 - y0) * CROP_SCALE, width, height)
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max - size)
  return { x: clamp((x0 + x1) / 2 - size / 2, width), y: clamp((y0 + y1) / 2 - size / 2, height), size }
}

/** 切り抜き画像での正規化座標 → 元の画面での正規化座標 */
export function uncrop(lm: Landmark[], box: Box, width: number, height: number): Landmark[] {
  return lm.map((p) => ({ x: (box.x + p.x * box.size) / width, y: (box.y + p.y * box.size) / height, v: p.v }))
}
