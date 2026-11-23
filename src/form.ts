import type { Goal, Person, Sex, UnitSystem } from './engine/types'
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg, parseNumber, roundTo } from './engine/units'
import { checkAge, checkGoal, checkHeightImperial, checkHeightMetric, checkWeight } from './engine/validate'

/** What the user has typed or picked. Number fields stay as text so half-typed values are kept as typed. */
export interface FormState {
  unit: UnitSystem
  sex: Sex | ''
  age: string
  weight: string
  heightFt: string
  heightIn: string
  heightCm: string
  activity: number | null
  goal: Goal | ''
  /** Chosen pace for the goal, or null for the default. */
  pace: number | null
  // After a unit switch the boxes show rounded numbers. The exact metric values are kept
  // here until the user edits the box, so switching back and forth never drifts.
  exactWeightKg: number | null
  exactHeightCm: number | null
}

export const emptyForm: FormState = {
  unit: 'imperial',
  sex: '',
  age: '',
  weight: '',
  heightFt: '',
  heightIn: '',
  heightCm: '',
  activity: null,
  goal: '',
  pace: null,
  exactWeightKg: null,
  exactHeightCm: null,
}

export type FormAction =
  | { type: 'set'; field: 'sex'; value: Sex }
  | { type: 'set'; field: 'goal'; value: Goal }
  | { type: 'set'; field: 'activity'; value: number }
  | { type: 'set'; field: 'pace'; value: number }
  | { type: 'set'; field: 'age' | 'weight' | 'heightFt' | 'heightIn' | 'heightCm'; value: string }
  | { type: 'switchUnit'; unit: UnitSystem }
  | { type: 'load'; form: FormState }
  | { type: 'reset' }

export function weightInKg(form: FormState): number | null {
  if (form.exactWeightKg !== null) return form.exactWeightKg
  const value = parseNumber(form.weight)
  if (value === null || Number.isNaN(value)) return null
  return form.unit === 'imperial' ? lbToKg(value) : value
}

export function heightInCm(form: FormState): number | null {
  if (form.exactHeightCm !== null) return form.exactHeightCm
  if (form.unit === 'metric') {
    const cm = parseNumber(form.heightCm)
    return cm === null || Number.isNaN(cm) ? null : cm
  }
  const feet = parseNumber(form.heightFt)
  const inches = parseNumber(form.heightIn)
  if (feet === null || Number.isNaN(feet) || (inches !== null && Number.isNaN(inches))) return null
  return feetInchesToCm(feet, inches ?? 0)
}

function switchUnit(form: FormState, unit: UnitSystem): FormState {
  if (unit === form.unit) return form
  const kg = weightInKg(form)
  const cm = heightInCm(form)
  const next: FormState = { ...form, unit }

  if (kg !== null) {
    next.weight = String(unit === 'imperial' ? roundTo(kgToLb(kg), 1) : roundTo(kg, 1))
    next.exactWeightKg = kg
  }
  if (cm !== null) {
    if (unit === 'metric') {
      next.heightCm = String(roundTo(cm, 1))
    } else {
      const { feet, inches } = cmToFeetInches(cm)
      next.heightFt = String(feet)
      next.heightIn = String(inches)
    }
    next.exactHeightCm = cm
  }
  return next
}

export function formReducer(form: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'set': {
      const next = { ...form, [action.field]: action.value }
      // Each goal has its own paces, so a new goal starts from its default pace.
      if (action.field === 'goal' && action.value !== form.goal) next.pace = null
      // Typing in a box means the user's number wins over the remembered exact value.
      if (action.field === 'weight') next.exactWeightKg = null
      if (action.field === 'heightFt' || action.field === 'heightIn' || action.field === 'heightCm') next.exactHeightCm = null
      return next
    }
    case 'switchUnit':
      return switchUnit(form, action.unit)
    case 'load':
      return action.form
    case 'reset':
      return { ...emptyForm, unit: form.unit }
  }
}

export type StepId = 'about' | 'body' | 'activity' | 'goal'
export const STEPS: StepId[] = ['about', 'body', 'activity', 'goal']

export type FieldErrors = Partial<Record<'sex' | 'age' | 'weight' | 'height' | 'activity' | 'goal', string>>

/** Messages for the fields on one step. An empty object means the step is complete. */
export function stepErrors(form: FormState, step: StepId): FieldErrors {
  const errors: FieldErrors = {}
  const add = (field: keyof FieldErrors, message: string) => {
    if (message) errors[field] = message
  }

  if (step === 'about') {
    add('sex', form.sex ? '' : 'Pick one so the formula can be applied')
    add('age', checkAge(parseNumber(form.age)))
  }
  if (step === 'body') {
    add('weight', checkWeight(parseNumber(form.weight), form.unit))
    add(
      'height',
      form.unit === 'imperial'
        ? checkHeightImperial(parseNumber(form.heightFt), parseNumber(form.heightIn))
        : checkHeightMetric(parseNumber(form.heightCm)),
    )
  }
  if (step === 'activity') {
    add('activity', form.activity === null ? 'Pick the closest match' : '')
  }
  if (step === 'goal') {
    add('goal', checkGoal(form.goal, parseNumber(form.age)))
  }
  return errors
}

export function firstIncompleteStep(form: FormState): StepId | null {
  return STEPS.find(step => Object.keys(stepErrors(form, step)).length > 0) ?? null
}

/** The checked, metric version of the form, or null if any step still has a problem. */
export function toPerson(form: FormState): Person | null {
  if (firstIncompleteStep(form) !== null) return null
  const weightKg = weightInKg(form)
  const heightCm = heightInCm(form)
  if (weightKg === null || heightCm === null || form.sex === '' || form.goal === '' || form.activity === null) return null
  return {
    age: Number(form.age),
    sex: form.sex,
    weightKg,
    heightCm,
    activity: form.activity,
    goal: form.goal,
    pace: form.pace ?? undefined,
  }
}
