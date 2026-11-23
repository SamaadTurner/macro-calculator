import { writeFileSync } from 'node:fs'
import { DEFAULT_SETTINGS } from '../src/coach/expenditure'
import type { EstimatorSettings } from '../src/coach/expenditure'
import { simulate } from './body'
import { makeRandom } from './random'
import { CHECK_IN_DAYS, randomPerson, runMethod, START_DATE, truthAt } from './study'
import type { Method } from './study'

// Tries other values for the estimator's settings on a different seed from the reported study,
// so the reported numbers are not tuned to their own data. Usage: npm run simulate:tune

const PEOPLE = Number(process.env.PEOPLE ?? 1000)
const SEED = Number(process.env.SEED ?? 7)
const SCORED_DAYS = [14, 21, 28, 42]
// CHANGE=1: everyone burns 12% more from day 21 on, to see how fast each setting follows a real change.
const CHANGE = process.env.CHANGE === '1' ? { day: 21, factor: 1.12 } : undefined

const grid: EstimatorSettings[] = []
for (const formulaShareSd of [0.1, 0.15]) {
  for (const maxChangePerWeek of [200, Infinity]) {
    for (const minWeightNoiseKg of [0.4, 0.6]) {
      for (const windowDays of [28, 35]) {
        for (const slopeSeFactor of [1, 1.5, 1.73, 2, 2.5]) {
          grid.push({ ...DEFAULT_SETTINGS, formulaShareSd, maxChangePerWeek, minWeightNoiseKg, windowDays, slopeSeFactor })
        }
      }
    }
  }
}

const random = makeRandom(SEED)
const people = Array.from({ length: PEOPLE }, () => {
  const sim = randomPerson(random, { expenditureChange: CHANGE })
  const days = simulate(sim.body, sim.habits, CHECK_IN_DAYS[CHECK_IN_DAYS.length - 1] + 1, START_DATE, random)
  return { sim, days, truths: CHECK_IN_DAYS.map(day => truthAt(sim, days, day).logged) }
})

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

const rows = grid.map(settings => {
  const method: Method = { name: 'tune', settings }
  const errors = CHECK_IN_DAYS.map(() => [] as number[])
  for (const { sim, days, truths } of people) {
    runMethod(sim, days, method).forEach((estimate, d) => errors[d].push(Math.abs(estimate.value - truths[d])))
  }
  const perDay = SCORED_DAYS.map(day => median(errors[CHECK_IN_DAYS.indexOf(day)]))
  return { settings, perDay, score: perDay.reduce((sum, value) => sum + value, 0) / perDay.length }
})

rows.sort((a, b) => a.score - b.score)
const describe = (s: EstimatorSettings) =>
  `formula ±${s.formulaShareSd * 100}%, limit ${s.maxChangePerWeek}, noise ${s.minWeightNoiseKg} kg, window ${s.windowDays} d, slope SE x${s.slopeSeFactor}`
const current = rows.find(row => describe(row.settings) === describe(DEFAULT_SETTINGS))!
const lines = [
  `Tuning${CHANGE ? ' (burn up 12% from day 21)' : ''}, ${PEOPLE} people, seed ${SEED}. Median error (cal) at weeks ${SCORED_DAYS.map(d => d / 7).join(', ')}, and their average.`,
  '',
  ...rows.slice(0, 15).map((row, i) => `${i + 1}. ${describe(row.settings)}: ${row.perDay.map(Math.round).join(' / ')} → ${row.score.toFixed(1)}`),
  '',
  `Current (rank ${rows.indexOf(current) + 1} of ${rows.length}): ${describe(current.settings)}: ${current.perDay.map(Math.round).join(' / ')} → ${current.score.toFixed(1)}`,
]
writeFileSync(new URL(CHANGE ? './TUNING-CHANGE.md' : './TUNING.md', import.meta.url), lines.join('\n') + '\n')
console.log(lines.join('\n'))
