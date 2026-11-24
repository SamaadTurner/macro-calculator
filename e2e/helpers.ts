import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export interface Answers {
  sex: 'Male' | 'Female' | 'Other'
  age: string
  unit?: 'imperial' | 'metric'
  weight: string
  feet?: string
  inches?: string
  cm?: string
  activity: string
  goal: 'Lose fat' | 'Maintain' | 'Build muscle'
}

export const averageMan: Answers = {
  sex: 'Male',
  age: '30',
  weight: '180',
  feet: '5',
  inches: '10',
  activity: 'Active',
  goal: 'Lose fat',
}

export const continueButton = (page: Page) => page.getByRole('button', { name: /continue|see my macros/i })

export async function pick(page: Page, label: string) {
  await page.getByRole('radio', { name: new RegExp(`^${label}`) }).check()
}

/** Goes through all four steps and lands on the results page. */
export async function answerAll(page: Page, answers: Answers) {
  await pick(page, answers.sex)
  await page.getByLabel('Age').fill(answers.age)
  await continueButton(page).click()

  if (answers.unit === 'metric') await pick(page, 'kg / cm')
  await page.getByLabel('Weight').fill(answers.weight)
  if (answers.unit === 'metric') {
    await page.getByLabel('Height').fill(answers.cm ?? '')
  } else {
    await page.getByLabel('Feet').fill(answers.feet ?? '')
    await page.getByLabel('Inches').fill(answers.inches ?? '')
  }
  await continueButton(page).click()

  await pick(page, answers.activity)
  await continueButton(page).click()

  await pick(page, answers.goal)
  await continueButton(page).click()
  await expect(page.getByText('Your daily target')).toBeVisible()
}

export const calories = (page: Page) => page.getByTestId('calories')

// Fixed clock, and a log put straight into storage, so the numbers can be checked exactly.
// The expected values come from a separate Python version written from the formulas.
export const TODAY = new Date(2026, 10, 23, 9, 0)
export const LB_TO_KG = 0.45359237

export const averageManCut = {
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

export const isoDaysAgo = (days: number) => {
  const date = new Date(2026, 10, 23 - days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** `days` days ending today: weight from 182 lb down 0.1 lb a day, 2,000 calories every day. */
export function steadyLog(days: number) {
  return Array.from({ length: days }, (_, i) => ({ date: isoDaysAgo(days - 1 - i), weightKg: (182 - 0.1 * i) * LB_TO_KG, calories: 2000 }))
}

export async function openCheckIn(page: Page, storage: { form?: object; log?: object[]; checkins?: object[]; maintenanceBreak?: object }) {
  await page.clock.setFixedTime(TODAY)
  await page.addInitScript(data => {
    // Only on the first load, so a reload keeps what the test saved.
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    if (data.form) localStorage.setItem('macroCalculator.form.v2', JSON.stringify(data.form))
    if (data.log) localStorage.setItem('macroCalculator.log.v1', JSON.stringify(data.log))
    if (data.checkins) localStorage.setItem('macroCalculator.checkins.v1', JSON.stringify(data.checkins))
    if (data.maintenanceBreak) localStorage.setItem('macroCalculator.break.v1', JSON.stringify(data.maintenanceBreak))
  }, storage)
  await page.goto('./#checkin')
  await expect(page.getByRole('heading', { name: 'What you really burn' })).toBeVisible()
}
