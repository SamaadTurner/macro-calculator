import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { averageManCut, isoDaysAgo, openCheckIn, steadyLog } from './helpers'

/** One fat loss check-in a week, the newest `endDaysAgo` days ago. */
function weeklyCheckIns(count: number, endDaysAgo = 7) {
  return Array.from({ length: count }, (_, i) => ({
    date: isoDaysAgo(endDaysAgo + (count - 1 - i) * 7),
    expenditure: 2330,
    calories: 1940,
    protein: 174,
    carbs: 190,
    fats: 54,
    goal: 'cutting',
  }))
}

test('the support line is at the bottom of every tab', async ({ page }) => {
  await openCheckIn(page, { form: averageManCut })
  for (const hash of ['#checkin', '#log', '#plan']) {
    await page.goto(`./${hash}`)
    const line = page.getByTestId('support-line')
    await expect(line).toBeVisible()
    await expect(line.getByRole('link', { name: 'ANAD helpline' })).toHaveAttribute('href', 'https://anad.org/eating-disorder-helpline/')
    await expect(line.getByRole('link', { name: '1-888-375-7767' })).toHaveAttribute('href', 'tel:+18883757767')
    await expect(line.getByRole('link', { name: '988' })).toHaveAttribute('href', 'tel:988')
  }
})

test('a maintenance break switches the targets to maintenance and back', async ({ page }) => {
  await openCheckIn(page, { form: averageManCut, log: steadyLog(28) })
  await expect(page.getByTestId('suggested-calories')).toHaveText('1,943')

  // Before 12 weeks of fat loss the offer is there but folded away.
  const offer = page.getByTestId('break-offer')
  await expect(offer.getByRole('button', { name: 'Take a 2-week break' })).toBeHidden()
  await offer.getByText('Take a maintenance break').click()
  await offer.getByRole('button', { name: 'Take a 2-week break' }).click()
  await expect(page.getByRole('status')).toHaveText('Break started. Fat loss targets come back on Dec 7.')

  const now = page.getByTestId('break-now')
  await expect(now).toContainText('Eating at maintenance through Dec 6')
  await expect(page.getByText('Maintain, for your break.')).toBeVisible()
  const maintenance = Number((await page.getByTestId('suggested-calories').textContent())?.replace(',', ''))
  expect(maintenance).toBeGreaterThan(2300)
  expect(maintenance).toBeLessThan(2360)
  await expect(offer).toHaveCount(0)

  // A check-in saved during the break is a maintenance check-in.
  await page.getByRole('button', { name: 'Save check-in' }).click()
  await expect(page.getByRole('table')).toContainText('Maintain')

  // The break survives a reload and shows on the Plan tab.
  await page.reload()
  await expect(now).toBeVisible()
  await page.getByRole('link', { name: 'Plan', exact: true }).click()
  await expect(page.getByTestId('break-banner')).toContainText('maintenance break through Dec 6')

  await page.getByTestId('break-banner').getByRole('link', { name: 'Open the check-in' }).click()
  await now.getByRole('button', { name: 'End the break now' }).click()
  await expect(now).toHaveCount(0)
  await expect(page.getByTestId('suggested-calories')).toHaveText('1,943')
})

test('suggests a break after 12 weeks of fat loss', async ({ page }) => {
  await openCheckIn(page, { form: averageManCut, log: steadyLog(28), checkins: weeklyCheckIns(12) })
  const offer = page.getByTestId('break-offer')
  await expect(offer.getByRole('heading', { name: 'Time for a break?' })).toBeVisible()
  await expect(offer).toContainText('losing fat for 12 weeks in a row')
  await expect(offer.getByRole('button', { name: 'Take a 1-week break' })).toBeVisible()
})

test('a break that has ended is gone and the fat loss targets are back', async ({ page }) => {
  await openCheckIn(page, {
    form: averageManCut,
    log: steadyLog(28),
    checkins: weeklyCheckIns(20),
    maintenanceBreak: { start: isoDaysAgo(20), end: isoDaysAgo(6) },
  })
  await expect(page.getByTestId('break-now')).toHaveCount(0)
  await expect(page.getByTestId('suggested-calories')).toHaveText('1,943')
  // The 20 weeks before the break do not count toward the next suggestion.
  await expect(page.getByRole('heading', { name: 'Time for a break?' })).toHaveCount(0)
})

test('the weekly reminder downloads a calendar file starting on the next check-in day', async ({ page }) => {
  await openCheckIn(page, { form: averageManCut, log: steadyLog(28), checkins: weeklyCheckIns(1, 3) })
  const reminder = page.getByTestId('reminder')
  await reminder.getByText('Weekly reminder (optional)').click()
  await expect(reminder).toContainText('every Friday from Nov 27')
  const downloadPromise = page.waitForEvent('download')
  await reminder.getByRole('button', { name: 'Add to my calendar' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('weekly-check-in.ics')
  const text = await readFile(await download.path(), 'utf-8')
  expect(text).toContain('DTSTART;VALUE=DATE:20261127\r\n')
  expect(text).toContain('RRULE:FREQ=WEEKLY\r\n')
})

for (const scheme of ['light', 'dark'] as const) {
  test(`the break and reminder cards pass axe in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await openCheckIn(page, {
      form: averageManCut,
      log: steadyLog(28),
      checkins: weeklyCheckIns(12),
      maintenanceBreak: { start: isoDaysAgo(2), end: isoDaysAgo(-5) },
    })
    await expect(page.getByTestId('break-now')).toBeVisible()
    await page.getByText('Weekly reminder (optional)').click()
    // Let the page's rise-in animation finish so colours are final.
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)))
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
}
