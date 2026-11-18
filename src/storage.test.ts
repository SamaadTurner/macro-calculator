import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deletePlan, loadForm, loadPlans, MAX_SAVED_PLANS, saveForm, savePlan } from './storage'
import { emptyForm } from './form'
import { calculatePlan } from './engine/calculate'

const plan = calculatePlan({ age: 30, sex: 'male', weightKg: 80, heightCm: 180, activity: 1.55, goal: 'maintain' })

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('form storage', () => {
  it('round-trips the form', () => {
    const form = { ...emptyForm, sex: 'female' as const, age: '28', weight: '140', activity: 1.375 }
    saveForm(form)
    expect(loadForm()).toEqual(form)
  })

  // Audit bug 8: broken JSON in storage threw on page load.
  it('returns null for broken data instead of throwing', () => {
    localStorage.setItem('macroCalculator.form.v2', '{bad')
    expect(loadForm()).toBeNull()
  })

  it('drops fields with the wrong type', () => {
    localStorage.setItem('macroCalculator.form.v2', JSON.stringify({ sex: 'robot', age: 30, weight: '150', activity: 'lots' }))
    expect(loadForm()).toEqual({ ...emptyForm, weight: '150' })
  })
})

describe('saved plans', () => {
  it('saves newest first and keeps ten', () => {
    for (let i = 0; i < 12; i++) savePlan(plan, 'maintain', new Date(2026, 10, 18, 10, i))
    const plans = loadPlans()
    expect(plans).toHaveLength(MAX_SAVED_PLANS)
    expect(plans[0].savedAt).toBe(new Date(2026, 10, 18, 10, 11).toISOString())
  })

  it('skips broken entries', () => {
    localStorage.setItem('macroCalculator.plans.v2', JSON.stringify([{ id: 'x' }, 'junk', null]))
    expect(loadPlans()).toEqual([])
  })

  it('deletes one plan', () => {
    const saved = savePlan(plan, 'maintain')!
    savePlan(plan, 'cutting')
    expect(deletePlan(saved[0].id)).toHaveLength(1)
  })

  it('returns null when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(savePlan(plan, 'maintain')).toBeNull()
    expect(saveForm(emptyForm)).toBe(false)
  })
})
