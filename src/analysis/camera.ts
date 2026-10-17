/**
 * カメラが動いたかどうかを、動画から間引いたコマ同士のずれで調べる。
 * 手足とホールドの位置合わせ（3D 表示）も、動きの速さの指標も、カメラを固定して撮った動画が前提なので、動いていたら撮り直しを勧める
 */

/** ずれを調べる画像の幅（ピクセル）。小さいほど速い */
export const CAMERA_CHECK_WIDTH = 96
/** 調べるずれの最大（画像の幅に対する割合） */
export const MAX_SHIFT = 0.12
/** 最初のコマからこれ以上ずれたらカメラが動いたとみなす（画像の幅に対する割合）。手持ちで少し傾いた garrett（約 0.06）は通し、追いかけて撮った eric（0.16 以上）は止める */
export const CAMERA_SHIFT_LIMIT = 0.08

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
 * b が a に対してどれだけずれているか（ピクセル）。重なる部分の差の平均が最も小さいずれを総当たりで探す。
 * 登っている人の動きは画面の一部なので、壁の模様（ホールド）のずれが勝つ
 */
export function estimateShift(a: Gray, b: Gray, maxShift = Math.round(a.width * MAX_SHIFT)): { dx: number; dy: number } {
  const { width: w, height: h } = a
  let best = { dx: 0, dy: 0 }
  let bestCost = Infinity
  for (let dy = -maxShift; dy <= maxShift; dy++) {
    for (let dx = -maxShift; dx <= maxShift; dx++) {
      let sum = 0
      let n = 0
      for (let y = Math.max(0, -dy); y < Math.min(h, h - dy); y++) {
        const ra = y * w
        const rb = (y + dy) * w + dx
        for (let x = Math.max(0, -dx); x < Math.min(w, w - dx); x++) sum += Math.abs(a.data[ra + x]! - b.data[rb + x]!)
        n += Math.min(w, w - dx) - Math.max(0, -dx)
      }
      // 重なりが小さいずれほど偶然一致しやすいので、少しだけ不利にする
      const cost = sum / n + 0.02 * Math.hypot(dx, dy)
      if (cost < bestCost) {
        bestCost = cost
        best = { dx, dy }
      }
    }
  }
  return best
}

/**
 * 間引いたコマのうち、最初のコマから最も大きくずれた量（画像の幅に対する割合）。
 * shortcut: 平行移動だけを見る（ズーム・回転は見ない）。スマホを手で持って撮ると主に平行移動になるため。ズームの誤検出が出たら拡大率も探す
 */
export function maxCameraShift(frames: Gray[]): number {
  const [first, ...rest] = frames
  if (!first) return 0
  return Math.max(0, ...rest.map((f) => {
    const { dx, dy } = estimateShift(first, f)
    return Math.hypot(dx, dy) / first.width
  }))
}
