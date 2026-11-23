import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, daysBetween, isIsoDate, todayIso } from './dates'
import type { LogEntry } from './entries'
import { cleanEntry, loadLog, removeEntry, saveLog, upsertEntry } from './entries'
import { draftErrors, draftToEntry, emptyDraft, entryToDraft } from './draft'
import { trendChange, weightTrend } from './trend'
import { BACKUP_FORMAT, backupText, mergeBackup, readBackup } from './backup'
import { lbToKg } from '../engine/units'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('dates', () => {
  it('writes today in local time', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })

  it('rejects dates that do not exist', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-2-3')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })

  it('counts days across a daylight saving change and a month end', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetween('2026-11-30', '2026-12-01')).toBe(1)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('log storage', () => {
  it('saves and loads entries oldest first', () => {
    let log: LogEntry[] = []
    log = upsertEntry(log, { date: '2026-11-03', weightKg: 80 })
    log = upsertEntry(log, { date: '2026-11-01', calories: 2100 })
    saveLog(log)
    expect(loadLog().map(entry => entry.date)).toEqual(['2026-11-01', '2026-11-03'])
  })

  it('replaces an entry on the same date', () => {
    const log = upsertEntry([{ date: '2026-11-01', weightKg: 80 }], { date: '2026-11-01', weightKg: 79.5 })
    expect(log).toEqual([{ date: '2026-11-01', weightKg: 79.5 }])
  })

  it('removes one day', () => {
    const log = [
      { date: '2026-11-01', weightKg: 80 },
      { date: '2026-11-02', weightKg: 79 },
    ]
    expect(removeEntry(log, '2026-11-01')).toEqual([{ date: '2026-11-02', weightKg: 79 }])
  })

  it('ignores broken storage instead of throwing', () => {
    localStorage.setItem('macroCalculator.log.v1', '{bad')
    expect(loadLog()).toEqual([])
    localStorage.setItem('macroCalculator.log.v1', '{"date":"2026-11-01"}')
    expect(loadLog()).toEqual([])
  })

  it('reports when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(saveLog([])).toBe(false)
  })
})

describe('cleanEntry', () => {
  it('keeps good fields and drops bad ones', () => {
    expect(cleanEntry({ date: '2026-11-01', weightKg: 80, calories: 2000.4, protein: -5, carbs: 'lots', fats: 70 })).toEqual({
      date: '2026-11-01',
      weightKg: 80,
      calories: 2000,
      fats: 70,
    })
  })

  it('drops an entry with no weight and no calories', () => {
    expect(cleanEntry({ date: '2026-11-01', protein: 150 })).toBeNull()
  })

  it('drops bad dates and out of range weights', () => {
    expect(cleanEntry({ date: '2026-13-01', weightKg: 80 })).toBeNull()
    expect(cleanEntry({ date: '1999-12-31', weightKg: 80 })).toBeNull()
    expect(cleanEntry({ date: '2026-11-01', weightKg: 900 })).toBeNull()
    expect(cleanEntry(null)).toBeNull()
  })
})

describe('log form', () => {
  const today = '2026-11-23'

  it('needs a weight or calories', () => {
    expect(draftErrors(emptyDraft(today), 'imperial', today).form).toBe('Enter a weight, calories, or both')
    expect(draftErrors({ ...emptyDraft(today), calories: '2100' }, 'imperial', today)).toEqual({})
  })

  it('refuses future dates and bad numbers', () => {
    const errors = draftErrors({ ...emptyDraft('2026-11-24'), weight: '12', calories: 'abc', protein: '2000' }, 'imperial', today)
    expect(errors.date).toBe('You can only log today or earlier')
    expect(errors.weight).toBe('Weight must be between 50 and 500 lb')
    expect(errors.calories).toBe('Enter calories as a number')
    expect(errors.protein).toBe('Protein must be between 0 and 1,000 g')
  })

  it('accepts 0 calories for a fasting day', () => {
    expect(draftErrors({ ...emptyDraft(today), calories: '0' }, 'metric', today)).toEqual({})
  })

  it('stores pounds as kilograms and rounds calories and grams', () => {
    const entry = draftToEntry({ date: today, weight: '180', calories: '2100.6', protein: '150', carbs: '', fats: '70.2' }, 'imperial')
    expect(entry).toEqual({ date: today, weightKg: lbToKg(180), calories: 2101, protein: 150, fats: 70 })
  })

  it('fills the form back in the current unit', () => {
    const draft = entryToDraft({ date: today, weightKg: lbToKg(180), calories: 2100 }, 'imperial')
    expect(draft).toEqual({ date: today, weight: '180', calories: '2100', protein: '', carbs: '', fats: '' })
    expect(entryToDraft({ date: today, weightKg: lbToKg(180) }, 'metric').weight).toBe('81.6')
  })
})

describe('weight trend', () => {
  it('starts at the first weigh-in and moves 10% toward each new one', () => {
    const points = weightTrend([
      { date: '2026-11-01', weightKg: 80 },
      { date: '2026-11-02', weightKg: 81 },
    ])
    expect(points[0].trendKg).toBe(80)
    expect(points[1].trendKg).toBeCloseTo(80.1, 10)
  })

  it('takes a bigger step after a gap, the same as weighing the same number each missing day', () => {
    const withGap = weightTrend([
      { date: '2026-11-01', weightKg: 80 },
      { date: '2026-11-04', weightKg: 78 },
    ])
    const daily = weightTrend([
      { date: '2026-11-01', weightKg: 80 },
      { date: '2026-11-02', weightKg: 78 },
      { date: '2026-11-03', weightKg: 78 },
      { date: '2026-11-04', weightKg: 78 },
    ])
    expect(withGap[1].trendKg).toBeCloseTo(daily[3].trendKg, 10)
  })

  it('skips days with calories only', () => {
    const points = weightTrend([
      { date: '2026-11-01', weightKg: 80 },
      { date: '2026-11-02', calories: 2000 },
    ])
    expect(points).toHaveLength(1)
  })

  it('smooths out a one-day water spike', () => {
    const entries: LogEntry[] = Array.from({ length: 10 }, (_, i) => ({ date: addDays('2026-11-01', i), weightKg: i === 5 ? 82 : 80 }))
    const points = weightTrend(entries)
    expect(points[5].trendKg).toBeLessThan(80.25)
  })

  it('reports the change over the last week once there is a week of data', () => {
    const entries: LogEntry[] = Array.from({ length: 8 }, (_, i) => ({ date: addDays('2026-11-01', i), weightKg: 80 - i * 0.1 }))
    expect(trendChange(weightTrend(entries.slice(0, 7)))).toBeNull()
    const change = trendChange(weightTrend(entries))
    expect(change).toBeLessThan(0)
  })
})

describe('backup', () => {
  const log: LogEntry[] = [
    { date: '2026-11-01', weightKg: 80, calories: 2100 },
    { date: '2026-11-02', weightKg: 79.8 },
  ]

  it('round-trips through the file format', () => {
    const result = readBackup(backupText(log))
    expect(result).toEqual({ ok: true, entries: log, skipped: 0 })
  })

  it('refuses files that are not a backup', () => {
    expect(readBackup('not json')).toMatchObject({ ok: false })
    expect(readBackup('{"entries": []}')).toEqual({ ok: false, message: 'That file is not a log backup from this app.' })
    expect(readBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, entries: [] }))).toMatchObject({ ok: false })
  })

  it('skips unreadable days and counts them', () => {
    const text = JSON.stringify({ format: BACKUP_FORMAT, version: 1, entries: [...log, { date: 'yesterday', weightKg: 80 }, 'junk'] })
    expect(readBackup(text)).toEqual({ ok: true, entries: log, skipped: 2 })
  })

  it('merges by date, letting the backup win', () => {
    const current: LogEntry[] = [
      { date: '2026-10-31', weightKg: 80.4 },
      { date: '2026-11-01', weightKg: 81 },
    ]
    const merged = mergeBackup(current, log)
    expect(merged.added).toBe(1)
    expect(merged.replaced).toBe(1)
    expect(merged.entries.map(entry => entry.weightKg)).toEqual([80.4, 80, 79.8])
  })
})
