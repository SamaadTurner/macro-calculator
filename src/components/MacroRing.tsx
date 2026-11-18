import { useState } from 'react'
import type { MacroPlan } from '../engine/types'

export const MACROS = [
  { key: 'protein', label: 'Protein', calPerGram: 4 },
  { key: 'carbs', label: 'Carbs', calPerGram: 4 },
  { key: 'fats', label: 'Fats', calPerGram: 9 },
] as const

export type MacroKey = (typeof MACROS)[number]['key']

const SIZE = 220
const STROKE = 22
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
// Space between segments so each one reads on its own, drawn in the card's colour.
const GAP = 4

/** Ring of calories by macro with the daily total in the middle. Hovering a segment or a row shows that macro in the middle. */
export function MacroRing({ plan }: { plan: MacroPlan }) {
  const [active, setActive] = useState<MacroKey | null>(null)

  let offset = 0
  const segments = MACROS.map(macro => {
    const share = plan[macro.key].pct / 100
    const length = Math.max(share * CIRCUMFERENCE - GAP, 0)
    const segment = { ...macro, length, offset }
    offset += share * CIRCUMFERENCE
    return segment
  })

  const activeMacro = active ? MACROS.find(m => m.key === active) : null

  return (
    <div className="ring-layout">
      <div className="ring-wrap">
        <svg
          className="ring"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`${plan.calories} calories a day: protein ${plan.protein.pct}%, carbs ${plan.carbs.pct}%, fats ${plan.fats.pct}%`}
        >
          <circle className="ring-track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} strokeWidth={STROKE} fill="none" />
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {segments.map(segment => (
              <circle
                key={segment.key}
                className={`ring-seg seg-${segment.key}${active && active !== segment.key ? ' is-dim' : ''}`}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                strokeWidth={STROKE}
                strokeDasharray={`${segment.length} ${CIRCUMFERENCE}`}
                strokeDashoffset={-segment.offset}
                onMouseEnter={() => setActive(segment.key)}
                onMouseLeave={() => setActive(null)}
              />
            ))}
          </g>
        </svg>
        <div className="ring-center" aria-hidden="true">
          {activeMacro ? (
            <>
              <span className="ring-number">{plan[activeMacro.key].grams}g</span>
              <span className="ring-unit">{activeMacro.label.toLowerCase()}</span>
            </>
          ) : (
            <>
              <span className="ring-number" data-testid="calories">
                {plan.calories.toLocaleString('en-US')}
              </span>
              <span className="ring-unit">calories / day</span>
            </>
          )}
        </div>
      </div>

      <ul className="macro-list">
        {MACROS.map(macro => (
          <li
            key={macro.key}
            className={`macro-row${active === macro.key ? ' is-active' : ''}`}
            data-testid={`macro-${macro.key}`}
            onMouseEnter={() => setActive(macro.key)}
            onMouseLeave={() => setActive(null)}
          >
            <span className={`swatch seg-${macro.key}`} aria-hidden="true" />
            <span className="macro-name">{macro.label}</span>
            <span className="macro-grams">{plan[macro.key].grams}g</span>
            <span className="macro-meta">
              {plan[macro.key].pct}% · {(plan[macro.key].grams * macro.calPerGram).toLocaleString('en-US')} cal
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
