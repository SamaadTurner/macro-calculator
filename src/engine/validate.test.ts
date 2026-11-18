import { describe, expect, it } from 'vitest'
import { checkAge, checkGoal, checkHeightImperial, checkHeightMetric, checkWeight } from './validate'
import { cmToFeetInches, parseNumber } from './units'

describe('parseNumber', () => {
  it('tells empty apart from not a number', () => {
    expect(parseNumber('  ')).toBeNull()
    expect(parseNumber('abc')).toBeNaN()
    expect(parseNumber(' 72.5 ')).toBe(72.5)
  })
})

describe('checkAge', () => {
  it.each([
    [null, 'Enter your age'],
    [25.5, 'whole number'],
    [12, 'at least 13'],
    [101, '100 or less'],
  ])('rejects %s', (age, message) => {
    expect(checkAge(age)).toMatch(message)
  })

  it('accepts 13 and 100', () => {
    expect(checkAge(13)).toBe('')
    expect(checkAge(100)).toBe('')
  })
})

describe('checkWeight', () => {
  // Audit bug 5: decimals were blocked by the browser's step rule.
  it('accepts decimals', () => {
    expect(checkWeight(180.25, 'imperial')).toBe('')
    expect(checkWeight(81.65, 'metric')).toBe('')
  })

  it('uses the limits for the unit system', () => {
    expect(checkWeight(40, 'imperial')).toMatch('50 and 500 lb')
    expect(checkWeight(40, 'metric')).toBe('')
    expect(checkWeight(230, 'metric')).toMatch('23 and 227 kg')
  })

  it('handles empty and not-a-number', () => {
    expect(checkWeight(null, 'imperial')).toMatch('Enter your weight')
    expect(checkWeight(NaN, 'metric')).toMatch('as a number')
  })
})

describe('checkHeightImperial', () => {
  it('treats blank inches as 0', () => {
    expect(checkHeightImperial(6, null)).toBe('')
  })

  it.each([-3, 12, 15])('rejects %s inches', inches => {
    expect(checkHeightImperial(5, inches)).toMatch('Inches must be between 0 and 11')
  })

  it('accepts decimal inches but not decimal feet', () => {
    expect(checkHeightImperial(5, 10.5)).toBe('')
    expect(checkHeightImperial(5.5, null)).toMatch('whole feet')
  })

  it('checks the total height range', () => {
    expect(checkHeightImperial(7, 7)).toMatch('7 ft 6 in')
    expect(checkHeightImperial(7, 6)).toBe('')
    expect(checkHeightImperial(3, 11)).toMatch('4 ft 0 in')
  })
})

describe('checkHeightMetric', () => {
  // Audit bug 1: this message was written into a box that is hidden in metric mode.
  it('gives a message for empty and out of range', () => {
    expect(checkHeightMetric(null)).toMatch('Enter your height')
    expect(checkHeightMetric(100)).toMatch('120 and 230 cm')
    expect(checkHeightMetric(175.5)).toBe('')
  })
})

describe('checkGoal', () => {
  // Audit bug 9: minors could pick a cut.
  it('does not offer fat loss under 18', () => {
    expect(checkGoal('cutting', 16)).toMatch('not offered under 18')
    expect(checkGoal('maintain', 16)).toBe('')
    expect(checkGoal('cutting', 18)).toBe('')
  })

  it('needs a goal', () => {
    expect(checkGoal('', 30)).toMatch('Pick a goal')
  })
})

describe('cmToFeetInches', () => {
  it('converts 177.8 cm to 5 ft 10 in', () => {
    expect(cmToFeetInches(177.8)).toEqual({ feet: 5, inches: 10 })
  })

  it('never shows 12 inches', () => {
    // 182.8 cm is 71.97 inches, which would round to 5 ft 12 in
    expect(cmToFeetInches(182.8)).toEqual({ feet: 6, inches: 0 })
  })
})
