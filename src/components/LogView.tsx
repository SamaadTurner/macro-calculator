import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { UnitSystem } from '../engine/types'
import { kgToLb, lbToKg, roundTo } from '../engine/units'
import { addDays, formatDay, isIsoDate, todayIso } from '../log/dates'
import type { LogEntry } from '../log/entries'
import { loadLog, removeEntry, saveLog, upsertEntry } from '../log/entries'
import type { DraftErrors, LogDraft } from '../log/draft'
import { draftErrors, draftToEntry, emptyDraft, entryToDraft, weightForDisplay } from '../log/draft'
import { trendChange, weightTrend } from '../log/trend'
import { backupText, MAX_BACKUP_BYTES, mergeBackup, readBackup } from '../log/backup'
import { Choice, FieldError, NumberField } from './fields'
import { WeightChart } from './WeightChart'
import { TrashIcon } from './Icons'

const UNIT_OPTIONS = [
  { value: 'imperial' as const, label: 'lb' },
  { value: 'metric' as const, label: 'kg' },
]
const RANGE_OPTIONS = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 0, label: 'All' },
]
const HISTORY_PAGE = 14

interface LogViewProps {
  unit: UnitSystem
  onUnitChange: (unit: UnitSystem) => void
  showToast: (message: string) => void
}

/** The form for one date: that day's saved numbers if it has any, otherwise empty boxes. */
function draftForDate(entries: LogEntry[], date: string, unit: UnitSystem): LogDraft {
  const saved = entries.find(entry => entry.date === date)
  return saved ? entryToDraft(saved, unit) : emptyDraft(date)
}

/** "P 180 · C 220 · F 70" with only the macros that were logged, or '' for none. */
function macroSummary(entry: LogEntry): string {
  const parts: string[] = []
  if (entry.protein !== undefined) parts.push(`P ${entry.protein}`)
  if (entry.carbs !== undefined) parts.push(`C ${entry.carbs}`)
  if (entry.fats !== undefined) parts.push(`F ${entry.fats}`)
  return parts.join(' · ')
}

function formatChange(kg: number, unit: UnitSystem): string {
  const value = roundTo(unit === 'imperial' ? kgToLb(kg) : kg, 1)
  if (value === 0) return 'No change'
  return `${value > 0 ? '+' : '−'}${Math.abs(value)} ${unit === 'imperial' ? 'lb' : 'kg'}`
}

export function LogView({ unit, onUnitChange, showToast }: LogViewProps) {
  const [entries, setEntries] = useState<LogEntry[]>(() => loadLog())
  const [draft, setDraft] = useState<LogDraft>(() => draftForDate(loadLog(), todayIso(), unit))
  const [errors, setErrors] = useState<DraftErrors>({})
  const [range, setRange] = useState(30)
  const [historyShown, setHistoryShown] = useState(HISTORY_PAGE)
  const fileInput = useRef<HTMLInputElement>(null)
  const label = unit === 'imperial' ? 'lb' : 'kg'

  const today = todayIso()
  const alreadyLogged = entries.some(entry => entry.date === draft.date)
  const points = weightTrend(entries)
  // The trend is worked out over the whole history and only then cut to the range, so it is the same in every view.
  const shownPoints = range === 0 ? points : points.filter(point => point.date >= addDays(today, -(range - 1)))
  const latest = points[points.length - 1]
  const weekChange = trendChange(points, 7)
  const newestFirst = [...entries].reverse()

  function persist(next: LogEntry[]): boolean {
    if (!saveLog(next)) {
      showToast('Could not save. Your browser is blocking storage.')
      return false
    }
    setEntries(next)
    return true
  }

  function update(field: keyof LogDraft) {
    return (value: string) => {
      setDraft(current => ({ ...current, [field]: value }))
      // Clear a message as soon as the user starts fixing that field.
      setErrors(current => ({ ...current, [field]: undefined, form: undefined }))
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = draftErrors(draft, unit, today)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      const firstBad = (['date', 'weight', 'calories', 'protein', 'carbs', 'fats'] as const).find(field => found[field])
      document.getElementById(`log-${firstBad ?? 'weight'}`)?.focus()
      return
    }
    const next = upsertEntry(entries, draftToEntry(draft, unit))
    if (persist(next)) {
      showToast(alreadyLogged ? `Updated ${formatDay(draft.date)}` : `Saved ${formatDay(draft.date)}`)
      // Show the numbers as saved (rounded), so the form matches the history.
      setDraft(draftForDate(next, draft.date, unit))
    }
  }

  function handleDateChange(date: string) {
    // Picking a day that is already logged loads it, so saving never wipes numbers the user cannot see.
    setDraft(isIsoDate(date) ? draftForDate(entries, date, unit) : { ...draft, date })
    setErrors({})
  }

  function handleEdit(entry: LogEntry) {
    setDraft(entryToDraft(entry, unit))
    setErrors({})
    document.getElementById('log-form-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    document.getElementById('log-weight')?.focus({ preventScroll: true })
  }

  function handleDelete(entry: LogEntry) {
    if (!window.confirm(`Delete the log for ${formatDay(entry.date)}?`)) return
    const next = removeEntry(entries, entry.date)
    if (persist(next)) {
      showToast(`Deleted ${formatDay(entry.date)}`)
      if (draft.date === entry.date) setDraft(emptyDraft(entry.date))
    }
  }

  function handleUnitChange(next: UnitSystem) {
    // A weight typed in the old unit is converted, so switching never changes the number the user meant.
    const typed = Number(draft.weight)
    if (draft.weight.trim() !== '' && Number.isFinite(typed) && next !== unit) {
      const kg = unit === 'imperial' ? lbToKg(typed) : typed
      setDraft(current => ({ ...current, weight: String(weightForDisplay(kg, next)) }))
    }
    onUnitChange(next)
  }

  function handleExport() {
    const blob = new Blob([backupText(entries)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `macro-log-${today}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // so picking the same file again still fires a change
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES) {
      showToast('That file is too big to be a log backup.')
      return
    }
    const result = readBackup(await file.text())
    if (!result.ok) {
      showToast(result.message)
      return
    }
    const merged = mergeBackup(entries, result.entries)
    if (persist(merged.entries)) {
      const parts = [`Imported ${merged.added + merged.replaced} days`]
      if (merged.replaced > 0) parts.push(`${merged.replaced} replaced`)
      if (result.skipped > 0) parts.push(`${result.skipped} skipped as unreadable`)
      showToast(parts.join(', '))
    }
  }

  return (
    <section className="log" aria-labelledby="log-title">
      <div className="results-head">
        <p className="eyebrow">Daily log</p>
        <h1 id="log-title" className="display" tabIndex={-1}>
          Track your weight
        </h1>
        <p className="lede">Weigh in most mornings and log what you ate. The trend line smooths out water and salt swings.</p>
      </div>

      <form className="card stack" onSubmit={handleSubmit} noValidate aria-labelledby="log-form-title">
        <h2 id="log-form-title" className="card-title">
          {alreadyLogged ? 'Change a day' : 'Log a day'}
        </h2>
        <div className="field">
          <label htmlFor="log-date" className="field-label">
            Date
          </label>
          <div className={`number-input date-input${errors.date ? ' has-error' : ''}`}>
            <input
              id="log-date"
              type="date"
              value={draft.date}
              max={today}
              min="2000-01-01"
              aria-invalid={errors.date ? true : undefined}
              aria-describedby="log-date-hint log-date-error"
              onChange={event => handleDateChange(event.target.value)}
            />
          </div>
          <p id="log-date-hint" className="field-hint">
            {alreadyLogged ? 'Already logged. Change the numbers and press Update day.' : ' '}
          </p>
          <FieldError id="log-date-error" message={errors.date} />
        </div>
        <Choice legend="Weight unit" name="log-unit" variant="segmented" options={UNIT_OPTIONS} value={unit} onChange={handleUnitChange} />
        <NumberField
          id="log-weight"
          label="Weight"
          suffix={label}
          value={draft.weight}
          onChange={update('weight')}
          error={errors.weight}
          placeholder={unit === 'imperial' ? '180' : '82'}
          decimals
        />
        <NumberField id="log-calories" label="Calories eaten" suffix="cal" value={draft.calories} onChange={update('calories')} error={errors.calories} placeholder="2200" />
        <details className="details log-macros" open={Boolean(draft.protein || draft.carbs || draft.fats || errors.protein || errors.carbs || errors.fats)}>
          <summary>Add macros (optional)</summary>
          <div className="macro-fields">
            <NumberField id="log-protein" label="Protein" suffix="g" value={draft.protein} onChange={update('protein')} error={errors.protein} />
            <NumberField id="log-carbs" label="Carbs" suffix="g" value={draft.carbs} onChange={update('carbs')} error={errors.carbs} />
            <NumberField id="log-fats" label="Fats" suffix="g" value={draft.fats} onChange={update('fats')} error={errors.fats} />
          </div>
        </details>
        <FieldError id="log-form-error" message={errors.form} />
        <button type="submit" className="btn btn-primary">
          {alreadyLogged ? 'Update day' : 'Save day'}
        </button>
      </form>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Weight trend</h2>
          {points.length > 0 ? <Choice legend="Show" name="log-range" variant="segmented" options={RANGE_OPTIONS} value={range} onChange={setRange} hideLegend /> : null}
        </div>
        {latest ? (
          <>
            <dl className="trend-stats">
              <div>
                <dt>Trend weight</dt>
                <dd data-testid="trend-weight">
                  {weightForDisplay(latest.trendKg, unit)} {label}
                </dd>
              </div>
              <div>
                <dt>Last 7 days</dt>
                <dd data-testid="trend-change">{weekChange === null ? 'Needs a week of data' : formatChange(weekChange, unit)}</dd>
              </div>
            </dl>
            {shownPoints.length > 0 ? (
              <WeightChart points={shownPoints} unit={unit} />
            ) : (
              <p className="empty-note">No weigh-ins in the last {range} days. Pick All to see older ones.</p>
            )}
          </>
        ) : (
          <p className="empty-note">Your trend shows up here after your first weigh-in.</p>
        )}
      </div>

      {entries.length > 0 ? (
        <div className="card">
          <h2 className="card-title" id="history-title">
            History
          </h2>
          <div className="table-scroll">
            <table className="log-table" aria-labelledby="history-title">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Weight</th>
                  <th scope="col">Food</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.slice(0, historyShown).map(entry => (
                  <tr key={entry.date}>
                    <th scope="row">{formatDay(entry.date, today)}</th>
                    <td>{entry.weightKg === undefined ? '–' : `${weightForDisplay(entry.weightKg, unit)} ${label}`}</td>
                    <td className="food">
                      {entry.calories === undefined ? '–' : `${entry.calories.toLocaleString('en-US')} cal`}
                      {macroSummary(entry) ? <small>{macroSummary(entry)}</small> : null}
                    </td>
                    <td className="row-actions">
                      <button type="button" className="btn-text" onClick={() => handleEdit(entry)} aria-label={`Edit ${formatDay(entry.date, today)}`}>
                        Edit
                      </button>
                      <button type="button" className="icon-btn" onClick={() => handleDelete(entry)} aria-label={`Delete ${formatDay(entry.date, today)}`}>
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {entries.length > historyShown ? (
            <button type="button" className="btn btn-secondary show-more" onClick={() => setHistoryShown(entries.length)}>
              Show all {entries.length} days
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <h2 className="card-title">Backup</h2>
        <p className="card-text">Your log is saved only in this browser. Export a backup now and then, and import it on a new phone or after clearing your browser.</p>
        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={handleExport} disabled={entries.length === 0}>
            Export backup
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
            Import backup
          </button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="visually-hidden" tabIndex={-1} aria-label="Backup file" onChange={handleImport} />
        </div>
      </div>
    </section>
  )
}
