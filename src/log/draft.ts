import type { UnitSystem } from '../engine/types'
import { kgToLb, lbToKg, parseNumber, roundTo } from '../engine/units'
import { checkWeight } from '../engine/validate'
import { isIsoDate, todayIso } from './dates'
import type { LogEntry } from './entries'
import { LOG_LIMITS } from './entries'

/** What the user has typed in the log form, kept as text like the calculator form. */
export interface LogDraft {
  date: string
  weight: string
  calories: string
  protein: string
  carbs: string
  fats: string
}

export type DraftErrors = Partial<Record<keyof LogDraft | 'form', string>>

export const emptyDraft = (date = todayIso()): LogDraft => ({ date, weight: '', calories: '', protein: '', carbs: '', fats: '' })

const MACRO_NAMES = { protein: 'Protein', carbs: 'Carbs', fats: 'Fats' } as const

function checkAmount(text: string, label: string, range: { min: number; max: number }, unit: string): string {
  const value = parseNumber(text)
  if (value === null) return ''
  if (Number.isNaN(value)) return `Enter ${label.toLowerCase()} as a number`
  if (value < range.min || value > range.max) return `${label} must be between ${range.min} and ${range.max.toLocaleString('en-US')}${unit}`
  return ''
}

export function draftErrors(draft: LogDraft, unit: UnitSystem, today = todayIso()): DraftErrors {
  const errors: DraftErrors = {}
  if (!isIsoDate(draft.date)) errors.date = 'Pick a date'
  else if (draft.date > today) errors.date = 'You can only log today or earlier'
  else if (draft.date < LOG_LIMITS.earliestDate) errors.date = 'Pick a date from 2000 on'

  if (draft.weight.trim() !== '') {
    const message = checkWeight(parseNumber(draft.weight), unit)
    if (message) errors.weight = message
  }
  const caloriesMessage = checkAmount(draft.calories, 'Calories', LOG_LIMITS.calories, '')
  if (caloriesMessage) errors.calories = caloriesMessage
  for (const macro of ['protein', 'carbs', 'fats'] as const) {
    const message = checkAmount(draft[macro], MACRO_NAMES[macro], LOG_LIMITS.grams, ' g')
    if (message) errors[macro] = message
  }

  if (draft.weight.trim() === '' && draft.calories.trim() === '') {
    errors.form = 'Enter a weight, calories, or both'
  }
  return errors
}

/** Turns a checked draft into an entry. Call draftErrors first. */
export function draftToEntry(draft: LogDraft, unit: UnitSystem): LogEntry {
  const entry: LogEntry = { date: draft.date }
  const weight = parseNumber(draft.weight)
  if (weight !== null) entry.weightKg = unit === 'imperial' ? lbToKg(weight) : weight
  const calories = parseNumber(draft.calories)
  if (calories !== null) entry.calories = Math.round(calories)
  for (const macro of ['protein', 'carbs', 'fats'] as const) {
    const grams = parseNumber(draft[macro])
    if (grams !== null) entry[macro] = Math.round(grams)
  }
  return entry
}

export function weightForDisplay(kg: number, unit: UnitSystem): number {
  return roundTo(unit === 'imperial' ? kgToLb(kg) : kg, 1)
}

/** Fills the form with a saved day so it can be changed. */
export function entryToDraft(entry: LogEntry, unit: UnitSystem): LogDraft {
  const text = (value: number | undefined) => (value === undefined ? '' : String(value))
  return {
    date: entry.date,
    weight: entry.weightKg === undefined ? '' : String(weightForDisplay(entry.weightKg, unit)),
    calories: text(entry.calories),
    protein: text(entry.protein),
    carbs: text(entry.carbs),
    fats: text(entry.fats),
  }
}
