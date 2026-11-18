import { describe, expect, it } from 'vitest'
import { emptyForm, firstIncompleteStep, formReducer, heightInCm, stepErrors, toPerson, weightInKg } from './form'
import type { FormAction, FormState } from './form'

const run = (actions: FormAction[], start: FormState = emptyForm) => actions.reduce(formReducer, start)

const complete = run([
  { type: 'set', field: 'sex', value: 'male' },
  { type: 'set', field: 'age', value: '30' },
  { type: 'set', field: 'weight', value: '180' },
  { type: 'set', field: 'heightFt', value: '5' },
  { type: 'set', field: 'heightIn', value: '10' },
  { type: 'set', field: 'activity', value: 1.55 },
  { type: 'set', field: 'goal', value: 'maintain' },
])

describe('unit switching', () => {
  // Audit bug 3: height was not converted when switching units.
  it('converts weight and height to metric and back', () => {
    const metric = formReducer(complete, { type: 'switchUnit', unit: 'metric' })
    expect(metric.weight).toBe('81.6')
    expect(metric.heightCm).toBe('177.8')

    const back = formReducer(metric, { type: 'switchUnit', unit: 'imperial' })
    expect(back.weight).toBe('180')
    expect(back.heightFt).toBe('5')
    expect(back.heightIn).toBe('10')
  })

  // Audit bug 4: 155 lb became 154 lb after three round trips.
  it('does not drift after many switches', () => {
    let form = formReducer(emptyForm, { type: 'set', field: 'weight', value: '155' })
    for (let i = 0; i < 10; i++) {
      form = formReducer(form, { type: 'switchUnit', unit: 'metric' })
      form = formReducer(form, { type: 'switchUnit', unit: 'imperial' })
    }
    expect(form.weight).toBe('155')
  })

  it('uses what the user typed after a switch, not the remembered value', () => {
    const form = run([
      { type: 'set', field: 'weight', value: '155' },
      { type: 'switchUnit', unit: 'metric' },
      { type: 'set', field: 'weight', value: '70' },
      { type: 'switchUnit', unit: 'imperial' },
    ])
    expect(form.weight).toBe('154.3')
  })

  // Audit bug 2: an old value in the hidden unit's box blocked the form.
  it('ignores the other unit system\'s boxes when checking', () => {
    const form = run([{ type: 'switchUnit', unit: 'metric' }, { type: 'set', field: 'heightCm', value: '300' }, { type: 'switchUnit', unit: 'imperial' }, { type: 'set', field: 'heightFt', value: '5' }, { type: 'set', field: 'heightIn', value: '10' }], complete)
    expect(stepErrors(form, 'body')).toEqual({})
    expect(heightInCm(form)).toBeCloseTo(177.8)
  })

  it('leaves empty boxes empty', () => {
    const form = formReducer(emptyForm, { type: 'switchUnit', unit: 'metric' })
    expect(form.weight).toBe('')
    expect(form.heightCm).toBe('')
  })
})

describe('stepErrors', () => {
  it('lists every missing field on a step', () => {
    expect(Object.keys(stepErrors(emptyForm, 'about'))).toEqual(['sex', 'age'])
    expect(Object.keys(stepErrors(emptyForm, 'body'))).toEqual(['weight', 'height'])
    expect(Object.keys(stepErrors(emptyForm, 'activity'))).toEqual(['activity'])
    expect(Object.keys(stepErrors(emptyForm, 'goal'))).toEqual(['goal'])
  })

  // Audit bug 1: the metric height error used to be invisible.
  it('gives a height message in metric too', () => {
    const form = formReducer(emptyForm, { type: 'switchUnit', unit: 'metric' })
    expect(stepErrors(form, 'body').height).toMatch('Enter your height')
  })

  it('finds the first step that is not done', () => {
    expect(firstIncompleteStep(emptyForm)).toBe('about')
    expect(firstIncompleteStep({ ...complete, goal: '' })).toBe('goal')
    expect(firstIncompleteStep(complete)).toBeNull()
  })
})

describe('toPerson', () => {
  it('turns a complete form into metric numbers', () => {
    const person = toPerson(complete)
    expect(person).not.toBeNull()
    expect(person!.weightKg).toBeCloseTo(81.6466, 3)
    expect(person!.heightCm).toBeCloseTo(177.8)
    expect(person!.age).toBe(30)
  })

  it('returns null while anything is missing', () => {
    expect(toPerson({ ...complete, activity: null })).toBeNull()
  })

  it('treats blank inches as 0', () => {
    const form = formReducer(complete, { type: 'set', field: 'heightIn', value: '' })
    expect(heightInCm(form)).toBeCloseTo(152.4)
    expect(weightInKg(form)).toBeCloseTo(81.6466, 3)
  })
})
