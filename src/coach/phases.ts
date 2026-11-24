import { addDays, daysBetween, isIsoDate } from '../log/dates'
import type { CheckIn } from './checkins'

/**
 * A maintenance break: a week or two eating at maintenance in the middle of a long fat loss
 * phase. While one runs, the check-in suggests maintenance targets; when it ends, the plan's own
 * goal comes back by itself, so nobody has to remember to switch it back.
 */
export interface MaintenanceBreak {
  /** First day of the break. */
  start: string
  /** First day after the break. */
  end: string
}

const BREAK_KEY = 'macroCalculator.break.v1'
export const BREAK_LENGTHS_WEEKS = [1, 2] as const
/** Weeks of fat loss check-ins in a row before the check-in mentions a break. */
export const SUGGEST_BREAK_AFTER_WEEKS = 12

export function loadBreak(): MaintenanceBreak | null {
  try {
    const text = localStorage.getItem(BREAK_KEY)
    if (text === null) return null
    const raw: unknown = JSON.parse(text)
    if (!raw || typeof raw !== 'object') return null
    const { start, end } = raw as Record<string, unknown>
    if (typeof start !== 'string' || typeof end !== 'string' || !isIsoDate(start) || !isIsoDate(end)) return null
    const days = daysBetween(start, end)
    if (days < 1 || days > 7 * Math.max(...BREAK_LENGTHS_WEEKS)) return null
    return { start, end }
  } catch {
    return null
  }
}

/** Saves the break, or clears it with null. Returns false if storage is blocked. */
export function saveBreak(value: MaintenanceBreak | null): boolean {
  try {
    if (value === null) localStorage.removeItem(BREAK_KEY)
    else localStorage.setItem(BREAK_KEY, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function startBreak(today: string, weeks: number): MaintenanceBreak {
  return { start: today, end: addDays(today, weeks * 7) }
}

export function isBreakActive(value: MaintenanceBreak | null, today: string): value is MaintenanceBreak {
  return value !== null && value.start <= today && today < value.end
}

/**
 * How many weeks the current run of fat loss check-ins has lasted: from the first fat loss
 * check-in after the last one with another goal, up to today. A run ends at a maintain or
 * build check-in, a break that started after it, or a gap of more than four weeks with no
 * check-in (someone who stopped and came back has not been dieting the whole time).
 */
export function weeksOfFatLoss(checkIns: CheckIn[], today: string, lastBreak: MaintenanceBreak | null): number {
  let runStart: string | null = null
  let previous: string | null = null
  for (const item of checkIns) {
    if (item.date > today) break
    const gapTooLong = previous !== null && daysBetween(previous, item.date) > 28
    if (item.goal !== 'cutting') runStart = null
    else if (runStart === null || gapTooLong) runStart = item.date
    previous = item.date
  }
  if (runStart === null || previous === null || daysBetween(previous, today) > 28) return 0
  if (lastBreak && lastBreak.end > runStart && lastBreak.end <= today) runStart = lastBreak.end
  return Math.floor(daysBetween(runStart, today) / 7)
}

const icsDate = (iso: string) => iso.replace(/-/g, '')

/**
 * A calendar file with a weekly all-day event on the check-in day. Calendars on phones and
 * computers can import it, so the reminder works without the app sending notifications.
 */
export function weeklyReminderIcs(firstDay: string, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Macro Calculator//Weekly check-in//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:checkin-${icsDate(firstDay)}@macro-calculator`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(firstDay)}`,
    `DTEND;VALUE=DATE:${icsDate(addDays(firstDay, 1))}`,
    'RRULE:FREQ=WEEKLY',
    'SUMMARY:Weekly check-in',
    'DESCRIPTION:Open Macro Calculator and save this week\'s check-in. Skipping a week is fine.',
    'URL:https://samaadturner.github.io/macro-calculator/#checkin',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  // The calendar file format asks for CRLF line ends. Commas in text need a backslash.
  return lines.map(line => (line.startsWith('DESCRIPTION:') ? line.replace(/,/g, '\\,') : line)).join('\r\n') + '\r\n'
}
