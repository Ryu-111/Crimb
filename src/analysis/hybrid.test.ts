import { describe, expect, it } from 'vitest'
import { cocoToMediapipe, decodeYolo, mergePose } from './hybrid'
import { LM } from './geometry'
import type { Landmark } from './types'

/** COCO の 17 点。番号 k の点を (k / 100, k / 100 + 0.5) に置く */
const coco: Landmark[] = Array.from({ length: 17 }, (_, k) => ({ x: k / 100, y: k / 100 + 0.5, v: 0.9 }))

describe('COCO → MediaPipe', () => {
  const mp = cocoToMediapipe(coco)

  it('puts each joint at the MediaPipe index', () => {
    expect(mp).toHaveLength(33)
    expect(mp[LM.leftShoulder]!.x).toBeCloseTo(0.05)
    expect(mp[LM.rightWrist]!.x).toBeCloseTo(0.1)
    expect(mp[LM.leftHip]!.x).toBeCloseTo(0.11)
    expect(mp[LM.rightAnkle]!.x).toBeCloseTo(0.16)
  })

  it('uses the wrist for the fingers and the ankle for the toes', () => {
    expect(mp[LM.leftIndex]).toEqual(mp[LM.leftWrist])
    expect(mp[LM.rightFootIndex]).toEqual(mp[LM.rightAnkle])
  })

  it('marks points YOLO does not have as not visible', () => {
    expect(mp[9]!.v).toBe(0) // 口
  })
})

describe('merging the two estimates', () => {
  const at = (x: number, y: number): Landmark[] => Array.from({ length: 33 }, () => ({ x, y, v: 1 }))

  it('keeps MediaPipe when both point at the same person', () => {
    const mediapipe = at(0.5, 0.5)
    expect(mergePose(mediapipe, at(0.52, 0.51))).toBe(mediapipe)
  })

  it('takes YOLO when MediaPipe locked onto something else', () => {
    const yolo = at(0.3, 0.6)
    expect(mergePose(at(0.85, 0.3), yolo)).toBe(yolo)
  })

  it('uses whichever one found a person', () => {
    const mediapipe = at(0.5, 0.5)
    const yolo = at(0.4, 0.5)
    expect(mergePose(mediapipe, null)).toBe(mediapipe)
    expect(mergePose(null, yolo)).toBe(yolo)
    expect(mergePose(null, null)).toBeNull()
  })
})

describe('YOLO output', () => {
  it('reads boxes, scores and keypoints from the [56, N] layout and drops weak ones', () => {
    const n = 2
    const out = new Float32Array(56 * n)
    const set = (row: number, i: number, v: number) => (out[row * n + i] = v)
    // 候補 0: 確からしさ 0.9、外接枠 (100, 200, 50, 80)、点 k は (k, 2k, 0.5)
    ;[100, 200, 50, 80, 0.9].forEach((v, row) => set(row, 0, v))
    for (let k = 0; k < 17; k++) {
      set(5 + 3 * k, 0, k)
      set(6 + 3 * k, 0, 2 * k)
      set(7 + 3 * k, 0, 0.5)
    }
    set(4, 1, 0.1) // 候補 1: 弱いので捨てる
    const people = decodeYolo(out, n)
    expect(people).toHaveLength(1)
    expect(people[0]!.score).toBeCloseTo(0.9)
    expect(people[0]!.box).toEqual({ cx: 100, cy: 200, w: 50, h: 80 })
    expect(people[0]!.kp[16]).toEqual({ x: 16, y: 32, v: 0.5 })
  })
})
