import { describe, expect, it } from 'vitest'
import { cutOff, pickPerson } from './person'
import type { YoloPerson } from './hybrid'

const W = 720
const H = 1280

/** 外接枠を画面に対する割合で指定した人 */
const person = (score: number, cx: number, cy: number, w: number, h: number): YoloPerson => ({
  score,
  box: { cx: cx * W, cy: cy * H, w: w * W, h: h * H },
  kp: [],
})

// 壁の上で小さく写る登っている人と、手前に座って大きく写る見ている人（下の縁で切れる）
const climber = person(0.6, 0.7, 0.42, 0.22, 0.14)
const spectator = person(0.93, 0.7, 0.79, 0.52, 0.42)
// 左下に立つビレイヤー（左の縁で切れる）
const belayer = person(0.84, 0.08, 0.77, 0.16, 0.44)

describe('cut off by the frame', () => {
  it('detects people cut by the bottom, left or right edge', () => {
    expect(cutOff(spectator, W, H)).toBe(true)
    expect(cutOff(belayer, W, H)).toBe(true)
    expect(cutOff(person(0.9, 0.95, 0.5, 0.12, 0.3), W, H)).toBe(true)
  })

  it('keeps a climber reaching to the top of the frame', () => {
    expect(cutOff(person(0.9, 0.5, 0.15, 0.2, 0.3), W, H)).toBe(false)
    expect(cutOff(climber, W, H)).toBe(false)
  })
})

describe('picking the climber', () => {
  it('prefers the whole-body person over a larger person in the foreground', () => {
    expect(pickPerson([spectator, climber], W, H)).toBe(climber)
    expect(pickPerson([belayer, person(0.8, 0.39, 0.57, 0.32, 0.25)], W, H)?.score).toBe(0.8)
  })

  it('leaves a tracked foreground person for the climber found in the whole frame', () => {
    // 追っている人（先頭）が縁で切れていたら、画面全体の候補と比べ直す（yolo.ts）
    expect(pickPerson([spectator, spectator, climber], W, H)).toBe(climber)
    // 画面全体に縁で切れた人しかいなければ、追っている人のまま
    expect(pickPerson([spectator, belayer], W, H)).toBe(spectator)
  })

  it('still picks a cut-off person when nobody else is found', () => {
    expect(pickPerson([spectator], W, H)).toBe(spectator)
  })

  it('picks the highest score among people inside the frame', () => {
    expect(pickPerson([person(0.5, 0.3, 0.5, 0.2, 0.3), climber], W, H)).toBe(climber)
    expect(pickPerson([], W, H)).toBeNull()
  })
})
