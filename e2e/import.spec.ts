import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Importing daily totals from another app's CSV export, with a fixed clock so dates are stable.
const TODAY = new Date(2026, 10, 23, 9, 0)

function csv(name: string, lines: string[]) {
  return { name, mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) }
}

/** Meal rows like a MyFitnessPal nutrition summary: three meals on Nov 20, one on Nov 21. */
const mealFile = csv('Nutrition-Summary.csv', [
  'Date,Meal,Time,Calories,Fat (g),Saturated Fat,Carbohydrates (g),Fiber,Sugar,Protein (g),Note',
  '2026-11-20,Breakfast,8:02 AM,520,18,6,55,8,12,32,',
  '2026-11-20,Lunch,12:30 PM,700,25,9,70,10,6,45,',
  '2026-11-20,Dinner,7:15 PM,880,30,11,90,9,8,60,"steak, rice"',
  '2026-11-21,Breakfast,8:10 AM,450,15,5,50,7,10,30,',
])

async function openLog(page: Page) {
  await page.clock.setFixedTime(TODAY)
  await page.goto('./#log')
  await expect(page.getByRole('heading', { name: 'Track your weight' })).toBeVisible()
}

test('imports meal rows as daily totals after checking the columns', async ({ page }) => {
  await openLog(page)
  // A weigh-in already in the log stays when food is imported for that day.
  await page.getByLabel('Date').fill('2026-11-20')
  await page.getByLabel('Weight', { exact: true }).fill('181')
  await page.getByRole('button', { name: 'Save day' }).click()

  await page.getByLabel('CSV file').setInputFiles(mealFile)
  await expect(page.getByText('Nutrition-Summary.csv: 4 rows.')).toBeVisible()
  await expect(page.getByLabel('Calories', { exact: true })).toHaveValue('3')
  await expect(page.getByLabel('Protein (g)')).toHaveValue('9')
  await expect(page.getByLabel('Weight', { exact: true }).last()).toHaveValue('')
  await expect(page.getByTestId('import-preview')).toContainText(
    "2 days from Nov 20 to Nov 21: 2 with calories, 0 with weight. 1 are already in your log; the file's numbers replace theirs.",
  )
  await expect(page.getByTestId('import-preview')).toContainText('Nov 202,100 cal')

  // Picking no calorie column leaves nothing to import.
  await page.getByLabel('Calories', { exact: true }).selectOption('')
  await expect(page.getByTestId('import-preview')).toContainText('No days to import with these columns.')
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeDisabled()
  await page.getByLabel('Calories', { exact: true }).selectOption({ label: 'Calories' })

  await page.getByRole('button', { name: 'Import 2 days' }).click()
  await expect(page.locator('.toast')).toHaveText('Imported 2 days (1 already in your log updated)')
  const nov20 = page.getByRole('row', { name: /Nov 20/ })
  await expect(nov20).toContainText('181 lb')
  await expect(nov20).toContainText('2,100 cal')
  await expect(nov20).toContainText('P 137 · C 215 · F 73')
  await expect(page.getByRole('button', { name: 'Choose a CSV file' })).toBeVisible()
})

test('imports body weight from a file with one measurement per row', async ({ page }) => {
  await openLog(page)
  await page.getByLabel('CSV file').setInputFiles(
    csv('biometrics.csv', ['Day,Group,Metric,Unit,Amount', '2026-11-21,,Weight,kg,82', '2026-11-21,,Body Fat,%,21', '2026-11-22,,Weight,lbs,180.4']),
  )
  await expect(page.getByText('One measurement per row, so only body weight is read.')).toBeVisible()
  await expect(page.getByTestId('import-preview')).toContainText('2 days from Nov 21 to Nov 22: 0 with calories, 2 with weight. 1 rows skipped')
  await page.getByRole('button', { name: 'Import 2 days' }).click()
  await expect(page.getByRole('row', { name: /Nov 21/ })).toContainText('180.8 lb')
  await expect(page.getByRole('row', { name: /Nov 22/ })).toContainText('180.4 lb')
})

test('says why a file cannot be imported, and cancel leaves the log alone', async ({ page }) => {
  await openLog(page)
  await page.getByLabel('CSV file').setInputFiles(csv('empty.csv', ['Date,Calories']))
  await expect(page.locator('.toast')).toHaveText('That file has no rows to import.')

  await page.getByLabel('CSV file').setInputFiles(mealFile)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Choose a CSV file' })).toBeVisible()
  await expect(page.locator('.log-table')).toHaveCount(0)
})

test('the column check passes axe in light and dark mode', async ({ page }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    await openLog(page)
    await page.reload() // a fresh page for each scheme, so the file box is back
    await page.getByLabel('CSV file').setInputFiles(csv('weights.csv', ['Date,Weight', '2026-11-21,180', '2026-11-22,179.6']))
    await expect(page.getByRole('radio', { name: 'lb' }).last()).toBeChecked()
    // The page fades in; scanning mid-fade would measure half-transparent colours.
    await page.locator('.log').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)))
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
  }
})
