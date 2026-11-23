import { lbToKg } from '../engine/units'
import { isIsoDate } from './dates'
import type { LogEntry } from './entries'
import { cleanEntry, sortAndDedupe } from './entries'

// Importing daily totals from another app's CSV export (Cronometer, MyFitnessPal, a
// spreadsheet). Export formats change and differ by app, so nothing here depends on one exact
// layout: the columns are guessed from common header names and the user confirms or changes
// them before anything is saved.

export const MAX_CSV_BYTES = 5_000_000

export interface CsvFile {
  headers: string[]
  rows: string[][]
}

export type CsvResult = { ok: true; file: CsvFile } | { ok: false; message: string }

/** Which column holds what. A column is its index in the header row, or null when the file does not have it. */
export interface CsvMapping {
  date: number | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fats: number | null
  weight: number | null
  /** Unit of the weight column when the file does not say per row. */
  weightUnit: 'lb' | 'kg'
  /** A "Completed" column: a day marked not completed is imported as not complete. */
  completed: number | null
  /**
   * Files with one row per measurement (Cronometer's biometrics: Day, Metric, Unit, Amount):
   * only rows whose metric is a body weight are read, and the unit comes from the unit column.
   */
  metric: number | null
  unit: number | null
}

/** Splits CSV text into rows of cells: quoted cells, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const source = text.replace(/^\uFEFF/, '') // a byte order mark from Excel
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"'
        i++
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  // Blank lines carry nothing.
  return rows.filter(cells => cells.some(value => value.trim() !== ''))
}

export function readCsv(text: string): CsvResult {
  const rows = parseCsv(text)
  if (rows.length < 2) return { ok: false, message: 'That file has no rows to import.' }
  const headers = rows[0].map(header => header.trim())
  if (headers.length < 2) return { ok: false, message: 'That file does not look like a CSV export (it has only one column).' }
  return { ok: true, file: { headers, rows: rows.slice(1) } }
}

/** The first header matching one of the patterns, in order of preference. */
function findColumn(headers: string[], patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const index = headers.findIndex(header => pattern.test(header))
    if (index !== -1) return index
  }
  return null
}

/** Guesses the columns from the header names. The user can change every one of them. */
export function guessMapping(file: CsvFile): CsvMapping {
  const { headers } = file
  const metric = findColumn(headers, [/^metric$/i])
  const amount = findColumn(headers, [/^amount$/i, /^value$/i])
  const isMetricFile = metric !== null && amount !== null
  const weight = isMetricFile ? amount : findColumn(headers, [/^weight\b/i, /^body ?weight/i])
  return {
    date: findColumn(headers, [/^date$/i, /^day$/i, /^date\b/i, /\bdate\b/i]),
    calories: isMetricFile ? null : findColumn(headers, [/^energy \(kcal\)$/i, /^calories$/i, /^calories\b/i, /^energy\b/i, /\bkcal\b/i]),
    protein: isMetricFile ? null : findColumn(headers, [/^protein\b/i]),
    carbs: isMetricFile ? null : findColumn(headers, [/^carbs \(g\)$/i, /^carbohydrates?\b/i, /^carbs\b/i, /^net carbs\b/i]),
    fats: isMetricFile ? null : findColumn(headers, [/^fat \(g\)$/i, /^fats?\b/i, /^total fat\b/i]),
    weight,
    weightUnit: weight !== null && /\bkg\b|kilo/i.test(headers[weight]) ? 'kg' : 'lb',
    completed: isMetricFile ? null : findColumn(headers, [/^completed?$/i, /^complete day$/i]),
    metric: isMetricFile ? metric : null,
    unit: isMetricFile ? findColumn(headers, [/^unit$/i, /^units$/i]) : null,
  }
}

/** "1,234.5" or " 1234 " to a number; anything else to null. */
function toNumber(text: string | undefined): number | null {
  if (text === undefined) return null
  const cleaned = text.trim().replace(/,/g, '')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/**
 * Dates as YYYY-MM-DD (a time after it is ignored) or with slashes. Slashed dates are month
 * first unless the file has one with a first part over 12, which means day first.
 */
function dateReader(values: string[]): (text: string) => string | null {
  const dayFirst = values.some(value => {
    const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/\d{4}/)
    return match !== null && Number(match[1]) > 12
  })
  return text => {
    const value = text.trim()
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return isIsoDate(iso[0]) ? iso[0] : null
    const slashed = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (!slashed) return null
    const [first, second, year] = [slashed[1], slashed[2], slashed[3]]
    const [month, day] = dayFirst ? [second, first] : [first, second]
    const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    return isIsoDate(date) ? date : null
  }
}

const NOT_COMPLETED = /^(false|no|n|0)$/i
const POUNDS = /^(lb|lbs|pound|pounds)$/i
const KILOS = /^(kg|kgs|kilogram|kilograms)$/i

export interface ImportPreview {
  entries: LogEntry[]
  /** Rows that could not be used: no readable date, a date after today, or nothing to import. */
  skippedRows: number
  withCalories: number
  withWeight: number
}

/**
 * Turns the rows into one entry per day. Rows on the same day are added up (MyFitnessPal has one
 * row per meal); several weigh-ins on one day keep the last. Numbers out of range are dropped by
 * the same checks as the log form.
 */
export function csvToEntries(file: CsvFile, mapping: CsvMapping, today: string): ImportPreview {
  const days = new Map<string, { calories?: number; protein?: number; carbs?: number; fats?: number; weightKg?: number; notCompleted?: boolean }>()
  let skippedRows = 0
  if (mapping.date === null) return { entries: [], skippedRows: file.rows.length, withCalories: 0, withWeight: 0 }
  const readDate = dateReader(file.rows.map(row => row[mapping.date!] ?? ''))
  const cell = (row: string[], column: number | null) => (column === null ? undefined : row[column])

  for (const row of file.rows) {
    const date = readDate(row[mapping.date] ?? '')
    if (date === null || date > today) {
      skippedRows++
      continue
    }
    const day = days.get(date) ?? {}
    let used = false

    if (mapping.metric !== null) {
      // One measurement per row: only body weight is read.
      const metric = cell(row, mapping.metric) ?? ''
      const amount = toNumber(cell(row, mapping.weight))
      if (/weight/i.test(metric) && !/goal|target|lean|fat/i.test(metric) && amount !== null) {
        const unitText = (cell(row, mapping.unit) ?? '').trim()
        const unit = POUNDS.test(unitText) ? 'lb' : KILOS.test(unitText) ? 'kg' : mapping.weightUnit
        day.weightKg = unit === 'lb' ? lbToKg(amount) : amount
        used = true
      }
    } else {
      for (const field of ['calories', 'protein', 'carbs', 'fats'] as const) {
        const value = toNumber(cell(row, mapping[field]))
        if (value !== null) {
          day[field] = (day[field] ?? 0) + value
          used = true
        }
      }
      const weight = toNumber(cell(row, mapping.weight))
      if (weight !== null && weight > 0) {
        day.weightKg = mapping.weightUnit === 'lb' ? lbToKg(weight) : weight
        used = true
      }
      if (NOT_COMPLETED.test((cell(row, mapping.completed) ?? '').trim())) day.notCompleted = true
    }

    if (used) days.set(date, day)
    else skippedRows++
  }

  const entries: LogEntry[] = []
  for (const [date, day] of days) {
    const { notCompleted, ...numbers } = day
    const entry = cleanEntry({ date, ...numbers, incomplete: notCompleted === true })
    if (entry) entries.push(entry)
  }
  const sorted = sortAndDedupe(entries)
  return {
    entries: sorted,
    skippedRows,
    withCalories: sorted.filter(entry => entry.calories !== undefined).length,
    withWeight: sorted.filter(entry => entry.weightKg !== undefined).length,
  }
}

export interface ImportMerge {
  entries: LogEntry[]
  added: number
  updated: number
}

/**
 * Imported days fill in or replace only what the file has: a food export leaves the weigh-ins
 * already in the log alone, and a weight export leaves the food alone.
 */
export function mergeImport(current: LogEntry[], imported: LogEntry[]): ImportMerge {
  const byDate = new Map(current.map(entry => [entry.date, entry]))
  let added = 0
  let updated = 0
  for (const incoming of imported) {
    const existing = byDate.get(incoming.date)
    if (!existing) {
      byDate.set(incoming.date, incoming)
      added++
      continue
    }
    const merged: LogEntry = { ...existing }
    if (incoming.weightKg !== undefined) merged.weightKg = incoming.weightKg
    if (incoming.calories !== undefined) {
      // New food numbers replace the old ones together, including whether the day was complete.
      merged.calories = incoming.calories
      delete merged.protein
      delete merged.carbs
      delete merged.fats
      delete merged.incomplete
      for (const macro of ['protein', 'carbs', 'fats'] as const) if (incoming[macro] !== undefined) merged[macro] = incoming[macro]
      if (incoming.incomplete) merged.incomplete = true
    }
    byDate.set(incoming.date, merged)
    updated++
  }
  return { entries: sortAndDedupe([...byDate.values()]), added, updated }
}
