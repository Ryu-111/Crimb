import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, isBackup } from './backup'

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
})
