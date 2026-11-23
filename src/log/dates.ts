// Log days are plain calendar dates like "2026-11-23" in the user's own time zone.
// Working with the text instead of Date objects avoids daylight saving surprises.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

export function todayIso(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** True for a real calendar date written as YYYY-MM-DD (so 2026-02-30 is false). */
export function isIsoDate(text: string): boolean {
  if (!DATE_PATTERN.test(text)) return false
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function toUtcMs(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY)
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtcMs(iso) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** "Nov 23", or "Nov 23, 2025" when the year is not the current one. */
export function formatDay(iso: string, today = todayIso()): string {
  const [year, month, day] = iso.split('-').map(Number)
  const sameYear = iso.slice(0, 4) === today.slice(0, 4)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
}
