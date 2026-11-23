export type Sex = 'male' | 'female' | 'other'
export type Goal = 'cutting' | 'maintain' | 'bulking'
export type UnitSystem = 'imperial' | 'metric'

/** Everything the calculation needs, already checked and in metric units. */
export interface Person {
  age: number
  sex: Sex
  weightKg: number
  heightCm: number
  activity: number
  goal: Goal
  /** Share of body weight to lose or gain per week, like 0.005. Missing means the default for the goal. */
  pace?: number
}

export interface Macro {
  grams: number
  /** Share of daily calories, whole percent. Protein, carbs and fats add up to 100. */
  pct: number
}

export interface MacroPlan {
  calories: number
  protein: Macro
  carbs: Macro
  fats: Macro
  /** The steps behind the numbers, shown in "How we got this". */
  breakdown: {
    bmr: number
    activity: number
    maintenance: number
    adjustment: number
    /** The pace that was used, as a share of body weight per week. */
    pace: number
    /** Expected change in body weight per week at the final target, negative for loss. */
    weeklyChangeKg: number
    proteinPerKg: number
    referenceWeightKg: number
  }
  /** Plain-language notes when a safety limit changed the result. */
  notes: string[]
}
