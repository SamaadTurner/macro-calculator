import { BREAK_LENGTHS_WEEKS, weeklyReminderIcs } from '../coach/phases'
import type { MaintenanceBreak } from '../coach/phases'
import { addDays, formatDay } from '../log/dates'

interface BreakNowProps {
  value: MaintenanceBreak
  today: string
  onEnd: () => void
}

/** Shown while a maintenance break runs, above the targets, so the change in numbers makes sense. */
export function BreakNow({ value, today, onEnd }: BreakNowProps) {
  return (
    <div className="card stack break-card" data-testid="break-now">
      <h2 className="card-title">Maintenance break</h2>
      <p className="card-text">
        Eating at maintenance through {formatDay(addDays(value.end, -1), today)}. Your fat loss targets come back on {formatDay(value.end, today)} by
        themselves. The scale often goes up a little in the first days from water and food in the gut; that is not fat.
      </p>
      <button type="button" className="btn btn-secondary" onClick={onEnd}>
        End the break now
      </button>
    </div>
  )
}

interface BreakOfferProps {
  /** Weeks of fat loss in a row; at the suggestion point the card opens by itself. */
  weeks: number
  suggested: boolean
  onStart: (weeks: number) => void
}

/**
 * A week or two at maintenance during a long diet. Studies differ on whether it helps fat loss
 * (MATADOR, Byrne 2018, found more fat loss; ICECAP, Peos 2021, found the same fat loss with less
 * appetite), so it is offered, never pushed.
 */
export function BreakOffer({ weeks, suggested, onStart }: BreakOfferProps) {
  const buttons = (
    <div className="actions">
      {BREAK_LENGTHS_WEEKS.map(length => (
        <button key={length} type="button" className="btn btn-secondary" onClick={() => onStart(length)}>
          Take a {length}-week break
        </button>
      ))}
    </div>
  )
  const text = (
    <p className="card-text">
      A week or two eating at maintenance can make a long diet easier to stick with: in one study, people taking breaks felt less hungry. Fat loss over the whole
      diet was the same or better in studies. Your fat loss targets come back by themselves when the break ends.
    </p>
  )

  if (suggested) {
    return (
      <div className="card stack" data-testid="break-offer">
        <h2 className="card-title">Time for a break?</h2>
        <p className="card-text">You have been losing fat for {weeks} weeks in a row. This is a good point for a break if you want one; it is up to you.</p>
        {text}
        {buttons}
      </div>
    )
  }
  return (
    <details className="card details" data-testid="break-offer">
      <summary>Take a maintenance break</summary>
      <div className="stack details-body">
        {text}
        {buttons}
      </div>
    </details>
  )
}

/** Noon, so the weekday is right in every time zone the date could be read in. */
const weekdayName = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })

interface ReminderCardProps {
  /** The next check-in day: the reminder repeats every 7 days from it. */
  firstDay: string
  today: string
  onDone: (message: string) => void
}

/**
 * The app cannot send notifications on its own without a server, so the reminder is a weekly
 * event the user adds to their own calendar, and can delete there. Only the weekly check-in gets
 * one; daily logging reminders are left out on purpose.
 */
export function ReminderCard({ firstDay, today, onDone }: ReminderCardProps) {
  function handleDownload() {
    const blob = new Blob([weeklyReminderIcs(firstDay)], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'weekly-check-in.ics'
    link.click()
    URL.revokeObjectURL(url)
    onDone('Calendar file downloaded. Open it to add the reminder.')
  }

  return (
    <details className="card details" data-testid="reminder">
      <summary>Weekly reminder (optional)</summary>
      <div className="stack details-body">
        <p className="card-text">
          Add an all-day event for your check-in to your own calendar, every {weekdayName(firstDay)} from {formatDay(firstDay, today)}. Delete it there whenever you like. There are no
          daily reminders to log; log when it suits you, and skipping a week is fine.
        </p>
        <button type="button" className="btn btn-secondary" onClick={handleDownload}>
          Add to my calendar
        </button>
      </div>
    </details>
  )
}
