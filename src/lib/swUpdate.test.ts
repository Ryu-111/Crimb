import { describe, expect, it } from 'vitest'
import { isDraftRoute } from './swUpdate'

describe('isDraftRoute', () => {
  it('撮影〜保存の画面だけを Draft 画面とみなす', () => {
    for (const h of ['#/new', '#/analyze', '#/result', '#/result?x=1']) expect(isDraftRoute(h)).toBe(true)
    for (const h of ['', '#/', '#/growth', '#/settings', '#/session/3', '#/newer']) expect(isDraftRoute(h)).toBe(false)
  })
})
