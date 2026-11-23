import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { UnitSystem } from '../engine/types'
import { formatDay, todayIso } from '../log/dates'
import type { LogEntry } from '../log/entries'
import type { CsvFile, CsvMapping } from '../log/csvImport'
import { csvToEntries, guessMapping, MAX_CSV_BYTES, mergeImport, readCsv } from '../log/csvImport'
import { weightForDisplay } from '../log/draft'
import { Choice } from './fields'

interface CsvImportProps {
  entries: LogEntry[]
  unit: UnitSystem
  /** Saves the new log; false when storage is blocked (the caller shows the message). */
  persist: (next: LogEntry[]) => boolean
  showToast: (message: string) => void
}

const COLUMN_FIELDS = [
  { key: 'date', label: 'Date' },
  { key: 'calories', label: 'Calories' },
  { key: 'protein', label: 'Protein (g)' },
  { key: 'carbs', label: 'Carbs (g)' },
  { key: 'fats', label: 'Fats (g)' },
  { key: 'weight', label: 'Weight' },
] as const

const UNIT_OPTIONS = [
  { value: 'lb' as const, label: 'lb' },
  { value: 'kg' as const, label: 'kg' },
]

const PREVIEW_DAYS = 3

/** Import daily totals from another app's CSV: guess the columns, let the user check them, then merge. */
export function CsvImport({ entries, unit, persist, showToast }: CsvImportProps) {
  const [file, setFile] = useState<{ name: string; csv: CsvFile } | null>(null)
  const [mapping, setMapping] = useState<CsvMapping | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const today = todayIso()

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    event.target.value = '' // so picking the same file again still fires a change
    if (!picked) return
    if (picked.size > MAX_CSV_BYTES) {
      showToast('That file is too big to import (over 5 MB).')
      return
    }
    const result = readCsv(await picked.text())
    if (!result.ok) {
      showToast(result.message)
      return
    }
    const guessed = guessMapping(result.file)
    // A weight column with no unit in its name is read in the unit the user has picked in the app.
    const headerSaysUnit = guessed.weight !== null && /\b(kg|lb|lbs)\b/i.test(result.file.headers[guessed.weight])
    setFile({ name: picked.name, csv: result.file })
    setMapping(headerSaysUnit ? guessed : { ...guessed, weightUnit: unit === 'metric' ? 'kg' : 'lb' })
  }

  function cancel() {
    setFile(null)
    setMapping(null)
  }

  if (!file || !mapping) {
    return (
      <div className="card">
        <h2 className="card-title">Import from another app</h2>
        <p className="card-text">
          Bring in daily totals from a CSV export, such as Cronometer&apos;s daily nutrition or biometrics export or MyFitnessPal&apos;s nutrition or
          measurement summary. You check the columns before anything is saved.
        </p>
        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
            Choose a CSV file
          </button>
          <input ref={fileInput} type="file" accept=".csv,text/csv" className="visually-hidden" tabIndex={-1} aria-label="CSV file" onChange={handleFile} />
        </div>
      </div>
    )
  }

  const preview = csvToEntries(file.csv, mapping, today)
  const existing = new Set(entries.map(entry => entry.date))
  const alreadyLogged = preview.entries.filter(entry => existing.has(entry.date)).length
  const first = preview.entries[0]
  const last = preview.entries[preview.entries.length - 1]
  const isMetricFile = mapping.metric !== null
  const showUnit = mapping.weight !== null && (!isMetricFile || mapping.unit === null)

  function setColumn(key: (typeof COLUMN_FIELDS)[number]['key'], value: string) {
    setMapping(current => (current ? { ...current, [key]: value === '' ? null : Number(value) } : current))
  }

  function handleImport() {
    const merged = mergeImport(entries, preview.entries)
    if (persist(merged.entries)) {
      const updated = merged.updated > 0 ? ` (${merged.updated} already in your log updated)` : ''
      showToast(`Imported ${preview.entries.length} days${updated}`)
      cancel()
    }
  }

  return (
    <div className="card stack">
      <h2 className="card-title">Import from another app</h2>
      <p className="card-text">
        <strong>{file.name}</strong>: {file.csv.rows.length.toLocaleString('en-US')} rows.{' '}
        {isMetricFile ? 'One measurement per row, so only body weight is read.' : 'Check which column holds what.'}
      </p>

      {!isMetricFile ? (
        <div className="column-picks">
          {COLUMN_FIELDS.map(field => (
            <div className="field" key={field.key}>
              <label htmlFor={`csv-${field.key}`} className="field-label">
                {field.label}
              </label>
              <div className="select-input">
                <select id={`csv-${field.key}`} value={mapping[field.key] ?? ''} onChange={event => setColumn(field.key, event.target.value)}>
                  <option value="">Not in this file</option>
                  {file.csv.headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header || `Column ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {showUnit ? <Choice legend="Weight unit in this file" name="csv-unit" variant="segmented" options={UNIT_OPTIONS} value={mapping.weightUnit} onChange={value => setMapping({ ...mapping, weightUnit: value })} /> : null}

      <div className="import-preview" data-testid="import-preview" aria-live="polite">
        {preview.entries.length === 0 ? (
          <p className="card-text">{mapping.date === null ? 'Pick the date column to see what will be imported.' : 'No days to import with these columns.'}</p>
        ) : (
          <>
            <p className="card-text">
              {preview.entries.length} days from {formatDay(first.date, today)} to {formatDay(last.date, today)}: {preview.withCalories} with calories,{' '}
              {preview.withWeight} with weight.
              {alreadyLogged > 0 ? ` ${alreadyLogged} are already in your log; the file's numbers replace theirs.` : ''}
              {preview.skippedRows > 0 ? ` ${preview.skippedRows} rows skipped (no readable date, a future date, or nothing to import).` : ''}
            </p>
            <ul className="preview-days">
              {preview.entries.slice(-PREVIEW_DAYS).map(entry => (
                <li key={entry.date}>
                  <span>{formatDay(entry.date, today)}</span>
                  <span>
                    {[
                      entry.calories !== undefined ? `${entry.calories.toLocaleString('en-US')} cal` : '',
                      entry.weightKg !== undefined ? `${weightForDisplay(entry.weightKg, unit)} ${unit === 'imperial' ? 'lb' : 'kg'}` : '',
                      entry.incomplete ? 'not complete' : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={handleImport} disabled={preview.entries.length === 0}>
          {preview.entries.length === 0 ? 'Import' : `Import ${preview.entries.length} days`}
        </button>
        <button type="button" className="btn btn-secondary" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
