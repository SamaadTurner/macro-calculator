import { FAT_CALORIES_PER_KG, FORBES_CONSTANT_KG, LEAN_CALORIES_PER_KG } from '../src/engine/energy'
import { addDays } from '../src/log/dates'
import type { LogEntry } from '../src/log/entries'
import type { Random } from './random'

// A simple version of Hall's body weight model (Hall 2008; Hall et al., Lancet 2011), with a
// known true expenditure, plus the things that make a real log messy: water shifts when a diet
// starts, scale noise, a weekend bump, the menstrual cycle, eating a bit different each day,
// under-logging, days without a weigh-in or calories, and (when switched on) a holiday, stretches
// with no log at all, and days where a meal is left out.

/** Everything about one simulated person that the app does not know. */
export interface Body {
  fatKg: number
  leanKg: number
  heightCm: number
  age: number
  /** Mifflin-St Jeor offset for their sex: +5 or -161. */
  sexOffset: number
  /** True expenditure on day 0, when they ate at maintenance. */
  baselineExpenditure: number
}

export interface Habits {
  /** Real calories they mean to eat each day (they log less than this when they under-log). */
  plannedIntake: number
  /** Share of food they leave out of the log, 0 to about 0.3. */
  underLogging: number
  /** Day-to-day spread of what they really eat, as a share. Around 0.2 in diet studies. */
  intakeDaySd: number
  /** Scale noise, one standard deviation as a share of body weight. About 0.005. */
  scaleNoiseShare: number
  /** Peak water swing over the menstrual cycle, kg (0 if none). */
  cycleKg: number
  cycleStartDay: number
  missWeighIn: number
  missCalories: number
  /** Glycogen water per 500 calories of change in intake, kg. WATER_KG_PER_500 normally, 0 to turn it off. */
  waterKgPer500: number
  /** From this day on, expenditure is multiplied by `factor` (a new job, more training). */
  expenditureChange?: { day: number; factor: number }
  /** A holiday: they eat `extraShare` more, rarely weigh in, and log food on few days and only part of it. */
  holiday?: { startDay: number; days: number; extraShare: number }
  /** Stretches with no log at all (no weigh-in, no food). They keep eating, `extraShare` more than planned. */
  lapses?: { startDay: number; days: number; extraShare: number }[]
  /** Chance on a normal day of logging only part of the day's food (a forgotten meal). */
  partialDayChance?: number
}

/** Thermic effect of food and adaptive thermogenesis, as shares of a change in intake (Hall et al. 2011). */
export const TEF_SHARE = 0.1
export const ADAPTIVE_SHARE = 0.14
export const ADAPTIVE_DAYS = 14
/**
 * Glycogen and its water: about 1 kg of scale weight per 500 calories a day of change in
 * intake, at most 1.5 kg down or 1 kg up, settling over a few days. An assumption sized to the
 * 1 to 2 kg early drop people see on a diet; the study also runs without it.
 */
export const WATER_KG_PER_500 = 1
export const WATER_DAYS = 3
export const WEEKEND_SHARE = 0.003
/**
 * On a holiday: most days have no scale, and food gets logged on few days and only in part
 * (restaurant meals, drinks). Assumptions, not measured values.
 */
export const HOLIDAY_WEIGH_IN = 0.3
export const HOLIDAY_LOG_DAY = 0.3
export const HOLIDAY_LOGGED_SHARE = 0.6

const within = (day: number, stretch: { startDay: number; days: number }) => day >= stretch.startDay && day < stretch.startDay + stretch.days

export interface Day {
  date: string
  /** The scale reading, if they weighed in. */
  scaleKg?: number
  /** Logged calories, if they logged. */
  loggedCalories?: number
  /** What they really burned that day. */
  trueExpenditure: number
  /** Their true weight without water noise. */
  tissueKg: number
}

function mifflinBase(weightKg: number, body: Body): number {
  return 10 * weightKg + 6.25 * body.heightCm - 5 * body.age + body.sexOffset
}

/** Runs `days` days from `startDate` (best a Monday, for the weekend bump). */
export function simulate(body: Body, habits: Habits, days: number, startDate: string, random: Random): Day[] {
  let fat = body.fatKg
  let lean = body.leanKg
  const startWeight = fat + lean
  const startBase = mifflinBase(startWeight, body)
  const baselineIntake = body.baselineExpenditure
  let adaptive = 0
  let water = 0
  let noise = 0
  const out: Day[] = []

  for (let day = 0; day < days; day++) {
    const weight = fat + lean
    const scaleSd = habits.scaleNoiseShare * startWeight
    // Noise that carries over a little from one day to the next (AR(1), 0.5), with the set spread.
    noise = 0.5 * noise + random.normal(0, scaleSd * Math.sqrt(1 - 0.25))
    const dayOfWeek = day % 7 // 0 = Monday
    const weekend = dayOfWeek === 0 ? WEEKEND_SHARE : dayOfWeek === 1 ? WEEKEND_SHARE / 2 : 0
    const cycle = habits.cycleKg * Math.max(0, Math.sin((2 * Math.PI * (day + habits.cycleStartDay)) / 28))
    const date = addDays(startDate, day)

    const onHoliday = habits.holiday !== undefined && within(day, habits.holiday)
    const lapse = habits.lapses?.find(stretch => within(day, stretch))
    const extraShare = onHoliday ? habits.holiday!.extraShare : (lapse?.extraShare ?? 0)
    const dayPlanned = habits.plannedIntake * (1 + extraShare)

    // Morning weigh-in, before the day's food.
    const record: Day = { date, trueExpenditure: 0, tissueKg: weight }
    if (!random.chance(onHoliday ? 1 - HOLIDAY_WEIGH_IN : habits.missWeighIn)) {
      record.scaleKg = Math.round((weight + water + noise + weekend * startWeight + cycle) * 10) / 10
    }

    const intake = Math.max(0, dayPlanned * (1 + random.normal(0, habits.intakeDaySd)))
    // Expenditure follows body size (as resting energy does), the thermic effect of food, and a slow adaptive part.
    adaptive += (ADAPTIVE_SHARE * (intake - baselineIntake) - adaptive) / ADAPTIVE_DAYS
    const changed = habits.expenditureChange && day >= habits.expenditureChange.day ? habits.expenditureChange.factor : 1
    const expenditure = body.baselineExpenditure * changed * (mifflinBase(weight, body) / startBase) + TEF_SHARE * (intake - baselineIntake) + adaptive
    record.trueExpenditure = expenditure

    if (!random.chance(onHoliday ? 1 - HOLIDAY_LOG_DAY : habits.missCalories)) {
      // Part of a day: a forgotten meal on a normal day, or most of a holiday day.
      let partOfDay = 1
      if (onHoliday) partOfDay = HOLIDAY_LOGGED_SHARE
      else if (habits.partialDayChance && random.chance(habits.partialDayChance)) partOfDay = random.uniform(0.4, 0.7)
      // Logged calories leave out the under-logged share and are rounded like a food app would.
      record.loggedCalories = Math.round((intake * partOfDay * (1 - habits.underLogging)) / 10) * 10
    }
    if (lapse) {
      delete record.scaleKg
      delete record.loggedCalories
    }

    // Energy balance into fat and lean by Forbes' curve.
    const balance = intake - expenditure
    const leanPerFat = FORBES_CONSTANT_KG / fat
    const fatChange = balance / (FAT_CALORIES_PER_KG + LEAN_CALORIES_PER_KG * leanPerFat)
    fat += fatChange
    lean += fatChange * leanPerFat

    // A holiday's extra food (and salt) brings water back on, which goes again afterwards.
    const waterTarget = Math.min(1, Math.max(-1.5, (habits.waterKgPer500 * (dayPlanned - baselineIntake)) / 500))
    water += (waterTarget - water) / WATER_DAYS

    out.push(record)
  }
  return out
}

/** The days as log entries, the way the app would store them. */
export function toLog(days: Day[]): LogEntry[] {
  return days
    .filter(day => day.scaleKg !== undefined || day.loggedCalories !== undefined)
    .map(day => {
      const entry: LogEntry = { date: day.date }
      if (day.scaleKg !== undefined) entry.weightKg = day.scaleKg
      if (day.loggedCalories !== undefined) entry.calories = day.loggedCalories
      return entry
    })
}
