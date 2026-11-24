import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanBarcode, lookupBarcode, MinuteLimit, nutrientsFor, readProduct, searchFoods } from './openFoodFacts'

// Shaped like the real API answers (checked 2026-11-24), trimmed to the fields the app asks for.
const nutella = {
  code: '3017624010701',
  product_name: 'Nutella',
  brands: 'Ferrero, Nutella',
  serving_size: '15 g',
  serving_quantity: 15,
  nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
}

describe('readProduct', () => {
  it('reads the name, first brand, per-100 g numbers and serving', () => {
    expect(readProduct(nutella)).toEqual({
      code: '3017624010701',
      name: 'Nutella',
      brand: 'Ferrero',
      per100g: { calories: 539, protein: 6.3, carbs: 57.5, fats: 30.9 },
      serving: { grams: 15, label: '15 g' },
    })
  })

  it('works out calories from kJ when kcal is missing', () => {
    const food = readProduct({ product_name: 'Oats', nutriments: { 'energy-kj_100g': 1569 } })
    expect(food?.per100g.calories).toBe(375)
    expect(food?.per100g.protein).toBeNull()
  })

  it('reads numbers sent as text and leaves out a serving with no weight', () => {
    const food = readProduct({ product_name: 'Milk', serving_size: '1 cup', nutriments: { 'energy-kcal_100g': '64', proteins_100g: '3.4' } })
    expect(food?.per100g).toEqual({ calories: 64, protein: 3.4, carbs: null, fats: null })
    expect(food?.serving).toBeNull()
  })

  it('skips products with no name, no calories or impossible calories', () => {
    expect(readProduct({ nutriments: { 'energy-kcal_100g': 100 } })).toBeNull()
    expect(readProduct({ product_name: 'Water', nutriments: {} })).toBeNull()
    expect(readProduct({ product_name: 'Typo', nutriments: { 'energy-kcal_100g': 5000 } })).toBeNull()
    expect(readProduct({ product_name: 'Bad', nutriments: { 'energy-kcal_100g': -5 } })).toBeNull()
    expect(readProduct(null)).toBeNull()
  })
})

describe('nutrientsFor', () => {
  it('scales from 100 g to the amount eaten', () => {
    const food = readProduct(nutella)!
    expect(nutrientsFor(food, 15)).toEqual({ calories: 81, protein: 0.9, carbs: 8.6, fats: 4.6 })
    expect(nutrientsFor(food, 250)).toEqual({ calories: 1348, protein: 15.8, carbs: 143.8, fats: 77.3 })
  })

  it('keeps an unknown macro unknown', () => {
    const food = readProduct({ product_name: 'Milk', nutriments: { 'energy-kcal_100g': 64 } })!
    expect(nutrientsFor(food, 200)).toEqual({ calories: 128, protein: null, carbs: null, fats: null })
  })
})

describe('cleanBarcode', () => {
  it('accepts EAN-13, UPC-A, EAN-8 and GTIN-14 with the right check digit', () => {
    expect(cleanBarcode('3017624010701')).toBe('3017624010701')
    expect(cleanBarcode('0 49000 05010 3')).toBe('049000050103')
    expect(cleanBarcode('96385074')).toBe('96385074')
    expect(cleanBarcode('10012345678902')).toBe('10012345678902')
  })

  it('refuses a wrong check digit, letters and wrong lengths', () => {
    expect(cleanBarcode('3017624010702')).toBeNull()
    expect(cleanBarcode('30176240107O1')).toBeNull()
    expect(cleanBarcode('12345')).toBeNull()
    expect(cleanBarcode('')).toBeNull()
  })
})

describe('MinuteLimit', () => {
  it('lets max requests through in a minute, then says how long to wait', () => {
    const limit = new MinuteLimit(2)
    expect(limit.take(0)).toBe(0)
    expect(limit.take(10_000)).toBe(0)
    expect(limit.take(20_000)).toBe(40)
    expect(limit.take(60_001)).toBe(0)
  })
})

describe('requests', () => {
  afterEach(() => vi.unstubAllGlobals())

  const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

  it('searches by name with a plain GET and drops products without calories', async () => {
    const fetchMock = answer({ products: [nutella, { product_name: 'No calories' }] })
    vi.stubGlobal('fetch', fetchMock)
    const result = await searchFoods(' nutella ')
    expect(result).toEqual({ ok: true, value: [readProduct(nutella)] })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/cgi/search.pl?search_terms=nutella&')
    expect(url).toContain('json=1')
    // No extra headers: one would make the browser send a CORS preflight the server refuses
    expect(init.headers).toBeUndefined()
  })

  it('needs 2 letters before searching, without a request', async () => {
    const fetchMock = answer({})
    vi.stubGlobal('fetch', fetchMock)
    expect(await searchFoods('a')).toEqual({ ok: false, message: 'Type at least 2 letters to search.' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('looks up a barcode, and says so when it is not there or has no calories', async () => {
    vi.stubGlobal('fetch', answer({ status: 1, product: nutella }))
    expect(await lookupBarcode('3017624010701')).toEqual({ ok: true, value: readProduct(nutella) })

    vi.stubGlobal('fetch', answer({ status: 0 }, 404))
    const missing = await lookupBarcode('3017624010701')
    expect(missing.ok).toBe(false)
    expect(!missing.ok && missing.message).toContain('No product with barcode 3017624010701')

    vi.stubGlobal('fetch', answer({ status: 1, product: { product_name: 'Gum', nutriments: {} } }))
    const empty = await lookupBarcode('3017624010701')
    expect(!empty.ok && empty.message).toContain('has no calories listed')
  })

  it('checks the barcode before spending a lookup', async () => {
    const fetchMock = answer({})
    vi.stubGlobal('fetch', fetchMock)
    const result = await lookupBarcode('3017624010702')
    expect(!result.ok && result.message).toContain('does not look like a barcode')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a network error or a server error becomes a plain message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const failed = await searchFoods('yogurt')
    expect(!failed.ok && failed.message).toContain('busy or not answering')

    vi.stubGlobal('fetch', answer({}, 503))
    const busy = await searchFoods('yogurt')
    expect(!busy.ok && busy.message).toContain('busy or not answering')
  })
})
