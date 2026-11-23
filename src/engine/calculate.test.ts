import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_LEVELS,
  BULK_PACES,
  CALORIE_FLOOR,
  CUT_PACES,
  calculateBmr,
  calculatePlan,
  goalAdjustment,
  MAX_DEFICIT_SHARE,
  MAX_SURPLUS_SHARE,
  paceFor,
  splitAcrossMeals,
} from './calculate'
import type { Goal, Person, Sex } from './types'
import { feetInchesToCm, lbToKg } from './units'

const average: Person = {
  age: 30,
  sex: 'male',
  weightKg: lbToKg(180),
  heightCm: feetInchesToCm(5, 10),
  activity: 1.55,
  goal: 'maintain',
}

describe('calculateBmr', () => {
  it('matches the Mifflin-St Jeor equation for men and women', () => {
    expect(calculateBmr(80, 180, 30, 'male')).toBe(800 + 1125 - 150 + 5)
    expect(calculateBmr(60, 165, 40, 'female')).toBeCloseTo(600 + 1031.25 - 200 - 161)
  })

  it('uses the average of the two for "other"', () => {
    const male = calculateBmr(70, 170, 35, 'male')
    const female = calculateBmr(70, 170, 35, 'female')
    expect(calculateBmr(70, 170, 35, 'other')).toBeCloseTo((male + female) / 2)
  })
})

describe('paces', () => {
  it('turns a pace into calories at 7,700 per kg', () => {
    // 80 kg x 0.5% = 0.4 kg a week = 3,080 calories a week = 440 a day
    expect(goalAdjustment('cutting', 2800, 80, 0.005)).toEqual({ calories: -440, capped: false })
    // 80 kg x 0.25% = 0.2 kg a week = 220 a day
    expect(goalAdjustment('bulking', 2800, 80, 0.0025)).toEqual({ calories: 220, capped: false })
    expect(goalAdjustment('maintain', 2800, 80, 0)).toEqual({ calories: 0, capped: false })
  })

  it('caps the deficit at 25% and the surplus at 20% of maintenance', () => {
    // 160 kg x 1% would be 1,760 a day
    expect(goalAdjustment('cutting', 3000, 160, 0.01)).toEqual({ calories: -750, capped: true })
    expect(goalAdjustment('bulking', 3000, 160, 0.005)).toEqual({ calories: 600, capped: true })
  })

  it('falls back to the default for a pace the goal does not offer', () => {
    expect(paceFor('cutting', undefined)).toBe(0.005)
    expect(paceFor('cutting', 0.0025)).toBe(0.0025)
    expect(paceFor('cutting', 0.05)).toBe(0.005)
    // A bulk pace kept from before a goal switch is not used for a cut.
    expect(paceFor('cutting', 0.0015)).toBe(0.005)
    expect(paceFor('bulking', 0.0015)).toBe(0.0015)
    expect(paceFor('maintain', 0.005)).toBe(0)
  })
})

// Worked by hand from the papers, so a change to the engine that moves any number shows up here.
describe('worked examples', () => {
  it('average man maintaining: Mifflin x 1.55', () => {
    // BMR = 816.47 + 1111.25 - 150 + 5 = 1782.72; x 1.55 = 2763.2
    const plan = calculatePlan(average)
    expect(plan.calories).toBe(2763)
    expect(plan.breakdown.maintenance).toBe(2763)
    expect(plan.breakdown.weeklyChangeKg).toBe(0)
    expect(plan.notes).toEqual([])
  })

  it('average man losing fat at the steady pace', () => {
    // Deficit = 81.65 kg x 0.5% x 7,700 / 7 = 449.1; 2763.2 - 449.1 = 2314
    // BMI 25.8, so protein uses the BMI 25 weight: 25 x 1.778^2 = 79.03 kg x 2.2 = 174 g
    // Fat = 2314 x 25% / 9 = 64 g; carbs = (2314 - 696 - 576) / 4 = 261 g
    const plan = calculatePlan({ ...average, goal: 'cutting' })
    expect(plan.calories).toBe(2314)
    expect(plan.protein.grams).toBe(174)
    expect(plan.fats.grams).toBe(64)
    expect(plan.carbs.grams).toBe(261)
    expect(plan.breakdown.weeklyChangeKg).toBeCloseTo(-0.408, 3)
  })

  it('average man building muscle at the lean pace', () => {
    // Surplus = 81.65 x 0.25% x 1,100 = 224.5; 2763.2 + 224.5 = 2988
    const plan = calculatePlan({ ...average, goal: 'bulking' })
    expect(plan.calories).toBe(2988)
    expect(plan.breakdown.pace).toBe(0.0025)
  })

  it('woman at the floor: maintenance above 1,200, fast pace', () => {
    // 60 y, 50 kg, 155 cm, mostly sitting: BMR 1007.75, maintenance 1209.3.
    // 1% pace = 550 a day, capped at 25% = 302.3, so 907 before the floor; raised to 1,200.
    const plan = calculatePlan({ age: 60, sex: 'female', weightKg: 50, heightCm: 155, activity: 1.2, goal: 'cutting', pace: 0.01 })
    expect(plan.calories).toBe(1200)
    expect(plan.notes.some(note => /capped/.test(note))).toBe(true)
    expect(plan.notes.some(note => /Raised to 1,200/.test(note))).toBe(true)
  })

  // Found in the 2026-11-23 audit: the floor used to push both goals above maintenance.
  it('never sets a fat loss or maintain target above maintenance when maintenance is under the floor', () => {
    // 80 y, 45 kg, 150 cm, mostly sitting: BMR 826.5, maintenance 991.8
    const person: Person = { age: 80, sex: 'female', weightKg: 45, heightCm: 150, activity: 1.2, goal: 'cutting' }
    const cut = calculatePlan(person)
    expect(cut.calories).toBe(992)
    expect(cut.notes[0]).toMatch(/maintenance is below 1,200/)
    expect(calculatePlan({ ...person, goal: 'maintain' }).calories).toBe(992)
    // A bulk adds its surplus to maintenance and ignores the floor: 45 x 0.25% x 1,100 = 123.75
    expect(calculatePlan({ ...person, goal: 'bulking' }).calories).toBe(1116)
  })

  it('caps a fast cut for a large body', () => {
    // 30 y man, 160 kg, 190 cm, mostly sitting: BMR 2642.5, maintenance 3171.
    // 1% = 1,760 a day, capped at 25% = 792.75 -> 2378
    const plan = calculatePlan({ age: 30, sex: 'male', weightKg: 160, heightCm: 190, activity: 1.2, goal: 'cutting', pace: 0.01 })
    expect(plan.calories).toBe(2378)
    expect(plan.breakdown.weeklyChangeKg).toBeCloseTo((-793 * 7) / 7700, 3)
  })

  it('adds a note under 18', () => {
    const plan = calculatePlan({ ...average, age: 16 })
    expect(plan.notes.some(note => /under 18/.test(note))).toBe(true)
    expect(calculatePlan(average).notes.some(note => /under 18/.test(note))).toBe(false)
  })

  it('gives the same result for the same body in either unit system', () => {
    const metric = calculatePlan({ ...average, weightKg: 81.6466, heightCm: 177.8 })
    expect(metric.calories).toBe(calculatePlan(average).calories)
  })

  // Audit bug 6 (2026-11-18): a small, older, sedentary woman on a cut got 286 calories and -46 g carbs.
  it('never gives negative carbs for a tiny body', () => {
    const plan = calculatePlan({ age: 80, sex: 'female', weightKg: lbToKg(100), heightCm: 121.92, activity: 1.2, goal: 'cutting' })
    expect(plan.carbs.grams).toBeGreaterThan(0)
  })

  // Audit bug 7: 1 g per lb of total weight gave a 320 lb person 320 g of protein.
  it('bases protein on a reference weight at higher body weights', () => {
    const plan = calculatePlan({ age: 45, sex: 'female', weightKg: lbToKg(320), heightCm: feetInchesToCm(5, 2), activity: 1.2, goal: 'cutting' })
    expect(plan.protein.grams).toBeLessThan(200)
    expect(plan.breakdown.referenceWeightKg).toBeCloseTo(25 * 1.5748 * 1.5748, 0)
    expect(plan.carbs.grams).toBeGreaterThan(100)
  })

  it('uses real weight for protein when BMI is 25 or less', () => {
    const plan = calculatePlan({ ...average, weightKg: 70, heightCm: 180 })
    expect(plan.breakdown.referenceWeightKg).toBe(70)
    expect(plan.protein.grams).toBe(Math.round(70 * 1.8))
  })

  it('caps protein at 40% of calories and says so', () => {
    const plan = calculatePlan({ age: 90, sex: 'male', weightKg: 100, heightCm: 230, activity: 1.2, goal: 'cutting' })
    expect(plan.protein.pct).toBeLessThanOrEqual(40)
    expect(plan.notes.some(note => /capped at 40%/.test(note))).toBe(true)
  })
})

describe('every body, goal and pace', () => {
  // 3 sexes x 5 ages x 5 weights x 3 heights x 5 activity levels x 8 goal/pace pairs = 9,000 plans.
  const sexes: Sex[] = ['male', 'female', 'other']
  const goalsAndPaces: [Goal, number][] = [
    ...CUT_PACES.map((pace): [Goal, number] => ['cutting', pace.value]),
    ['maintain', 0],
    ...BULK_PACES.map((pace): [Goal, number] => ['bulking', pace.value]),
  ]
  const plans: { person: Person; plan: ReturnType<typeof calculatePlan>; maintenance: number }[] = []
  for (const sex of sexes)
    for (const age of [13, 18, 30, 55, 80])
      for (const weightKg of [40, 60, 80, 110, 160])
        for (const heightCm of [150, 170, 190])
          for (const { value: activity } of ACTIVITY_LEVELS)
            for (const [goal, pace] of goalsAndPaces) {
              const person = { age, sex, weightKg, heightCm, activity, goal, pace }
              const maintenance = calculateBmr(weightKg, heightCm, age, sex) * activity
              plans.push({ person, plan: calculatePlan(person), maintenance })
            }

  const label = (person: Person) => JSON.stringify(person)

  it('keeps macros positive, adding up to the calories and to 100%', () => {
    for (const { person, plan } of plans) {
      expect(Math.min(plan.protein.grams, plan.carbs.grams, plan.fats.grams), label(person)).toBeGreaterThan(0)
      expect(plan.protein.pct + plan.carbs.pct + plan.fats.pct, label(person)).toBe(100)
      const fromMacros = plan.protein.grams * 4 + plan.carbs.grams * 4 + plan.fats.grams * 9
      expect(Math.abs(fromMacros - plan.calories), label(person)).toBeLessThanOrEqual(3)
      expect(plan.protein.pct, label(person)).toBeLessThanOrEqual(40)
    }
  })

  it('keeps each goal on the right side of maintenance', () => {
    for (const { person, plan, maintenance } of plans) {
      const rounded = Math.round(maintenance)
      if (person.goal === 'maintain') expect(plan.calories, label(person)).toBe(rounded)
      if (person.goal === 'cutting') {
        expect(plan.calories, label(person)).toBeLessThanOrEqual(rounded)
        expect(plan.calories, label(person)).toBeGreaterThanOrEqual(Math.min(CALORIE_FLOOR[person.sex], rounded))
        expect(plan.calories, label(person)).toBeGreaterThanOrEqual(Math.floor(maintenance * (1 - MAX_DEFICIT_SHARE)))
      }
      if (person.goal === 'bulking') {
        expect(plan.calories, label(person)).toBeGreaterThan(rounded)
        expect(plan.calories, label(person)).toBeLessThanOrEqual(Math.ceil(maintenance * (1 + MAX_SURPLUS_SHARE)))
      }
    }
  })

  it('never moves weight faster than the chosen pace', () => {
    for (const { person, plan } of plans) {
      // One calorie of rounding is allowed for.
      const limitKg = (person.weightKg * (person.pace ?? 0)) + 7 / 7700
      expect(Math.abs(plan.breakdown.weeklyChangeKg), label(person)).toBeLessThanOrEqual(limitKg)
    }
  })
})

describe('splitAcrossMeals', () => {
  it('splits evenly when it divides', () => {
    expect(splitAcrossMeals(180, 3)).toEqual([60, 60, 60])
  })

  it('gives leftover grams to the first meals so the total still matches', () => {
    const meals = splitAcrossMeals(174, 4)
    expect(meals).toEqual([44, 44, 43, 43])
    expect(meals.reduce((a, b) => a + b, 0)).toBe(174)
  })
})
