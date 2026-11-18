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
    proteinPerKg: number
    referenceWeightKg: number
  }
  /** Plain-language notes when a safety limit changed the result. */
  notes: string[]
}
