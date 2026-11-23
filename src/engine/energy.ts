import type { Sex } from '../engine/types'

// How many calories a kilo of body weight change stands for depends on how much of it is fat.
// Hall (2008) gives the energy in each part: fat 39.5 MJ/kg, lean tissue 7.6 MJ/kg.
export const FAT_CALORIES_PER_KG = 39_500 / 4.184
export const LEAN_CALORIES_PER_KG = 7_600 / 4.184

/**
 * Forbes' curve: the lean share of a weight change is 10.4 / (10.4 + fat mass in kg).
 * Leaner people lose (and gain) more lean tissue per kilo, so each kilo holds fewer calories.
 */
export const FORBES_CONSTANT_KG = 10.4

const BODY_FAT_LIMITS = { min: 5, max: 60 }

/**
 * Body fat % from BMI, age and sex (Deurenberg et al. 1991). Off by about 4 points for one
 * person in three, but it is only used to pick the energy per kilo, where that error matters little.
 * "Other" uses the average of the male and female versions. Ages under 18 use 18, since the
 * equation for adults is the one used here.
 */
export function estimateBodyFatPct(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const heightM = heightCm / 100
  const bmi = weightKg / (heightM * heightM)
  const sexTerm = sex === 'male' ? 1 : sex === 'female' ? 0 : 0.5
  const pct = 1.2 * bmi + 0.23 * Math.max(age, 18) - 10.8 * sexTerm - 5.4
  return Math.min(BODY_FAT_LIMITS.max, Math.max(BODY_FAT_LIMITS.min, pct))
}

/** Share of a weight change that is fat, from Forbes' curve. */
export function fatShareOfChange(fatMassKg: number): number {
  return fatMassKg / (fatMassKg + FORBES_CONSTANT_KG)
}

/** Calories in one kilo of weight lost or gained, for this body. */
export function caloriesPerKgChange(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const fatMassKg = (weightKg * estimateBodyFatPct(weightKg, heightCm, age, sex)) / 100
  const fatShare = fatShareOfChange(fatMassKg)
  return fatShare * FAT_CALORIES_PER_KG + (1 - fatShare) * LEAN_CALORIES_PER_KG
}
