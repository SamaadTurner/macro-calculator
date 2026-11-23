import { beforeEach, describe, expect, it } from 'vitest'
import { caloriesPerKgChange, estimateBodyFatPct, FAT_CALORIES_PER_KG, fatShareOfChange, LEAN_CALORIES_PER_KG } from '../engine/energy'
import { estimateExpenditure, MAX_CHANGE_PER_WEEK, MIN_INTAKE_DAYS, MIN_SPAN_DAYS, MIN_WEIGH_INS } from './expenditure'
import type { ExpenditureInput } from './expenditure'
import { loadCheckIns, previousCheckIn, saveCheckIn } from './checkins'
import type { CheckIn } from './checkins'
import { addDays } from '../log/dates'
import type { LogEntry } from '../log/entries'
import { lbToKg } from '../engine/units'

const TODAY = '2026-11-23'
const MAN = { weightKg: lbToKg(180), heightCm: 70 * 2.54, age: 30, sex: 'male' as const }

/** A log of `days` days ending today, built from a weight and a calories function of the day number. */
function makeLog(days: number, weight: (day: number) => number | undefined, calories: (day: number) => number | undefined): LogEntry[] {
  const entries: LogEntry[] = []
  for (let day = 0; day < days; day++) {
    const entry: LogEntry = { date: addDays(TODAY, day - days + 1) }
    const w = weight(day)
    const c = calories(day)
    if (w !== undefined) entry.weightKg = w
    if (c !== undefined) entry.calories = c
    if (w !== undefined || c !== undefined) entries.push(entry)
  }
  return entries
}

// Small repeatable wobble, like water and salt on the scale (about +-0.6 kg).
const wobble = (day: number) => 0.6 * Math.sin(day * 2.3) + 0.3 * Math.cos(day * 5.1)

function input(entries: LogEntry[], extra: Partial<ExpenditureInput> = {}): ExpenditureInput {
  return { entries, today: TODAY, formulaMaintenance: 2700, caloriesPerKg: 6620, ...extra }
}

describe('energy in a kilo of weight change', () => {
  it('matches a hand-worked example for a 180 lb, 5 ft 10 in, 30 year old man', () => {
    // Worked out separately from Deurenberg 1991, Forbes and Hall 2008: BMI 25.8, 21.7% fat,
    // 63% of a change is fat, 6,620 calories per kg.
    expect(estimateBodyFatPct(MAN.weightKg, MAN.heightCm, MAN.age, MAN.sex)).toBeCloseTo(21.69, 2)
    expect(caloriesPerKgChange(MAN.weightKg, MAN.heightCm, MAN.age, MAN.sex)).toBeCloseTo(6620.05, 1)
  })

  it('gives more calories per kg to people with more body fat', () => {
    expect(caloriesPerKgChange(70, 185, 25, 'male')).toBeCloseTo(5528.0, 0)
    expect(caloriesPerKgChange(lbToKg(140), 65 * 2.54, 30, 'female')).toBeCloseTo(6716.4, 0)
    expect(caloriesPerKgChange(120, 180, 40, 'male')).toBeCloseTo(8007.7, 0)
  })

  it('stays between pure lean tissue and pure fat', () => {
    for (const weightKg of [40, 60, 90, 150, 250]) {
      for (const sex of ['male', 'female', 'other'] as const) {
        const value = caloriesPerKgChange(weightKg, 165, 40, sex)
        expect(value).toBeGreaterThan(LEAN_CALORIES_PER_KG)
        expect(value).toBeLessThan(FAT_CALORIES_PER_KG)
      }
    }
  })

  it('uses the Forbes share and keeps body fat in a sensible range', () => {
    expect(fatShareOfChange(10.4)).toBe(0.5)
    expect(estimateBodyFatPct(40, 200, 18, 'male')).toBe(5)
    expect(estimateBodyFatPct(250, 150, 80, 'female')).toBe(60)
    // Under 18 is treated as 18.
    expect(estimateBodyFatPct(60, 170, 15, 'other')).toBe(estimateBodyFatPct(60, 170, 18, 'other'))
  })
})

describe('expenditure estimate', () => {
  it('waits for enough data and says what is missing', () => {
    const result = estimateExpenditure(input(makeLog(5, () => 80, () => 2000)))
    expect(result.status).toBe('not-enough')
    if (result.status !== 'not-enough') return
    expect(result.have).toEqual({ spanDays: 4, weighIns: 5, intakeDays: 4 })
    expect(result.need).toEqual({ spanDays: MIN_SPAN_DAYS, weighIns: MIN_WEIGH_INS, intakeDays: MIN_INTAKE_DAYS })
  })

  it('needs calories as well as weigh-ins', () => {
    const result = estimateExpenditure(input(makeLog(28, () => 80, () => undefined)))
    expect(result.status).toBe('not-enough')
  })

  it('matches a hand-worked example: steady loss of 0.5 kg a week on 2,000 calories', () => {
    const entries = makeLog(28, day => 82 - (0.5 / 7) * day, () => 2000)
    const result = estimateExpenditure(input(entries))
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.weeklyChangeKg).toBeCloseTo(-0.5, 6)
    expect(result.averageIntake).toBe(2000)
    expect(result.fromData).toBeCloseTo(2472.86, 1)
    expect(result.dataWeight).toBeCloseTo(0.93455, 4)
    expect(result.expenditure).toBeCloseTo(2487.73, 1)
    expect(result.high - result.expenditure).toBeCloseTo(1.96 * 103.61, 1)
    expect(result.start).toBe(addDays(TODAY, -27))
    expect(result.end).toBe(TODAY)
    expect(result.limited).toBe(false)
  })

  it('finds the true expenditure through scale noise', () => {
    // True expenditure 2,600, eating 2,100: losing 500 / 6,620 kg a day.
    const entries = makeLog(28, day => 85 - (500 / 6620) * day + wobble(day), () => 2100)
    const result = estimateExpenditure(input(entries, { formulaMaintenance: 2900 }))
    if (result.status !== 'ready') throw new Error('expected an estimate')
    expect(Math.abs(result.expenditure - 2600)).toBeLessThan(120)
    expect(result.low).toBeLessThan(2600)
    expect(result.high).toBeGreaterThan(2600)
  })

  it('leans on the formula with two weeks of data and on the log with four', () => {
    const weight = (day: number) => 85 + wobble(day)
    const twoWeeks = estimateExpenditure(input(makeLog(14, weight, () => 2400)))
    const fourWeeks = estimateExpenditure(input(makeLog(28, weight, () => 2400)))
    if (twoWeeks.status !== 'ready' || fourWeeks.status !== 'ready') throw new Error('expected estimates')
    expect(twoWeeks.dataWeight).toBeLessThan(fourWeeks.dataWeight)
    expect(fourWeeks.dataWeight).toBeGreaterThan(0.8)
    expect(Math.abs(fourWeeks.expenditure - 2400)).toBeLessThan(Math.abs(twoWeeks.expenditure - 2400))
  })

  it('leaves out days with no calories instead of counting them as zero', () => {
    const entries = makeLog(28, () => 80, day => (day % 3 === 0 ? undefined : 2500))
    const result = estimateExpenditure(input(entries))
    if (result.status !== 'ready') throw new Error('expected an estimate')
    expect(result.averageIntake).toBe(2500)
  })

  it('handles missed weigh-ins: the line spans the gaps', () => {
    const entries = makeLog(28, day => (day % 4 === 1 || (day > 10 && day < 17) ? undefined : 80 - 0.1 * day), () => 2000)
    const result = estimateExpenditure(input(entries))
    if (result.status !== 'ready') throw new Error('expected an estimate')
    expect(result.weeklyChangeKg).toBeCloseTo(-0.7, 6)
  })

  it('leaves out food from the day of the last weigh-in', () => {
    const entries = makeLog(28, () => 80, day => (day === 27 ? 9000 : 2000))
    const result = estimateExpenditure(input(entries))
    if (result.status !== 'ready') throw new Error('expected an estimate')
    expect(result.averageIntake).toBe(2000)
    expect(result.intakeDays).toBe(27)
  })

  it('only uses the last 35 days', () => {
    const old = makeLog(60, day => (day < 25 ? 100 : 80), day => (day < 25 ? 5000 : 2200))
    const result = estimateExpenditure(input(old))
    if (result.status !== 'ready') throw new Error('expected an estimate')
    expect(result.averageIntake).toBe(2200)
    expect(result.weeklyChangeKg).toBeCloseTo(0, 6)
  })

  it('limits how far the estimate moves since the last check-in', () => {
    const entries = makeLog(28, () => 80, () => 2000)
    const previous = { date: addDays(TODAY, -7), expenditure: 2700 }
    const result = estimateExpenditure(input(entries, { previous }))
    if (result.status !== 'ready') throw new Error('expected an estimate')
    expect(result.expenditure).toBe(2700 - MAX_CHANGE_PER_WEEK)
    expect(result.limited).toBe(true)
    // Two weeks since the last check-in allows twice the move.
    const later = estimateExpenditure(input(entries, { previous: { date: addDays(TODAY, -14), expenditure: 2700 } }))
    if (later.status !== 'ready') throw new Error('expected an estimate')
    expect(later.expenditure).toBe(2700 - 2 * MAX_CHANGE_PER_WEEK)
  })

  it('flags a log that is far from the formula', () => {
    const entries = makeLog(28, () => 80, () => 1200)
    const result = estimateExpenditure(input(entries))
    if (result.status !== 'ready') throw new Error('expected an estimate')
    expect(result.unusual).toBe(true)
  })
})

describe('saved check-ins', () => {
  beforeEach(() => localStorage.clear())

  const checkIn = (date: string, expenditure = 2500): CheckIn => ({ date, expenditure, calories: 2100, protein: 170, carbs: 220, fats: 58, goal: 'cutting' })

  it('saves, replaces the same date and loads oldest first', () => {
    let list = saveCheckIn([], checkIn('2026-11-16'))!
    list = saveCheckIn(list, checkIn('2026-11-09'))!
    list = saveCheckIn(list, checkIn('2026-11-16', 2600))!
    expect(list.map(item => item.date)).toEqual(['2026-11-09', '2026-11-16'])
    expect(loadCheckIns()).toEqual(list)
    expect(loadCheckIns()[1].expenditure).toBe(2600)
  })

  it('drops broken check-ins from storage', () => {
    localStorage.setItem(
      'macroCalculator.checkins.v1',
      JSON.stringify([checkIn('2026-11-16'), { ...checkIn('2026-11-17'), goal: 'shred' }, { ...checkIn('2026-02-30') }, 'x', { ...checkIn('2026-11-18'), calories: 1e9 }]),
    )
    expect(loadCheckIns().map(item => item.date)).toEqual(['2026-11-16'])
    localStorage.setItem('macroCalculator.checkins.v1', '{oops')
    expect(loadCheckIns()).toEqual([])
  })

  it('finds the last check-in before today', () => {
    const list = [checkIn('2026-11-09'), checkIn('2026-11-16'), checkIn(TODAY)]
    expect(previousCheckIn(list, TODAY)?.date).toBe('2026-11-16')
    expect(previousCheckIn([], TODAY)).toBeUndefined()
  })
})
