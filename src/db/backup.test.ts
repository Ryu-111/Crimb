import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, isBackup, toSessionRecord } from './backup'

const entry = { session: { createdAt: 1, problemName: 'a', metrics: {}, advice: [] }, track: { frames: [] } }

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
    expect(wrap({ ...entry, track: { frames: [[1, 2]] } })).toBe(false)
    expect(wrap({ ...entry, track: { frames: [{ t: 0, lm: [{ x: '0', y: 0 }] }] } })).toBe(false)
    expect(wrap({ ...entry, track: { frames: [{ t: 0, lm: null }, { t: 1, lm: [{ x: 0, y: 0, v: 1 }] }] } })).toBe(true)
    expect(wrap({ ...entry, session: { ...entry.session, metrics: { fallAt: null, moveCount: 3 } } })).toBe(true)
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
