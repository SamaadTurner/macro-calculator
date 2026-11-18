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
