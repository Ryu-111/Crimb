import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { analyze } from '../src/analysis/metrics'
import { climb } from '../src/analysis/synthetic'

function backupFile(path: string) {
  const day = 86_400_000
  const sessions = [climb({ bend: 1, useFeet: false }), climb()].map((track, i) => {
    const { metrics, advice } = analyze(track)
    return {
      session: {
        createdAt: Date.now() - (2 - i) * day,
        problemName: '合成課題',
        grade: '5級',
        wallAngle: '垂壁',
        sent: i === 1,
        notes: '',
        metrics,
        advice,
        hasVideo: false,
      },
      track,
    }
  })
  writeFileSync(path, JSON.stringify({ format: 'crimb-backup', version: 1, exportedAt: Date.now(), sessions }))
}

test('import a backup, review growth and timeline, export and delete', async ({ page }, info) => {
  const file = info.outputPath('backup.json')
  backupFile(file)

  await page.goto('./#/settings')
  await page.getByTestId('import-input').setInputFiles(file)
  await expect(page.getByRole('status')).toHaveText(/2 件を読み込みました/)
  // 同じファイルをもう一度読み込んでも重複しない
  await page.getByTestId('import-input').setInputFiles(file)
  await expect(page.getByRole('status')).toHaveText(/0 件を読み込みました（重複 2 件/)

  await page.getByRole('link', { name: '成長' }).click()
  await expect(page.getByTestId('trend-chart')).toBeVisible()
  await page.waitForTimeout(1500) // Chart.js の描画アニメーション完了を待つ
  await page.screenshot({ path: info.outputPath('growth.png') })

  await page.getByRole('link', { name: '履歴' }).click()
  await page.getByTestId('session-list').getByRole('link').first().click()
  await expect(page.getByText('前回')).not.toHaveCount(0)
  await page.screenshot({ path: info.outputPath('session.png'), fullPage: true })

  await page.getByRole('link', { name: '設定' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /書き出す/ }).click()
  expect((await download).suggestedFilename()).toMatch(/^crimb-backup-.*\.json$/)

  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'すべての記録を削除' }).click()
  await expect(page.getByRole('status')).toHaveText('すべての記録を削除しました')
  await page.getByRole('link', { name: '履歴' }).click()
  await expect(page.getByText('まだ記録がありません')).toBeVisible()
})
