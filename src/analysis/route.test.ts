import { describe, expect, it } from 'vitest'
import { findHolds, holdContacts, pickColor, rgbToHsv, routeOrder, wallTilt, type Hold } from './route'
import type { Frame, Landmark, PoseTrack } from './types'

/** 背景がベージュで、ピンクの塊と青の塊がある画像 */
function image(w: number, h: number, blobs: { x: number; y: number; r: number; rgb: [number, number, number] }[]) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const blob = blobs.find((b) => Math.hypot(x - b.x, y - b.y) <= b.r)
      const [r, g, b] = blob ? blob.rgb : [225, 210, 180]
      data.set([r, g, b, 255], i)
    }
  }
  return data
}
const PINK: [number, number, number] = [225, 50, 125]
const BLUE: [number, number, number] = [40, 90, 200]

describe('hold detection', () => {
  const w = 100
  const h = 200
  const data = image(w, h, [
    { x: 30, y: 40, r: 6, rgb: PINK },
    { x: 70, y: 120, r: 8, rgb: PINK },
    { x: 50, y: 80, r: 7, rgb: BLUE },
    { x: 0, y: 190, r: 8, rgb: PINK }, // 画面の縁に接する（壁の帯など）
  ])

  it('picks the colour under the tap and rejects grey', () => {
    expect(pickColor(data, w, h, 30, 40)!.h).toBeCloseTo(rgbToHsv(...PINK).h, 0)
    const grey = image(10, 10, [{ x: 5, y: 5, r: 5, rgb: [128, 128, 128] }])
    expect(pickColor(grey, 10, 10, 5, 5)).toBeNull()
  })

  it('finds only the holds of the picked colour, away from the frame edge', () => {
    const holds = findHolds(data, w, h, pickColor(data, w, h, 30, 40)!)
    expect(holds).toHaveLength(2)
    const [a, b] = [...holds].sort((p, q) => p.y - q.y)
    expect(a!.x).toBeCloseTo(0.3, 2)
    expect(a!.y).toBeCloseTo(0.2, 2)
    expect(b!.y).toBeCloseTo(0.6, 2)
    expect(b!.area).toBeGreaterThan(a!.area)
  })
})

describe('hold contacts', () => {
  const holds: Hold[] = [
    { x: 0.3, y: 0.8, w: 0.05, h: 0.025, area: 0.001 },
    { x: 0.6, y: 0.3, w: 0.05, h: 0.025, area: 0.001 },
  ]
  const lm = (hand: { x: number; y: number }, foot: { x: number; y: number }): Landmark[] =>
    Array.from({ length: 33 }, (_, i) => {
      const p = [15, 19].includes(i) ? hand : [27, 31].includes(i) ? foot : { x: 0.9, y: 0.05 }
      return { ...p, v: 1 }
    })
  // 左足は最初からホールド 0、左手は 1 秒後にホールド 1 へ
  const frames: Frame[] = Array.from({ length: 45 }, (_, i) => ({
    t: i / 15,
    lm: lm(i < 15 ? { x: 0.45, y: 0.5 } : { x: 0.6, y: 0.31 }, { x: 0.3, y: 0.8 }),
  }))
  const track: PoseTrack = { fps: 15, width: 500, height: 1000, frames }

  it('records which limb held which hold and for how long', () => {
    const c = holdContacts(track, holds)
    expect(c.map((x) => [x.limb, x.hold])).toEqual([
      ['左足', 0],
      ['左手', 1],
    ])
    expect(c[1]!.t).toBeCloseTo(1, 5)
    expect(c[1]!.dur).toBeCloseTo(2, 5)
    expect(routeOrder(c)).toEqual([0, 1])
  })

  it('ignores a brief touch', () => {
    const brief: PoseTrack = { ...track, frames: frames.slice(0, 18) }
    expect(holdContacts(brief, holds).map((x) => x.limb)).toEqual(['左足'])
  })
})

describe('wall tilt', () => {
  it('maps the recorded wall angle to a lean from vertical', () => {
    expect(wallTilt('垂壁')).toBe(0)
    expect(wallTilt('スラブ')).toBe(-10)
    expect(wallTilt('120°')).toBe(30)
    expect(wallTilt('130°以上')).toBe(40)
    expect(wallTilt('ルーフ')).toBe(60)
    expect(wallTilt(undefined)).toBe(0)
  })
})

describe('real climb: garrett (pink problem)', () => {
  it('follows the climb from the start holds to the top', async () => {
    // サンプル動画の最初のコマで下の大きいピンクをタップして拾ったホールド（test-fixtures/README.md 参照）
    const { default: holds } = await import('../../test-fixtures/garrett.pink-holds.json')
    const { default: garrett } = await import('../../test-fixtures/tracks/garrett.json')
    const c = holdContacts(garrett as PoseTrack, holds)
    const order = routeOrder(c)
    const top = holds.reduce((best, h, i) => (h.y < holds[best]!.y ? i : best), 0)
    const bottom = holds.reduce((best, h, i) => (h.y > holds[best]!.y ? i : best), 0)
    expect(holds).toHaveLength(11)
    // 最後に触れたのは一番上のホールド、最初の足は下の大きいピンク
    expect(c[c.length - 1]!.hold).toBe(top)
    expect(c.find((x) => x.limb.endsWith('足'))!.hold).toBe(bottom)
    expect(order).toHaveLength(7)
  })
})
