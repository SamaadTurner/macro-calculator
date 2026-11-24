import { useEffect, useRef, useState } from 'react'
import type { FoodItem } from '../food/openFoodFacts'
import { nutrientsFor } from '../food/openFoodFacts'
import type { FoodAmounts } from '../log/entries'
import { parseNumber } from '../engine/units'
import { NumberField } from './fields'

const cal = (value: number) => Math.round(value).toLocaleString('en-US')
const grams = (value: number | null) => (value === null ? '?' : `${value} g`)

interface ChosenFoodProps {
  food: FoodItem
  idPrefix: string
  addLabel: string
  onAdd: (amounts: FoodAmounts) => void
  onBack: () => void
}

/**
 * One food picked from a search or a barcode: its numbers, the amount eaten (one serving to
 * start with, when the package gives its weight) and what that adds. Give it a key per food
 * so the amount starts over for each one.
 */
export function ChosenFood({ food, idPrefix, addLabel, onAdd, onBack }: ChosenFoodProps) {
  const [amount, setAmount] = useState(String(food.serving?.grams ?? 100))
  const amountBox = useRef<HTMLDivElement>(null)

  // Focus the amount, so keyboard and screen reader users land on the next step
  useEffect(() => {
    amountBox.current?.querySelector('input')?.focus()
  }, [])

  const value = parseNumber(amount)
  const error =
    amount.trim() === '' ? '' : value === null || Number.isNaN(value) ? 'Enter the amount as a number' : value <= 0 || value > 5000 ? 'Enter between 1 and 5,000 g' : ''
  const preview = amount.trim() !== '' && error === '' ? nutrientsFor(food, value as number) : null

  return (
    <div className="food-chosen stack" data-testid={`${idPrefix}-chosen`}>
      <p className="food-name">
        {food.name}
        {food.brand ? <span className="food-detail"> · {food.brand}</span> : null}
      </p>
      <p className="food-detail">
        Per 100 g: {cal(food.per100g.calories)} cal · P {grams(food.per100g.protein)} · C {grams(food.per100g.carbs)} · F {grams(food.per100g.fats)}
        {food.serving ? `. One serving: ${food.serving.label}.` : '.'}
      </p>
      <div ref={amountBox}>
        <NumberField id={`${idPrefix}-amount`} label="Amount eaten" suffix="g" value={amount} onChange={setAmount} error={error} decimals />
      </div>
      {preview ? (
        <p className="food-preview" data-testid={`${idPrefix}-preview`}>
          Adds {cal(preview.calories)} cal · P {grams(preview.protein)} · C {grams(preview.carbs)} · F {grams(preview.fats)}
        </p>
      ) : null}
      <div className="actions">
        <button type="button" className="btn btn-primary btn-small" onClick={() => preview && onAdd(preview)} disabled={!preview}>
          {addLabel}
        </button>
        <button type="button" className="btn btn-secondary btn-small" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}
