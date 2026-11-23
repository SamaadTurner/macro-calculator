import type { FormState } from './form'
import { emptyForm } from './form'
import type { MacroPlan } from './engine/types'

// Everything stays in this browser's local storage. Storage can be full, blocked (private
// browsing) or hold old or broken data, so every read and write is guarded.

const FORM_KEY = 'macroCalculator.form.v2'
const PLANS_KEY = 'macroCalculator.plans.v2'
export const MAX_SAVED_PLANS = 10

export interface SavedPlan {
  id: string
  savedAt: string
  goal: string
  calories: number
  protein: number
  carbs: number
  fats: number
}

function read(key: string): unknown {
  try {
    const text = localStorage.getItem(key)
    return text === null ? null : JSON.parse(text)
  } catch {
    return null
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Loads the last form, keeping only fields with the right type so old or edited data cannot break the page. */
export function loadForm(): FormState | null {
  const data = read(FORM_KEY)
  if (!data || typeof data !== 'object') return null
  const saved = data as Record<string, unknown>
  const form: FormState = { ...emptyForm }

  if (saved.unit === 'imperial' || saved.unit === 'metric') form.unit = saved.unit
  if (saved.sex === 'male' || saved.sex === 'female' || saved.sex === 'other') form.sex = saved.sex
  if (saved.goal === 'cutting' || saved.goal === 'maintain' || saved.goal === 'bulking') form.goal = saved.goal
  if (isFiniteNumber(saved.activity)) form.activity = saved.activity
  // The engine ignores a pace it does not offer, so any number is safe to keep here.
  if (isFiniteNumber(saved.pace)) form.pace = saved.pace
  for (const field of ['age', 'weight', 'heightFt', 'heightIn', 'heightCm'] as const) {
    if (typeof saved[field] === 'string') form[field] = saved[field] as string
  }
  if (isFiniteNumber(saved.exactWeightKg)) form.exactWeightKg = saved.exactWeightKg
  if (isFiniteNumber(saved.exactHeightCm)) form.exactHeightCm = saved.exactHeightCm
  return form
}

export function saveForm(form: FormState): boolean {
  return write(FORM_KEY, form)
}

export function clearForm(): void {
  try {
    localStorage.removeItem(FORM_KEY)
  } catch {
    // Nothing was saved, so there is nothing to clear.
  }
}

function isSavedPlan(item: unknown): item is SavedPlan {
  if (!item || typeof item !== 'object') return false
  const plan = item as Record<string, unknown>
  return (
    typeof plan.id === 'string' &&
    typeof plan.savedAt === 'string' &&
    typeof plan.goal === 'string' &&
    isFiniteNumber(plan.calories) &&
    isFiniteNumber(plan.protein) &&
    isFiniteNumber(plan.carbs) &&
    isFiniteNumber(plan.fats)
  )
}

export function loadPlans(): SavedPlan[] {
  const data = read(PLANS_KEY)
  return Array.isArray(data) ? data.filter(isSavedPlan) : []
}

/** Adds a plan to the front of the list, keeping the newest ten. Returns the new list, or null if storage failed. */
export function savePlan(plan: MacroPlan, goal: string, now = new Date()): SavedPlan[] | null {
  const entry: SavedPlan = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: now.toISOString(),
    goal,
    calories: plan.calories,
    protein: plan.protein.grams,
    carbs: plan.carbs.grams,
    fats: plan.fats.grams,
  }
  const plans = [entry, ...loadPlans()].slice(0, MAX_SAVED_PLANS)
  return write(PLANS_KEY, plans) ? plans : null
}

export function deletePlan(id: string): SavedPlan[] {
  const plans = loadPlans().filter(plan => plan.id !== id)
  write(PLANS_KEY, plans)
  return plans
}
