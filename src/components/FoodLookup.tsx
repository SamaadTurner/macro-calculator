import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { FoodHit, FoodItem } from '../food/openFoodFacts'
import { loadProduct, lookupBarcode, searchFoods } from '../food/openFoodFacts'
import { canUseCamera } from '../food/barcodeReader'
import type { FoodAmounts } from '../log/entries'
import { BarcodeScanner } from './BarcodeScanner'
import { ChosenFood } from './ChosenFood'

interface FoodLookupProps {
  /** Adds the food to the day being typed; the user still presses Save day. */
  onAdd: (name: string, amounts: FoodAmounts) => void
}

type Status = { kind: 'idle' } | { kind: 'loading'; what: string } | { kind: 'message'; text: string }

/** Where the food numbers come from; shown under the Log panel and the scan sheet. */
export function FoodDataNote() {
  return (
    <p className="fine-print">
      Food data from{' '}
      <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">
        Open Food Facts
      </a>{' '}
      (Open Database License), filled in by volunteers. Check it against the label.
    </p>
  )
}

/**
 * "Add from a food": search Open Food Facts by name or barcode (typed, or scanned with the
 * camera), pick an amount, and add it to the day. It sits inside the log form, so its
 * buttons are type="button" and Enter in its boxes searches instead of saving.
 */
export function FoodLookup({ onAdd }: FoodLookupProps) {
  const [query, setQuery] = useState('')
  const [barcode, setBarcode] = useState('')
  const [results, setResults] = useState<FoodHit[] | null>(null)
  const [chosen, setChosen] = useState<FoodItem | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [scanning, setScanning] = useState(false)
  const request = useRef<AbortController | null>(null)

  // Leaving the page (or the tab) cancels a lookup that is still on its way
  useEffect(() => () => request.current?.abort(), [])

  function startRequest(what: string): AbortSignal {
    request.current?.abort()
    request.current = new AbortController()
    setStatus({ kind: 'loading', what })
    return request.current.signal
  }

  async function handleSearch() {
    setChosen(null)
    const signal = startRequest('Searching Open Food Facts…')
    try {
      const result = await searchFoods(query, signal)
      if (!result.ok) {
        setResults(null)
        setStatus({ kind: 'message', text: result.message })
        return
      }
      setResults(result.value)
      setStatus(result.value.length === 0 ? { kind: 'message', text: `Nothing found for "${query.trim()}". Try other words or the barcode.` } : { kind: 'idle' })
    } catch {
      // Cancelled by a newer request; that one shows its own status
    }
  }

  async function show(load: (signal: AbortSignal) => ReturnType<typeof loadProduct>, what: string) {
    const signal = startRequest(what)
    try {
      const result = await load(signal)
      if (!result.ok) {
        setStatus({ kind: 'message', text: result.message })
        return
      }
      setStatus({ kind: 'idle' })
      setChosen(result.value)
    } catch {
      // Cancelled by a newer request
    }
  }

  function handleLookup(code = barcode) {
    setChosen(null)
    setResults(null)
    show(signal => lookupBarcode(code, signal), 'Looking up the barcode…')
  }

  // Search results only have names, so picking one loads its numbers
  function handlePick(hit: FoodHit) {
    show(signal => loadProduct(hit.code, signal), `Loading ${hit.name}…`)
  }

  function onEnter(action: () => void) {
    return (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return
      // Enter would otherwise submit the log form around this panel
      event.preventDefault()
      action()
    }
  }

  function handleAdd(food: FoodItem, amounts: FoodAmounts) {
    onAdd(food.name, amounts)
    setChosen(null)
    setResults(null)
    setQuery('')
    setBarcode('')
    setStatus({ kind: 'idle' })
  }

  return (
    <details className="details food-lookup">
      <summary>Add from a food (search or barcode)</summary>
      <div className="stack details-body">
        <p className="field-hint">
          Search words and barcodes go to Open Food Facts, a free public food database. Nothing from your log is sent.
        </p>

        <div className="field">
          <label htmlFor="food-search" className="field-label">
            Food name
          </label>
          <div className="food-row">
            <div className="number-input food-input">
              <input
                id="food-search"
                type="search"
                autoComplete="off"
                placeholder="greek yogurt"
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={onEnter(handleSearch)}
              />
            </div>
            <button type="button" className="btn btn-secondary btn-small" onClick={handleSearch}>
              Search
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="food-barcode" className="field-label">
            Barcode
          </label>
          <div className="food-row">
            <div className="number-input food-input">
              <input
                id="food-barcode"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="digits under the bars"
                value={barcode}
                onChange={event => setBarcode(event.target.value)}
                onKeyDown={onEnter(() => handleLookup())}
              />
            </div>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => handleLookup()}>
              Look up
            </button>
          </div>
          {canUseCamera() ? (
            <button type="button" className="btn btn-secondary btn-small food-scan" onClick={() => setScanning(true)} disabled={scanning}>
              Scan with camera
            </button>
          ) : null}
        </div>

        {scanning ? (
          <BarcodeScanner
            idPrefix="food"
            onFound={code => {
              setScanning(false)
              setBarcode(code)
              handleLookup(code)
            }}
            onClose={message => {
              setScanning(false)
              if (message) setStatus({ kind: 'message', text: message })
            }}
          />
        ) : null}

        <p className="food-status" role="status" data-testid="food-status">
          {status.kind === 'loading' ? status.what : status.kind === 'message' ? status.text : ''}
        </p>

        {results && results.length > 0 && !chosen ? (
          <ul className="food-results" aria-label="Foods found">
            {results.map(hit => (
              <li key={hit.code}>
                <button type="button" className="food-result" onClick={() => handlePick(hit)}>
                  <span className="food-name">{hit.name}</span>
                  {hit.brand ? <span className="food-detail">{hit.brand}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {chosen ? (
          <ChosenFood
            key={chosen.code + chosen.name}
            food={chosen}
            idPrefix="food"
            addLabel="Add to this day"
            onAdd={amounts => handleAdd(chosen, amounts)}
            onBack={() => setChosen(null)}
          />
        ) : null}

        <FoodDataNote />
      </div>
    </details>
  )
}
