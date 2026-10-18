import type { Landmark } from '../analysis/types'

/** 切り抜き範囲（ピクセル） */
export interface Box {
  x: number
  y: number
  size: number
}

/** 切り抜きは体の外接枠の長辺のこの倍率の正方形（手足を伸ばしても収まるように） */
export const CROP_SCALE = 1.6

/** 姿勢の外接枠を中心にした正方形の切り抜き範囲（外接枠の長辺の scale 倍、minSize ピクセル以上）。画面からはみ出す分は内側へずらす */
export function cropBox(lm: Landmark[], width: number, height: number, scale = CROP_SCALE, minSize = 0): Box {
  const pts = lm.filter((p) => p.v >= 0.3)
  const use = pts.length >= 4 ? pts : lm
  const xs = use.map((p) => p.x * width)
  const ys = use.map((p) => p.y * height)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const size = Math.min(Math.max((x1 - x0) * scale, (y1 - y0) * scale, minSize), width, height)
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max - size)
  return { x: clamp((x0 + x1) / 2 - size / 2, width), y: clamp((y0 + y1) / 2 - size / 2, height), size }
}

/** 切り抜き画像での正規化座標 → 元の画面での正規化座標 */
export function uncrop(lm: Landmark[], box: Box, width: number, height: number): Landmark[] {
  return lm.map((p) => ({ x: (box.x + p.x * box.size) / width, y: (box.y + p.y * box.size) / height, v: p.v }))
}

/** 見失った人を探し直す切り抜きは、直前の姿勢の外接枠の長辺のこの倍率（いつもの切り抜きより狭い） */
export const SEARCH_SCALE = 1.5
/** 探し直しは切り抜きをこの倍率に拡大して推定する */
export const SEARCH_ZOOM = 3
/** 探し直しの切り抜きの最小の一辺（ピクセル）。点が重なった姿勢でも 0 にしない */
export const SEARCH_MIN_SIZE = 64

/**
 * 直前の姿勢の周りを狭く切り抜く範囲と、推定の入力の一辺（32 の倍数、maxInput まで）。
 * 強い傾斜の下で体を丸めた小さく暗い人は、いつもの切り抜きでは確からしさが下限を割るが、狭く切り抜いて拡大すると見つかる
 */
export function searchBox(lm: Landmark[], width: number, height: number, maxInput: number): Box & { input: number } {
  const box = cropBox(lm, width, height, SEARCH_SCALE, SEARCH_MIN_SIZE)
  return { ...box, input: Math.min(maxInput, Math.ceil((box.size * SEARCH_ZOOM) / 32) * 32) }
}
