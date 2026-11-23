import type { Goal, MacroPlan, Person, Sex } from './types'
import { caloriesPerKgChange } from './energy'

/**
 * Lowest fat loss target the app suggests without a doctor or dietitian involved.
 * 1,200 for women and 1,500 for men is a widely used rule of thumb, not a formal guideline.
 * It only applies to fat loss, and it never pushes a target above maintenance.
 */
export const CALORIE_FLOOR: Record<Sex, number> = { male: 1500, female: 1200, other: 1350 }

/**
 * Protein in grams per kg of reference weight. Gains level off around 1.6 g/kg
 * (Morton et al. 2018); a little more during a cut helps keep muscle (ISSN 2017).
 */
export const PROTEIN_G_PER_KG: Record<Goal, number> = { cutting: 2.2, maintain: 1.8, bulking: 1.8 }

export const PROTEIN_MAX_SHARE = 0.4
export const FAT_SHARE = 0.25

/**
 * Goal paces as a share of body weight per week. Fat loss: 0.5 to 1% a week keeps
 * muscle (Helms et al. 2014). Muscle gain: 0.25 to 0.5% a week for newer lifters, less
 * for experienced ones (Iraki et al. 2019).
 */
export const CUT_PACES = [
  { value: 0.0025, label: 'Gentle', detail: '0.25% of body weight a week' },
  { value: 0.005, label: 'Steady', detail: '0.5% a week, the usual choice' },
  { value: 0.0075, label: 'Faster', detail: '0.75% a week' },
  { value: 0.01, label: 'Fastest', detail: '1% a week, harder to keep muscle' },
] as const
export const BULK_PACES = [
  { value: 0.0015, label: 'Slow', detail: '0.15% a week, for lifters with years of training' },
  { value: 0.0025, label: 'Lean', detail: '0.25% a week, the usual choice' },
  { value: 0.005, label: 'Faster', detail: '0.5% a week, for newer lifters' },
] as const
export const DEFAULT_PACE: Record<Goal, number> = { cutting: 0.005, maintain: 0, bulking: 0.0025 }

/** Caps so a big body or a fast pace never gives an extreme target. */
export const MAX_DEFICIT_SHARE = 0.25
export const MAX_SURPLUS_SHARE = 0.2

/**
 * Above this BMI, protein is based on the weight at this BMI for the person's height,
 * because total weight overstates muscle at higher body fat.
 */
export const REFERENCE_BMI = 25

export const ADULT_AGE = 18

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Mostly sitting', detail: 'Desk job and little or no exercise' },
  { value: 1.375, label: 'Lightly active', detail: 'Desk job and training 1 to 3 days a week' },
  { value: 1.55, label: 'Active', detail: 'Desk job and training 4 to 6 days a week, or on your feet all day' },
  { value: 1.725, label: 'Very active', detail: 'On your feet all day and training most days' },
  { value: 1.9, label: 'Athlete', detail: 'Physical job and hard training, or training twice a day' },
] as const

/** Resting energy use with the Mifflin-St Jeor equation. "Other" averages the male and female versions. */
export function calculateBmr(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  if (sex === 'male') return base + 5
  if (sex === 'female') return base - 161
  return base - 78
}

/** A pace the app offers for this goal; anything else falls back to the default. */
export function paceFor(goal: Goal, pace: number | undefined): number {
  const options: readonly { value: number }[] = goal === 'cutting' ? CUT_PACES : goal === 'bulking' ? BULK_PACES : []
  return options.some(option => option.value === pace) ? (pace as number) : DEFAULT_PACE[goal]
}

/**
 * Calories to add (positive) or take away (negative) for the goal and pace, and whether a
 * cap made it smaller than the pace asked for.
 */
export function goalAdjustment(
  goal: Goal,
  maintenance: number,
  weightKg: number,
  pace: number,
  caloriesPerKg: number,
): { calories: number; capped: boolean } {
  if (goal === 'maintain') return { calories: 0, capped: false }
  const fromPace = (weightKg * pace * caloriesPerKg) / 7
  const cap = maintenance * (goal === 'cutting' ? MAX_DEFICIT_SHARE : MAX_SURPLUS_SHARE)
  const size = Math.min(fromPace, cap)
  return { calories: goal === 'cutting' ? -size : size, capped: fromPace > cap }
}

/**
 * The weekly check-in passes the maintenance it measured from the log (and the energy per kg it
 * used) instead of the formula. Everything else (caps, floor, macro split) stays the same.
 */
export interface PlanOptions {
  maintenance?: number
  caloriesPerKg?: number
}

export function calculatePlan(person: Person, options: PlanOptions = {}): MacroPlan {
  const notes: string[] = []
  // A kg of weight change holds fewer calories for leaner people, who lose more lean tissue per kg (Hall 2008, Forbes).
  const caloriesPerKg = options.caloriesPerKg ?? caloriesPerKgChange(person.weightKg, person.heightCm, person.age, person.sex)
  const bmr = calculateBmr(person.weightKg, person.heightCm, person.age, person.sex)
  const maintenance = options.maintenance ?? bmr * person.activity
  const pace = paceFor(person.goal, person.pace)
  const adjustment = goalAdjustment(person.goal, maintenance, person.weightKg, pace, caloriesPerKg)
  if (adjustment.capped) {
    notes.push(
      person.goal === 'cutting'
        ? 'This pace would cut more than a quarter of your maintenance, so the deficit is capped there. Expect slower loss than the pace says.'
        : 'This pace would add more than a fifth of your maintenance, so the surplus is capped there.',
    )
  }

  let calories = Math.round(maintenance + adjustment.calories)

  // The floor is for fat loss only. If maintenance is already below it, the target stays at
  // maintenance: raising it to the floor would mean gaining weight on a "lose fat" plan.
  const floor = CALORIE_FLOOR[person.sex]
  if (person.goal === 'cutting' && calories < floor) {
    if (maintenance > floor) {
      calories = floor
      notes.push(
        `Raised to ${floor.toLocaleString('en-US')} calories, the lowest fat loss target this calculator gives. Going lower should be planned with a doctor or dietitian.`,
      )
    } else {
      calories = Math.round(maintenance)
      notes.push(
        `Your estimated maintenance is below ${floor.toLocaleString('en-US')} calories, so this shows maintenance instead of a deficit. Plan any fat loss with a doctor or dietitian.`,
      )
    }
  }

  if (person.age < ADULT_AGE) {
    notes.push(
      'The formula was built from adults, so it is rougher under 18, and a growing body needs enough food. Check with a doctor or dietitian before changing how much you eat.',
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

  const finalAdjustment = calories - Math.round(maintenance)
  return {
    calories,
    protein: { grams: proteinGrams, pct: proteinPct },
    carbs: { grams: carbGrams, pct: carbPct },
    fats: { grams: fatGrams, pct: fatPct },
    breakdown: {
      bmr: Math.round(bmr),
      activity: person.activity,
      maintenance: Math.round(maintenance),
      adjustment: finalAdjustment,
      pace,
      // What the final target works out to in body weight per week, after any cap or floor.
      weeklyChangeKg: (finalAdjustment * 7) / caloriesPerKg,
      caloriesPerKg: Math.round(caloriesPerKg),
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
