import { expect, test } from '@playwright/test'
import { answerAll, averageMan, calories, continueButton, pick } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
})

test('a full run gives the expected plan', async ({ page }) => {
  await answerAll(page, averageMan)
  // Maintenance 2,763 minus 500 for fat loss
  await expect(calories(page)).toHaveText('2,263')
  await expect(page.getByText('Maintenance is about 2,763')).toBeVisible()
  await expect(page.getByTestId('macro-protein')).toContainText('174g')
  await expect(page.getByTestId('macro-carbs')).toContainText('250g')
  await expect(page.getByTestId('macro-fats')).toContainText('63g')
})

test('metric gives the same result as imperial', async ({ page }) => {
  await answerAll(page, { ...averageMan, unit: 'metric', weight: '81.6466', cm: '177.8' })
  await expect(calories(page)).toHaveText('2,263')
})

test('pressing Continue on an empty step shows every message and focuses the first field', async ({ page }) => {
  await continueButton(page).click()
  await expect(page.getByText('Pick one so the formula can be applied')).toBeVisible()
  await expect(page.getByText('Enter your age')).toBeVisible()
  await expect(page.getByText('Step 1 of 4')).toBeVisible()

  await page.getByLabel('Age').fill('30')
  await expect(page.getByText('Enter your age')).toBeHidden()
})

test('metric height errors are visible', async ({ page }) => {
  await pick(page, 'Male')
  await page.getByLabel('Age').fill('30')
  await continueButton(page).click()
  await pick(page, 'kg / cm')
  await page.getByLabel('Weight').fill('80')
  await continueButton(page).click()
  await expect(page.getByText('Enter your height', { exact: true })).toBeVisible()

  await page.getByLabel('Height').fill('100')
  await continueButton(page).click()
  await expect(page.getByText('Height must be between 120 and 230 cm')).toBeVisible()
})

test('switching units converts weight and height without drifting', async ({ page }) => {
  await pick(page, 'Male')
  await page.getByLabel('Age').fill('30')
  await continueButton(page).click()

  await page.getByLabel('Weight').fill('155')
  await page.getByLabel('Feet').fill('5')
  await page.getByLabel('Inches').fill('10')
  await pick(page, 'kg / cm')
  await expect(page.getByLabel('Weight')).toHaveValue('70.3')
  await expect(page.getByLabel('Height')).toHaveValue('177.8')

  for (let i = 0; i < 4; i++) {
    await pick(page, 'lb / ft')
    await pick(page, 'kg / cm')
  }
  await pick(page, 'lb / ft')
  await expect(page.getByLabel('Weight')).toHaveValue('155')
  await expect(page.getByLabel('Feet')).toHaveValue('5')
  await expect(page.getByLabel('Inches')).toHaveValue('10')
})

test('an old value in the other unit system does not block the form', async ({ page }) => {
  await pick(page, 'Male')
  await page.getByLabel('Age').fill('30')
  await continueButton(page).click()
  await pick(page, 'kg / cm')
  await page.getByLabel('Height').fill('300')
  await pick(page, 'lb / ft')
  await page.getByLabel('Weight').fill('180')
  await page.getByLabel('Feet').fill('5')
  await page.getByLabel('Inches').fill('10')
  await continueButton(page).click()
  await expect(page.getByText('Step 3 of 4')).toBeVisible()
})

test('bad inches get a clear message', async ({ page }) => {
  await pick(page, 'Female')
  await page.getByLabel('Age').fill('30')
  await continueButton(page).click()
  await page.getByLabel('Weight').fill('140')
  await page.getByLabel('Feet').fill('5')
  await page.getByLabel('Inches').fill('14')
  await continueButton(page).click()
  await expect(page.getByText('Inches must be between 0 and 11')).toBeVisible()
  // Focus goes to the first box of the height group.
  await expect(page.getByLabel('Feet')).toBeFocused()
})

test('a small, older person on a cut gets the floor and a note, never negative macros', async ({ page }) => {
  await answerAll(page, { sex: 'Female', age: '80', weight: '100', feet: '4', inches: '0', activity: 'Mostly sitting', goal: 'Lose fat' })
  await expect(calories(page)).toHaveText('1,200')
  await expect(page.getByText(/Raised to 1,200 calories/)).toBeVisible()
  for (const macro of ['protein', 'carbs', 'fats']) {
    const grams = await page.getByTestId(`macro-${macro}`).locator('.macro-grams').textContent()
    expect(parseInt(grams ?? '0')).toBeGreaterThan(0)
  }
})

test('fat loss is not offered under 18', async ({ page }) => {
  await pick(page, 'Male')
  await page.getByLabel('Age').fill('16')
  await continueButton(page).click()
  await page.getByLabel('Weight').fill('150')
  await page.getByLabel('Feet').fill('5')
  await page.getByLabel('Inches').fill('8')
  await continueButton(page).click()
  await pick(page, 'Active')
  await continueButton(page).click()
  await pick(page, 'Lose fat')
  await continueButton(page).click()
  await expect(page.getByText(/not offered under 18/)).toBeVisible()

  await pick(page, 'Maintain')
  await continueButton(page).click()
  await expect(page.getByText('Your daily target')).toBeVisible()

  // The goal switcher on the results page refuses too. A click, not check(), because the radio is meant to stay unchecked.
  await page.getByRole('radio', { name: 'Cut' }).click()
  await expect(page.getByRole('status')).toContainText('not offered under 18')
  await expect(page.getByRole('radio', { name: 'Maintain' })).toBeChecked()
})

test('switching goal on the results page updates the numbers', async ({ page }) => {
  await answerAll(page, averageMan)
  await pick(page, 'Bulk')
  await expect(calories(page)).toHaveText('3,063')
  await pick(page, 'Maintain')
  await expect(calories(page)).toHaveText('2,763')
})

test('the per-meal table follows the number of meals', async ({ page }) => {
  await answerAll(page, averageMan)
  const rows = page.locator('.meal-table tbody tr')
  await expect(rows).toHaveCount(4)
  await pick(page, '3')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('58g')
})

test('a returning visitor lands on their results, and Start over clears them', async ({ page }) => {
  await answerAll(page, averageMan)
  await page.reload()
  await expect(calories(page)).toHaveText('2,263')

  await page.getByRole('button', { name: 'Start over' }).click()
  await expect(page.getByText('Step 1 of 4')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Step 1 of 4')).toBeVisible()
  await expect(page.getByLabel('Age')).toHaveValue('')
})

test('Edit answers keeps the answers', async ({ page }) => {
  await answerAll(page, averageMan)
  await page.getByRole('button', { name: 'Edit answers' }).click()
  await expect(page.getByLabel('Age')).toHaveValue('30')
  await expect(page.getByRole('radio', { name: 'Male', exact: true })).toBeChecked()
})

test('plans can be saved and deleted', async ({ page }) => {
  await answerAll(page, averageMan)
  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByRole('status')).toHaveText('Plan saved on this device')
  const saved = page.locator('.saved-item')
  await expect(saved).toHaveCount(1)
  await expect(saved).toContainText('2,263 cal')

  await page.reload()
  await expect(saved).toHaveCount(1)
  await page.getByRole('button', { name: /Delete plan/ }).click()
  await expect(saved).toHaveCount(0)
})

test('broken saved data does not break the page', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('macroCalculator.form.v2', '{bad')
    localStorage.setItem('macroCalculator.plans.v2', '[{"id": 1}]')
  })
  await page.reload()
  await expect(page.getByText('Step 1 of 4')).toBeVisible()
  await answerAll(page, averageMan)
  await expect(calories(page)).toHaveText('2,263')
})

test('choices work with the keyboard', async ({ page }) => {
  await page.getByRole('radio', { name: 'Male', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Female' })).toBeChecked()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Age')).toBeFocused()
  await page.keyboard.type('30')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Step 2 of 4')).toBeVisible()
})

test('the page never scrolls sideways', async ({ page }) => {
  const overflows = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(await overflows()).toBe(false)
  await answerAll(page, averageMan)
  expect(await overflows()).toBe(false)
})

test('tapping the ring on a phone does not leave a macro highlighted', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch only')
  await answerAll(page, averageMan)
  await page.locator('.ring').tap()
  await page.getByTestId('macro-carbs').tap()
  await expect(page.locator('.ring-seg.is-dim')).toHaveCount(0)
  await expect(page.locator('.macro-row.is-active')).toHaveCount(0)
})

test('hovering a macro with a mouse highlights it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse only')
  await answerAll(page, averageMan)
  await page.getByTestId('macro-protein').hover()
  await expect(page.locator('.ring-seg.is-dim')).toHaveCount(2)
  await page.mouse.move(0, 0)
  await expect(page.locator('.ring-seg.is-dim')).toHaveCount(0)
})
