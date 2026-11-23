import { addDays, daysBetween } from '../log/dates'
import type { LogEntry } from '../log/entries'

// The weekly check-in estimates how many calories a day the user really burns, from the
// calories they logged and how their weight moved:
//
//   expenditure = average calories eaten - (weight change per day x calories per kg)
//
// It uses what was logged, not the plan (so eating more or less than planned does not
// matter), and the same logging habits on both sides cancel out: someone who forgets the
// cooking oil every day gets an estimate in their own logged calories, which is what their
// targets are compared against anyway.

/** The last 4 weeks are used. Long enough to average out water swings, short enough to follow change. */
export const WINDOW_DAYS = 28
/** Before an estimate is shown: weigh-ins at least this many days apart... */
export const MIN_SPAN_DAYS = 10
/** ...this many weigh-ins... */
export const MIN_WEIGH_INS = 5
/** ...and this many days with calories logged between the first and last weigh-in. */
export const MIN_INTAKE_DAYS = 7

/**
 * How far off the formula usually is, as a share of maintenance. Mifflin-St Jeor misses by more
 * than 10% for about one person in four, and the activity factor adds more error on top.
 */
export const FORMULA_SHARE_SD = 0.15
/**
 * Scale weight wobbles day to day by at least this much (kg, one standard deviation), even when
 * a few weigh-ins happen to line up, so a short, tidy log is not trusted too much.
 */
export const MIN_WEIGHT_NOISE_KG = 0.4
/** The estimate moves at most this much per week between saved check-ins. */
export const MAX_CHANGE_PER_WEEK = 200
/** A data estimate this far from the formula (as a share) gets a "check your logging" note. */
export const UNUSUAL_SHARE = 0.35

export interface ExpenditureInput {
  /** Sorted, one per date. */
  entries: LogEntry[]
  today: string
  /** Maintenance from the formula at the current trend weight. */
  formulaMaintenance: number
  caloriesPerKg: number
  /** The last saved check-in, used to limit how fast the estimate moves. */
  previous?: { date: string; expenditure: number }
}

export interface MissingData {
  spanDays: number
  weighIns: number
  intakeDays: number
}

export type ExpenditureResult =
  | { status: 'not-enough'; have: MissingData; need: MissingData }
  | {
      status: 'ready'
      expenditure: number
      /** The estimate before the weekly limit. */
      blended: number
      /** About 95% likely to be between these, before the weekly limit. */
      low: number
      high: number
      formula: number
      fromData: number
      /** 0 to 1: how much of the estimate comes from the log rather than the formula. */
      dataWeight: number
      averageIntake: number
      /** Weight change per week from the best-fit line, kg. */
      weeklyChangeKg: number
      caloriesPerKg: number
      start: string
      end: string
      weighIns: number
      intakeDays: number
      /** True when the weekly limit held the estimate back. */
      limited: boolean
      /** True when the log disagrees with the formula by a lot. */
      unusual: boolean
    }

interface Line {
  slope: number
  slopeSe: number
}

/** Least-squares line through (day, weight). Missed weigh-ins need no filling: the line simply spans them. */
function fitLine(days: number[], weights: number[]): Line {
  const n = days.length
  const meanX = days.reduce((sum, x) => sum + x, 0) / n
  const meanY = weights.reduce((sum, y) => sum + y, 0) / n
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (days[i] - meanX) ** 2
    sxy += (days[i] - meanX) * (weights[i] - meanY)
  }
  const slope = sxy / sxx
  let squaredResiduals = 0
  for (let i = 0; i < n; i++) {
    const fitted = meanY + slope * (days[i] - meanX)
    squaredResiduals += (weights[i] - fitted) ** 2
  }
  const noise = Math.max(MIN_WEIGHT_NOISE_KG, Math.sqrt(squaredResiduals / (n - 2)))
  return { slope, slopeSe: noise / Math.sqrt(sxx) }
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sampleVariance(values: number[]): number {
  const average = mean(values)
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
}

export function estimateExpenditure(input: ExpenditureInput): ExpenditureResult {
  const { entries, today, formulaMaintenance, caloriesPerKg, previous } = input
  const start = addDays(today, -(WINDOW_DAYS - 1))
  const inWindow = entries.filter(entry => entry.date >= start && entry.date <= today)
  const weighIns = inWindow.filter((entry): entry is LogEntry & { weightKg: number } => entry.weightKg !== undefined)
  const first = weighIns[0]?.date
  const last = weighIns[weighIns.length - 1]?.date
  // Food eaten on the day of the last weigh-in shows up on the scale the next morning, so it is left out.
  const intake =
    first && last ? inWindow.filter(entry => entry.date >= first && entry.date < last && entry.calories !== undefined).map(entry => entry.calories as number) : []

  const have: MissingData = { spanDays: first && last ? daysBetween(first, last) : 0, weighIns: weighIns.length, intakeDays: intake.length }
  const need: MissingData = { spanDays: MIN_SPAN_DAYS, weighIns: MIN_WEIGH_INS, intakeDays: MIN_INTAKE_DAYS }
  if (have.spanDays < need.spanDays || have.weighIns < need.weighIns || have.intakeDays < need.intakeDays || !first || !last) {
    return { status: 'not-enough', have, need }
  }

  const line = fitLine(
    weighIns.map(entry => daysBetween(first, entry.date)),
    weighIns.map(entry => entry.weightKg),
  )
  const averageIntake = mean(intake)
  const fromData = averageIntake - line.slope * caloriesPerKg

  // Mix the formula and the data, each weighted by how sure it is (one over its variance).
  // A short or noisy log leans on the formula; after 3 to 4 weeks the data does most of the work.
  const dataVariance = (caloriesPerKg * line.slopeSe) ** 2 + sampleVariance(intake) / intake.length
  const formulaVariance = (FORMULA_SHARE_SD * formulaMaintenance) ** 2
  const dataWeight = formulaVariance / (formulaVariance + dataVariance)
  const blended = dataWeight * fromData + (1 - dataWeight) * formulaMaintenance
  const blendedSd = Math.sqrt((dataVariance * formulaVariance) / (dataVariance + formulaVariance))

  let expenditure = blended
  let limited = false
  if (previous && previous.date < today) {
    const weeks = Math.max(1, daysBetween(previous.date, today) / 7)
    const limit = MAX_CHANGE_PER_WEEK * weeks
    const clamped = Math.min(previous.expenditure + limit, Math.max(previous.expenditure - limit, blended))
    limited = clamped !== blended
    expenditure = clamped
  }

  return {
    status: 'ready',
    expenditure,
    blended,
    low: blended - 1.96 * blendedSd,
    high: blended + 1.96 * blendedSd,
    formula: formulaMaintenance,
    fromData,
    dataWeight,
    averageIntake,
    weeklyChangeKg: line.slope * 7,
    caloriesPerKg,
    start: weighIns[0].date,
    end: last,
    weighIns: weighIns.length,
    intakeDays: intake.length,
    limited,
    unusual: Math.abs(fromData - formulaMaintenance) > UNUSUAL_SHARE * formulaMaintenance,
  }
}
