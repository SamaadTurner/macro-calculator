import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fakeCamera, noCamera } from './camera'

// The scan button on every tab. Open Food Facts is faked; the camera is a canvas.
const TODAY = new Date(2026, 10, 24, 9, 0)

test.use({ serviceWorkers: 'block' })

const yogurt = {
  code: '9310653103609',
  product_name: 'Greek Yogurt',
  brands: 'Chobani',
  serving_size: '170 g',
  serving_quantity: 170,
  nutriments: { 'energy-kcal_100g': 59, proteins_100g: 10, carbohydrates_100g: 3.6, fat_100g: 0.4 },
}

/** Answers product lookups; returns the codes that were asked for. */
async function fakeProducts(page: Page): Promise<string[]> {
  const asked: string[] = []
  await page.route(/^https:\/\/(world|search)\.openfoodfacts\.org\//, async route => {
    const match = new URL(route.request().url()).pathname.match(/^\/api\/v2\/product\/(\d+)$/)
    const cors = { 'access-control-allow-origin': '*' }
    if (!match) return route.fulfill({ status: 500, headers: cors, body: 'unexpected request' })
    asked.push(match[1])
    const body = match[1] === yogurt.code ? { status: 1, product: yogurt } : { status: 0 }
    return route.fulfill({ status: match[1] === yogurt.code ? 200 : 404, headers: cors, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return asked
}

async function open(page: Page, hash: string) {
  await page.clock.setFixedTime(TODAY)
  await page.goto(`./${hash}`)
}

const scanButton = (page: Page) => page.getByRole('button', { name: 'Scan a barcode' })
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Scan a barcode' })

test('the scan button is on every tab', async ({ page }) => {
  await open(page, '#plan')
  await expect(scanButton(page)).toBeVisible()
  for (const name of ['Log', 'Check-in', 'Plan']) {
    await page.getByRole('link', { name, exact: true }).click()
    await expect(scanButton(page)).toBeVisible()
  }
})

test('from the Plan tab a scanned food is saved into today', async ({ page }) => {
  const asked = await fakeProducts(page)
  await fakeCamera(page, { barcode: yogurt.code, builtInReader: 'fake-native' })
  await open(page, '#plan')
  await scanButton(page).click()
  await expect(sheet(page)).toBeVisible()
  await expect(sheet(page).getByTestId('scan-chosen')).toContainText('Greek Yogurt')
  await expect(sheet(page).getByLabel('Amount eaten')).toHaveValue('170')
  await sheet(page).getByLabel('Amount eaten').fill('200')
  await sheet(page).getByRole('button', { name: 'Add to today' }).click()

  await expect(sheet(page)).toBeHidden()
  await expect(page.locator('.toast')).toHaveText('Added Greek Yogurt (118 cal) to today. Today: 118 cal.')
  expect(asked).toEqual([yogurt.code])
  // The camera was switched off
  expect(await page.evaluate(() => (window as unknown as { cameraStops: number }).cameraStops)).toBeGreaterThan(0)

  // It is in the log, and a second scan adds to it
  await scanButton(page).click()
  await sheet(page).getByRole('button', { name: 'Add to today' }).click()
  await expect(page.locator('.toast')).toHaveText('Added Greek Yogurt (100 cal) to today. Today: 218 cal.')
  await page.getByRole('link', { name: 'Log', exact: true }).click()
  await expect(page.getByRole('row', { name: /Nov 24/ })).toContainText('218')
})

test('from the Log tab a scanned food fills the form, and the day is saved as usual', async ({ page }) => {
  await fakeProducts(page)
  await fakeCamera(page, { barcode: yogurt.code, builtInReader: 'fake-native' })
  await open(page, '#log')
  await page.getByLabel('Calories eaten').fill('1000')
  await scanButton(page).click()
  await sheet(page).getByRole('button', { name: 'Add to the form' }).click()
  await expect(page.locator('.toast')).toHaveText('Added Greek Yogurt (100 cal). Press Save day to keep it.')
  await expect(page.getByLabel('Calories eaten')).toHaveValue('1100')
  await expect(page.getByLabel('Protein')).toHaveValue('17')
  await page.getByRole('button', { name: 'Save day' }).click()
  await expect(page.getByRole('row', { name: /Nov 24/ })).toContainText('1,100')
})

test('in a browser without a built-in reader the bundled one reads the barcode', async ({ page }) => {
  const asked = await fakeProducts(page)
  // No BarcodeDetector: the app has to download zxing-wasm and decode the drawn barcode
  await fakeCamera(page, { barcode: yogurt.code, builtInReader: 'none' })
  const wasm = page.waitForResponse(response => response.url().endsWith('.wasm'))
  await open(page, '#checkin')
  await scanButton(page).click()
  // The reader's .wasm comes from this site, not a CDN
  expect(new URL((await wasm).url()).host).toBe(new URL(page.url()).host)
  await expect(sheet(page).getByTestId('scan-chosen')).toContainText('Greek Yogurt', { timeout: 20_000 })
  expect(asked).toEqual([yogurt.code])
})

test('without a camera the sheet asks for the digits', async ({ page }) => {
  await fakeProducts(page)
  await noCamera(page)
  await open(page, '#plan')
  await scanButton(page).click()
  await expect(sheet(page).getByTestId('scan-scanner')).toHaveCount(0)
  await sheet(page).getByLabel('Barcode', { exact: true }).fill('9310653103608')
  await sheet(page).getByRole('button', { name: 'Look up' }).click()
  await expect(sheet(page).getByTestId('scan-status')).toContainText('does not look like a barcode')
  await sheet(page).getByLabel('Barcode', { exact: true }).fill(yogurt.code)
  await sheet(page).getByLabel('Barcode', { exact: true }).press('Enter')
  await expect(sheet(page).getByTestId('scan-chosen')).toContainText('Greek Yogurt')
})

test('a camera that is refused falls back to typing, and Escape closes the sheet', async ({ page }) => {
  await fakeProducts(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => { throw new DOMException('Permission denied', 'NotAllowedError') } },
    })
  })
  await open(page, '#plan')
  await scanButton(page).click()
  await expect(sheet(page).getByTestId('scan-status')).toContainText('The camera could not be opened')
  await expect(sheet(page).getByLabel('Or type the barcode')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toBeHidden()
  await expect(scanButton(page)).toBeVisible()
})

test('closing the sheet while scanning stops the camera', async ({ page }) => {
  await fakeProducts(page)
  // A reader that never finds the code, so the camera keeps running until the sheet closes
  await fakeCamera(page, { barcode: yogurt.code, builtInReader: 'blind' })
  await open(page, '#plan')
  await scanButton(page).click()
  await expect(sheet(page).getByText('Point the back camera at the barcode')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { cameraStops: number }).cameraStops)).toBe(0)
  await sheet(page).getByRole('button', { name: 'Close' }).click()
  await expect(sheet(page)).toBeHidden()
  await expect.poll(() => page.evaluate(() => (window as unknown as { cameraStops: number }).cameraStops)).toBeGreaterThan(0)
})

for (const scheme of ['light', 'dark'] as const) {
  test(`the scan sheet passes axe in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await fakeProducts(page)
    await fakeCamera(page, { barcode: yogurt.code, builtInReader: 'fake-native' })
    await open(page, '#plan')
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)))
    let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
    await scanButton(page).click()
    await expect(sheet(page).getByTestId('scan-chosen')).toBeVisible()
    results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
}
