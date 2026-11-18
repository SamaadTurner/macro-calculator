import { describe, expect, it } from 'vitest'
import { CALORIE_FLOOR, calculateBmr, calculatePlan, goalAdjustment, splitAcrossMeals } from './calculate'
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

describe('goalAdjustment', () => {
  it('cuts 20% for a small person instead of a flat 500', () => {
    expect(goalAdjustment('cutting', 1800)).toBe(-360)
  })

  it('never cuts more than 500', () => {
    expect(goalAdjustment('cutting', 3200)).toBe(-500)
  })

  it('adds 300 for a bulk and nothing for maintain', () => {
    expect(goalAdjustment('bulking', 2500)).toBe(300)
    expect(goalAdjustment('maintain', 2500)).toBe(0)
  })
})

describe('calculatePlan', () => {
  it('gives the expected numbers for an average man maintaining', () => {
    const plan = calculatePlan(average)
    // BMR 1782.7 x 1.55 = 2763
    expect(plan.calories).toBe(2763)
    expect(plan.breakdown.maintenance).toBe(2763)
    expect(plan.notes).toEqual([])
  })

  it('gives the same result for the same body in either unit system', () => {
    const metric = calculatePlan({ ...average, weightKg: 81.6466, heightCm: 177.8 })
    expect(metric.calories).toBe(calculatePlan(average).calories)
  })

  // Audit bug 6: a small, older, sedentary woman on a cut got 286 calories and -46 g carbs.
  it('applies the calorie floor and never gives negative carbs', () => {
    const plan = calculatePlan({ age: 80, sex: 'female', weightKg: lbToKg(100), heightCm: 121.92, activity: 1.2, goal: 'cutting' })
    expect(plan.calories).toBe(CALORIE_FLOOR.female)
    expect(plan.carbs.grams).toBeGreaterThan(0)
    expect(plan.notes[0]).toMatch(/1,200/)
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

  it('keeps every macro positive and the percentages at 100 across extreme inputs', () => {
    const sexes: Sex[] = ['male', 'female', 'other']
    const goals: Goal[] = ['cutting', 'maintain', 'bulking']
    const bodies = [
      [22.7, 120, 13], [22.7, 120, 100], [45, 121.92, 80], [227, 230, 18],
      [227, 121.92, 100], [227, 230, 100], [54, 152, 18], [145, 157, 60],
    ]
    for (const sex of sexes) {
      for (const goal of goals) {
        for (const activity of [1.2, 1.375, 1.55, 1.725, 1.9]) {
          for (const [weightKg, heightCm, age] of bodies) {
            const plan = calculatePlan({ age, sex, weightKg, heightCm, activity, goal })
            const label = JSON.stringify({ sex, goal, activity, weightKg, heightCm, age })
            expect(plan.protein.grams, label).toBeGreaterThan(0)
            expect(plan.carbs.grams, label).toBeGreaterThan(0)
            expect(plan.fats.grams, label).toBeGreaterThan(0)
            expect(plan.protein.pct + plan.carbs.pct + plan.fats.pct, label).toBe(100)
            expect(plan.calories, label).toBeGreaterThanOrEqual(CALORIE_FLOOR[sex])
          }
        }
      }
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
