import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { answerAll, averageMan } from './helpers'

// The installable app: a manifest with icons, and a service worker that keeps every file so the
// app opens and saves with no connection.

/** Waits until the service worker is installed and controls the page, as on a second visit. */
async function waitForOffline(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) await page.reload()
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
}

test('has a manifest with the name, start page and icons that load', async ({ page, request }) => {
  await page.goto('./')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('/macro-calculator/manifest.webmanifest')
  const manifest = await (await request.get(href!)).json()
  expect(manifest).toMatchObject({ name: 'Macro Calculator', short_name: 'Macros', start_url: '/macro-calculator/', display: 'standalone' })
  expect(manifest.icons.map((icon: { sizes: string; purpose?: string }) => `${icon.sizes}${icon.purpose ? ` ${icon.purpose}` : ''}`)).toEqual([
    '192x192',
    '512x512',
    '512x512 maskable',
  ])
  for (const icon of [...manifest.icons.map((i: { src: string }) => i.src), 'apple-touch-icon.png']) {
    const response = await request.get(`/macro-calculator/${icon}`)
    expect(response.status(), icon).toBe(200)
    expect(response.headers()['content-type'], icon).toBe('image/png')
  }
})

test('opens, works out a plan and saves a log day with no connection', async ({ page, context }) => {
  await page.goto('./')
  await waitForOffline(page)
  await context.setOffline(true)
  await page.reload()

  // The whole flow runs from the saved files.
  await answerAll(page, averageMan)
  await expect(page.getByTestId('calories')).toHaveText('2,377')

  await page.getByRole('link', { name: 'Log', exact: true }).click()
  await page.getByLabel('Weight', { exact: true }).fill('180')
  await page.getByRole('button', { name: 'Save day' }).click()
  await expect(page.getByRole('row').filter({ hasText: '180 lb' })).toBeVisible()

  // Still there after another offline reload.
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: '180 lb' })).toBeVisible()
})
