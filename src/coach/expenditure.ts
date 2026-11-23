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

/**
 * The last 5 weeks are used. Long enough to average out water swings, short enough to follow a
 * real change (in the simulation study, 35 days beat 28 and still caught up with a 12% rise in burn).
 */
export const WINDOW_DAYS = 35
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
/**
 * Scale water carries over from one day to the next, so weigh-ins are not independent and the
 * plain standard error of the line is too small. With day-to-day carry-over of about 0.5 the
 * usual correction is sqrt((1 + 0.5) / (1 - 0.5)) = 1.73. The simulation study picked it too.
 */
export const SLOPE_SE_FACTOR = 1.73
/** The estimate moves at most this much per week between saved check-ins. */
export const MAX_CHANGE_PER_WEEK = 200
/** A data estimate this far from the formula (as a share) gets a "check your logging" note. */
export const UNUSUAL_SHARE = 0.35
/**
 * Off. A run of this many days with no calories would be a gap whose weight change is not
 * counted, each stretch getting its own starting weight. The simulation study found it made
 * the estimate worse: after a holiday the extra water comes off fast, and a fresh line through
 * those days reads it as fat loss. Kept as a setting so the study can be rerun.
 */
export const GAP_DAYS = Infinity
/**
 * A logged day under half the usual (median) day looks like a forgotten meal and is left out of
 * the average: what was eaten still shows on the scale, but the log does not have it.
 */
export const PART_DAY_SHARE = 0.5
/** ...unless low days are this common, which looks like a pattern (fasting days) rather than forgotten meals. */
export const PART_DAY_PATTERN_SHARE = 0.2
/**
 * Trust the log less when fewer of its days have calories: unlogged days are often the ones with
 * more food (holidays, weekends away), so a patchy log tends to read low. The data's variance is
 * divided by the share of days logged.
 */
export const COVERAGE_WEIGHTING = true

/** The tuning numbers above in one object, so the simulation study can try other values. */
export interface EstimatorSettings {
  windowDays: number
  minSpanDays: number
  minWeighIns: number
  minIntakeDays: number
  formulaShareSd: number
  minWeightNoiseKg: number
  maxChangePerWeek: number
  slopeSeFactor: number
  gapDays: number
  partDayShare: number
  /** Trust the log less when fewer of its days have calories. */
  coverageWeighting: boolean
}

export const DEFAULT_SETTINGS: EstimatorSettings = {
  windowDays: WINDOW_DAYS,
  minSpanDays: MIN_SPAN_DAYS,
  minWeighIns: MIN_WEIGH_INS,
  minIntakeDays: MIN_INTAKE_DAYS,
  formulaShareSd: FORMULA_SHARE_SD,
  minWeightNoiseKg: MIN_WEIGHT_NOISE_KG,
  maxChangePerWeek: MAX_CHANGE_PER_WEEK,
  slopeSeFactor: SLOPE_SE_FACTOR,
  gapDays: GAP_DAYS,
  partDayShare: PART_DAY_SHARE,
  coverageWeighting: COVERAGE_WEIGHTING,
}

export interface ExpenditureInput {
  /** Sorted, one per date. */
  entries: LogEntry[]
  today: string
  /** Maintenance from the formula at the current trend weight. */
  formulaMaintenance: number
  caloriesPerKg: number
  /** The last saved check-in, used to limit how fast the estimate moves. */
  previous?: { date: string; expenditure: number }
  settings?: EstimatorSettings
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
      /** Gaps in the food log whose weight change was not counted, as [first, last] unlogged day. */
      gaps: [string, string][]
      /** Logged days that looked part-logged and were left out of the average. */
      partDays: string[]
      /** Days the user marked as not complete, left out of the average. */
      markedDays: string[]
      /** Share of the days between the first and last weigh-in that have calories logged. */
      loggedShare: number
    }

interface Line {
  slope: number
  slopeSe: number
}

/**
 * Least-squares line through (day, weight). Missed weigh-ins need no filling: the line simply
 * spans them. With gaps, each stretch between gaps gets its own starting weight and they share
 * one slope, so a jump during a gap does not tilt the line.
 */
function fitLine(stretches: { days: number[]; weights: number[] }[], minNoiseKg: number): Line {
  const centred = stretches.map(({ days, weights }) => ({ days, weights, meanX: mean(days), meanY: mean(weights) }))
  let sxx = 0
  let sxy = 0
  let points = 0
  for (const { days, weights, meanX, meanY } of centred) {
    for (let i = 0; i < days.length; i++) {
      sxx += (days[i] - meanX) ** 2
      sxy += (days[i] - meanX) * (weights[i] - meanY)
    }
    points += days.length
  }
  const slope = sxy / sxx
  let squaredResiduals = 0
  for (const { days, weights, meanX, meanY } of centred) {
    for (let i = 0; i < days.length; i++) squaredResiduals += (weights[i] - (meanY + slope * (days[i] - meanX))) ** 2
  }
  const freedom = points - stretches.length - 1
  const noise = freedom > 0 ? Math.max(minNoiseKg, Math.sqrt(squaredResiduals / freedom)) : minNoiseKg
  return { slope, slopeSe: noise / Math.sqrt(sxx) }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Runs of `minDays` or more days in [first, last) with no calories, as [first, last] unlogged day. */
function findGaps(first: string, last: string, logged: Set<string>, minDays: number): [string, string][] {
  const gaps: [string, string][] = []
  let runStart: string | null = null
  for (let day = first; day <= last; day = addDays(day, 1)) {
    const unlogged = day < last && !logged.has(day)
    if (unlogged && runStart === null) runStart = day
    if (!unlogged && runStart !== null) {
      if (daysBetween(runStart, day) >= minDays) gaps.push([runStart, addDays(day, -1)])
      runStart = null
    }
  }
  return gaps
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
  const settings = input.settings ?? DEFAULT_SETTINGS
  const start = addDays(today, -(settings.windowDays - 1))
  const inWindow = entries.filter(entry => entry.date >= start && entry.date <= today)
  const weighIns = inWindow.filter((entry): entry is LogEntry & { weightKg: number } => entry.weightKg !== undefined)
  const first = weighIns[0]?.date
  const last = weighIns[weighIns.length - 1]?.date
  // Food eaten on the day of the last weigh-in shows up on the scale the next morning, so it is left out.
  const intake =
    first && last ? inWindow.filter(entry => entry.date >= first && entry.date < last && entry.calories !== undefined).map(entry => entry.calories as number) : []

  const have: MissingData = { spanDays: first && last ? daysBetween(first, last) : 0, weighIns: weighIns.length, intakeDays: intake.length }
  const need: MissingData = { spanDays: settings.minSpanDays, weighIns: settings.minWeighIns, intakeDays: settings.minIntakeDays }
  if (have.spanDays < need.spanDays || have.weighIns < need.weighIns || have.intakeDays < need.intakeDays || !first || !last) {
    return { status: 'not-enough', have, need }
  }

  const loggedDays = inWindow.filter(
    (entry): entry is LogEntry & { calories: number } => entry.date >= first && entry.date < last && entry.calories !== undefined,
  )

  // Forgotten meals: a day far under the usual is left out, unless low days are a regular pattern.
  // Days the user marked as not complete are left out first; the check below looks at the rest.
  const markedDays = loggedDays.filter(entry => entry.incomplete).map(entry => entry.date)
  const unmarked = loggedDays.filter(entry => !entry.incomplete)
  let partDays: string[] = []
  if (settings.partDayShare > 0 && unmarked.length > 0) {
    const usual = median(unmarked.map(entry => entry.calories))
    const low = unmarked.filter(entry => entry.calories < settings.partDayShare * usual)
    if (low.length <= PART_DAY_PATTERN_SHARE * unmarked.length) partDays = low.map(entry => entry.date)
  }

  // Gaps split the log into stretches. A weigh-in on a gap's first morning still shows the food
  // before the gap, and the morning after a gap starts the next stretch; weigh-ins inside are dropped.
  const gaps = Number.isFinite(settings.gapDays) ? findGaps(first, last, new Set(loggedDays.map(entry => entry.date)), settings.gapDays) : []
  const groups: (typeof weighIns)[] = [[]]
  for (const entry of weighIns) {
    if (gaps.some(([gapStart, gapEnd]) => entry.date > gapStart && entry.date <= gapEnd)) continue
    const stretch = gaps.filter(([, gapEnd]) => gapEnd < entry.date).length
    while (groups.length <= stretch) groups.push([])
    groups[stretch].push(entry)
  }
  const stretches = groups.filter(group => group.length >= 2)
  const leftOut = new Set([...partDays, ...markedDays])
  const usedIntake = loggedDays
    .filter(entry => !leftOut.has(entry.date) && stretches.some(group => entry.date >= group[0].date && entry.date < group[group.length - 1].date))
    .map(entry => entry.calories)
  const used: MissingData = {
    spanDays: stretches.reduce((sum, group) => sum + daysBetween(group[0].date, group[group.length - 1].date), 0),
    weighIns: stretches.reduce((sum, group) => sum + group.length, 0),
    intakeDays: usedIntake.length,
  }
  if (used.spanDays < need.spanDays || used.weighIns < need.weighIns || used.intakeDays < need.intakeDays) {
    return { status: 'not-enough', have: used, need }
  }

  const line = fitLine(
    stretches.map(group => ({ days: group.map(entry => daysBetween(first, entry.date)), weights: group.map(entry => entry.weightKg) })),
    settings.minWeightNoiseKg,
  )
  const averageIntake = mean(usedIntake)
  const fromData = averageIntake - line.slope * caloriesPerKg

  // Mix the formula and the data, each weighted by how sure it is (one over its variance).
  // A short or noisy log leans on the formula; after 3 to 4 weeks the data does most of the work.
  const coverage = settings.coverageWeighting ? Math.min(1, usedIntake.length / used.spanDays) : 1
  const dataVariance =
    ((caloriesPerKg * line.slopeSe * settings.slopeSeFactor) ** 2 + sampleVariance(usedIntake) / usedIntake.length) / coverage
  const formulaVariance = (settings.formulaShareSd * formulaMaintenance) ** 2
  const dataWeight = formulaVariance / (formulaVariance + dataVariance)
  const blended = dataWeight * fromData + (1 - dataWeight) * formulaMaintenance
  const blendedSd = Math.sqrt((dataVariance * formulaVariance) / (dataVariance + formulaVariance))

  let expenditure = blended
  let limited = false
  if (previous && previous.date < today) {
    const weeks = Math.max(1, daysBetween(previous.date, today) / 7)
    const limit = settings.maxChangePerWeek * weeks
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
    intakeDays: usedIntake.length,
    limited,
    unusual: Math.abs(fromData - formulaMaintenance) > UNUSUAL_SHARE * formulaMaintenance,
    gaps,
    partDays,
    markedDays,
    loggedShare: loggedDays.length / have.spanDays,
  }
}
