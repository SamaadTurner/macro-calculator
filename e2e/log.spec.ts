import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// The clock is fixed so "today" and the dates in the history do not depend on when the tests run.
const TODAY = new Date(2026, 10, 23, 9, 0)
const LB_TO_KG = 0.45359237

/** A backup with one weigh-in a day, starting at `startLb` and dropping 0.2 lb a day. */
function backupFile(days: number, startLb: number) {
  const entries = Array.from({ length: days }, (_, i) => {
    const date = new Date(2026, 10, 23 - (days - 1 - i))
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { date: iso, weightKg: (startLb - i * 0.2) * LB_TO_KG, calories: 2200 }
  })
  return {
    name: 'macro-log.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'macro-calculator-log', version: 1, entries })),
  }
}

async function openLog(page: Page) {
  await page.clock.setFixedTime(TODAY)
  await page.goto('./#log')
  await expect(page.getByRole('heading', { name: 'Track your weight' })).toBeVisible()
}

test('logs a weigh-in and shows it in the trend and history', async ({ page }) => {
  await openLog(page)
  await expect(page.getByText('Your trend shows up here after your first weigh-in.')).toBeVisible()

  await page.getByLabel('Weight', { exact: true }).fill('181.4')
  await page.getByLabel('Calories eaten').fill('2300')
  await page.getByRole('button', { name: 'Save day' }).click()

  await expect(page.locator('.toast')).toHaveText('Saved Nov 23')
  await expect(page.getByTestId('trend-weight')).toHaveText('181.4 lb')
  await expect(page.getByTestId('trend-change')).toHaveText('Needs a week of data')
  const row = page.getByRole('row', { name: /Nov 23/ })
  await expect(row).toContainText('181.4 lb')
  await expect(row).toContainText('2,300')
  // The form now shows the saved day, ready to change.
  await expect(page.getByRole('heading', { name: 'Change a day' })).toBeVisible()
  await expect(page.getByLabel('Weight', { exact: true })).toHaveValue('181.4')
})

test('picking a day that is already logged loads its numbers', async ({ page }) => {
  await openLog(page)
  await page.getByLabel('Date').fill('2026-11-20')
  await page.getByLabel('Weight', { exact: true }).fill('182')
  await page.getByText('Add macros (optional)').click()
  await page.getByLabel('Protein').fill('175')
  await page.getByRole('button', { name: 'Save day' }).click()

  await page.getByLabel('Date').fill('2026-11-23')
  await expect(page.getByLabel('Weight', { exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Save day' })).toBeVisible()

  await page.getByLabel('Date').fill('2026-11-20')
  await expect(page.getByLabel('Weight', { exact: true })).toHaveValue('182')
  await expect(page.getByLabel('Protein')).toHaveValue('175')
  await expect(page.getByText('Already logged. Change the numbers and press Update day.')).toBeVisible()
  await expect(page.getByRole('row', { name: /Nov 20/ })).toContainText('P 175')
})

test('asks for a weight or calories and checks the numbers', async ({ page }) => {
  await openLog(page)
  await page.getByRole('button', { name: 'Save day' }).click()
  await expect(page.getByText('Enter a weight, calories, or both')).toBeVisible()

  await page.getByLabel('Weight', { exact: true }).fill('20')
  await page.getByRole('button', { name: 'Save day' }).click()
  await expect(page.getByText('Weight must be between 50 and 500 lb')).toBeVisible()
  await expect(page.getByLabel('Weight', { exact: true })).toBeFocused()

  await page.getByText('Add macros (optional)').click()
  await page.getByLabel('Weight', { exact: true }).fill('180')
  await page.getByLabel('Protein').fill('abc')
  await page.getByRole('button', { name: 'Save day' }).click()
  await expect(page.getByText('Enter protein as a number')).toBeVisible()
  await expect(page.getByRole('row', { name: /Nov 23/ })).toHaveCount(0)
})

test('edits and deletes a day', async ({ page }) => {
  await openLog(page)
  await page.getByLabel('Weight', { exact: true }).fill('180')
  await page.getByRole('button', { name: 'Save day' }).click()

  await page.getByRole('button', { name: 'Edit Nov 23' }).click()
  await expect(page.getByLabel('Weight', { exact: true })).toHaveValue('180')
  await page.getByLabel('Weight', { exact: true }).fill('179.6')
  await page.getByRole('button', { name: 'Update day' }).click()
  await expect(page.locator('.toast')).toHaveText('Updated Nov 23')
  await expect(page.getByRole('row', { name: /Nov 23/ })).toContainText('179.6 lb')

  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Delete Nov 23' }).click()
  await expect(page.getByRole('row', { name: /Nov 23/ })).toHaveCount(0)
  await expect(page.getByText('Your trend shows up here after your first weigh-in.')).toBeVisible()
})

test('keeps the log after a reload and switches units without changing it', async ({ page }) => {
  await openLog(page)
  await page.getByLabel('Weight', { exact: true }).fill('180')
  await page.getByRole('button', { name: 'Save day' }).click()
  await page.reload()

  await expect(page.getByRole('heading', { name: 'Track your weight' })).toBeVisible()
  await expect(page.getByRole('row', { name: /Nov 23/ })).toContainText('180 lb')
  await page.getByRole('radio', { name: 'kg' }).check()
  await expect(page.getByRole('row', { name: /Nov 23/ })).toContainText('81.6 kg')
  await page.getByRole('radio', { name: 'lb' }).check()
  await expect(page.getByRole('row', { name: /Nov 23/ })).toContainText('180 lb')
})

test('imports a backup, draws the chart and exports the same days', async ({ page }) => {
  await openLog(page)
  await page.getByLabel('Backup file').setInputFiles(backupFile(45, 190))
  await expect(page.locator('.toast')).toHaveText('Imported 45 days')

  // 0.2 lb a day down: the trend lags a little behind the scale, and the week change is negative.
  await expect(page.getByTestId('trend-change')).toHaveText(/^−1\.\d lb$/)
  await expect(page.getByRole('group', { name: /weight chart in lb, 30 weigh-ins/i })).toBeVisible()
  await page.getByRole('radio', { name: 'All' }).check()
  await expect(page.getByRole('group', { name: /45 weigh-ins/i })).toBeVisible()

  // The history shows two weeks first, then everything.
  await expect(page.locator('.log-table tbody tr')).toHaveCount(14)
  await page.getByRole('button', { name: 'Show all 45 days' }).click()
  await expect(page.locator('.log-table tbody tr')).toHaveCount(45)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('macro-log-2026-11-23.json')
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(exported.format).toBe('macro-calculator-log')
  expect(exported.entries).toHaveLength(45)
})

test('refuses a file that is not a backup', async ({ page }) => {
  await openLog(page)
  await page.getByLabel('Backup file').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": 1}') })
  await expect(page.locator('.toast')).toHaveText('That file is not a log backup from this app.')
  await expect(page.getByText('Your trend shows up here after your first weigh-in.')).toBeVisible()
})

test('the chart can be read with the keyboard', async ({ page }) => {
  await openLog(page)
  await page.getByLabel('Backup file').setInputFiles(backupFile(10, 180))
  const chart = page.getByRole('group', { name: /weight chart/i })
  await chart.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(chart).toContainText('Nov 23')
  await expect(chart).toContainText('178.2 lb on the scale')
  await page.keyboard.press('Home')
  await expect(chart).toContainText('180 lb on the scale')
})

test('the tabs switch between the plan and the log', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('link', { name: 'Plan' })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('link', { name: 'Log' }).click()
  await expect(page).toHaveURL(/#log$/)
  await expect(page.getByRole('heading', { name: 'Track your weight' })).toBeVisible()
  await page.getByRole('link', { name: 'Plan' }).click()
  await expect(page.getByText('Step 1 of 4')).toBeVisible()
})
