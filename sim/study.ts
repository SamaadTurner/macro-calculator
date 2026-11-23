import { ACTIVITY_LEVELS, BULK_PACES, calculateBmr, calculatePlan, CUT_PACES } from '../src/engine/calculate'
import type { Goal, Person, Sex } from '../src/engine/types'
import { caloriesPerKgChange, estimateBodyFatPct } from '../src/engine/energy'
import { DEFAULT_SETTINGS, estimateExpenditure } from '../src/coach/expenditure'
import type { EstimatorSettings } from '../src/coach/expenditure'
import { weightTrend } from '../src/log/trend'
import type { Body, Day, Habits } from './body'
import { simulate, toLog, WATER_KG_PER_500 } from './body'
import { clamp, makeRandom } from './random'
import type { Random } from './random'

// The study: make a few thousand people whose true expenditure is known, let each one log for
// six weeks while eating their formula plan, and compare what the app would say at each weekly
// check-in with the truth.

export const START_DATE = '2026-01-05' // a Monday
export const CHECK_IN_DAYS = [7, 14, 21, 28, 35, 42]

/**
 * How far a person's real expenditure is from the formula. Mifflin-St Jeor is within 10% of
 * measured resting energy for about 75% of people, which fits a spread of about 8.5%. The
 * activity factor's error is not well measured; 10% is an assumption.
 */
export const RMR_SPREAD = 0.085
export const ACTIVITY_SPREAD = 0.1
/** Deurenberg's equation is off by 4.1 points of body fat (one standard deviation). */
export const BODY_FAT_SPREAD = 4.1

export interface SimPerson {
  person: Person
  body: Body
  habits: Habits
  /** Logged calories they aim for: the formula plan's target. */
  target: number
}

export interface PopulationOptions {
  waterKgPer500?: number
  /** Multiplies how far off the formula is (1 = the spreads above). */
  formulaErrorScale?: number
  expenditureChange?: { day: number; factor: number }
  /** Most food a person leaves out of the log (0.3 normally, 0 for perfect loggers). */
  underLoggingMax?: number
  /** Holidays, stretches with no log, and forgotten meals (see `addMessyHabits`). */
  messy?: boolean
  /** Share of part-logged days the user ticks as not complete. */
  tickShare?: number
  /** Share of unlogged holiday and gap days the user fills in with a rough guess. */
  guessShare?: number
}

export function randomPerson(random: Random, options: PopulationOptions = {}): SimPerson {
  const sex: Sex = random.chance(0.5) ? 'male' : 'female'
  const age = Math.round(random.uniform(18, 65))
  const heightCm = clamp(sex === 'male' ? random.normal(176, 7) : random.normal(163, 6.5), 145, 205)
  const bmi = random.uniform(19, 36)
  const weightKg = (bmi * heightCm * heightCm) / 10_000
  const activity = pickActivity(random)
  const goal: Goal = random.next() < 0.6 ? 'cutting' : random.next() < 0.5 ? 'maintain' : 'bulking'
  const pace = goal === 'cutting' ? random.pick(CUT_PACES).value : goal === 'bulking' ? random.pick(BULK_PACES).value : 0
  const person: Person = { age, sex, weightKg, heightCm, activity, goal, pace }

  const bodyFat = clamp(estimateBodyFatPct(weightKg, heightCm, age, sex) + random.normal(0, BODY_FAT_SPREAD), 6, 55)
  const fatKg = (weightKg * bodyFat) / 100
  const scale = options.formulaErrorScale ?? 1
  const rmrFactor = clamp(random.normal(1, RMR_SPREAD * scale), 0.7, 1.3)
  const activityFactor = clamp(random.normal(1, ACTIVITY_SPREAD * scale), 0.7, 1.3)
  const body: Body = {
    fatKg,
    leanKg: weightKg - fatKg,
    heightCm,
    age,
    sexOffset: sex === 'male' ? 5 : -161,
    baselineExpenditure: calculateBmr(weightKg, heightCm, age, sex) * activity * rmrFactor * activityFactor,
  }

  const target = calculatePlan(person).calories
  const underLogging = random.uniform(0, options.underLoggingMax ?? 0.3)
  const habits: Habits = {
    // They log the target, so with under-logging they really eat more than it.
    plannedIntake: target / (1 - underLogging),
    underLogging,
    intakeDaySd: random.uniform(0.1, 0.25),
    scaleNoiseShare: random.uniform(0.003, 0.008),
    cycleKg: sex === 'female' && age < 50 ? random.uniform(0.3, 1) : 0,
    cycleStartDay: Math.floor(random.uniform(0, 28)),
    missWeighIn: random.uniform(0, 0.4),
    missCalories: random.uniform(0, 0.3),
    waterKgPer500: options.waterKgPer500 ?? WATER_KG_PER_500,
    expenditureChange: options.expenditureChange,
  }
  if (options.messy) addMessyHabits(random, habits)
  if (options.tickShare) habits.tickShare = options.tickShare
  if (options.guessShare) habits.guessShare = options.guessShare
  return { person, body, habits, target }
}

/**
 * The real-life breaks in a log, all assumptions sized to be common but not extreme: half the
 * people take a 3 to 7 day holiday eating 20 to 50% more, most have one or two 3 to 7 day
 * stretches with no log while eating up to 20% more, and up to 15% of normal days leave a meal out.
 */
function addMessyHabits(random: Random, habits: Habits) {
  const stretch = (extraMin: number, extraMax: number) => ({
    startDay: Math.floor(random.uniform(7, 36)),
    days: Math.floor(random.uniform(3, 8)),
    extraShare: random.uniform(extraMin, extraMax),
  })
  if (random.chance(0.5)) habits.holiday = stretch(0.2, 0.5)
  habits.lapses = Array.from({ length: random.pick([0, 1, 1, 2]) }, () => stretch(0, 0.2))
  habits.partialDayChance = random.uniform(0, 0.15)
}

function pickActivity(random: Random): number {
  // More people sit at work than train hard.
  const weights = [0.25, 0.3, 0.3, 0.1, 0.05]
  let roll = random.next()
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]
    if (roll < 0) return ACTIVITY_LEVELS[i].value
  }
  return ACTIVITY_LEVELS[ACTIVITY_LEVELS.length - 1].value
}

/** One way of estimating maintenance at a check-in. */
export interface Method {
  name: string
  settings?: EstimatorSettings
  /** Energy per kg to use instead of the body-based one. */
  fixedCaloriesPerKg?: number
  formulaOnly?: boolean
}

/** The check-in as it was before part-logged days were left out and patchy logs trusted less. */
const WITHOUT_PATCHY_LOG_FIXES: Method = {
  name: 'Check-in without the patchy-log fixes',
  settings: { ...DEFAULT_SETTINGS, partDayShare: 0, coverageWeighting: false },
}

export const METHODS: Method[] = [
  { name: 'Formula only', formulaOnly: true },
  { name: 'Check-in (the app)' },
  {
    name: 'Check-in, first version (28 days, no carry-over fix)',
    settings: { ...DEFAULT_SETTINGS, windowDays: 28, slopeSeFactor: 1, partDayShare: 0, coverageWeighting: false },
  },
  WITHOUT_PATCHY_LOG_FIXES,
  { name: 'Check-in, no weekly limit', settings: { ...DEFAULT_SETTINGS, maxChangePerWeek: Infinity } },
  { name: 'Check-in with 7,700 cal/kg', fixedCaloriesPerKg: 7700 },
  { name: 'Log only (no formula, no limit)', settings: { ...DEFAULT_SETTINGS, formulaShareSd: 100, maxChangePerWeek: Infinity } },
]

/** The app with and without the patchy-log fixes, for the tick and rough-guess scenarios. */
export const HABIT_METHODS: Method[] = [METHODS[0], METHODS[1], WITHOUT_PATCHY_LOG_FIXES]

/** The weekly limit at other sizes, for the messy-log scenario. */
export const LIMIT_METHODS: Method[] = [
  METHODS[0],
  { name: 'Check-in, limit 100 a week', settings: { ...DEFAULT_SETTINGS, maxChangePerWeek: 100 } },
  { name: 'Check-in (the app)' },
  { name: 'Check-in, limit 300 a week', settings: { ...DEFAULT_SETTINGS, maxChangePerWeek: 300 } },
  METHODS[4],
  WITHOUT_PATCHY_LOG_FIXES,
]

export interface Estimate {
  value: number
  fromLog: boolean
}

/** What a method says at each check-in day, saving each check-in so the weekly limit works as in the app. */
export function runMethod(sim: SimPerson, days: Day[], method: Method): Estimate[] {
  const log = toLog(days)
  let previous: { date: string; expenditure: number } | undefined
  return CHECK_IN_DAYS.map(day => {
    const today = days[day].date
    // What the app would see that morning: everything before today, and today's weigh-in but not today's food.
    const seen = log.filter(entry => entry.date <= today).map(entry => (entry.date === today ? { date: entry.date, weightKg: entry.weightKg } : entry))
    const visible = seen.filter(entry => entry.weightKg !== undefined || entry.calories !== undefined)
    const points = weightTrend(visible)
    const weightKg = points[points.length - 1]?.trendKg ?? sim.person.weightKg
    const { heightCm, age, sex, activity } = sim.person
    const formula = calculateBmr(weightKg, heightCm, age, sex) * activity
    if (method.formulaOnly) return { value: formula, fromLog: false }
    const result = estimateExpenditure({
      entries: visible,
      today,
      formulaMaintenance: formula,
      caloriesPerKg: method.fixedCaloriesPerKg ?? caloriesPerKgChange(weightKg, heightCm, age, sex),
      previous,
      settings: method.settings,
    })
    if (result.status !== 'ready') return { value: formula, fromLog: false }
    previous = { date: today, expenditure: result.expenditure }
    return { value: result.expenditure, fromLog: true }
  })
}

/**
 * The truth at a check-in: what they really burned over the last 7 days, in the calories they
 * log. Someone who logs 80% of what they eat needs targets in those logged calories, so that is
 * what the app should find. `real` is the same in real calories.
 */
export function truthAt(sim: SimPerson, days: Day[], day: number): { logged: number; real: number } {
  const week = days.slice(day - 7, day)
  const real = week.reduce((sum, d) => sum + d.trueExpenditure, 0) / week.length
  return { logged: real * (1 - sim.habits.underLogging), real }
}

export interface Summary {
  method: string
  day: number
  /** Median of |estimate - truth|, calories. */
  medianError: number
  /** 90th percentile of |estimate - truth|. */
  p90Error: number
  /** Mean of estimate - truth: positive means it guesses too high. */
  bias: number
  /** Share of people within 10% of the truth. */
  within10: number
  /** Share whose estimate used the log (the rest fell back to the formula). */
  usedLog: number
  /**
   * Share of check-ins that moved more than 200 calories further than the truth did since the
   * last check-in (a jump the person would feel in their targets for no real reason). Counted
   * from week 3, when both check-ins used the log; 0 before that.
   */
  wrongMoves: number
}

export const WRONG_MOVE_CALORIES = 200

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]

export interface StudyOptions extends PopulationOptions {
  people: number
  seed: number
  methods?: Method[]
  /** Compare with the truth in real calories instead of logged calories. */
  realCalories?: boolean
}

export function runStudy(options: StudyOptions): Summary[] {
  const random = makeRandom(options.seed)
  // A separate stream for ticks and guesses, so those scenarios have the very same people and days.
  const habitRandom = makeRandom(options.seed + 1)
  const methods = options.methods ?? METHODS
  const errors = methods.map(() => CHECK_IN_DAYS.map(() => [] as { error: number; share: number; fromLog: boolean; wrongMove?: boolean }[]))
  const lastDay = CHECK_IN_DAYS[CHECK_IN_DAYS.length - 1]

  for (let i = 0; i < options.people; i++) {
    const sim = randomPerson(random, options)
    const days = simulate(sim.body, sim.habits, lastDay + 1, START_DATE, random, habitRandom)
    const targets = CHECK_IN_DAYS.map(day => {
      const truth = truthAt(sim, days, day)
      return options.realCalories ? truth.real : truth.logged
    })
    methods.forEach((method, m) => {
      const estimates = runMethod(sim, days, method)
      estimates.forEach((estimate, d) => {
        const target = targets[d]
        const before = estimates[d - 1]
        const wrongMove =
          before && before.fromLog && estimate.fromLog
            ? Math.abs(estimate.value - before.value - (target - targets[d - 1])) > WRONG_MOVE_CALORIES
            : undefined
        errors[m][d].push({ error: estimate.value - target, share: Math.abs(estimate.value - target) / target, fromLog: estimate.fromLog, wrongMove })
      })
    })
  }

  const summaries: Summary[] = []
  methods.forEach((method, m) => {
    CHECK_IN_DAYS.forEach((day, d) => {
      const rows = errors[m][d]
      const absolute = rows.map(row => Math.abs(row.error)).sort((a, b) => a - b)
      summaries.push({
        method: method.name,
        day,
        medianError: percentile(absolute, 0.5),
        p90Error: percentile(absolute, 0.9),
        bias: rows.reduce((sum, row) => sum + row.error, 0) / rows.length,
        within10: rows.filter(row => row.share <= 0.1).length / rows.length,
        usedLog: rows.filter(row => row.fromLog).length / rows.length,
        wrongMoves: rows.filter(row => row.wrongMove).length / rows.length,
      })
    })
  })
  return summaries
}
