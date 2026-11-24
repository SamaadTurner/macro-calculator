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

// The flashlight and focus settings are not in the TypeScript DOM types yet
type CameraCapabilities = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] }

/**
 * Shows the back camera with a box to line the barcode up in, the way scanner apps do, and
 * reads food barcodes from it. The whole picture is read, so a barcode a little outside the
 * box still counts; the box is there to show where to aim and how close to hold the phone.
 */
export function BarcodeScanner({ idPrefix, onFound, onClose }: BarcodeScannerProps) {
  const video = useRef<HTMLVideoElement>(null)
  const track = useRef<MediaStreamTrack | null>(null)
  const [hint, setHint] = useState('Starting the camera…')
  const [error, setError] = useState('')
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false

    async function start() {
      try {
        // A sharper picture reads thin barcode lines better
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch {
        if (!stopped) onClose('The camera could not be opened. Allow camera access for this site, or type the digits under the bars.')
        return
      }
      if (stopped || !video.current) {
        stream.getTracks().forEach(each => each.stop())
        return
      }
      video.current.srcObject = stream
      // Not awaited: some browsers only settle play() once the first frame arrives
      video.current.play().catch(() => undefined)

      const camera = stream.getVideoTracks()[0] ?? null
      track.current = camera
      const capabilities = (camera?.getCapabilities?.() ?? {}) as CameraCapabilities
      if (capabilities.torch) setHasTorch(true)
      if (capabilities.focusMode?.includes('continuous')) {
        camera?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined)
      }

      let reader
      try {
        // In browsers without a built-in reader this downloads the bundled one the first time
        reader = await createBarcodeReader()
      } catch {
        if (!stopped) onClose('The barcode reader could not be loaded. Check the connection, or type the digits under the bars.')
        return
      }
      if (stopped) return
      setHint('Line up the barcode inside the box and hold still.')

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
            // A short buzz, like the scanner apps, where the phone supports it
            navigator.vibrate?.(80)
            onFound(found[0].rawValue)
            return
          }
          setError('')
        } catch {
          setError('Could not read the picture. Hold the barcode flat and well lit.')
        }
        timer = window.setTimeout(look, 200)
      }
      look()
    }
    start()

    return () => {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach(each => each.stop())
    }
    // Runs once per opening; the callbacks come from the parent's current render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleTorch() {
    const next = !torchOn
    track.current
      ?.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      .then(() => setTorchOn(next))
      .catch(() => setHasTorch(false))
  }

  return (
    <div className="food-scanner stack" data-testid={`${idPrefix}-scanner`}>
      <div className="scan-view">
        <video ref={video} className="food-video" muted playsInline aria-label="Camera view for the barcode" />
        <div className="scan-frame" aria-hidden="true">
          <span className="scan-corner scan-corner-tl" />
          <span className="scan-corner scan-corner-tr" />
          <span className="scan-corner scan-corner-bl" />
          <span className="scan-corner scan-corner-br" />
          <span className="scan-line" />
        </div>
      </div>
      <p className="scan-hint" role="status">
        {hint}
      </p>
      <FieldError id={`${idPrefix}-scan-error`} message={error} />
      <div className="actions">
        {hasTorch ? (
          <button type="button" className="btn btn-secondary btn-small" onClick={toggleTorch} aria-pressed={torchOn}>
            {torchOn ? 'Flashlight off' : 'Flashlight'}
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary btn-small" onClick={() => onClose()}>
          Stop scanning
        </button>
      </div>
    </div>
  )
}
