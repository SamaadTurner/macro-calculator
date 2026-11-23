import { describe, expect, it } from 'vitest'
import { lbToKg } from '../engine/units'
import { csvToEntries, guessMapping, mergeImport, parseCsv, readCsv } from './csvImport'
import type { CsvFile } from './csvImport'

const TODAY = '2026-11-23'

function fileFrom(text: string): CsvFile {
  const result = readCsv(text)
  if (!result.ok) throw new Error(result.message)
  return result.file
}

function importText(text: string) {
  const file = fileFrom(text)
  return csvToEntries(file, guessMapping(file), TODAY)
}

describe('reading CSV text', () => {
  it('handles quotes, commas inside quotes, doubled quotes, CRLF and a byte order mark', () => {
    const text = '\uFEFFDate,Note,Calories\r\n2026-11-20,"Pizza, ""large""","1,850"\r\n\r\n2026-11-21,,2100\r\n'
    expect(parseCsv(text)).toEqual([
      ['Date', 'Note', 'Calories'],
      ['2026-11-20', 'Pizza, "large"', '1,850'],
      ['2026-11-21', '', '2100'],
    ])
  })

  it('refuses a file with no rows or only one column', () => {
    expect(readCsv('Date,Calories\n')).toEqual({ ok: false, message: 'That file has no rows to import.' })
    expect(readCsv('just text\nmore text')).toEqual({ ok: false, message: 'That file does not look like a CSV export (it has only one column).' })
  })
})

describe('guessing columns and building days', () => {
  it('adds up meal rows into one day (a MyFitnessPal style nutrition file)', () => {
    const text = [
      'Date,Meal,Time,Calories,Fat (g),Saturated Fat,Carbohydrates (g),Fiber,Sugar,Protein (g),Note',
      '2026-11-20,Breakfast,8:02 AM,520,18,6,55,8,12,32,',
      '2026-11-20,Lunch,12:30 PM,700,25,9,70,10,6,45,',
      '2026-11-20,Dinner,7:15 PM,880.4,30,11,90,9,8,60.2,"steak, rice"',
      '2026-11-21,Breakfast,8:10 AM,450,15,5,50,7,10,30,',
    ].join('\n')
    const file = fileFrom(text)
    const mapping = guessMapping(file)
    expect(mapping).toMatchObject({ date: 0, calories: 3, fats: 4, carbs: 6, protein: 9, weight: null, completed: null, metric: null })
    const result = csvToEntries(file, mapping, TODAY)
    expect(result.entries).toEqual([
      { date: '2026-11-20', calories: 2100, protein: 137, carbs: 215, fats: 73 },
      { date: '2026-11-21', calories: 450, protein: 30, carbs: 50, fats: 15 },
    ])
    expect(result).toMatchObject({ skippedRows: 0, withCalories: 2, withWeight: 0 })
  })

  it('reads a daily summary with a Completed column (a Cronometer style file)', () => {
    const text = [
      'Date,Completed,Energy (kcal),Alcohol (g),Caffeine (mg),Carbs (g),Fiber (g),Fat (g),Protein (g)',
      '2026-11-19,true,2210.5,0,95,240.2,30,70.1,165.6',
      '2026-11-20,false,1390,0,95,150,20,40,110',
    ].join('\n')
    const result = importText(text)
    expect(result.entries).toEqual([
      { date: '2026-11-19', calories: 2211, protein: 166, carbs: 240, fats: 70 },
      { date: '2026-11-20', calories: 1390, protein: 110, carbs: 150, fats: 40, incomplete: true },
    ])
  })

  it('reads only body weight from a file with one measurement per row, in each row\'s unit', () => {
    const text = [
      'Day,Group,Metric,Unit,Amount',
      '2026-11-19,,Weight,lbs,181.2',
      '2026-11-19,,Body Fat,%,21',
      '2026-11-20,,Weight,kg,82',
      '2026-11-20,,Blood Pressure,mmHg,120/80',
      '2026-11-21,,Weight,lbs,180.8',
      '2026-11-21,,Weight,lbs,180.4',
    ].join('\n')
    const file = fileFrom(text)
    const mapping = guessMapping(file)
    expect(mapping).toMatchObject({ date: 0, metric: 2, unit: 3, weight: 4, calories: null })
    const result = csvToEntries(file, mapping, TODAY)
    expect(result.entries).toEqual([
      { date: '2026-11-19', weightKg: lbToKg(181.2) },
      { date: '2026-11-20', weightKg: 82 },
      // Two weigh-ins on one day: the last one counts.
      { date: '2026-11-21', weightKg: lbToKg(180.4) },
    ])
    expect(result.skippedRows).toBe(2)
  })

  it('takes a plain weight column in the unit the user picks', () => {
    const file = fileFrom('Date,Weight\n2026-11-20,180\n2026-11-21,179.5')
    const mapping = guessMapping(file)
    expect(mapping.weightUnit).toBe('lb')
    expect(csvToEntries(file, mapping, TODAY).entries[0]).toEqual({ date: '2026-11-20', weightKg: lbToKg(180) })
    expect(csvToEntries(file, { ...mapping, weightUnit: 'kg' }, TODAY).entries[0]).toEqual({ date: '2026-11-20', weightKg: 180 })
    // A header that names kilograms is guessed as kg.
    expect(guessMapping(fileFrom('Date,Weight (kg)\n2026-11-20,82')).weightUnit).toBe('kg')
  })

  it('reads slashed dates month first, or day first when the file shows it', () => {
    expect(importText('Date,Calories\n11/2/2026,2000\n11/20/2026,2100').entries.map(e => e.date)).toEqual(['2026-11-02', '2026-11-20'])
    expect(importText('Date,Calories\n2/11/2026,2000\n20/11/2026,2100').entries.map(e => e.date)).toEqual(['2026-11-02', '2026-11-20'])
    // A time after the date is ignored.
    expect(importText('Date,Calories\n2026-11-20 08:30:00,2000').entries.map(e => e.date)).toEqual(['2026-11-20'])
  })

  it('skips rows with no readable date, a date after today, or nothing to import, and drops numbers out of range', () => {
    const text = ['Date,Calories,Weight', 'not a date,2000,', '2026-11-24,2000,', '2026-11-20,,', '2026-02-30,2000,', '2026-11-21,25000,180'].join('\n')
    const result = importText(text)
    expect(result.skippedRows).toBe(4)
    // 25,000 calories is over the limit, so only the weight is kept.
    expect(result.entries).toEqual([{ date: '2026-11-21', weightKg: lbToKg(180) }])
  })

  it('imports nothing without a date column', () => {
    const file = fileFrom('Calories,Protein\n2000,150')
    const mapping = guessMapping(file)
    expect(mapping.date).toBeNull()
    expect(csvToEntries(file, mapping, TODAY)).toEqual({ entries: [], skippedRows: 1, withCalories: 0, withWeight: 0 })
  })
})

describe('merging into the log', () => {
  const current = [
    { date: '2026-11-19', weightKg: 82, calories: 1500, protein: 100, incomplete: true as const },
    { date: '2026-11-20', weightKg: 81.8 },
  ]

  it('keeps weigh-ins when importing food, and replaces old food numbers as a set', () => {
    const merged = mergeImport(current, [
      { date: '2026-11-19', calories: 2200, carbs: 250 },
      { date: '2026-11-20', calories: 2100, protein: 150 },
      { date: '2026-11-21', calories: 2000 },
    ])
    expect(merged.entries).toEqual([
      { date: '2026-11-19', weightKg: 82, calories: 2200, carbs: 250 },
      { date: '2026-11-20', weightKg: 81.8, calories: 2100, protein: 150 },
      { date: '2026-11-21', calories: 2000 },
    ])
    expect(merged).toMatchObject({ added: 1, updated: 2 })
  })

  it('keeps food when importing weigh-ins', () => {
    const merged = mergeImport(current, [{ date: '2026-11-19', weightKg: 81.5 }])
    expect(merged.entries[0]).toEqual({ date: '2026-11-19', weightKg: 81.5, calories: 1500, protein: 100, incomplete: true })
  })
})
