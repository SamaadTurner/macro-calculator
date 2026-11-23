import { describe, expect, it } from 'vitest'
import { FAT_CALORIES_PER_KG, LEAN_CALORIES_PER_KG } from '../src/engine/energy'
import { estimateExpenditure } from '../src/coach/expenditure'
import { simulate, toLog } from './body'
import type { Body, Habits } from './body'
import { makeRandom } from './random'
import { LIMIT_METHODS, randomPerson, runMethod, runStudy, START_DATE, truthAt, METHODS } from './study'

const body: Body = { fatKg: 20, leanKg: 60, heightCm: 178, age: 30, sexOffset: 5, baselineExpenditure: 2600 }

/** No noise, no water, no misses: only the physics. */
const quiet = (plannedIntake: number): Habits => ({
  plannedIntake,
  underLogging: 0,
  intakeDaySd: 0,
  scaleNoiseShare: 0,
  cycleKg: 0,
  cycleStartDay: 0,
  missWeighIn: 0,
  missCalories: 0,
  waterKgPer500: 0,
})

describe('random numbers', () => {
  it('repeat from the same seed', () => {
    const a = makeRandom(42)
    const b = makeRandom(42)
    expect(Array.from({ length: 5 }, () => a.normal())).toEqual(Array.from({ length: 5 }, () => b.normal()))
  })

  it('have about the right mean and spread', () => {
    const random = makeRandom(1)
    const values = Array.from({ length: 20_000 }, () => random.normal(10, 2))
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length)
    expect(mean).toBeCloseTo(10, 1)
    expect(sd).toBeCloseTo(2, 1)
  })
})

describe('body model', () => {
  it('holds weight when eating at maintenance', () => {
    const days = simulate(body, quiet(2600), 60, START_DATE, makeRandom(1))
    expect(days[59].tissueKg).toBeCloseTo(80, 6)
    expect(days[59].trueExpenditure).toBeCloseTo(2600, 6)
  })

  it('keeps energy balance: stored energy lost equals the deficit eaten', () => {
    const days = simulate(body, quiet(2100), 90, START_DATE, makeRandom(1))
    const deficit = days.reduce((sum, day) => sum + (day.trueExpenditure - 2100), 0)
    const lost = 80 - days[89].tissueKg
    expect(lost).toBeGreaterThan(0)
    // Each kg lost holds between lean and fat energy, so the deficit must fall between those bounds.
    expect(deficit).toBeGreaterThan(lost * LEAN_CALORIES_PER_KG)
    expect(deficit).toBeLessThan(lost * FAT_CALORIES_PER_KG)
  })

  it('slows down as expenditure drops (smaller body, less food, adaptation)', () => {
    const days = simulate(body, quiet(2100), 120, START_DATE, makeRandom(1))
    const firstMonth = days[0].tissueKg - days[30].tissueKg
    const fourthMonth = days[89].tissueKg - days[119].tissueKg
    expect(fourthMonth).toBeLessThan(firstMonth)
    expect(days[119].trueExpenditure).toBeLessThan(2600 - 0.1 * 500)
  })

  it('drops water at the start of a diet, at most 1.5 kg', () => {
    const habits = { ...quiet(1600), waterKgPer500: 1 }
    const days = simulate(body, habits, 14, START_DATE, makeRandom(1))
    const waterOnDay13 = days[13].scaleKg! - days[13].tissueKg
    expect(waterOnDay13).toBeLessThan(-1.3)
    expect(waterOnDay13).toBeGreaterThanOrEqual(-1.55)
  })

  it('logs less than was eaten when under-logging', () => {
    const days = simulate(body, { ...quiet(2600), underLogging: 0.2 }, 7, START_DATE, makeRandom(1))
    expect(days.every(day => day.loggedCalories === 2080)).toBe(true)
  })

  it('on a holiday eats more, weighs in less, logs little, and puts water on', () => {
    const holiday = { startDay: 20, days: 7, extraShare: 0.5 }
    const plain = simulate(body, quiet(2600), 40, START_DATE, makeRandom(4))
    const away = simulate(body, { ...quiet(2600), waterKgPer500: 1, holiday }, 40, START_DATE, makeRandom(4))
    const holidayDays = away.slice(20, 27)
    expect(away[27].tissueKg).toBeGreaterThan(plain[27].tissueKg + 0.3)
    expect(holidayDays.filter(day => day.scaleKg !== undefined).length).toBeLessThan(5)
    // Logged holiday days hold only part of the 3,900 calories eaten.
    holidayDays.filter(day => day.loggedCalories !== undefined).forEach(day => expect(day.loggedCalories).toBe(2340))
    // Day 27 is the first morning home (a Sunday, so no weekend bump): about 0.9 kg of water on top of tissue.
    expect(away[27].scaleKg! - away[27].tissueKg).toBeGreaterThan(0.8)
    // The rest of the log is untouched.
    expect(away.slice(0, 20).every(day => day.loggedCalories === 2600 && day.scaleKg !== undefined)).toBe(true)
  })

  it('logs nothing during a gap but keeps eating', () => {
    const lapses = [{ startDay: 10, days: 5, extraShare: 0.2 }]
    const days = simulate(body, { ...quiet(2600), lapses }, 20, START_DATE, makeRandom(5))
    expect(toLog(days).map(entry => entry.date)).not.toContain(days[12].date)
    expect(toLog(days)).toHaveLength(15)
    expect(days[15].tissueKg).toBeGreaterThan(80.1)
  })

  it('leaves part of a meal out on some days', () => {
    const days = simulate(body, { ...quiet(2600), partialDayChance: 0.5 }, 200, START_DATE, makeRandom(6))
    const short = days.filter(day => day.loggedCalories! < 2600)
    expect(short.length).toBeGreaterThan(70)
    expect(short.length).toBeLessThan(130)
    expect(short.every(day => day.loggedCalories! >= 1040 && day.loggedCalories! <= 1820)).toBe(true)
  })

  it('turns days into log entries, skipping missed ones', () => {
    const days = simulate(body, { ...quiet(2600), missWeighIn: 0.5, missCalories: 0.5 }, 100, START_DATE, makeRandom(3))
    const log = toLog(days)
    expect(log.length).toBeLessThan(100)
    expect(log.every(entry => entry.weightKg !== undefined || entry.calories !== undefined)).toBe(true)
  })
})

describe('the estimator on a clean simulated log', () => {
  it('finds the true burn closely when nothing is noisy', () => {
    const days = simulate(body, quiet(2100), 36, START_DATE, makeRandom(1))
    const today = days[35].date
    const log = toLog(days).map(entry => (entry.date === today ? { date: entry.date, weightKg: entry.weightKg } : entry))
    const truth = days.slice(0, 35).reduce((sum, day) => sum + day.trueExpenditure, 0) / 35
    // A huge formula spread so the answer is the log alone.
    const result = estimateExpenditure({
      entries: log,
      today,
      formulaMaintenance: 3500,
      caloriesPerKg: 6700,
      settings: { windowDays: 35, minSpanDays: 10, minWeighIns: 5, minIntakeDays: 7, formulaShareSd: 100, minWeightNoiseKg: 0.4, maxChangePerWeek: Infinity, slopeSeFactor: 1 },
    })
    if (result.status !== 'ready') throw new Error('expected an estimate')
    // Off only by the scale rounding and by the energy per kg not matching this exact body.
    expect(Math.abs(result.expenditure - truth)).toBeLessThan(60)
  })
})

describe('study', () => {
  it('gives the same numbers from the same seed', () => {
    const a = runStudy({ people: 30, seed: 5 })
    const b = runStudy({ people: 30, seed: 5 })
    expect(a).toEqual(b)
  })

  it('uses the formula until there is enough log, then the log', () => {
    const random = makeRandom(9)
    const sim = randomPerson(random)
    const days = simulate(sim.body, { ...sim.habits, missWeighIn: 0, missCalories: 0 }, 43, START_DATE, random)
    const app = runMethod(sim, days, METHODS[1])
    expect(app[0].fromLog).toBe(false) // week 1: 7 days, not enough
    expect(app[1].fromLog).toBe(true) // week 2
    expect(truthAt(sim, days, 14).logged).toBeCloseTo(truthAt(sim, days, 14).real * (1 - sim.habits.underLogging), 6)
  })

  it('keeps the people the same when the messy habits are added', () => {
    const clean = randomPerson(makeRandom(12))
    const messy = randomPerson(makeRandom(12), { messy: true })
    expect(messy.body).toEqual(clean.body)
    expect(messy.habits.plannedIntake).toBe(clean.habits.plannedIntake)
    expect(messy.habits.partialDayChance).toBeGreaterThanOrEqual(0)
  })

  it('counts check-ins that jump without a real change', () => {
    const summaries = runStudy({ people: 200, seed: 11, messy: true, methods: LIMIT_METHODS })
    const at = (method: string, day: number) => summaries.find(s => s.method === method && s.day === day)!
    expect(at('Check-in (the app)', 14).wrongMoves).toBe(0) // the first estimate has nothing to move from
    // A limit of 100 a week can hardly move further than the truth by over 200.
    expect(at('Check-in, limit 100 a week', 28).wrongMoves).toBeLessThan(at('Check-in, no weekly limit', 28).wrongMoves)
  })

  it('beats the formula by week 4 across a small population', () => {
    const summaries = runStudy({ people: 200, seed: 11 })
    const at = (method: string) => summaries.find(s => s.method === method && s.day === 28)!
    expect(at('Check-in (the app)').medianError).toBeLessThan(at('Formula only').medianError / 2)
  })
})
