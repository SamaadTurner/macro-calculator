import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { answerAll, averageMan, continueButton } from './helpers'

// Runs axe (WCAG 2.1 A and AA rules) on every screen, including the error states.
// Reduced motion so axe does not read colours halfway through a fade-in.
test.use({ contextOptions: { reducedMotion: 'reduce' } })

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const summary = results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)
  expect(summary).toEqual([])
}

test('every step and the results page pass axe checks', async ({ page }) => {
  await page.goto('./')
  await expectNoViolations(page)

  await continueButton(page).click()
  await expect(page.getByText('Enter your age')).toBeVisible()
  await expectNoViolations(page)

  await answerAll(page, averageMan)
  await page.locator('summary').click()
  await page.getByRole('button', { name: 'Save plan' }).click()
  await expectNoViolations(page)
})

test('each step passes axe checks when shown with errors', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('radio', { name: 'Male', exact: true }).check()
  await page.getByLabel('Age').fill('30')
  await continueButton(page).click()

  for (const step of ['Step 2 of 4', 'Step 3 of 4', 'Step 4 of 4']) {
    await expect(page.getByText(step)).toBeVisible()
    await continueButton(page).click()
    await expectNoViolations(page)
    // Fill the step so the next one opens.
    if (step === 'Step 2 of 4') {
      await page.getByLabel('Weight').fill('180')
      await page.getByLabel('Feet').fill('5')
    }
    if (step === 'Step 3 of 4') await page.getByRole('radio', { name: /^Active/ }).check()
    if (step !== 'Step 4 of 4') await continueButton(page).click()
  }
})

/** Fills the log with a few days through the form, so the chart, history and errors all show. */
async function fillLog(page: Page) {
  await page.goto('./#log')
  await page.getByRole('button', { name: 'Save day' }).click()
  await expect(page.getByText('Enter a weight, calories, or both')).toBeVisible()
  await expectNoViolations(page)
  for (const [date, weight] of [
    ['2026-11-20', '181'],
    ['2026-11-21', '180.4'],
    ['2026-11-22', '180.8'],
  ]) {
    await page.getByLabel('Date').fill(date)
    await page.getByLabel('Weight', { exact: true }).fill(weight)
    await page.getByRole('button', { name: 'Save day' }).click()
  }
  await expect(page.locator('.log-table tbody tr')).toHaveCount(3)
  await page.getByRole('group', { name: /weight chart/i }).focus()
  await page.keyboard.press('ArrowLeft')
}

test('the log page passes axe checks, empty and with data', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 23, 9, 0))
  await page.goto('./#log')
  await expectNoViolations(page)
  await fillLog(page)
  await expectNoViolations(page)
})

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('the results page passes axe checks in dark mode', async ({ page }) => {
    await page.goto('./')
    await continueButton(page).click()
    await expectNoViolations(page)
    await answerAll(page, averageMan)
    await expectNoViolations(page)
  })

  test('the log page passes axe checks in dark mode', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 23, 9, 0))
    await fillLog(page)
    await expectNoViolations(page)
  })
})
