/**
 * 写真 1 枚からの奥行き推定（壁の凹凸）の回帰テスト。実際のモデル（約 27MB）を Hugging Face から取得するので、
 * ネットワークのある CI の pose-regression ジョブ（@pose）でだけ動かす。
 */
import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const video = fileURLToPath(new URL('../test-fixtures/garrett.webm', import.meta.url))
const holds = JSON.parse(readFileSync(new URL('../test-fixtures/garrett.pink-holds.json', import.meta.url), 'utf8')) as { x: number; y: number }[]

interface ReliefStats {
  cols: number
  rows: number
  /** 一番下の大きいピンクのホールドの中心の高さ */
  hold: number
  /** 格子全体の中央値（壁の面） */
  median: number
}

test.describe('@pose depth', () => {
  test.skip(!existsSync(video), 'test-fixtures/garrett.webm がありません')

  test('raises the big pink start hold out of the wall', async ({ page }, info) => {
    test.skip(info.project.name !== 'android', '1 プロジェクトで十分')
    test.setTimeout(900_000)
    await page.goto('./#/new')
    await page.getByTestId('video-input').setInputFiles(video)
    await page.getByRole('button', { name: '解析スタート' }).click()
    const proceed = page.getByRole('button', { name: 'このまま解析' })
    await Promise.race([
      proceed.waitFor({ timeout: 600_000 }).then(() => proceed.click()),
      page.waitForURL(/#\/result/, { timeout: 600_000 }),
    ])
    await page.waitForURL(/#\/result/, { timeout: 600_000 })

    const bottom = holds.reduce((a, h) => (h.y > a.y ? h : a))
    const img = page.getByTestId('route-frame')
    await img.scrollIntoViewIfNeeded()
    const box = (await img.boundingBox())!
    await img.click({ position: { x: box.width * bottom.x, y: box.height * bottom.y } })
    await expect(page.getByRole('img', { name: /課題の 3D 表示/ })).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: '壁の凹凸を推定する' }).click()
    await expect(page.getByText('写真 1 枚から奥行きを推定して')).toBeHidden({ timeout: 300_000 })
    const stats = await page.evaluate(({ x, y }) => {
      const r = (globalThis as unknown as { __crimbLastRelief: { cols: number; rows: number; z: Float32Array } }).__crimbLastRelief
      const at = (u: number, v: number) => r.z[Math.round(v * (r.rows - 1)) * r.cols + Math.round(u * (r.cols - 1))]!
      const sorted = Array.from(r.z).sort((a, b) => a - b)
      return { cols: r.cols, rows: r.rows, hold: at(x, y), median: sorted[Math.floor(sorted.length / 2)]! }
    }, bottom) as ReliefStats
    console.log('relief', JSON.stringify(stats))
    await page.getByRole('img', { name: /課題の 3D 表示/ }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath('relief.png') })

    // 大きいホールドは壁の面（中央値）より手前に出ている
    expect(stats.hold - stats.median).toBeGreaterThan(0.02)
  })
})
