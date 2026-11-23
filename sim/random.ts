// A small seeded random number generator, so every run of the study gives the same numbers.

/** Mulberry32: fast, good enough for a simulation, and repeatable from a seed. */
export function makeRandom(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  let spare: number | null = null
  return {
    /** Uniform in [0, 1). */
    next,
    uniform: (min: number, max: number) => min + (max - min) * next(),
    /** Normal with the given mean and standard deviation (Box-Muller). */
    normal: (mean = 0, sd = 1) => {
      if (spare !== null) {
        const value = spare
        spare = null
        return mean + sd * value
      }
      const u = Math.max(next(), 1e-12)
      const v = next()
      const radius = Math.sqrt(-2 * Math.log(u))
      spare = radius * Math.sin(2 * Math.PI * v)
      return mean + sd * radius * Math.cos(2 * Math.PI * v)
    },
    chance: (probability: number) => next() < probability,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
  }
}

export type Random = ReturnType<typeof makeRandom>

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
