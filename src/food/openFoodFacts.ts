// Food search and barcode lookup through Open Food Facts, a free public food database
// (https://world.openfoodfacts.org, data under the Open Database License).
//
// Their rules (checked 2026-11-24, openfoodfacts.github.io/openfoodfacts-server/api):
// at most 10 searches and 15 product reads a minute per IP, and no search-as-you-type.
// They also ask apps to name themselves in the User-Agent. A web page cannot set that, and
// an extra header (X-User-Agent) makes the browser send a CORS preflight first, which their
// server refused for Chrome in a test on 2026-11-24. So requests are plain GETs: the
// browser's own User-Agent and the site's address are what they see.
//
// Searching uses their search service (search.openfoodfacts.org, "Search-a-licious"). The
// older /cgi/search.pl answered 503 without CORS headers several times in a row on
// 2026-11-24, which a browser reports as a blocked request. The search service is fast but
// leaves out the nutrition numbers, so picking a result loads that one product, like a
// barcode lookup does.

export interface FoodNutrients {
  calories: number
  protein: number | null
  carbs: number | null
  fats: number | null
}

/** Foods are measured in grams; drinks often in millilitres. */
export type BaseUnit = 'g' | 'ml'

export interface FoodServing {
  /** As printed, like "1 bar (68 g)" or "12 fl oz (360 ml)". */
  label: string
  /** The serving in grams or millilitres, when the package gives it. */
  quantity: number | null
  /** One serving. The label's own numbers when Open Food Facts has them, so they match the package. */
  nutrients: FoodNutrients
}

export interface FoodItem {
  code: string
  name: string
  brand: string
  unit: BaseUnit
  /** Per 100 g or 100 ml, when known. */
  per100: FoodNutrients | null
  /** One serving as the package states it, when it states one. */
  serving: FoodServing | null
}

/** How much was eaten: a number of servings (the usual way, like the big logging apps) or g/ml. */
export type FoodAmount = { kind: 'servings'; count: number } | { kind: 'quantity'; value: number }

/** One search result: enough to show in the list. Picking it loads the full FoodItem. */
export interface FoodHit {
  code: string
  name: string
  brand: string
}

export type FoodResult<T> = { ok: true; value: T } | { ok: false; message: string }

const BASE = 'https://world.openfoodfacts.org'
const SEARCH = 'https://search.openfoodfacts.org/search'
const FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per'
export const SEARCH_PAGE_SIZE = 20

/** Remembers when requests were sent and refuses more than `max` in any minute. */
export class MinuteLimit {
  private times: number[] = []
  constructor(private readonly max: number) {}

  /** Seconds until another request may go, or 0 if one may go now (and counts it). */
  take(now = Date.now()): number {
    this.times = this.times.filter(time => now - time < 60_000)
    if (this.times.length >= this.max) return Math.ceil((this.times[0] + 60_000 - now) / 1000)
    this.times.push(now)
    return 0
  }
}

// A little under the published limits, so a second tab or a retry does not get the IP blocked.
const searchLimit = new MinuteLimit(8)
const productLimit = new MinuteLimit(12)

const toNumber = (value: unknown): number | null => {
  const number = typeof value === 'string' ? Number(value) : value
  return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null
}

const roundTo1 = (value: number) => Math.round(value * 10) / 10

/**
 * The first brand, from "Ferrero, Nutella" (product API) or ["xx:Chobani"] (search service,
 * which puts a language tag in front).
 */
function firstBrand(brands: unknown): string {
  const first = Array.isArray(brands) ? brands[0] : typeof brands === 'string' ? brands.split(',')[0] : ''
  return typeof first === 'string' ? first.replace(/^[a-z]{2}:/, '').trim() : ''
}

/** Reads one search result, or null when it has no name or code. */
export function readHit(raw: unknown): FoodHit | null {
  if (!raw || typeof raw !== 'object') return null
  const hit = raw as Record<string, unknown>
  const name = typeof hit.product_name === 'string' ? hit.product_name.trim() : ''
  const code = typeof hit.code === 'string' && /^\d{1,14}$/.test(hit.code) ? hit.code : ''
  if (!name || !code) return null
  return { code, name, brand: firstBrand(hit.brands) }
}

/** Calories (from kcal, or kJ when only that is given) and macros for one suffix: "_100g" or "_serving". */
function readNutrients(nutriments: Record<string, unknown>, suffix: string): FoodNutrients | null {
  const kcal = toNumber(nutriments[`energy-kcal${suffix}`])
  const kj = toNumber(nutriments[`energy-kj${suffix}`] ?? nutriments[`energy${suffix}`])
  const calories = kcal ?? (kj === null ? null : kj / 4.184)
  if (calories === null) return null
  return {
    calories,
    protein: toNumber(nutriments[`proteins${suffix}`]),
    carbs: toNumber(nutriments[`carbohydrates${suffix}`]),
    fats: toNumber(nutriments[`fat${suffix}`]),
  }
}

function scale(nutrients: FoodNutrients, factor: number): FoodNutrients {
  const macro = (value: number | null) => (value === null ? null : value * factor)
  return { calories: nutrients.calories * factor, protein: macro(nutrients.protein), carbs: macro(nutrients.carbs), fats: macro(nutrients.fats) }
}

/**
 * Reads one product from the API, or null when it has no name or no calories (it cannot be
 * logged then). US labels give numbers per serving and Open Food Facts keeps those as
 * "_serving" values next to its per-100 g ones; both are kept so the app can show the numbers
 * printed on the package.
 */
export function readProduct(raw: unknown): FoodItem | null {
  if (!raw || typeof raw !== 'object') return null
  const product = raw as Record<string, unknown>
  const name = typeof product.product_name === 'string' ? product.product_name.trim() : ''
  if (!name) return null
  const nutriments = (product.nutriments && typeof product.nutriments === 'object' ? product.nutriments : {}) as Record<string, unknown>
  const unit: BaseUnit = product.serving_quantity_unit === 'ml' || product.nutrition_data_per === '100ml' ? 'ml' : 'g'

  let per100 = readNutrients(nutriments, '_100g')
  // More than 900 calories in 100 g is not food (pure fat is about 900): a typo in the data
  if (per100 && per100.calories > 900) per100 = null

  const quantityValue = toNumber(product.serving_quantity)
  const quantity = quantityValue !== null && quantityValue > 0 && quantityValue <= 5000 ? quantityValue : null
  const label = typeof product.serving_size === 'string' && product.serving_size.trim() ? product.serving_size.trim() : quantity ? `${quantity} ${unit}` : ''
  let servingNutrients = readNutrients(nutriments, '_serving')
  if (servingNutrients && servingNutrients.calories > 5000) servingNutrients = null
  if (!servingNutrients && per100 && quantity) servingNutrients = scale(per100, quantity / 100)
  // Only a per-serving entry: work out per 100 from the serving weight, so grams still work
  if (!per100 && servingNutrients && quantity) per100 = scale(servingNutrients, 100 / quantity)

  const serving = servingNutrients && label ? { label, quantity, nutrients: servingNutrients } : null
  if (!per100 && !serving) return null
  return { code: typeof product.code === 'string' ? product.code : '', name, brand: firstBrand(product.brands), unit, per100, serving }
}

/** The amount a food starts at: one serving when the package gives one, otherwise 100 g or ml. */
export function defaultAmount(food: FoodItem): FoodAmount {
  return food.serving ? { kind: 'servings', count: 1 } : { kind: 'quantity', value: 100 }
}

/** What an amount of the food adds: calories rounded to whole, macros to 0.1 g. Null if it cannot be worked out. */
export function nutrientsFor(food: FoodItem, amount: FoodAmount): FoodNutrients | null {
  const base = amount.kind === 'servings' ? food.serving && scale(food.serving.nutrients, amount.count) : food.per100 && scale(food.per100, amount.value / 100)
  if (!base) return null
  const macro = (value: number | null) => (value === null ? null : roundTo1(value))
  return { calories: Math.round(base.calories), protein: macro(base.protein), carbs: macro(base.carbs), fats: macro(base.fats) }
}

/**
 * Barcodes on food are EAN-13, UPC-A (12 digits), EAN-8, or GTIN-14. Returns the digits when
 * the check digit is right, otherwise null, so a typo is caught before a lookup is spent.
 */
export function cleanBarcode(text: string): string | null {
  const digits = text.replace(/[\s-]/g, '')
  if (!/^(\d{8}|\d{12,14})$/.test(digits)) return null
  const body = digits.slice(0, -1)
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    // From the right, digits are weighted 3, 1, 3, 1, ...
    const weight = (body.length - i) % 2 === 1 ? 3 : 1
    sum += Number(body[i]) * weight
  }
  const check = (10 - (sum % 10)) % 10
  return check === Number(digits[digits.length - 1]) ? digits : null
}

const OFFLINE = 'No connection. Food search needs the internet; you can still type the numbers yourself.'
const BUSY = 'Open Food Facts is busy or not answering. Try again in a minute, or type the numbers yourself.'

async function getJson(url: string, signal?: AbortSignal): Promise<FoodResult<unknown>> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, message: OFFLINE }
  try {
    const response = await fetch(url, { signal })
    if (!response.ok) return { ok: false, message: response.status === 404 ? 'not-found' : BUSY }
    return { ok: true, value: await response.json() }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return { ok: false, message: BUSY }
  }
}

const waitMessage = (seconds: number) => `That is a lot of lookups in a minute. Try again in ${seconds} seconds (Open Food Facts asks apps to slow down).`

/** Searches by name. Results without a name are left out. */
export async function searchFoods(query: string, signal?: AbortSignal): Promise<FoodResult<FoodHit[]>> {
  const terms = query.trim()
  if (terms.length < 2) return { ok: false, message: 'Type at least 2 letters to search.' }
  const wait = searchLimit.take()
  if (wait > 0) return { ok: false, message: waitMessage(wait) }
  const params = new URLSearchParams({ q: terms, page_size: String(SEARCH_PAGE_SIZE), fields: 'code,product_name,brands' })
  const result = await getJson(`${SEARCH}?${params}`, signal)
  if (!result.ok) return { ok: false, message: result.message === 'not-found' ? BUSY : result.message }
  const hits = (result.value as { hits?: unknown[] }).hits
  const foods = Array.isArray(hits) ? hits.map(readHit).filter((hit): hit is FoodHit => hit !== null) : []
  return { ok: true, value: foods }
}

/** Looks up one product by a typed or scanned barcode, checking the digits first. */
export async function lookupBarcode(barcode: string, signal?: AbortSignal): Promise<FoodResult<FoodItem>> {
  const code = cleanBarcode(barcode)
  if (!code) return { ok: false, message: 'That does not look like a barcode. Check the digits under the bars (8, 12, 13 or 14 of them).' }
  return loadProduct(code, signal)
}

/**
 * Loads one product by its code. Codes from search results are used as they are: some are
 * shop codes without a check digit.
 */
export async function loadProduct(code: string, signal?: AbortSignal): Promise<FoodResult<FoodItem>> {
  const wait = productLimit.take()
  if (wait > 0) return { ok: false, message: waitMessage(wait) }
  const result = await getJson(`${BASE}/api/v2/product/${code}?fields=${FIELDS}`, signal)
  const notFound = `No product with code ${code} in Open Food Facts yet. Type the numbers from the label instead.`
  if (!result.ok) return { ok: false, message: result.message === 'not-found' ? notFound : result.message }
  const body = result.value as { status?: number; product?: unknown }
  if (body.status === 0 || !body.product) return { ok: false, message: notFound }
  const food = readProduct({ ...(body.product as object), code })
  if (!food) return { ok: false, message: `This product is in Open Food Facts but has no calories listed. Type the numbers from the label instead.` }
  return { ok: true, value: food }
}
