import type { Page } from '@playwright/test'

export interface FakeCameraOptions {
  /** The EAN-13 barcode the camera "sees". */
  barcode: string
  /**
   * 'fake-native': a stand-in for the browser's own reader that reports the code straight away.
   * 'none': no built-in reader, so the app has to load its bundled one and really decode the
   * picture, which shows a drawn barcode.
   * 'blind': a built-in reader that never finds anything, to test closing mid-scan.
   */
  builtInReader: 'fake-native' | 'none' | 'blind'
}

/**
 * Replaces the camera with a canvas showing a real EAN-13 barcode, redrawn a few times a
 * second like a video feed. window.cameraStops counts how often a camera track was stopped.
 */
export async function fakeCamera(page: Page, options: FakeCameraOptions) {
  await page.addInitScript(({ barcode, builtInReader }) => {
    const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
    const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
    const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
    const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']
    const digits = barcode.split('').map(Number)
    let modules = '101'
    for (let i = 1; i <= 6; i++) modules += (PARITY[digits[0]][i - 1] === 'L' ? L : G)[digits[i]]
    modules += '01010'
    for (let i = 7; i <= 12; i++) modules += R[digits[i]]
    modules += '101'

    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 360
    const context = canvas.getContext('2d')!
    const draw = () => {
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#000'
      const moduleWidth = 4
      const left = (canvas.width - modules.length * moduleWidth) / 2
      for (let i = 0; i < modules.length; i++) {
        if (modules[i] === '1') context.fillRect(left + i * moduleWidth, 60, moduleWidth, 240)
      }
    }
    draw()
    setInterval(draw, 100)

    const counts = window as unknown as { cameraStops: number }
    counts.cameraStops = 0
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const stream = canvas.captureStream(10)
          for (const track of stream.getTracks()) {
            const stop = track.stop.bind(track)
            track.stop = () => {
              counts.cameraStops++
              stop()
            }
          }
          return stream
        },
      },
    })

    const win = window as unknown as { BarcodeDetector?: unknown }
    if (builtInReader === 'none') {
      delete win.BarcodeDetector
    } else {
      const found = builtInReader === 'blind' ? [] : [{ rawValue: barcode }]
      win.BarcodeDetector = class {
        async detect() {
          return found
        }
      }
    }
  }, options)
}

/** No camera at all, as on a desktop without one or when the browser hides it. */
export async function noCamera(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
  })
}
