import type { Goal, UnitSystem } from './types'

// Each check returns a message for the user, or '' when the value is fine.

export const LIMITS = {
  age: { min: 13, max: 100 },
  weightLb: { min: 50, max: 500 },
  weightKg: { min: 23, max: 227 },
  heightIn: { min: 48, max: 90 },
  heightCm: { min: 120, max: 230 },
  adultAge: 18,
}

export function checkAge(age: number | null): string {
  if (age === null) return 'Enter your age'
  if (!Number.isInteger(age)) return 'Enter your age as a whole number'
  if (age < LIMITS.age.min) return `You need to be at least ${LIMITS.age.min}`
  if (age > LIMITS.age.max) return `Age must be ${LIMITS.age.max} or less`
  return ''
}

export function checkWeight(weight: number | null, unit: UnitSystem): string {
  if (weight === null) return 'Enter your weight'
  if (Number.isNaN(weight)) return 'Enter your weight as a number'
  const { min, max } = unit === 'imperial' ? LIMITS.weightLb : LIMITS.weightKg
  const label = unit === 'imperial' ? 'lb' : 'kg'
  if (weight < min || weight > max) return `Weight must be between ${min} and ${max} ${label}`
  return ''
}

export function checkHeightImperial(feet: number | null, inches: number | null): string {
  if (feet === null) return 'Enter your height in feet (inches are optional)'
  if (Number.isNaN(feet) || (inches !== null && Number.isNaN(inches))) return 'Enter your height as numbers'
  if (!Number.isInteger(feet)) return 'Enter whole feet and put the rest in inches'
  const inchesOrZero = inches ?? 0
  if (inchesOrZero < 0 || inchesOrZero >= 12) return 'Inches must be between 0 and 11'
  const total = feet * 12 + inchesOrZero
  if (total < LIMITS.heightIn.min || total > LIMITS.heightIn.max) return 'Height must be between 4 ft 0 in and 7 ft 6 in'
  return ''
}

export function checkHeightMetric(cm: number | null): string {
  if (cm === null) return 'Enter your height'
  if (Number.isNaN(cm)) return 'Enter your height as a number'
  if (cm < LIMITS.heightCm.min || cm > LIMITS.heightCm.max) {
    return `Height must be between ${LIMITS.heightCm.min} and ${LIMITS.heightCm.max} cm`
  }
  return ''
}

export function checkGoal(goal: Goal | '', age: number | null): string {
  if (!goal) return 'Pick a goal'
  if (goal === 'cutting' && age !== null && Number.isInteger(age) && age < LIMITS.adultAge) {
    return 'Fat loss plans are not offered under 18. Talk to a doctor or dietitian first.'
  }
  return ''
}
