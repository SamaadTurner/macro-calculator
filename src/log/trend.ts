import { daysBetween } from './dates'
import type { LogEntry } from './entries'

// Scale weight jumps around by a kilo or two from water, salt and food in the gut, so
// the log shows a smoothed trend next to the raw numbers. It is an exponential moving
// average that moves 10% of the way toward each new weigh-in (the approach from John
// Walker's "The Hacker's Diet"). After a gap of several days the step is bigger, as if
// the missing days had been weighed at the new value, so a week away does not freeze the trend.
export const DAILY_SMOOTHING = 0.1

export interface TrendPoint {
  date: string
  weightKg: number
  trendKg: number
}

/** One point per day that has a weight, oldest first. Expects entries sorted by date. */
export function weightTrend(entries: LogEntry[], smoothing = DAILY_SMOOTHING): TrendPoint[] {
  const points: TrendPoint[] = []
  for (const entry of entries) {
    if (entry.weightKg === undefined) continue
    const previous = points[points.length - 1]
    if (!previous) {
      points.push({ date: entry.date, weightKg: entry.weightKg, trendKg: entry.weightKg })
      continue
    }
    const gapDays = Math.max(1, daysBetween(previous.date, entry.date))
    const step = 1 - (1 - smoothing) ** gapDays
    const trendKg = previous.trendKg + step * (entry.weightKg - previous.trendKg)
    points.push({ date: entry.date, weightKg: entry.weightKg, trendKg })
  }
  return points
}

/**
 * How much the trend moved over about the last `days` days, in kg (negative = down).
 * Compares the latest point with the newest point at least `days` days before it.
 * Null until there is enough history.
 */
export function trendChange(points: TrendPoint[], days = 7): number | null {
  const latest = points[points.length - 1]
  if (!latest) return null
  for (let i = points.length - 2; i >= 0; i--) {
    if (daysBetween(points[i].date, latest.date) >= days) return latest.trendKg - points[i].trendKg
  }
  return null
}
