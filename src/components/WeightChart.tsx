import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { UnitSystem } from '../engine/types'
import { addDays, daysBetween, formatDay } from '../log/dates'
import { weightForDisplay } from '../log/draft'
import type { TrendPoint } from '../log/trend'

const HEIGHT = 240
const MARGIN = { top: 12, right: 16, bottom: 28, left: 44 }

interface WeightChartProps {
  points: TrendPoint[]
  unit: UnitSystem
}

/** Round tick values that cover the data, about four of them. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (min === max) {
    min -= 1
    max += 1
  }
  const rawStep = (max - min) / target
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(s => s >= rawStep) ?? 10 * magnitude
  const ticks: number[] = []
  for (let value = Math.floor(min / step) * step; value <= max + step * 0.001; value += step) {
    ticks.push(Math.round(value * 100) / 100)
  }
  if (ticks[ticks.length - 1] < max) ticks.push(Math.round((ticks[ticks.length - 1] + step) * 100) / 100)
  return ticks
}

export function WeightChart({ points, unit }: WeightChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [active, setActive] = useState<number | null>(null)
  const label = unit === 'imperial' ? 'lb' : 'kg'

  // Draw in real pixels so the axis text stays the same size on a phone and a laptop.
  useEffect(() => {
    const element = wrapRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // A new range or a new entry can leave the old index pointing past the end.
  useEffect(() => setActive(null), [points])

  if (points.length === 0) return null

  const scale = points.map(p => weightForDisplay(p.weightKg, unit))
  const trend = points.map(p => weightForDisplay(p.trendKg, unit))
  const ticks = niceTicks(Math.min(...scale, ...trend), Math.max(...scale, ...trend))
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]

  const first = points[0].date
  const spanDays = Math.max(1, daysBetween(first, points[points.length - 1].date))
  const plotWidth = width - MARGIN.left - MARGIN.right
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const x = (date: string) => MARGIN.left + (points.length === 1 ? plotWidth / 2 : (daysBetween(first, date) / spanDays) * plotWidth)
  const y = (value: number) => MARGIN.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight

  const trendPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(trend[i]).toFixed(1)}`).join(' ')
  // First and last day, plus the day halfway between them when the span is long enough for three labels.
  const lastDate = points[points.length - 1].date
  const dateLabels = points.length === 1 ? [first] : spanDays >= 6 ? [first, addDays(first, Math.round(spanDays / 2)), lastDate] : [first, lastDate]

  function nearestIndex(pointerX: number): number {
    let best = 0
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(points[i].date) - pointerX) < Math.abs(x(points[best].date) - pointerX)) best = i
    }
    return best
  }

  function handlePointer(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (box) setActive(nearestIndex(event.clientX - box.left))
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    const last = points.length - 1
    let next: number | null = null
    if (event.key === 'ArrowLeft') next = active === null ? last : Math.max(0, active - 1)
    if (event.key === 'ArrowRight') next = active === null ? last : Math.min(last, active + 1)
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = last
    if (event.key === 'Escape') {
      setActive(null)
      return
    }
    if (next !== null) {
      event.preventDefault()
      setActive(next)
    }
  }

  const activeX = active === null ? 0 : x(points[active].date)
  // Keep the tooltip inside the chart: show it to the left of the line near the right edge.
  const tooltipOnLeft = activeX > width / 2

  return (
    <div className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span className="legend-item">
          <span className="legend-dot" /> Scale weight
        </span>
        <span className="legend-item">
          <span className="legend-line" /> Trend
        </span>
      </div>
      <div
        ref={wrapRef}
        className="chart-plot"
        tabIndex={0}
        role="group"
        aria-label={`Weight chart in ${label}, ${points.length} weigh-ins. Use the left and right arrow keys to read each day.`}
        onKeyDown={handleKey}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={HEIGHT} aria-hidden="true">
          {ticks.map(tick => (
            <g key={tick}>
              <line className="chart-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} />
              <text className="chart-axis" x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                {tick}
              </text>
            </g>
          ))}
          {dateLabels.map((date, n) => (
            <text
              key={date}
              className="chart-axis"
              x={x(date)}
              y={HEIGHT - 8}
              textAnchor={dateLabels.length === 1 ? 'middle' : n === 0 ? 'start' : n === dateLabels.length - 1 ? 'end' : 'middle'}
            >
              {formatDay(date)}
            </text>
          ))}
          {active !== null ? <line className="chart-crosshair" x1={activeX} x2={activeX} y1={MARGIN.top} y2={MARGIN.top + plotHeight} /> : null}
          {points.map((p, i) => (
            <circle key={p.date} className="chart-dot" cx={x(p.date)} cy={y(scale[i])} r={active === i ? 6 : 4} />
          ))}
          {points.length > 1 ? <path className="chart-trend" d={trendPath} /> : null}
          {active !== null ? <circle className="chart-trend-dot" cx={activeX} cy={y(trend[active])} r={5} /> : null}
          <rect
            className="chart-hit"
            x={MARGIN.left - 12}
            y={0}
            width={plotWidth + 24}
            height={HEIGHT}
            onPointerMove={handlePointer}
            onPointerDown={handlePointer}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        <div
          className={`chart-tooltip${active === null ? '' : ' is-visible'}`}
          style={active === null ? undefined : { left: tooltipOnLeft ? activeX - 12 : activeX + 12, transform: tooltipOnLeft ? 'translateX(-100%)' : undefined }}
          aria-live="polite"
        >
          {active === null ? null : (
            <>
              <p className="tooltip-date">{formatDay(points[active].date)}</p>
              <p className="tooltip-row">
                <span className="legend-line" aria-hidden="true" /> <strong>{trend[active]}</strong> {label} trend
              </p>
              <p className="tooltip-row">
                <span className="legend-dot" aria-hidden="true" /> <strong>{scale[active]}</strong> {label} on the scale
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
