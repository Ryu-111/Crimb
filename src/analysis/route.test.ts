import { describe, expect, it } from 'vitest'
import { alignHolds, findHolds, holdContacts, isAchromatic, pickColor, rgbToHsv, routeOrder, wallTilt, type Hold } from './route'
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

  it('picks the colour under the tap', () => {
    expect(pickColor(data, w, h, 30, 40)!.h).toBeCloseTo(rgbToHsv(...PINK).h, 0)
    expect(isAchromatic(pickColor(data, w, h, 30, 40)!)).toBe(false)
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

describe('white, grey and black holds', () => {
  const w = 100
  const h = 200
  const WHITE: [number, number, number] = [240, 238, 236]
  const BLACK: [number, number, number] = [30, 30, 34]
  const data = image(w, h, [
    { x: 30, y: 40, r: 6, rgb: WHITE },
    { x: 70, y: 120, r: 8, rgb: WHITE },
    { x: 40, y: 160, r: 7, rgb: BLACK },
    { x: 60, y: 60, r: 7, rgb: [128, 128, 128] },
    { x: 50, y: 90, r: 7, rgb: PINK },
  ])

  it('tells them apart by brightness instead of hue', () => {
    const white = pickColor(data, w, h, 30, 40)!
    expect(isAchromatic(white)).toBe(true)
    expect(findHolds(data, w, h, white).map((x) => Math.round(x.y * h))).toEqual([40, 120])
    expect(findHolds(data, w, h, pickColor(data, w, h, 40, 160)!).map((x) => Math.round(x.y * h))).toEqual([160])
    expect(findHolds(data, w, h, pickColor(data, w, h, 60, 60)!).map((x) => Math.round(x.y * h))).toEqual([60])
  })

  it('does not pick up the wall itself (it touches the frame edge)', () => {
    // 壁（ベージュ）をタップしても、壁は画面の縁に接するのでホールドにならない
    expect(findHolds(data, w, h, pickColor(data, w, h, 5, 5)!)).toEqual([])
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

describe('contact distance for elongated holds', () => {
  // 横に長い帯状のホールド（幅 0.4、高さ 0.02）。長辺を直径とする円で見ると、真上 0.15 の足も触れていると誤判定していた
  const rail: Hold[] = [{ x: 0.5, y: 0.5, w: 0.4, h: 0.02, area: 0.006 }]
  const at = (x: number, y: number): PoseTrack => ({
    fps: 15,
    width: 500,
    height: 1000,
    frames: Array.from({ length: 15 }, (_, i) => ({
      t: i / 15,
      lm: Array.from({ length: 33 }, (_, k) => ({ ...([27, 31].includes(k) ? { x, y } : { x: 0.9, y: 0.05 }), v: 1 })),
    })),
  })

  it('touches along the long edge and not above it', () => {
    expect(holdContacts(at(0.65, 0.5), rail)).toHaveLength(1)
    expect(holdContacts(at(0.65, 0.52), rail)).toHaveLength(1) // 外接枠の縁のすぐ下
    expect(holdContacts(at(0.5, 0.65), rail)).toHaveLength(0) // 長辺の半分を超えて上下に離れている
    expect(holdContacts(at(0.5, 0.56), rail)).toHaveLength(0)
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
    // 最初に触れる細い帯（外接枠 25×9px）は、すぐ下の大きなホールドの上のふちの破片。目視で確認したので数えない（以前は 7 と数えていた）
    expect(order).toHaveLength(6)
  })
})

describe('aligning two attempts', () => {
  const base: Hold[] = [
    [0.2, 0.2], [0.7, 0.25], [0.4, 0.5], [0.6, 0.7], [0.3, 0.85],
  ].map(([x, y]) => ({ x: x!, y: y!, w: 0.05, h: 0.03, area: 0.001 }))

  it('recovers zoom and shift between two videos shot from different spots', () => {
    // 2 本目は少し寄って（1.2 倍）、右下にずれて撮った。1 本目にしかないホールドもある
    const other = base.slice(0, 4).map((h) => ({ ...h, x: (h.x - 0.1) * 1.2, y: ((h.y * 2 - 0.2) * 1.2) / 2 }))
    const t = alignHolds(other, [...base, { x: 0.9, y: 0.1, w: 0.05, h: 0.03, area: 0.001 }], 2, 2)!
    expect(t.matched).toBe(4)
    expect(t.s).toBeCloseTo(1 / 1.2, 2)
    const p = other[2]!
    expect(t.s * p.x + t.tx).toBeCloseTo(base[2]!.x, 2)
    expect(t.s * p.y * 2 + t.ty).toBeCloseTo(base[2]!.y * 2, 2)
  })

  it('needs at least three holds on each side', () => {
    expect(alignHolds(base.slice(0, 2), base, 2, 2)).toBeNull()
  })
})
