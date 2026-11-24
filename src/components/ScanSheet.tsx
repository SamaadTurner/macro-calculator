import { useEffect, useRef, useState } from 'react'
import type { FoodItem } from '../food/openFoodFacts'
import { lookupBarcode } from '../food/openFoodFacts'
import { canUseCamera } from '../food/barcodeReader'
import type { FoodAmounts } from '../log/entries'
import { BarcodeScanner } from './BarcodeScanner'
import { ChosenFood } from './ChosenFood'
import { FoodDataNote } from './FoodLookup'

interface ScanSheetProps {
  open: boolean
  /** What the add button says: where the food goes from the tab the user is on. */
  addLabel: string
  onAdd: (name: string, amounts: FoodAmounts) => void
  onClose: () => void
}

/**
 * The sheet behind the scan button that is on every tab: the camera opens straight away,
 * the digits can be typed instead, then the user picks the amount and adds it.
 */
export function ScanSheet({ open, addLabel, onAdd, onClose }: ScanSheetProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  // showModal keeps keyboard focus inside the sheet and closes it with Escape
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog ref={dialog} className="scan-sheet" aria-labelledby="scan-title" onClose={onClose}>
      {open ? <ScanSheetBody addLabel={addLabel} onAdd={onAdd} onClose={onClose} /> : null}
    </dialog>
  )
}

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'message'; text: string }

/** Mounted only while the sheet is open, so every opening starts fresh and stops the camera on close. */
function ScanSheetBody({ addLabel, onAdd, onClose }: Omit<ScanSheetProps, 'open'>) {
  const camera = canUseCamera()
  const [scanning, setScanning] = useState(camera)
  const [barcode, setBarcode] = useState('')
  const [chosen, setChosen] = useState<FoodItem | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => request.current?.abort(), [])

  async function handleLookup(code = barcode) {
    setChosen(null)
    request.current?.abort()
    request.current = new AbortController()
    setStatus({ kind: 'loading' })
    try {
      const result = await lookupBarcode(code, request.current.signal)
      if (!result.ok) {
        setStatus({ kind: 'message', text: result.message })
        return
      }
      setStatus({ kind: 'idle' })
      setChosen(result.value)
    } catch {
      // Cancelled by a newer lookup or by closing the sheet
    }
  }

  return (
    <div className="stack">
      <div className="scan-head">
        <h2 id="scan-title" className="card-title">
          Scan food
        </h2>
        <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="field-hint">The barcode goes to Open Food Facts, a free public food database. Nothing from your log is sent.</p>

      {scanning && !chosen ? (
        <BarcodeScanner
          idPrefix="scan"
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

      {!chosen ? (
        <form
          className="field"
          onSubmit={event => {
            event.preventDefault()
            handleLookup()
          }}
        >
          <label htmlFor="scan-barcode" className="field-label">
            {camera ? 'Or type the barcode' : 'Barcode'}
          </label>
          <div className="food-row">
            <div className="number-input food-input">
              <input
                id="scan-barcode"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="digits under the bars"
                value={barcode}
                onChange={event => setBarcode(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-secondary btn-small">
              Look up
            </button>
          </div>
          {camera && !scanning ? (
            <button type="button" className="btn btn-secondary btn-small food-scan" onClick={() => setScanning(true)}>
              Scan again
            </button>
          ) : null}
        </form>
      ) : null}

      <p className="food-status" role="status" data-testid="scan-status">
        {status.kind === 'loading' ? 'Looking up the barcode…' : status.kind === 'message' ? status.text : ''}
      </p>

      {chosen ? (
        <ChosenFood
          key={chosen.code}
          food={chosen}
          idPrefix="scan"
          addLabel={addLabel}
          onAdd={amounts => {
            onAdd(chosen.name, amounts)
            onClose()
          }}
          onBack={() => {
            setChosen(null)
            setScanning(camera)
          }}
        />
      ) : null}

      <FoodDataNote />
    </div>
  )
}
