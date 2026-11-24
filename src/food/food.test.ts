import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanBarcode, defaultAmount, loadProduct, lookupBarcode, MinuteLimit, nutrientsFor, readHit, readProduct, searchFoods } from './openFoodFacts'

// Shaped like the real API answers (checked 2026-11-24), trimmed to the fields the app asks for.
const nutella = {
  code: '3017624010701',
  product_name: 'Nutella',
  brands: 'Ferrero, Nutella',
  serving_size: '15 g',
  serving_quantity: 15,
  nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
}

// Real Open Food Facts entries (2026-11-24): the per-serving numbers are the label's.
const clifBar = {
  code: '722252100900',
  product_name: 'CHOCOLATE CHIP ENERGY BAR',
  brands: 'CLIF',
  serving_size: '1 bar (68 g)',
  serving_quantity: 68,
  serving_quantity_unit: 'g',
  nutrition_data_per: '100g',
  nutriments: {
    'energy-kcal_100g': 367.647058823529,
    proteins_100g: 14.7058823529412,
    carbohydrates_100g: 63.2352941176471,
    fat_100g: 8.82352941176471,
    'energy-kcal_serving': 250,
    proteins_serving: 10,
    carbohydrates_serving: 43,
    fat_serving: 6,
  },
}
const coke = {
  code: '049000050103',
  product_name: 'Coca Cola',
  brands: 'Coca-Cola',
  serving_size: '12 fl oz (360 ml)',
  serving_quantity: 360,
  serving_quantity_unit: 'ml',
  nutrition_data_per: '100ml',
  nutriments: { 'energy-kcal_100g': 38.8888888888889, proteins_100g: 0, carbohydrates_100g: 10.8333333333333, fat_100g: 0, 'energy-kcal_serving': 140, carbohydrates_serving: 39 },
}

describe('readProduct', () => {
  it('keeps the label serving with its own numbers, and the per-100 g ones', () => {
    const food = readProduct(clifBar)!
    expect(food.name).toBe('CHOCOLATE CHIP ENERGY BAR')
    expect(food.brand).toBe('CLIF')
    expect(food.unit).toBe('g')
    expect(food.serving).toEqual({ label: '1 bar (68 g)', quantity: 68, nutrients: { calories: 250, protein: 10, carbs: 43, fats: 6 } })
    expect(food.per100?.calories).toBeCloseTo(367.65, 2)
  })

  it('knows a drink is measured in millilitres', () => {
    const food = readProduct(coke)!
    expect(food.unit).toBe('ml')
    expect(food.serving?.label).toBe('12 fl oz (360 ml)')
    expect(food.serving?.nutrients.calories).toBe(140)
  })

  it('works out the serving from per-100 g numbers when the label numbers are missing', () => {
    const food = readProduct(nutella)!
    expect(food.serving?.quantity).toBe(15)
    expect(food.serving?.nutrients.calories).toBeCloseTo(80.85, 2)
    expect(food.brand).toBe('Ferrero')
  })

  it('works out per-100 g numbers from a per-serving-only entry with a serving weight', () => {
    const food = readProduct({ product_name: 'Bar', serving_size: '1 bar (50 g)', serving_quantity: 50, nutriments: { 'energy-kcal_serving': 200, proteins_serving: 20 } })!
    expect(food.per100).toEqual({ calories: 400, protein: 40, carbs: null, fats: null })
  })

  it('works out calories from kJ when kcal is missing', () => {
    const food = readProduct({ product_name: 'Oats', nutriments: { 'energy-kj_100g': 1569 } })
    expect(food?.per100?.calories).toBeCloseTo(375, 0)
    expect(food?.per100?.protein).toBeNull()
  })

  it('has no serving when the package gives no size, and reads numbers sent as text', () => {
    const food = readProduct({ product_name: 'Milk', nutriments: { 'energy-kcal_100g': '64', proteins_100g: '3.4' } })
    expect(food?.per100).toEqual({ calories: 64, protein: 3.4, carbs: null, fats: null })
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

describe('readHit', () => {
  it('reads a search result and drops the language tag from the brand', () => {
    expect(readHit({ code: '9310653103609', product_name: 'Greek Yogurt', brands: ['xx:Chobani'] })).toEqual({
      code: '9310653103609',
      name: 'Greek Yogurt',
      brand: 'Chobani',
    })
    expect(readHit({ code: '5310224562518', product_name: 'Kiev', brands: ['steggles'] })?.brand).toBe('steggles')
    expect(readHit({ code: '20048402', product_name: 'Ham' })?.brand).toBe('')
  })

  it('skips results with no name or a code that is not digits', () => {
    expect(readHit({ code: '2000000085748', product_name: '' })).toBeNull()
    expect(readHit({ code: 'abc', product_name: 'Odd' })).toBeNull()
    expect(readHit({ product_name: 'No code' })).toBeNull()
  })
})

describe('defaultAmount and nutrientsFor', () => {
  it('starts at one serving and matches the label exactly', () => {
    const food = readProduct(clifBar)!
    expect(defaultAmount(food)).toEqual({ kind: 'servings', count: 1 })
    expect(nutrientsFor(food, { kind: 'servings', count: 1 })).toEqual({ calories: 250, protein: 10, carbs: 43, fats: 6 })
    expect(nutrientsFor(food, { kind: 'servings', count: 1.5 })).toEqual({ calories: 375, protein: 15, carbs: 64.5, fats: 9 })
    // The whole can of coke is the label's 140, not 100 ml worth
    expect(nutrientsFor(readProduct(coke)!, { kind: 'servings', count: 1 })?.calories).toBe(140)
  })

  it('counts by weight or volume too', () => {
    const food = readProduct(clifBar)!
    expect(nutrientsFor(food, { kind: 'quantity', value: 34 })).toEqual({ calories: 125, protein: 5, carbs: 21.5, fats: 3 })
    expect(nutrientsFor(readProduct(coke)!, { kind: 'quantity', value: 180 })?.calories).toBe(70)
  })

  it('starts at 100 g without a serving size, and keeps unknown macros unknown', () => {
    const food = readProduct({ product_name: 'Milk', nutriments: { 'energy-kcal_100g': 64 } })!
    expect(defaultAmount(food)).toEqual({ kind: 'quantity', value: 100 })
    expect(nutrientsFor(food, { kind: 'quantity', value: 200 })).toEqual({ calories: 128, protein: null, carbs: null, fats: null })
    expect(nutrientsFor(food, { kind: 'servings', count: 1 })).toBeNull()
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

  it('searches by name with a plain GET to the search service', async () => {
    const fetchMock = answer({ hits: [{ code: '3017624010701', product_name: 'Nutella', brands: ['xx:Ferrero'] }, { code: '1', product_name: '' }] })
    vi.stubGlobal('fetch', fetchMock)
    const result = await searchFoods(' nutella ')
    expect(result).toEqual({ ok: true, value: [{ code: '3017624010701', name: 'Nutella', brand: 'Ferrero' }] })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/^https:\/\/search\.openfoodfacts\.org\/search\?q=nutella&/)
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
    expect(!missing.ok && missing.message).toContain('No product with code 3017624010701')

    vi.stubGlobal('fetch', answer({ status: 1, product: { product_name: 'Gum', nutriments: {} } }))
    const empty = await lookupBarcode('3017624010701')
    expect(!empty.ok && empty.message).toContain('has no calories listed')
  })

  it('loads a product picked from search results, even with a shop code', async () => {
    const fetchMock = answer({ status: 1, product: nutella })
    vi.stubGlobal('fetch', fetchMock)
    expect(await loadProduct('20048402')).toEqual({ ok: true, value: { ...readProduct(nutella)!, code: '20048402' } })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain('/api/v2/product/20048402?fields=')
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
