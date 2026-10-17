import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const video = fileURLToPath(new URL('./fixtures/no-person.webm', import.meta.url))

test('home shows the empty state and navigation', async ({ page }, info) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Crimb' })).toBeVisible()
  await expect(page.getByText('まだ記録がありません')).toBeVisible()
  await page.screenshot({ path: info.outputPath('home.png') })
  await page.getByRole('link', { name: '成長' }).click()
  await expect(page.getByRole('heading', { name: '成長' })).toBeVisible()
  await page.getByRole('link', { name: '設定' }).click()
  await expect(page.getByRole('heading', { name: '設定' })).toBeVisible()
})

test('analyze a video, save it and see it in history', async ({ page }, info) => {
  await page.goto('./#/new')
  await page.getByPlaceholder('例: 黄色テープ 3番').fill('E2E 課題')
  await page.getByTestId('video-input').setInputFiles(video)
  await page.getByRole('button', { name: '解析スタート' }).click()

  // 人が映っていないので全身チェックの警告が出る
  await page.getByRole('button', { name: 'このまま解析' }).click({ timeout: 60_000 })

  // 人が映っていない動画なので「撮影条件」の改善案が出る
  await expect(page.getByText('撮影条件を見直しましょう')).toBeVisible({ timeout: 180_000 })
  await page.screenshot({ path: info.outputPath('result.png'), fullPage: true })

  // 課題の 3D 表示: 壁の写真をタップすると、ホールドが見つかれば 3D、見つからなければ案内が出る
  await expect(page.getByRole('heading', { name: '課題を 3D で見る' })).toBeVisible()
  // 壁の写真に使うコマを変えると、写真が差し替わる
  const photo = page.getByTestId('route-frame')
  const first = await photo.getAttribute('src', { timeout: 30_000 })
  await page.getByTestId('route-frame-time').fill('1')
  await expect(page.getByText('壁の写真に使うコマ（1.0 秒）')).toBeVisible()
  await expect(photo).not.toHaveAttribute('src', first!)
  await photo.click()
  await expect(page.getByRole('img', { name: /課題の 3D 表示/ }).or(page.getByRole('alert'))).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '記録を保存' }).click()
  await expect(page).toHaveURL(/#\/session\/\d+/)

  await page.getByRole('link', { name: '履歴' }).click()
  await expect(page.getByTestId('session-list').getByText('E2E 課題')).toBeVisible()
  await page.screenshot({ path: info.outputPath('history.png') })
})
