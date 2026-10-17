import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, MAX_ADVICE, isBackup, toSessionRecord, toTrack } from './backup'

const lm33 = (v = 1) => Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, v }))
const entry = { session: { createdAt: 1, problemName: 'a', metrics: {}, advice: [] }, track: { fps: 30, width: 100, height: 200, frames: [] } }

describe('isBackup', () => {
  it('accepts a valid backup', () => {
    expect(isBackup({ format: BACKUP_FORMAT, version: 1, exportedAt: 0, sessions: [entry, { ...entry, track: null }] })).toBe(true)
  })

  it('rejects other files', () => {
    expect(isBackup(null)).toBe(false)
    expect(isBackup({ format: 'other', version: 1, sessions: [] })).toBe(false)
    expect(isBackup({ format: BACKUP_FORMAT, version: 2, sessions: [] })).toBe(false)
    expect(isBackup({ format: BACKUP_FORMAT, version: 1, sessions: [{ session: { createdAt: '1' } }] })).toBe(false)
    const nullMetrics = { ...entry, session: { ...entry.session, metrics: null } }
    expect(isBackup({ format: BACKUP_FORMAT, version: 1, exportedAt: 0, sessions: [nullMetrics] })).toBe(false)
  })

  it('rejects malformed values inside a session', () => {
    const wrap = (e: unknown) => isBackup({ format: BACKUP_FORMAT, version: 1, exportedAt: 0, sessions: [e] })
    expect(wrap({ ...entry, session: { ...entry.session, metrics: null } })).toBe(false)
    expect(wrap({ ...entry, session: { ...entry.session, metrics: { moveCount: 'x' } } })).toBe(false)
    expect(wrap({ ...entry, session: { ...entry.session, advice: [{ id: 'a', severity: 'high', title: {}, detail: '' }] } })).toBe(false)
    const track = (patch: object) => ({ ...entry, track: { ...entry.track, ...patch } })
    expect(wrap(track({ frames: [[1, 2]] }))).toBe(false)
    expect(wrap(track({ frames: [{ t: 0, lm: [{ x: '0', y: 0 }] }] }))).toBe(false)
    expect(wrap(track({ frames: [{ t: 0, lm: null }, { t: 1, lm: lm33() }] }))).toBe(true)
    expect(wrap({ ...entry, session: { ...entry.session, metrics: { fallAt: null, moveCount: 3 } } })).toBe(true)
  })
})

describe('isBackup: track boundaries', () => {
  const wrap = (track: unknown, session: object = {}) =>
    isBackup({ format: BACKUP_FORMAT, version: 1, exportedAt: 0, sessions: [{ session: { ...entry.session, ...session }, track }] })
  const base = entry.track
  const f = (t: number) => ({ t, lm: lm33() })

  it('requires positive finite fps and integer sizes', () => {
    for (const bad of [{ fps: 0 }, { fps: -1 }, { fps: Number.NaN }, { fps: 5000 }, { fps: '30' }, { width: 0 }, { height: 1.5 }, { width: -3 }]) {
      expect(wrap({ ...base, ...bad }), JSON.stringify(bad)).toBe(false)
    }
    const { fps: _f, ...noFps } = base
    expect(wrap(noFps)).toBe(false)
  })

  it('requires 33 landmarks with a numeric visibility, and times in order', () => {
    expect(wrap({ ...base, frames: [{ t: 0, lm: lm33().slice(0, 32) }] })).toBe(false)
    expect(wrap({ ...base, frames: [{ t: 0, lm: [...lm33(), { x: 0, y: 0, v: 1 }] }] })).toBe(false)
    expect(wrap({ ...base, frames: [{ t: 0, lm: lm33().map(({ x, y }) => ({ x, y })) }] })).toBe(false)
    expect(wrap({ ...base, frames: [f(0), f(0.1), f(0.05)] })).toBe(false)
    expect(wrap({ ...base, frames: [f(-1)] })).toBe(false)
    expect(wrap({ ...base, frames: [f(0), f(0.1), f(0.1)] })).toBe(true)
  })

  it('checks that camera has one finite entry per frame', () => {
    const frames = [f(0), f(0.1)]
    expect(wrap({ ...base, frames, camera: [{ dx: 0, dy: 0 }, { dx: 0.1, dy: -0.2 }] })).toBe(true)
    expect(wrap({ ...base, frames, camera: [{ dx: 0, dy: 0 }] })).toBe(false)
    expect(wrap({ ...base, frames, camera: [{ dx: 0, dy: 0 }, { dx: null, dy: 0 }] })).toBe(false)
    expect(wrap({ ...base, frames, camera: 'x' })).toBe(false)
  })

  it('caps the number of advice items', () => {
    const one = { id: 'a', severity: 'low', title: 't', detail: 'd' }
    expect(wrap(null, { advice: Array.from({ length: MAX_ADVICE }, () => one) })).toBe(true)
    expect(wrap(null, { advice: Array.from({ length: MAX_ADVICE + 1 }, () => one) })).toBe(false)
  })
})

describe('toTrack', () => {
  it('drops unknown keys at every level', () => {
    const t = toTrack({
      fps: 30,
      width: 10,
      height: 20,
      evil: 1,
      frames: [{ t: 0, extra: 1, lm: [{ x: 0, y: 0, v: 1, z: 9 }] }],
      camera: [{ dx: 1, dy: 2, q: 3 }],
    } as never)
    expect(t).toEqual({ fps: 30, width: 10, height: 20, frames: [{ t: 0, lm: [{ x: 0, y: 0, v: 1 }] }], camera: [{ dx: 1, dy: 2 }] })
  })
})

describe('toSessionRecord', () => {
  it('keeps only known fields with safe types', () => {
    const r = toSessionRecord({
      ...entry.session,
      grade: { x: 1 },
      wallAngle: 130,
      sent: 'yes',
      hasVideo: true,
      extra: 1,
      advice: [{ id: 'a', severity: 'low', title: 't', detail: 'd', junk: 1 }],
    } as never)
    expect(r).toEqual({
      createdAt: 1,
      problemName: 'a',
      grade: '[object Object]',
      wallAngle: '130',
      notes: '',
      sent: true,
      hasVideo: false,
      metrics: {},
      advice: [{ id: 'a', severity: 'low', title: 't', detail: 'd' }],
    })
  })
})
