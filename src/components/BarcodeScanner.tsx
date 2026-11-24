import { useEffect, useRef, useState } from 'react'
import { createBarcodeReader } from '../food/barcodeReader'
import { FieldError } from './fields'

interface BarcodeScannerProps {
  /** Makes the ids unique when the Log panel and the scan sheet both have a scanner. */
  idPrefix: string
  onFound: (code: string) => void
  /** Closed by the user (no message) or because the camera could not be used (a message). */
  onClose: (message?: string) => void
}

/** Shows the back camera and reads food barcodes from it. */
export function BarcodeScanner({ idPrefix, onFound, onClose }: BarcodeScannerProps) {
  const video = useRef<HTMLVideoElement>(null)
  const [hint, setHint] = useState('Starting the camera…')
  const [error, setError] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      } catch {
        if (!stopped) onClose('The camera could not be opened. Allow camera access for this site, or type the digits under the bars.')
        return
      }
      if (stopped || !video.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      video.current.srcObject = stream
      // Not awaited: some browsers only settle play() once the first frame arrives
      video.current.play().catch(() => undefined)

      let reader
      try {
        // In browsers without a built-in reader this downloads the bundled one the first time
        reader = await createBarcodeReader()
      } catch {
        if (!stopped) onClose('The barcode reader could not be loaded. Check the connection, or type the digits under the bars.')
        return
      }
      if (stopped) return
      setHint('Point the back camera at the barcode and hold it still.')

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
          setError('')
        } catch {
          setError('Could not read the picture. Hold the barcode flat and well lit.')
        }
        timer = window.setTimeout(look, 250)
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
    <div className="food-scanner stack" data-testid={`${idPrefix}-scanner`}>
      <video ref={video} className="food-video" muted playsInline aria-label="Camera view for the barcode" />
      <p className="field-hint" role="status">
        {hint}
      </p>
      <FieldError id={`${idPrefix}-scan-error`} message={error} />
      <button type="button" className="btn btn-secondary btn-small" onClick={() => onClose()}>
        Stop scanning
      </button>
    </div>
  )
}
