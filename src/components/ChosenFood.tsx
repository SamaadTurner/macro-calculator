import { useEffect, useRef, useState } from 'react'
import type { FoodAmount, FoodItem } from '../food/openFoodFacts'
import { defaultAmount, nutrientsFor } from '../food/openFoodFacts'
import type { FoodAmounts } from '../log/entries'
import { parseNumber, roundTo } from '../engine/units'
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

type Kind = FoodAmount['kind']

/**
 * One food picked from a search or a barcode, laid out the way the big logging apps do it:
 * a serving size (the one on the label, or grams / millilitres), a number of servings that
 * starts at 1, and the totals for that amount. Give it a key per food so it starts over.
 */
export function ChosenFood({ food, idPrefix, addLabel, onAdd, onBack }: ChosenFoodProps) {
  const start = defaultAmount(food)
  const [kind, setKind] = useState<Kind>(start.kind)
  const [amount, setAmount] = useState(String(start.kind === 'servings' ? start.count : start.value))
  const amountBox = useRef<HTMLDivElement>(null)

  // Focus the amount, so keyboard and screen reader users land on the next step
  useEffect(() => {
    amountBox.current?.querySelector('input')?.focus()
  }, [])

  const unitName = food.unit === 'ml' ? 'ml' : 'g'
  const quantity = food.serving?.quantity ?? null

  function changeKind(next: Kind) {
    if (next === kind) return
    const value = parseNumber(amount)
    const usable = value !== null && !Number.isNaN(value) && value > 0
    // Keep the same amount when the serving weight is known: 2 servings of 68 g = 136 g
    if (usable && quantity) setAmount(String(next === 'quantity' ? roundTo(value * quantity, 1) : roundTo(value / quantity, 2)))
    else setAmount(next === 'servings' ? '1' : String(quantity ?? 100))
    setKind(next)
  }

  const value = parseNumber(amount)
  const max = kind === 'servings' ? 50 : 5000
  const error =
    amount.trim() === ''
      ? ''
      : value === null || Number.isNaN(value)
        ? 'Enter a number'
        : value <= 0 || value > max
          ? kind === 'servings'
            ? 'Enter between 0.1 and 50 servings'
            : `Enter between 1 and 5,000 ${unitName}`
          : ''
  const chosenAmount: FoodAmount | null = amount.trim() === '' || error ? null : kind === 'servings' ? { kind, count: value as number } : { kind, value: value as number }
  const total = chosenAmount ? nutrientsFor(food, chosenAmount) : null

  return (
    <div className="food-chosen stack" data-testid={`${idPrefix}-chosen`}>
      <p className="food-name">
        {food.name}
        {food.brand ? <span className="food-detail"> · {food.brand}</span> : null}
      </p>

      <div className="field">
        <label htmlFor={`${idPrefix}-unit`} className="field-label">
          Serving size
        </label>
        <div className="select-input">
          <select id={`${idPrefix}-unit`} value={kind} onChange={event => changeKind(event.target.value as Kind)}>
            {food.serving ? <option value="servings">{food.serving.label}</option> : null}
            {food.per100 ? <option value="quantity">{food.unit === 'ml' ? 'Millilitres (ml)' : 'Grams (g)'}</option> : null}
          </select>
        </div>
      </div>

      <div ref={amountBox}>
        <NumberField
          id={`${idPrefix}-amount`}
          label={kind === 'servings' ? 'Number of servings' : `Amount (${unitName})`}
          suffix={kind === 'servings' ? 'servings' : unitName}
          value={amount}
          onChange={setAmount}
          error={error}
          decimals
        />
      </div>

      {total ? (
        <div className="food-total" data-testid={`${idPrefix}-preview`}>
          <p className="food-calories">
            <strong>{cal(total.calories)}</strong> cal
          </p>
          <p className="food-macros">
            Protein {grams(total.protein)} · Carbs {grams(total.carbs)} · Fat {grams(total.fats)}
          </p>
        </div>
      ) : null}

      <p className="field-hint">
        {food.serving
          ? 'One serving is the size printed on the package. Check the numbers against your label.'
          : `No serving size on file for this product, so it is counted by ${food.unit === 'ml' ? 'millilitres' : 'weight'}. Use the weight on the package.`}
      </p>

      <div className="actions">
        <button type="button" className="btn btn-primary btn-small" onClick={() => total && onAdd(total)} disabled={!total}>
          {addLabel}
        </button>
        <button type="button" className="btn btn-secondary btn-small" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}
