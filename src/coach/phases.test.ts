import { beforeEach, describe, expect, it } from 'vitest'
import { isBreakActive, loadBreak, saveBreak, startBreak, weeklyReminderIcs, weeksOfFatLoss } from './phases'
import type { CheckIn } from './checkins'
import type { Goal } from '../engine/types'
import { addDays } from '../log/dates'
import { calculatePlan, CALORIE_FLOOR } from '../engine/calculate'

const TODAY = '2026-11-23'

const checkIn = (date: string, goal: Goal = 'cutting'): CheckIn => ({ date, goal, expenditure: 2500, calories: 2000, protein: 160, carbs: 200, fats: 60 })

/** One check-in a week, the last one `endDaysAgo` days before today. */
function weekly(count: number, goal: Goal = 'cutting', endDaysAgo = 0): CheckIn[] {
  return Array.from({ length: count }, (_, i) => checkIn(addDays(TODAY, -endDaysAgo - (count - 1 - i) * 7), goal))
}

describe('maintenance break storage', () => {
  beforeEach(() => localStorage.clear())

  it('saves, loads and clears a break', () => {
    expect(loadBreak()).toBeNull()
    const value = startBreak(TODAY, 2)
    expect(value).toEqual({ start: TODAY, end: '2026-12-07' })
    expect(saveBreak(value)).toBe(true)
    expect(loadBreak()).toEqual(value)
    saveBreak(null)
    expect(loadBreak()).toBeNull()
  })

  it('ignores a stored break that is broken or too long', () => {
    localStorage.setItem('macroCalculator.break.v1', '{oops')
    expect(loadBreak()).toBeNull()
    localStorage.setItem('macroCalculator.break.v1', JSON.stringify({ start: TODAY, end: '2027-03-01' }))
    expect(loadBreak()).toBeNull()
    localStorage.setItem('macroCalculator.break.v1', JSON.stringify({ start: TODAY, end: TODAY }))
    expect(loadBreak()).toBeNull()
  })

  it('is active from the first day up to, not including, the end day', () => {
    const value = startBreak(TODAY, 1)
    expect(isBreakActive(value, addDays(TODAY, -1))).toBe(false)
    expect(isBreakActive(value, TODAY)).toBe(true)
    expect(isBreakActive(value, addDays(TODAY, 6))).toBe(true)
    expect(isBreakActive(value, addDays(TODAY, 7))).toBe(false)
    expect(isBreakActive(null, TODAY)).toBe(false)
  })
})

describe('weeksOfFatLoss', () => {
  it('counts weeks since the first fat loss check-in in a row', () => {
    expect(weeksOfFatLoss([], TODAY, null)).toBe(0)
    expect(weeksOfFatLoss(weekly(13), TODAY, null)).toBe(12)
    expect(weeksOfFatLoss(weekly(4), TODAY, null)).toBe(3)
  })

  it('starts again after a check-in with another goal', () => {
    const list = [...weekly(10, 'cutting', 35), ...weekly(1, 'maintain', 28), ...weekly(4, 'cutting')]
    expect(weeksOfFatLoss(list, TODAY, null)).toBe(3)
  })

  it('is zero when the latest check-in is not fat loss', () => {
    expect(weeksOfFatLoss([...weekly(12, 'cutting', 7), checkIn(TODAY, 'maintain')], TODAY, null)).toBe(0)
  })

  it('starts again after a long gap or when check-ins stopped', () => {
    const list = [...weekly(10, 'cutting', 60), ...weekly(3, 'cutting')]
    expect(weeksOfFatLoss(list, TODAY, null)).toBe(2)
    expect(weeksOfFatLoss(weekly(20, 'cutting', 30), TODAY, null)).toBe(0)
  })

  it('starts again when a break ended during the run', () => {
    const lastBreak = startBreak(addDays(TODAY, -35), 2)
    expect(weeksOfFatLoss(weekly(16), TODAY, lastBreak)).toBe(3)
    // A break still running does not move the start.
    expect(weeksOfFatLoss(weekly(16), TODAY, startBreak(TODAY, 1))).toBe(15)
  })
})

describe('weeklyReminderIcs', () => {
  it('makes a weekly all-day event with CRLF line ends', () => {
    const text = weeklyReminderIcs('2026-11-30', new Date('2026-11-23T10:20:30.456Z'))
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(text).toContain('DTSTART;VALUE=DATE:20261130\r\n')
    expect(text).toContain('DTEND;VALUE=DATE:20261201\r\n')
    expect(text).toContain('RRULE:FREQ=WEEKLY\r\n')
    expect(text).toContain('DTSTAMP:20261123T102030Z\r\n')
    expect(text).not.toMatch(/[^\r]\n/)
  })
})

describe('targets during a break', () => {
  it('a maintenance target is never under the fat loss floor unless maintenance itself is', () => {
    for (const sex of ['male', 'female', 'other'] as const) {
      for (const maintenance of [1100, 1400, 1800, 2600]) {
        const person = { weightKg: 60, heightCm: 165, age: 40, sex, activity: 1.2, goal: 'cutting' as const, pace: 0.0075 }
        const cut = calculatePlan(person, { maintenance, caloriesPerKg: 7000 })
        expect(cut.calories).toBeGreaterThanOrEqual(Math.min(CALORIE_FLOOR[sex], Math.round(maintenance)) - 10)
        const rest = calculatePlan({ ...person, goal: 'maintain' }, { maintenance, caloriesPerKg: 7000 })
        expect(rest.calories).toBeGreaterThanOrEqual(cut.calories)
      }
    }
  })
})
