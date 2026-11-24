import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { fakeCamera, noCamera } from './camera'

// Open Food Facts is never called for real: every request to it is answered here, so the
// tests do not depend on (or add load to) their servers.
const TODAY = new Date(2026, 10, 24, 9, 0)

// The service worker could answer requests before page.route sees them
test.use({ serviceWorkers: 'block' })

const yogurt = {
  code: '9310653103609',
  product_name: 'Greek Yogurt',
  brands: 'Chobani',
  serving_size: '170 g',
  serving_quantity: 170,
  nutriments: { 'energy-kcal_100g': 59, proteins_100g: 10, carbohydrates_100g: 3.6, fat_100g: 0.4 },
}
const oats = {
  code: '20048402',
  product_name: 'Rolled Oats',
  brands: '',
  nutriments: { 'energy-kj_100g': 1569, proteins_100g: 13, carbohydrates_100g: 60, fat_100g: 7 },
}

// No calories listed, so it can be found but not added
const gum = { code: '4009900000000', product_name: 'Chewing Gum', brands: 'Minty', nutriments: {} }
const productsByCode: Record<string, object> = { [yogurt.code]: yogurt, [oats.code]: oats, [gum.code]: gum }
// The search service answers with names only, brands tagged with a language
const hits = [
  { code: yogurt.code, product_name: yogurt.product_name, brands: ['xx:Chobani'] },
  { code: oats.code, product_name: oats.product_name },
  { code: gum.code, product_name: gum.product_name, brands: ['xx:Minty'] },
  { code: '2000000085748', product_name: '' },
]

interface FakeOff {
  searches: string[]
  products: string[]
}

/** Answers Open Food Facts requests and records what was asked. */
async function fakeOpenFoodFacts(page: Page, options: { searchStatus?: number; product?: object | null } = {}): Promise<FakeOff> {
  const seen: FakeOff = { searches: [], products: [] }
  const cors = { 'access-control-allow-origin': '*' }
  await page.route('https://search.openfoodfacts.org/**', async (route: Route) => {
    const url = new URL(route.request().url())
    seen.searches.push(url.searchParams.get('q') ?? '')
    if (options.searchStatus) return route.fulfill({ status: options.searchStatus, headers: cors, body: '' })
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ count: 4, hits }) })
  })
  await page.route('https://world.openfoodfacts.org/**', async (route: Route) => {
    const url = new URL(route.request().url())
    const product = url.pathname.match(/^\/api\/v2\/product\/(\d+)$/)
    if (product) {
      seen.products.push(product[1])
      const found = options.product === null ? undefined : (options.product ?? productsByCode[product[1]])
      if (!found) return route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: JSON.stringify({ status: 0 }) })
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ status: 1, product: found }) })
    }
    return route.fulfill({ status: 500, headers: cors, body: 'unexpected request' })
  })
  return seen
}

async function openFoodPanel(page: Page) {
  await page.clock.setFixedTime(TODAY)
  await page.goto('./#log')
  await expect(page.getByRole('heading', { name: 'Track your weight' })).toBeVisible()
  await page.getByText('Add from a food (search or barcode)').click()
}

test('searches a food, picks an amount and adds it to the day', async ({ page }) => {
  const seen = await fakeOpenFoodFacts(page)
  await openFoodPanel(page)
  await expect(page.getByText('Search words and barcodes go to Open Food Facts')).toBeVisible()

  await page.getByLabel('Food name').fill('greek yogurt')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const list = page.getByRole('list', { name: 'Foods found' })
  // The result without a name is left out; the brand loses its language tag
  await expect(list.getByRole('listitem')).toHaveCount(3)
  await expect(list.getByRole('button', { name: /Greek Yogurt\s*Chobani/ })).toBeVisible()
  await list.getByRole('button', { name: /Greek Yogurt/ }).click()

  // The amount starts at one serving
  const chosen = page.getByTestId('food-chosen')
  await expect(chosen).toContainText('One serving: 170 g')
  await expect(page.getByLabel('Amount eaten')).toBeFocused()
  await expect(page.getByLabel('Amount eaten')).toHaveValue('170')
  await expect(page.getByTestId('food-preview')).toHaveText('Adds 100 cal · P 17 g · C 6.1 g · F 0.7 g')
  await page.getByLabel('Amount eaten').fill('250')
  await expect(page.getByTestId('food-preview')).toHaveText('Adds 148 cal · P 25 g · C 9 g · F 1 g')
  await page.getByRole('button', { name: 'Add to this day' }).click()

  await expect(page.locator('.toast')).toHaveText('Added Greek Yogurt (148 cal). Press Save day to keep it.')
  await expect(page.getByLabel('Calories eaten')).toHaveValue('148')
  await expect(page.getByLabel('Protein')).toHaveValue('25')
  await expect(page.getByLabel('Carbs')).toHaveValue('9')

  // A second food adds to the first
  await page.getByLabel('Food name').fill('oats')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await list.getByRole('button', { name: /Rolled Oats/ }).click()
  // kJ-only oats are converted (1569 kJ = 375 cal); no serving weight, so the amount starts at 100 g
  await expect(page.getByTestId('food-chosen')).toContainText('Per 100 g: 375 cal')
  await expect(page.getByLabel('Amount eaten')).toHaveValue('100')
  await page.getByLabel('Amount eaten').fill('40')
  await page.getByRole('button', { name: 'Add to this day' }).click()
  await expect(page.getByLabel('Calories eaten')).toHaveValue('298')
  await expect(page.getByLabel('Protein')).toHaveValue('30.2')

  await page.getByRole('button', { name: 'Save day' }).click()
  await expect(page.getByRole('row', { name: /Nov 24/ })).toContainText('298')
  // Only the search words, and the codes of the picked foods, went to Open Food Facts
  expect(seen.searches).toEqual(['greek yogurt', 'oats'])
  expect(seen.products).toEqual([yogurt.code, oats.code])
})

test('a food with no calories listed can be found but not added', async ({ page }) => {
  await fakeOpenFoodFacts(page)
  await openFoodPanel(page)
  await page.getByLabel('Food name').fill('gum')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('list', { name: 'Foods found' }).getByRole('button', { name: /Chewing Gum/ }).click()
  await expect(page.getByTestId('food-status')).toContainText('has no calories listed')
  await expect(page.getByTestId('food-chosen')).toHaveCount(0)
  // The list stays, so another result can be picked
  await expect(page.getByRole('list', { name: 'Foods found' })).toBeVisible()
})

test('Enter in the search box searches instead of saving the day', async ({ page }) => {
  const seen = await fakeOpenFoodFacts(page)
  await openFoodPanel(page)
  await page.getByLabel('Food name').fill('yogurt')
  await page.getByLabel('Food name').press('Enter')
  await expect(page.getByRole('list', { name: 'Foods found' })).toBeVisible()
  expect(seen.searches).toEqual(['yogurt'])
  await expect(page.getByText('Enter a weight, calories, or both')).toBeHidden()
})

test('a typed barcode is checked, then looked up', async ({ page }) => {
  const seen = await fakeOpenFoodFacts(page)
  await openFoodPanel(page)
  const status = page.getByTestId('food-status')

  await page.getByLabel('Barcode', { exact: true }).fill('9310653103608')
  await page.getByRole('button', { name: 'Look up' }).click()
  await expect(status).toContainText('does not look like a barcode')
  expect(seen.products).toEqual([])

  await page.getByLabel('Barcode', { exact: true }).fill('9310653103609')
  await page.getByLabel('Barcode', { exact: true }).press('Enter')
  await expect(page.getByTestId('food-chosen')).toContainText('Greek Yogurt')
  expect(seen.products).toEqual(['9310653103609'])
})

test('a barcode that is not in the database says so', async ({ page }) => {
  await fakeOpenFoodFacts(page, { product: null })
  await openFoodPanel(page)
  await page.getByLabel('Barcode', { exact: true }).fill('9310653103609')
  await page.getByRole('button', { name: 'Look up' }).click()
  await expect(page.getByTestId('food-status')).toContainText('No product with code 9310653103609 in Open Food Facts yet')
})

test('a busy or unreachable service gets a plain message, and typing still works', async ({ page }) => {
  await fakeOpenFoodFacts(page, { searchStatus: 503 })
  await openFoodPanel(page)
  await page.getByLabel('Food name').fill('yogurt')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByTestId('food-status')).toContainText('busy or not answering')

  await page.unrouteAll()
  await page.route(/^https:\/\/(world|search)\.openfoodfacts\.org\//, route => route.abort('internetdisconnected'))
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByTestId('food-status')).toContainText('busy or not answering')
  await page.getByLabel('Calories eaten').fill('2100')
  await page.getByRole('button', { name: 'Save day' }).click()
  await expect(page.locator('.toast')).toHaveText('Saved Nov 24')
})

test('scans a barcode with the camera in the Log panel', async ({ page }) => {
  const seen = await fakeOpenFoodFacts(page)
  await fakeCamera(page, { barcode: '9310653103609', builtInReader: 'fake-native' })
  await openFoodPanel(page)
  await page.getByRole('button', { name: 'Scan with camera' }).click()
  await expect(page.getByTestId('food-chosen')).toContainText('Greek Yogurt')
  await expect(page.getByTestId('food-scanner')).toHaveCount(0)
  await expect(page.getByLabel('Barcode', { exact: true })).toHaveValue('9310653103609')
  expect(seen.products).toEqual(['9310653103609'])
  // The camera is switched off once the code is read
  expect(await page.evaluate(() => (window as unknown as { cameraStops: number }).cameraStops)).toBeGreaterThan(0)
})

test('without a camera there is no scan button, and typing the digits still works', async ({ page }) => {
  await fakeOpenFoodFacts(page)
  await noCamera(page)
  await openFoodPanel(page)
  await expect(page.getByRole('button', { name: 'Scan with camera' })).toHaveCount(0)
  await page.getByLabel('Barcode', { exact: true }).fill('9310653103609')
  await page.getByRole('button', { name: 'Look up' }).click()
  await expect(page.getByTestId('food-chosen')).toContainText('Greek Yogurt')
})

for (const scheme of ['light', 'dark'] as const) {
  test(`the food panel passes axe in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await fakeOpenFoodFacts(page)
    await openFoodPanel(page)
    await page.getByLabel('Food name').fill('yogurt')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Foods found' })).toBeVisible()
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)))
    let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])

    await page.getByRole('list', { name: 'Foods found' }).getByRole('button', { name: /Greek Yogurt/ }).click()
    await expect(page.getByTestId('food-preview')).toBeVisible()
    results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
}
