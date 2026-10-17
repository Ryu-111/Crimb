import { describe, expect, it } from 'vitest'
import { formatEta } from './format'

describe('formatEta', () => {
  it('hides the estimate while progress is too small or invalid', () => {
    expect(formatEta(10, 0.01)).toBeNull()
    expect(formatEta(0, 0.5)).toBeNull()
    expect(formatEta(10, 1)).toBeNull()
  })
  it('rounds seconds up to 5 and switches to minutes', () => {
    expect(formatEta(10, 0.5)).toBe('あと約 10 秒')
    expect(formatEta(11, 0.5)).toBe('あと約 15 秒')
    expect(formatEta(100, 0.5)).toBe('あと約 2 分')
    expect(formatEta(10, 0.99)).toBe('まもなく完了')
  })
})
