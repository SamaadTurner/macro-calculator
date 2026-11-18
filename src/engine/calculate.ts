import type { Goal, MacroPlan, Person, Sex } from './types'

/** Lowest daily target the app suggests without a doctor or dietitian involved. */
export const CALORIE_FLOOR: Record<Sex, number> = { male: 1500, female: 1200, other: 1350 }

/**
 * Protein in grams per kg of reference weight. Gains level off around 1.6 g/kg
 * (Morton et al. 2018); a little more during a cut helps keep muscle.
 */
export const PROTEIN_G_PER_KG: Record<Goal, number> = { cutting: 2.2, maintain: 1.8, bulking: 1.8 }

export const PROTEIN_MAX_SHARE = 0.4
export const FAT_SHARE = 0.25
export const MAX_CUT_SHARE = 0.2
export const MAX_CUT_CALORIES = 500
export const BULK_CALORIES = 300

/**
 * Above this BMI, protein is based on the weight at this BMI for the person's height,
 * because total weight overstates muscle at higher body fat.
 */
export const REFERENCE_BMI = 25

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Mostly sitting', detail: 'Desk job, little or no exercise' },
  { value: 1.375, label: 'Lightly active', detail: 'Training 1 to 3 days a week' },
  { value: 1.55, label: 'Active', detail: 'Training 3 to 5 days a week' },
  { value: 1.725, label: 'Very active', detail: 'Hard training 6 to 7 days a week' },
  { value: 1.9, label: 'Athlete', detail: 'Twice-a-day training or a physical job' },
] as const

/** Resting energy use with the Mifflin-St Jeor equation. "Other" averages the male and female versions. */
export function calculateBmr(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  if (sex === 'male') return base + 5
  if (sex === 'female') return base - 161
  return base - 78
}

export function goalAdjustment(goal: Goal, maintenance: number): number {
  // A fixed 500 calorie cut is too much for a small person, so cut at most 20%.
  if (goal === 'cutting') return -Math.min(MAX_CUT_CALORIES, maintenance * MAX_CUT_SHARE)
  if (goal === 'bulking') return BULK_CALORIES
  return 0
}

export function calculatePlan(person: Person): MacroPlan {
  const notes: string[] = []
  const bmr = calculateBmr(person.weightKg, person.heightCm, person.age, person.sex)
  const maintenance = bmr * person.activity
  const adjustment = goalAdjustment(person.goal, maintenance)

  let calories = Math.round(maintenance + adjustment)
  const floor = CALORIE_FLOOR[person.sex]
  if (calories < floor) {
    calories = floor
    notes.push(
      `Raised to ${floor.toLocaleString('en-US')} calories, the lowest target this calculator gives. Going lower should be planned with a doctor or dietitian.`,
    )
  }

  const heightM = person.heightCm / 100
  const referenceWeightKg = Math.min(person.weightKg, REFERENCE_BMI * heightM * heightM)
  const proteinPerKg = PROTEIN_G_PER_KG[person.goal]
  let proteinGrams = Math.round(referenceWeightKg * proteinPerKg)
  const maxProteinGrams = Math.floor((calories * PROTEIN_MAX_SHARE) / 4)
  if (proteinGrams > maxProteinGrams) {
    proteinGrams = maxProteinGrams
    notes.push('Protein is capped at 40% of calories so there is room for carbs and fats.')
  }

  const fatGrams = Math.round((calories * FAT_SHARE) / 9)
  // Protein is at most 40% and fat about 25%, so carbs never drop below about 35%.
  const carbGrams = Math.round((calories - proteinGrams * 4 - fatGrams * 9) / 4)

  // Percentages come from the rounded grams, and carbs take the remainder so the three add up to 100.
  const proteinPct = Math.round(((proteinGrams * 4) / calories) * 100)
  const fatPct = Math.round(((fatGrams * 9) / calories) * 100)
  const carbPct = 100 - proteinPct - fatPct

  return {
    calories,
    protein: { grams: proteinGrams, pct: proteinPct },
    carbs: { grams: carbGrams, pct: carbPct },
    fats: { grams: fatGrams, pct: fatPct },
    breakdown: {
      bmr: Math.round(bmr),
      activity: person.activity,
      maintenance: Math.round(maintenance),
      adjustment: Math.round(adjustment),
      proteinPerKg,
      referenceWeightKg: Math.round(referenceWeightKg * 10) / 10,
    },
    notes,
  }
}

/**
 * Splits daily grams across meals. Whole grams per meal; any leftover grams go to the
 * first meals so the meals still add up to the daily total.
 */
export function splitAcrossMeals(totalGrams: number, meals: number): number[] {
  const base = Math.floor(totalGrams / meals)
  const leftover = totalGrams - base * meals
  return Array.from({ length: meals }, (_, i) => base + (i < leftover ? 1 : 0))
}
