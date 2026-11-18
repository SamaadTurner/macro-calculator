export const KG_PER_LB = 0.45359237
export const CM_PER_INCH = 2.54

export const lbToKg = (lb: number) => lb * KG_PER_LB
export const kgToLb = (kg: number) => kg / KG_PER_LB
export const feetInchesToCm = (feet: number, inches: number) => (feet * 12 + inches) * CM_PER_INCH

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Splits a height into whole feet and inches rounded to one decimal, never showing 12 inches. */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / CM_PER_INCH
  let feet = Math.floor(totalInches / 12)
  let inches = roundTo(totalInches - feet * 12, 1)
  if (inches >= 12) {
    feet += 1
    inches = 0
  }
  return { feet, inches }
}

/**
 * Reads a number the user typed. Returns null for an empty box and NaN for text that
 * is not a number, so the checks can give different messages for each.
 */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  return Number(trimmed)
}
