import { useState } from 'react'
import type { Goal, MacroPlan, UnitSystem } from '../engine/types'
import { kgToLb, roundTo } from '../engine/units'
import { splitAcrossMeals } from '../engine/calculate'
import type { SavedPlan } from '../storage'
import type { CheckIn } from '../coach/checkins'
import { addDays, formatDay } from '../log/dates'
import { Choice } from './fields'
import { MacroRing, MACROS } from './MacroRing'
import { AlertIcon, TrashIcon } from './Icons'
import { GOAL_OPTIONS, paceHint, paceOptions } from './Wizard'

const GOAL_LABELS: Record<string, string> = { cutting: 'Lose fat', maintain: 'Maintain', bulking: 'Build muscle' }
const MEAL_OPTIONS = [3, 4, 5, 6].map(n => ({ value: n, label: String(n) }))

interface ResultsProps {
  plan: MacroPlan
  goal: Goal
  pace: number | null
  unit: UnitSystem
  savedPlans: SavedPlan[]
  /** The newest saved weekly check-in, shown above the formula plan. */
  latestCheckIn: CheckIn | null
  /** The first day after a maintenance break that is running now, or null. */
  breakEnd: string | null
  canShare: boolean
  onGoalChange: (goal: Goal) => void
  onPaceChange: (pace: number) => void
  onEdit: () => void
  onStartOver: () => void
  onSave: () => void
  onCopy: () => void
  onShare: () => void
  onDeletePlan: (id: string) => void
}

/** "About 0.9 lb a week" in the user's unit, or '' at maintenance. */
export function weeklyChangeText(weeklyChangeKg: number, unit: UnitSystem): string {
  const amount = roundTo(Math.abs(unit === 'imperial' ? kgToLb(weeklyChangeKg) : weeklyChangeKg), 1)
  if (amount === 0) return ''
  return `${weeklyChangeKg < 0 ? 'Losing' : 'Gaining'} about ${amount} ${unit === 'imperial' ? 'lb' : 'kg'} a week`
}

export function planAsText(plan: MacroPlan, goal: string): string {
  return [
    `My macros (${GOAL_LABELS[goal] ?? goal})`,
    `${plan.calories.toLocaleString('en-US')} calories a day`,
    `Protein ${plan.protein.grams}g · Carbs ${plan.carbs.grams}g · Fats ${plan.fats.grams}g`,
  ].join('\n')
}

export function Results(props: ResultsProps) {
  const { plan } = props
  const [meals, setMeals] = useState(4)
  const perMeal = MACROS.map(macro => splitAcrossMeals(plan[macro.key].grams, meals))
  const signedAdjustment = plan.breakdown.adjustment > 0 ? `+${plan.breakdown.adjustment}` : String(plan.breakdown.adjustment)

  return (
    <section className="results" aria-labelledby="results-title">
      <div className="results-head">
        <p className="eyebrow">Your daily target</p>
        <h1 id="results-title" className="display" tabIndex={-1}>
          {GOAL_LABELS[props.goal]}
        </h1>
        <p className="lede">
          Maintenance is about <strong>{plan.breakdown.maintenance.toLocaleString('en-US')}</strong> calories a day.
          {weeklyChangeText(plan.breakdown.weeklyChangeKg, props.unit) ? (
            <>
              {' '}
              <span data-testid="weekly-change">{weeklyChangeText(plan.breakdown.weeklyChangeKg, props.unit)}</span> at this target.
            </>
          ) : null}
        </p>
      </div>

      {props.breakEnd ? (
        <p className="checkin-banner" data-testid="break-banner">
          You are on a maintenance break through {formatDay(addDays(props.breakEnd, -1))}. The check-in has your maintenance targets until then.{' '}
          <a href="#checkin">Open the check-in</a>
        </p>
      ) : null}

      {props.latestCheckIn ? (
        <p className="checkin-banner" data-testid="checkin-banner">
          Your check-in on {formatDay(props.latestCheckIn.date)} measured maintenance at about{' '}
          {(Math.round(props.latestCheckIn.expenditure / 10) * 10).toLocaleString('en-US')} and set{' '}
          <strong>{props.latestCheckIn.calories.toLocaleString('en-US')} calories</strong>
          {props.latestCheckIn.goal !== props.goal ? ` for ${GOAL_LABELS[props.latestCheckIn.goal].toLowerCase()}` : ''}. The numbers below are the formula.{' '}
          <a href="#checkin">Open the check-in</a>
        </p>
      ) : null}

      <div className="card">
        <MacroRing plan={plan} />
        {plan.notes.length > 0 ? (
          <ul className="notices">
            {plan.notes.map(note => (
              <li key={note} className="notice">
                <AlertIcon /> <span>{note}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="card">
        <Choice
          legend="Switch goal"
          name="results-goal"
          variant="segmented"
          options={GOAL_OPTIONS.map(({ value, short }) => ({ value, label: short }))}
          value={props.goal}
          onChange={props.onGoalChange}
        />
        {props.goal !== 'maintain' ? (
          <div className="pace-choice">
            <Choice
              legend="Pace"
              name="results-pace"
              variant="segmented"
              options={paceOptions(props.goal)}
              value={plan.breakdown.pace}
              onChange={props.onPaceChange}
              hint={paceHint(props.goal, props.pace)}
            />
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Per meal</h2>
          <Choice legend="Meals a day" name="meals" variant="segmented" options={MEAL_OPTIONS} value={meals} onChange={setMeals} />
        </div>
        <table className="meal-table">
          <caption className="visually-hidden">Grams of each macro per meal for {meals} meals</caption>
          <thead>
            <tr>
              <th scope="col">Meal</th>
              {MACROS.map(macro => (
                <th scope="col" key={macro.key}>
                  <span className={`swatch seg-${macro.key}`} aria-hidden="true" /> {macro.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: meals }, (_, i) => (
              <tr key={i}>
                <th scope="row">{i + 1}</th>
                {perMeal.map((grams, m) => (
                  <td key={MACROS[m].key}>{grams[i]}g</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={props.onSave}>
          Save plan
        </button>
        {props.canShare ? (
          <button type="button" className="btn btn-secondary" onClick={props.onShare}>
            Share
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary" onClick={props.onCopy}>
          Copy
        </button>
        <button type="button" className="btn btn-secondary" onClick={props.onEdit}>
          Edit answers
        </button>
      </div>

      <details className="card details">
        <summary>How these numbers were worked out</summary>
        <dl className="breakdown">
          <div>
            <dt>Resting energy (Mifflin-St Jeor)</dt>
            <dd>{plan.breakdown.bmr.toLocaleString('en-US')} cal</dd>
          </div>
          <div>
            <dt>× Activity</dt>
            <dd>{plan.breakdown.activity}</dd>
          </div>
          <div>
            <dt>= Maintenance</dt>
            <dd>{plan.breakdown.maintenance.toLocaleString('en-US')} cal</dd>
          </div>
          <div>
            <dt>Goal adjustment{props.goal !== 'maintain' ? ` (${roundTo(plan.breakdown.pace * 100, 2)}% of body weight a week)` : ''}</dt>
            <dd>{signedAdjustment} cal</dd>
          </div>
          <div className="breakdown-total">
            <dt>Daily target</dt>
            <dd>{plan.calories.toLocaleString('en-US')} cal</dd>
          </div>
          <div>
            <dt>Protein</dt>
            <dd>
              {plan.breakdown.proteinPerKg} g per kg × {plan.breakdown.referenceWeightKg} kg
            </dd>
          </div>
          <div>
            <dt>Fats</dt>
            <dd>25% of calories</dd>
          </div>
          <div>
            <dt>Carbs</dt>
            <dd>The rest</dd>
          </div>
        </dl>
        <p className="fine-print">
          The pace turns into calories at {plan.breakdown.caloriesPerKg.toLocaleString('en-US')} calories per kg for your body: a kg of fat holds about 9,440 calories and a kg of lean tissue about 1,820 (Hall, 2008), and leaner people lose more lean per kg (Forbes). The deficit is capped at 25% of maintenance and the
          surplus at 20%. Fat loss paces follow Helms et al. (2014), muscle gain paces Iraki et al. (2019). Fat loss never goes below 1,200 calories for
          women or 1,500 for men, a common rule of thumb, or above maintenance. Above a BMI of 25, protein uses the weight at BMI 25 for your height, because total weight
          overstates muscle. Protein research: Morton et al., 2018.
        </p>
      </details>

      <p className="disclaimer">
        These are estimates from a standard formula, not medical advice. Real needs can be a few hundred calories off, so watch your weight trend for 2 to 3 weeks and
        adjust.
      </p>

      {props.savedPlans.length > 0 ? (
        <div className="card">
          <h2 className="card-title">Saved plans</h2>
          <ul className="saved-list">
            {props.savedPlans.map(saved => (
              <li key={saved.id} className="saved-item">
                <div>
                  <p className="saved-cal">
                    {saved.calories.toLocaleString('en-US')} cal · {GOAL_LABELS[saved.goal] ?? saved.goal}
                  </p>
                  <p className="saved-meta">
                    P {saved.protein}g · C {saved.carbs}g · F {saved.fats}g ·{' '}
                    {new Date(saved.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Delete plan from ${new Date(saved.savedAt).toLocaleString()}`}
                  onClick={() => props.onDeletePlan(saved.id)}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button type="button" className="btn btn-link" onClick={props.onStartOver}>
        Start over
      </button>
    </section>
  )
}
