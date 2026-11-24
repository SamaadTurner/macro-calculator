import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { FoodItem } from '../food/openFoodFacts'
import { lookupBarcode, nutrientsFor, searchFoods } from '../food/openFoodFacts'
import type { FoodAmounts } from '../log/draft'
import { parseNumber } from '../engine/units'
import { FieldError, NumberField } from './fields'

interface FoodLookupProps {
  /** Adds the food to the day being typed; the user still presses Save day. */
  onAdd: (name: string, amounts: FoodAmounts) => void
}

type Status = { kind: 'idle' } | { kind: 'loading'; what: string } | { kind: 'message'; text: string }

// The browser's own barcode reader (Chrome on Android, and some desktops). Not in the TypeScript
// DOM types yet, so only the part used here is described.
interface DetectedBarcode {
  rawValue: string
}
interface BarcodeReader {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
type BarcodeReaderClass = new (options: { formats: string[] }) => BarcodeReader

function barcodeReaderClass(): BarcodeReaderClass | null {
  const found = (window as unknown as { BarcodeDetector?: BarcodeReaderClass }).BarcodeDetector
  return found && typeof navigator.mediaDevices?.getUserMedia === 'function' ? found : null
}

const cal = (value: number) => Math.round(value).toLocaleString('en-US')
const grams = (value: number | null) => (value === null ? '?' : `${value} g`)

/**
 * "Add from a food": search Open Food Facts by name or barcode (typed, or scanned where the
 * browser can read barcodes), pick an amount, and add it to the day. It sits inside the log
 * form, so its buttons are type="button" and Enter in its boxes searches instead of saving.
 */
export function FoodLookup({ onAdd }: FoodLookupProps) {
  const [query, setQuery] = useState('')
  const [barcode, setBarcode] = useState('')
  const [results, setResults] = useState<FoodItem[] | null>(null)
  const [chosen, setChosen] = useState<FoodItem | null>(null)
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [scanning, setScanning] = useState(false)
  const request = useRef<AbortController | null>(null)
  const amountBox = useRef<HTMLDivElement>(null)
  const canScan = barcodeReaderClass() !== null

  // Leaving the page (or the tab) cancels a lookup that is still on its way
  useEffect(() => () => request.current?.abort(), [])

  function startRequest(what: string): AbortSignal {
    request.current?.abort()
    request.current = new AbortController()
    setStatus({ kind: 'loading', what })
    return request.current.signal
  }

  function choose(food: FoodItem) {
    setChosen(food)
    setAmount(String(food.serving?.grams ?? 100))
    // Move focus to the amount, so keyboard and screen reader users land on the next step
    setTimeout(() => amountBox.current?.querySelector('input')?.focus(), 0)
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
      setStatus(result.value.length === 0 ? { kind: 'message', text: `Nothing with calories found for "${query.trim()}". Try other words or the barcode.` } : { kind: 'idle' })
    } catch {
      // Cancelled by a newer request; that one shows its own status
    }
  }

  async function handleLookup(code = barcode) {
    setChosen(null)
    setResults(null)
    const signal = startRequest('Looking up the barcode…')
    try {
      const result = await lookupBarcode(code, signal)
      if (!result.ok) {
        setStatus({ kind: 'message', text: result.message })
        return
      }
      setStatus({ kind: 'idle' })
      choose(result.value)
    } catch {
      // Cancelled by a newer request
    }
  }

  function onEnter(action: () => void) {
    return (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return
      // Enter would otherwise submit the log form around this panel
      event.preventDefault()
      action()
    }
  }

  const amountGrams = parseNumber(amount)
  const amountError =
    amount.trim() === '' ? '' : amountGrams === null || Number.isNaN(amountGrams) ? 'Enter the amount as a number' : amountGrams <= 0 || amountGrams > 5000 ? 'Enter between 1 and 5,000 g' : ''
  const amountOk = chosen !== null && amount.trim() !== '' && amountError === ''
  const preview = amountOk ? nutrientsFor(chosen, amountGrams as number) : null

  function handleAdd() {
    if (!chosen || !preview) return
    onAdd(chosen.name, preview)
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
          {canScan ? (
            <button type="button" className="btn btn-secondary btn-small food-scan" onClick={() => setScanning(true)} disabled={scanning}>
              Scan with camera
            </button>
          ) : null}
        </div>

        {scanning ? (
          <BarcodeScanner
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
            {results.map(food => (
              <li key={`${food.code}-${food.name}`}>
                <button type="button" className="food-result" onClick={() => choose(food)}>
                  <span className="food-name">{food.name}</span>
                  <span className="food-detail">
                    {food.brand ? `${food.brand} · ` : ''}
                    {cal(food.per100g.calories)} cal per 100 g
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {chosen ? (
          <div className="food-chosen stack" data-testid="food-chosen">
            <p className="food-name">
              {chosen.name}
              {chosen.brand ? <span className="food-detail"> · {chosen.brand}</span> : null}
            </p>
            <p className="food-detail">
              Per 100 g: {cal(chosen.per100g.calories)} cal · P {grams(chosen.per100g.protein)} · C {grams(chosen.per100g.carbs)} · F {grams(chosen.per100g.fats)}
              {chosen.serving ? `. One serving: ${chosen.serving.label}.` : '.'}
            </p>
            <div ref={amountBox}>
              <NumberField id="food-amount" label="Amount eaten" suffix="g" value={amount} onChange={setAmount} error={amountError} decimals />
            </div>
            {preview ? (
              <p className="food-preview" data-testid="food-preview">
                Adds {cal(preview.calories)} cal · P {grams(preview.protein)} · C {grams(preview.carbs)} · F {grams(preview.fats)}
              </p>
            ) : null}
            <div className="actions">
              <button type="button" className="btn btn-primary btn-small" onClick={handleAdd} disabled={!preview}>
                Add to this day
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setChosen(null)}>
                Back
              </button>
            </div>
          </div>
        ) : null}

        <p className="fine-print">
          Food data from{' '}
          <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">
            Open Food Facts
          </a>{' '}
          (Open Database License), filled in by volunteers. Check it against the label.
        </p>
      </div>
    </details>
  )
}

interface BarcodeScannerProps {
  onFound: (code: string) => void
  /** Closed by the user (no message) or because the camera could not be used (a message). */
  onClose: (message?: string) => void
}

/** Shows the back camera and reads barcodes with the browser's built-in reader. */
function BarcodeScanner({ onFound, onClose }: BarcodeScannerProps) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const Reader = barcodeReaderClass()
    if (!Reader) return
    // UPC-E is left out: its 8 digits use a different check digit than EAN-8
    const reader = new Reader({ formats: ['ean_13', 'ean_8', 'upc_a'] })
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      } catch {
        if (!stopped) onClose('The camera could not be opened. Allow camera access, or type the digits under the bars.')
        return
      }
      if (stopped || !video.current) return
      video.current.srcObject = stream
      // Not awaited: some browsers only settle play() once the first frame arrives
      video.current.play().catch(() => undefined)
      const look = async () => {
        if (stopped || !video.current) return
        // Until the camera has sent a frame there is nothing to read
        if (video.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          timer = window.setTimeout(look, 300)
          return
        }
        try {
          const found = await reader.detect(video.current)
          if (found.length > 0 && !stopped) {
            onFound(found[0].rawValue)
            return
          }
        } catch {
          setError('Could not read the picture. Hold the barcode flat and well lit.')
        }
        timer = window.setTimeout(look, 300)
      }
      look()
    }
    start()

    return () => {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach(track => track.stop())
    }
    // Runs once per opening; the callbacks come from the parent's current render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="food-scanner stack" data-testid="food-scanner">
      <video ref={video} className="food-video" muted playsInline aria-label="Camera view for the barcode" />
      <p className="field-hint">Point the back camera at the barcode.</p>
      <FieldError id="food-scan-error" message={error} />
      <button type="button" className="btn btn-secondary btn-small" onClick={() => onClose()}>
        Stop scanning
      </button>
    </div>
  )
}
