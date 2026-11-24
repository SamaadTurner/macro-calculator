// Draws the app icons (PNG) from the same design as public/favicon.svg, using the Playwright
// browser already installed for the tests. Run with: node scripts/make-icons.mjs
// "any" icons keep the rounded square; the maskable and Apple icons fill the whole square,
// because the phone cuts its own shape and the ring must stay inside the middle 80%.
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../public/', import.meta.url))
const BG = '#1C1814'
const RING = '#D9A066'

function ring(scale) {
  // The favicon's ring on a 64 unit square, shrunk around the centre by `scale`.
  return `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)"><circle cx="32" cy="32" r="18" fill="none" stroke="${RING}" stroke-width="7" stroke-dasharray="85 28" stroke-linecap="round" transform="rotate(-90 32 32)"/></g>`
}

const designs = {
  'icon-192.png': { size: 192, svg: `<rect width="64" height="64" rx="14" fill="${BG}"/>${ring(1)}` },
  'icon-512.png': { size: 512, svg: `<rect width="64" height="64" rx="14" fill="${BG}"/>${ring(1)}` },
  'icon-maskable-512.png': { size: 512, svg: `<rect width="64" height="64" fill="${BG}"/>${ring(0.8)}` },
  'apple-touch-icon.png': { size: 180, svg: `<rect width="64" height="64" fill="${BG}"/>${ring(0.9)}` },
}

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [file, { size, svg }] of Object.entries(designs)) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">${svg}</svg></body></html>`,
  )
  await page.screenshot({ path: OUT + file, omitBackground: true })
  console.log('wrote', file)
}
await browser.close()
