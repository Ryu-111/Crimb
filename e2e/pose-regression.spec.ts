/**
 * 実際の登攀動画で解析結果が期待範囲に収まるかを確認する回帰テスト。
 * test-fixtures/<name>.(mp4|webm|mov) と test-fixtures/<name>.expected.json を置くと自動で対象になる。
 * expected.json の形式は test-fixtures/README.md を参照。
 */
import { expect, test } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

interface Expected {
  metrics?: Record<string, [number, number]>
  adviceIncludes?: string[]
  adviceExcludes?: string[]
}

interface AnalysisResult {
  metrics: Record<string, number | null>
  advice: { id: string }[]
}

// POSE_FIXTURES_DIR で別の場所の動画も試せる（リポジトリに入れたくない動画の確認用）
const dir = process.env.POSE_FIXTURES_DIR ?? fileURLToPath(new URL('../test-fixtures/', import.meta.url))
const videos = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(mp4|webm|mov)$/i.test(f)) : []

test.describe('@pose regression', () => {
  test.skip(videos.length === 0, 'test-fixtures/ に動画がありません')

  for (const file of videos) {
    test(file, async ({ page }, info) => {
      test.skip(info.project.name !== 'android', '1 プロジェクトで十分')
      await page.goto('./#/new')
      await page.getByTestId('video-input').setInputFiles(join(dir, file))
      test.setTimeout(900_000)
      await page.getByRole('button', { name: '解析スタート' }).click()
      // 全身チェックの警告が出たら「このまま解析」で続ける（出たかどうかは結果に記録）
      const proceed = page.getByRole('button', { name: 'このまま解析' })
      const first = await Promise.race([
        proceed.waitFor({ timeout: 600_000 }).then(() => 'warned' as const),
        page.waitForURL(/#\/result/, { timeout: 600_000 }).then(() => 'done' as const),
      ])
      const bodyWarning = first === 'warned'
      if (bodyWarning) await proceed.click()
      await page.waitForURL(/#\/result/, { timeout: 600_000 })
      const result = (await page.evaluate(
        () => (globalThis as unknown as { __crimbLastAnalysis: unknown }).__crimbLastAnalysis,
      )) as AnalysisResult

      const outDir = join(process.cwd(), 'pose-results')
      mkdirSync(outDir, { recursive: true })
      // しきい値調整用に姿勢の時系列も保存（pose-results/ は .gitignore 済み）
      const track = await page.evaluate(() => (globalThis as unknown as { __crimbLastTrack: unknown }).__crimbLastTrack)
      writeFileSync(join(outDir, `${file}.track.json`), JSON.stringify(track))
      writeFileSync(
        join(outDir, `${file}.json`),
        JSON.stringify({ bodyWarning, metrics: result.metrics, advice: result.advice.map((a) => a.id) }, null, 2),
      )

      const expPath = join(dir, file.replace(/\.[^.]+$/, '.expected.json'))
      if (!existsSync(expPath)) return
      const exp = JSON.parse(readFileSync(expPath, 'utf8')) as Expected
      for (const [key, [min, max]] of Object.entries(exp.metrics ?? {})) {
        const v = result.metrics[key]
        expect.soft(v, `${key}`).not.toBeNull()
        expect.soft(v as number, `${key} >= ${min}`).toBeGreaterThanOrEqual(min)
        expect.soft(v as number, `${key} <= ${max}`).toBeLessThanOrEqual(max)
      }
      const ids = result.advice.map((a) => a.id)
      for (const id of exp.adviceIncludes ?? []) expect.soft(ids, `advice ${id}`).toContain(id)
      for (const id of exp.adviceExcludes ?? []) expect.soft(ids, `advice ${id}`).not.toContain(id)
    })
  }
})
