// Reads barcodes from the camera picture. Chrome on Android (and some desktops) has a reader
// built in (BarcodeDetector). Everywhere else (Safari, Firefox, Chrome on Windows) the app
// loads zxing-wasm through the barcode-detector package, which copies the same interface.
// It is only downloaded when the camera is opened, and its .wasm file is served from this
// site, not from the package's default CDN.

export interface DetectedBarcode {
  rawValue: string
}

export interface BarcodeReader {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}

interface ReaderClass {
  new (options: { formats: string[] }): BarcodeReader
  getSupportedFormats?: () => Promise<string[]>
}

// Food barcodes. UPC-E is left out: its 8 digits use a different check digit than EAN-8,
// and nearly every UPC-E package also prints the full code.
const FORMATS = ['ean_13', 'ean_8', 'upc_a'] as const

export function canUseCamera(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
}

/** The browser's own reader, if it reads food barcodes. */
async function builtInReader(): Promise<BarcodeReader | null> {
  const Native = (window as unknown as { BarcodeDetector?: ReaderClass }).BarcodeDetector
  if (!Native) return null
  try {
    // Some browsers have the class but read nothing on that device (an empty list)
    const supported: readonly string[] = Native.getSupportedFormats ? await Native.getSupportedFormats() : FORMATS
    const formats = FORMATS.filter(format => supported.includes(format))
    return formats.length > 0 ? new Native({ formats }) : null
  } catch {
    return null
  }
}

let wasmReady = false

async function bundledReader(): Promise<BarcodeReader> {
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  if (!wasmReady) {
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
      },
    })
    wasmReady = true
  }
  return new BarcodeDetector({ formats: [...FORMATS] })
}

export async function createBarcodeReader(): Promise<BarcodeReader> {
  return (await builtInReader()) ?? bundledReader()
}
