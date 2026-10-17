import { describe, expect, it } from 'vitest'
import { estimateShift, maxCameraShift, toGray, type Gray } from './camera'

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

  it('reports the largest move from the first frame as a share of the width', () => {
    expect(maxCameraShift([wall(0, 0), wall(0, 0, { x: 50, y: 80 })])).toBe(0)
    expect(maxCameraShift([wall(0, 0), wall(3, 0), wall(9, 0)])).toBeCloseTo(9 / 96, 5)
    expect(maxCameraShift([])).toBe(0)
  })

  it('converts RGBA to grey', () => {
    expect([...toGray(new Uint8ClampedArray([255, 255, 255, 255, 255, 0, 0, 255]), 2, 1).data]).toEqual([255, 76])
  })
})
