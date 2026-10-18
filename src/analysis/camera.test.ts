import { describe, expect, it } from 'vitest'
import { estimateShift, medianCameraShift, stabilize, toGray, trackCamera, type Gray } from './camera'
import type { PoseTrack } from './types'

/** 壁の模様（ランダムな明るさの点）を (ox, oy) だけずらして撮った画像。person があれば、その位置に人の塊を描く */
function wall(ox: number, oy: number, person?: { x: number; y: number }): Gray {
  const width = 96
  const height = 160
  const data = new Uint8Array(width * height)
  const texture = (x: number, y: number) => {
    // 決まった種の擬似乱数で、壁の模様は毎回同じ
    const s = Math.sin(Math.floor(x / 3) * 12.9898 + Math.floor(y / 3) * 78.233) * 43758.5453
    return 80 + Math.floor((s - Math.floor(s)) * 150)
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inPerson = person && Math.abs(x - person.x) < 8 && Math.abs(y - person.y) < 25
      data[y * width + x] = inPerson ? 20 : texture(x + ox, y + oy)
    }
  }
  return { width, height, data }
}

describe('camera motion', () => {
  it('finds how far the picture moved', () => {
    expect(estimateShift(wall(0, 0), wall(5, -3))).toEqual({ dx: -5, dy: 3 })
  })

  it('follows the wall, not the climber moving across it', () => {
    const a = wall(0, 0, { x: 30, y: 120 })
    expect(estimateShift(a, wall(0, 0, { x: 60, y: 60 }))).toEqual({ dx: 0, dy: 0 })
    expect(estimateShift(a, wall(4, 0, { x: 60, y: 60 }))).toEqual({ dx: -4, dy: 0 })
  })

  it('reports the median move from the first frame as a share of the width', () => {
    expect(medianCameraShift([wall(0, 0), wall(0, 0, { x: 50, y: 80 }), wall(0, 0, { x: 20, y: 40 })])).toBe(0)
    // 人を追いかけて撮ると、ほとんどのコマが最初からずれたまま
    expect(medianCameraShift([wall(0, 0), wall(3, 0), wall(9, 0), wall(9, 4)])).toBeCloseTo(9 / 96, 5)
    expect(medianCameraShift([])).toBe(0)
  })

  it('ignores a short move such as picking the phone up at the end', () => {
    expect(medianCameraShift([wall(0, 0), wall(0, 0), wall(0, 0), wall(0, 0), wall(10, 6)])).toBe(0)
  })

  it('converts RGBA to grey', () => {
    expect([...toGray(new Uint8ClampedArray([255, 255, 255, 255, 255, 0, 0, 255]), 2, 1).data]).toEqual([255, 76])
  })
})

describe('camera tracking', () => {
  it('follows a slow pan past the search range, ignoring the climber', () => {
    // 30 コマかけて右へ 24 画素・上へ 9 画素パンする（1 回の探索範囲より大きい）。人は途中で横切る
    const n = 30
    const pan = (i: number) => ({ dx: Math.round((24 * i) / (n - 1)), dy: Math.round((-9 * i) / (n - 1)) })
    const frames = Array.from({ length: n }, (_, i) => wall(pan(i).dx, pan(i).dy, { x: 20 + 2 * i, y: 100 - i }))
    const got = trackCamera(frames)
    got.forEach((g, i) => {
      // wall(ox) は壁を左へ ox ずらして写すので、壁の点は -ox に写る
      expect(Math.abs(g.dx + pan(i).dx)).toBeLessThanOrEqual(1)
      expect(Math.abs(g.dy + pan(i).dy)).toBeLessThanOrEqual(1)
    })
  })

  it('moves the landmarks into the photo frame', () => {
    const track: PoseTrack = {
      fps: 1,
      width: 100,
      height: 100,
      frames: [
        { t: 0, lm: [{ x: 0.5, y: 0.5, v: 1 }] },
        { t: 1, lm: [{ x: 0.6, y: 0.4, v: 1 }] },
      ],
      // 2 コマ目は壁が右へ 0.1、上へ 0.1 ずれて写っている → 同じ壁の点
      camera: [
        { dx: 0, dy: 0 },
        { dx: 0.1, dy: -0.1 },
      ],
    }
    const at0 = stabilize(track, 0).frames.map((f) => f.lm![0]!)
    expect(at0[1]!.x).toBeCloseTo(0.5, 6)
    expect(at0[1]!.y).toBeCloseTo(0.5, 6)
    const at1 = stabilize(track, 1).frames.map((f) => f.lm![0]!)
    expect(at1[0]!.x).toBeCloseTo(0.6, 6)
    expect(at1[0]!.y).toBeCloseTo(0.4, 6)
    expect(stabilize({ ...track, camera: undefined }, 0)).toEqual({ ...track, camera: undefined })
  })
})
