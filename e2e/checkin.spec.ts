import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Fixed clock, and a log put straight into storage, so the numbers can be checked exactly.
// The expected values come from a separate Python version written from the formulas.
const TODAY = new Date(2026, 10, 23, 9, 0)
const LB_TO_KG = 0.45359237

const averageManCut = {
  unit: 'imperial',
  sex: 'male',
  age: '30',
  weight: '180',
  heightFt: '5',
  heightIn: '10',
  heightCm: '',
  activity: 1.55,
  goal: 'cutting',
  pace: null,
  exactWeightKg: null,
  exactHeightCm: null,
}

const isoDaysAgo = (days: number) => {
  const date = new Date(2026, 10, 23 - days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** `days` days ending today: weight from 182 lb down 0.1 lb a day, 2,000 calories every day. */
function steadyLog(days: number) {
  return Array.from({ length: days }, (_, i) => ({ date: isoDaysAgo(days - 1 - i), weightKg: (182 - 0.1 * i) * LB_TO_KG, calories: 2000 }))
}

async function openCheckIn(page: Page, storage: { form?: object; log?: object[]; checkins?: object[] }) {
  await page.clock.setFixedTime(TODAY)
  await page.addInitScript(data => {
    // Only on the first load, so a reload keeps what the test saved.
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    if (data.form) localStorage.setItem('macroCalculator.form.v2', JSON.stringify(data.form))
    if (data.log) localStorage.setItem('macroCalculator.log.v1', JSON.stringify(data.log))
    if (data.checkins) localStorage.setItem('macroCalculator.checkins.v1', JSON.stringify(data.checkins))
  }, storage)
  await page.goto('./#checkin')
  await expect(page.getByRole('heading', { name: 'What you really burn' })).toBeVisible()
}

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
}

test('asks for the plan first', async ({ page }) => {
  await openCheckIn(page, {})
  await page.getByRole('link', { name: 'Make your plan' }).click()
  await expect(page.getByText('Step 1 of 4')).toBeVisible()
})

test('shows what is still needed before the first estimate', async ({ page }) => {
  await openCheckIn(page, { form: averageManCut, log: steadyLog(4) })
  await expect(page.getByRole('heading', { name: 'Getting to know you' })).toBeVisible()
  const list = page.getByRole('list', { name: /What the first check-in needs/ })
  await expect(list.getByRole('listitem').nth(0)).toHaveText(/Weigh-ins\s*4 of 5/)
  await expect(list.getByRole('listitem').nth(1)).toHaveText(/first to last weigh-in\s*3 of 10/)
  await expect(list.getByRole('listitem').nth(2)).toHaveText(/calories logged\s*3 of 7/)
  await page.getByRole('link', { name: 'Go to the log' }).click()
  await expect(page.getByRole('heading', { name: 'Track your weight' })).toBeVisible()
})

test('estimates maintenance from 4 weeks of log and saves a check-in', async ({ page }) => {
  await openCheckIn(page, { form: averageManCut, log: steadyLog(28) })
  await expect(page.getByTestId('expenditure')).toHaveText('2,310')
  await expect(page.getByTestId('data-share')).toHaveText('98%')
  await expect(page.getByText('Likely between 2,190 and 2,430.')).toBeVisible()
  await expect(page.getByTestId('suggested-calories')).toHaveText('1,924')
  await expect(page.getByTestId('suggested-macros')).toHaveText('Protein 174g · Carbs 188g · Fats 53g')
  await expect(page.getByTestId('target-change')).toHaveText('Down 390 from your plan (2,314).')

  await page.getByText('How this was worked out').click()
  await expect(page.getByRole('definition').filter({ hasText: '−0.7 lb a week' })).toBeVisible()
  await expect(page.getByRole('definition').filter({ hasText: '2,000 cal' })).toBeVisible()

  await page.getByRole('button', { name: 'Save check-in' }).click()
  await expect(page.locator('.toast')).toHaveText('Check-in saved. Next one on Nov 30.')
  await expect(page.getByTestId('checkin-status')).toHaveText('Checked in today. Next check-in on Nov 30.')
  await expect(page.getByTestId('target-change')).toHaveText('Same as your last check-in.')
  const row = page.getByRole('row', { name: /Nov 23/ })
  await expect(row).toContainText('2,310 cal')
  await expect(row).toContainText('1,924 cal')

  await page.reload()
  await expect(page.getByRole('row', { name: /Nov 23/ })).toBeVisible()
  await expect(page.getByRole('button', { name: "Update today's check-in" })).toBeVisible()
})

test('moves at most 200 calories a week from the last check-in', async ({ page }) => {
  const lastWeek = { date: isoDaysAgo(7), expenditure: 3000, calories: 2550, protein: 174, carbs: 300, fats: 71, goal: 'cutting' }
  await openCheckIn(page, { form: averageManCut, log: steadyLog(28), checkins: [lastWeek] })
  await expect(page.getByTestId('checkin-status')).toHaveText('Last check-in Nov 16. A new one is due.')
  await expect(page.getByTestId('expenditure')).toHaveText('2,800')
  await expect(page.getByText('Your log points to 2,310 calories.')).toBeVisible()
  await expect(page.getByTestId('suggested-calories')).toHaveText('2,413')
  await expect(page.getByTestId('target-change')).toHaveText('Down 137 from your last check-in (2,550).')
})

test('the three tabs fit on a 320 px wide phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await openCheckIn(page, { form: averageManCut })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBe(0)
  for (const name of ['Plan', 'Log', 'Check-in']) await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
})

test.describe('accessibility', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('passes axe checks waiting for data and with an estimate', async ({ page }) => {
    await openCheckIn(page, { form: averageManCut, log: steadyLog(4) })
    await expectNoViolations(page)
    await page.evaluate(log => localStorage.setItem('macroCalculator.log.v1', JSON.stringify(log)), steadyLog(28))
    await page.reload()
    await page.getByText('How this was worked out').click()
    await page.getByRole('button', { name: 'Save check-in' }).click()
    await expectNoViolations(page)
  })

  test.describe('dark mode', () => {
    test.use({ colorScheme: 'dark' })

    test('passes axe checks in dark mode', async ({ page }) => {
      const lastWeek = { date: isoDaysAgo(7), expenditure: 3000, calories: 2550, protein: 174, carbs: 300, fats: 71, goal: 'cutting' }
      await openCheckIn(page, { form: averageManCut, log: steadyLog(28), checkins: [lastWeek] })
      await expectNoViolations(page)
    })
  })
})
