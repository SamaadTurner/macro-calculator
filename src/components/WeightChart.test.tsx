import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { niceTicks, WeightChart } from './WeightChart'
import { lbToKg } from '../engine/units'

describe('niceTicks', () => {
  it('covers the data with round numbers', () => {
    expect(niceTicks(178.2, 181.6)).toEqual([178, 179, 180, 181, 182])
    expect(niceTicks(70, 90)).toEqual([70, 75, 80, 85, 90])
  })

  it('still draws an axis when every weigh-in is the same', () => {
    const ticks = niceTicks(80, 80)
    expect(ticks[0]).toBeLessThan(80)
    expect(ticks[ticks.length - 1]).toBeGreaterThan(80)
  })
})

describe('WeightChart', () => {
  const points = [
    { date: '2026-11-01', weightKg: lbToKg(180), trendKg: lbToKg(180) },
    { date: '2026-11-02', weightKg: lbToKg(182), trendKg: lbToKg(180.2) },
  ]

  it('reads each day with the arrow keys', () => {
    render(<WeightChart points={points} unit="imperial" />)
    const chart = screen.getByRole('group', { name: /weight chart in lb, 2 weigh-ins/i })
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(chart).toHaveTextContent('182 lb on the scale')
    expect(chart).toHaveTextContent('180.2 lb trend')
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(chart).toHaveTextContent('180 lb on the scale')
    fireEvent.keyDown(chart, { key: 'Escape' })
    expect(chart).not.toHaveTextContent('on the scale')
  })
})
