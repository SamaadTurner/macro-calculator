import { useState } from 'react'
import type { Goal, Person, UnitSystem } from '../engine/types'
import { calculateBmr, calculatePlan } from '../engine/calculate'
import { kgToLb, roundTo } from '../engine/units'
import { addDays, daysBetween, formatDay, todayIso } from '../log/dates'
import { loadLog } from '../log/entries'
import { weightTrend } from '../log/trend'
import { caloriesPerKgChange } from '../engine/energy'
import { estimateExpenditure } from '../coach/expenditure'
import type { ExpenditureResult } from '../coach/expenditure'
import { CHECK_IN_EVERY_DAYS, loadCheckIns, previousCheckIn, saveCheckIn } from '../coach/checkins'
import type { CheckIn } from '../coach/checkins'
import { isBreakActive, loadBreak, saveBreak, startBreak, SUGGEST_BREAK_AFTER_WEEKS, weeksOfFatLoss } from '../coach/phases'
import type { MaintenanceBreak } from '../coach/phases'
import { BreakNow, BreakOffer, ReminderCard } from './HabitCards'
import { weeklyChangeText } from './Results'
import { AlertIcon } from './Icons'

const GOAL_LABELS: Record<Goal, string> = { cutting: 'Lose fat', maintain: 'Maintain', bulking: 'Build muscle' }

interface CheckInViewProps {
  /** The person from the plan answers, or null if the plan is not finished. */
  person: Person | null
  /** Today's target from the plan, to compare against. */
  planCalories: number | null
  unit: UnitSystem
  showToast: (message: string) => void
}

const cal = (value: number) => value.toLocaleString('en-US')
/** Estimates are shown to the nearest 10 calories; more digits would claim more than the data knows. */
const round10 = (value: number) => Math.round(value / 10) * 10
/** Under this share of days with calories, the page says the log is patchy. */
const PATCHY_SHARE = 0.7

function signedWeight(kg: number, unit: UnitSystem): string {
  const value = roundTo(unit === 'imperial' ? kgToLb(kg) : kg, 1)
  if (value === 0) return 'No change'
  return `${value > 0 ? '+' : '−'}${Math.abs(value)} ${unit === 'imperial' ? 'lb' : 'kg'} a week`
}

function NotEnoughData({ result, formula }: { result: Extract<ExpenditureResult, { status: 'not-enough' }>; formula: number }) {
  const rows = [
    { label: 'Weigh-ins', have: result.have.weighIns, need: result.need.weighIns },
    { label: 'Days from first to last weigh-in', have: result.have.spanDays, need: result.need.spanDays },
    { label: 'Days with calories logged', have: result.have.intakeDays, need: result.need.intakeDays },
  ]
  return (
    <div className="card stack">
      <h2 className="card-title">Getting to know you</h2>
      <p className="card-text">
        Log your morning weight and the day&apos;s calories for about two weeks. Then the check-in compares the two and works out what you really burn.
        Until then, your plan uses the formula: about <strong>{cal(round10(formula))}</strong> calories a day to maintain.
      </p>
      <ul className="checklist" aria-label="What the first check-in needs, from the last 5 weeks">
        {rows.map(row => {
          const done = row.have >= row.need
          return (
            <li key={row.label} className={done ? 'is-done' : undefined}>
              <span className="checklist-mark" aria-hidden="true">
                {done ? '✓' : ''}
              </span>
              <span className="checklist-label">{row.label}</span>
              <span className="checklist-count">
                {Math.min(row.have, row.need)} of {row.need}
                <span className="visually-hidden">{done ? ', done' : ''}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <a className="btn btn-primary" href="#log">
        Go to the log
      </a>
    </div>
  )
}

export function CheckInView({ person, planCalories, unit, showToast }: CheckInViewProps) {
  const [checkIns, setCheckIns] = useState<CheckIn[]>(() => loadCheckIns())
  const [breakValue, setBreakValue] = useState<MaintenanceBreak | null>(() => loadBreak())
  const today = todayIso()

  if (!person) {
    return (
      <section className="log" aria-labelledby="checkin-title">
        <Head />
        <div className="card stack">
          <p className="card-text">The check-in starts from your plan, so answer the four plan questions first.</p>
          <a className="btn btn-primary" href="#plan">
            Make your plan
          </a>
        </div>
      </section>
    )
  }

  const entries = loadLog()
  const points = weightTrend(entries)
  const onBreak = isBreakActive(breakValue, today)
  // Use today's trend weight, not the weight typed into the plan weeks ago. During a break the
  // targets are maintenance; the plan's own goal is left alone and comes back when it ends.
  const current: Person = {
    ...person,
    weightKg: points[points.length - 1]?.trendKg ?? person.weightKg,
    goal: onBreak ? 'maintain' : person.goal,
  }
  const formula = calculateBmr(current.weightKg, current.heightCm, current.age, current.sex) * current.activity
  const caloriesPerKg = caloriesPerKgChange(current.weightKg, current.heightCm, current.age, current.sex)
  const previous = previousCheckIn(checkIns, today)
  const result = estimateExpenditure({ entries, today, formulaMaintenance: formula, caloriesPerKg, previous })
  const savedToday = checkIns.find(item => item.date === today)
  const last = checkIns[checkIns.length - 1]

  function handleSave(expenditure: number, plan: ReturnType<typeof calculatePlan>) {
    const next = saveCheckIn(checkIns, {
      date: today,
      expenditure: Math.round(expenditure),
      calories: plan.calories,
      protein: plan.protein.grams,
      carbs: plan.carbs.grams,
      fats: plan.fats.grams,
      goal: current.goal,
    })
    if (!next) {
      showToast('Could not save. Your browser is blocking storage.')
      return
    }
    setCheckIns(next)
    showToast(`Check-in saved. Next one on ${formatDay(addDays(today, CHECK_IN_EVERY_DAYS))}.`)
  }

  function changeBreak(value: MaintenanceBreak | null, message: string) {
    if (!saveBreak(value)) {
      showToast('Could not save. Your browser is blocking storage.')
      return
    }
    setBreakValue(value)
    showToast(message)
  }

  const weeks = person.goal === 'cutting' && !onBreak ? weeksOfFatLoss(checkIns, today, breakValue) : 0

  return (
    <section className="log" aria-labelledby="checkin-title">
      <Head />
      {last ? (
        <p className="checkin-status" data-testid="checkin-status">
          {last.date === today
            ? `Checked in today. Next check-in on ${formatDay(addDays(today, CHECK_IN_EVERY_DAYS), today)}.`
            : daysBetween(last.date, today) >= CHECK_IN_EVERY_DAYS
              ? `Last check-in ${formatDay(last.date, today)}. A new one is due.`
              : `Last check-in ${formatDay(last.date, today)}. Next one on ${formatDay(addDays(last.date, CHECK_IN_EVERY_DAYS), today)}; the numbers below update as you log.`}
        </p>
      ) : null}

      {onBreak ? <BreakNow value={breakValue} today={today} onEnd={() => changeBreak(null, 'Break ended. Your fat loss targets are back.')} /> : null}

      {result.status === 'not-enough' ? (
        <NotEnoughData result={result} formula={formula} />
      ) : (
        <Ready
          result={result}
          current={current}
          planCalories={last?.calories ?? planCalories}
          comparedWith={last ? 'last check-in' : 'plan'}
          unit={unit}
          savedToday={Boolean(savedToday)}
          onBreak={onBreak}
          onSave={handleSave}
        />
      )}

      {person.goal === 'cutting' && !onBreak && result.status === 'ready' ? (
        <BreakOffer
          weeks={weeks}
          suggested={weeks >= SUGGEST_BREAK_AFTER_WEEKS}
          onStart={length => {
            const value = startBreak(today, length)
            changeBreak(value, `Break started. Fat loss targets come back on ${formatDay(value.end, today)}.`)
          }}
        />
      ) : null}

      {checkIns.length > 0 ? (
        <div className="card">
          <h2 className="card-title" id="checkins-title">
            Past check-ins
          </h2>
          <div className="table-scroll">
            <table className="log-table checkin-table" aria-labelledby="checkins-title">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Maintenance</th>
                  <th scope="col">Target</th>
                </tr>
              </thead>
              <tbody>
                {[...checkIns].reverse().map(item => (
                  <tr key={item.date}>
                    <th scope="row">{formatDay(item.date, today)}</th>
                    <td className="food">
                      {cal(round10(item.expenditure))} cal<small>{GOAL_LABELS[item.goal]}</small>
                    </td>
                    <td className="food">
                      {cal(item.calories)} cal
                      <small>
                        P {item.protein} · C {item.carbs} · F {item.fats}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <ReminderCard firstDay={last ? addDays(last.date, CHECK_IN_EVERY_DAYS) : today} today={today} onDone={showToast} />

      <p className="disclaimer">
        An estimate from your own log, not medical advice. It is only as good as the log: weigh in the morning before eating, and log everything, including drinks
        and cooking oil.
      </p>
    </section>
  )
}

function Head() {
  return (
    <div className="results-head">
      <p className="eyebrow">Weekly check-in</p>
      <h1 id="checkin-title" className="display" tabIndex={-1}>
        What you really burn
      </h1>
      <p className="lede">The formula is a starting guess. Your weight trend and the calories you log show what your body actually uses.</p>
    </div>
  )
}

interface ReadyProps {
  result: Extract<ExpenditureResult, { status: 'ready' }>
  current: Person
  planCalories: number | null
  comparedWith: 'plan' | 'last check-in'
  unit: UnitSystem
  savedToday: boolean
  onBreak: boolean
  onSave: (expenditure: number, plan: ReturnType<typeof calculatePlan>) => void
}

function Ready({ result, current, planCalories, comparedWith, unit, savedToday, onBreak, onSave }: ReadyProps) {
  const plan = calculatePlan(current, { maintenance: result.expenditure, caloriesPerKg: result.caloriesPerKg })
  const dataPct = Math.round(result.dataWeight * 100)
  const difference = planCalories === null ? 0 : plan.calories - planCalories
  const expected = weeklyChangeText(plan.breakdown.weeklyChangeKg, unit)
  const spanDays = daysBetween(result.start, result.end)
  const loggedDays = Math.round(result.loggedShare * spanDays)
  const patchy = result.loggedShare < PATCHY_SHARE

  return (
    <>
      <div className="card stack">
        <h2 className="card-title">Estimated maintenance</h2>
        <p className="big-number">
          <span data-testid="expenditure">{cal(round10(result.expenditure))}</span> <span className="big-unit">calories a day</span>
        </p>
        <p className="card-text">
          Likely between {cal(round10(result.low))} and {cal(round10(result.high))}. The formula said {cal(round10(result.formula))}; this estimate is{' '}
          <span data-testid="data-share">{dataPct}%</span> from your log and {100 - dataPct}% from the formula.
        </p>
        <div className="share-bar" aria-hidden="true">
          <span className="share-data" style={{ width: `${dataPct}%` }} />
        </div>
        {result.limited || result.unusual || result.partDays.length > 0 || result.markedDays.length > 0 || patchy ? (
          <ul className="notices" data-testid="checkin-notices">
            {result.markedDays.length > 0 ? (
              <li className="notice">
                <AlertIcon />{' '}
                <span>
                  Left out {result.markedDays.length === 1 ? 'the day' : `${result.markedDays.length} days`} you marked as not complete (
                  {result.markedDays.map(day => formatDay(day)).join(', ')}).
                </span>
              </li>
            ) : null}
            {result.partDays.length > 0 ? (
              <li className="notice">
                <AlertIcon />{' '}
                <span>
                  {result.partDays.length === 1 ? 'One day' : `${result.partDays.length} days`} logged under half your usual (
                  {result.partDays.map(day => formatDay(day)).join(', ')}) {result.partDays.length === 1 ? 'looks' : 'look'} like a forgotten meal
                  and {result.partDays.length === 1 ? 'was' : 'were'} left out. If you really ate that little, the estimate may read a little high.
                </span>
              </li>
            ) : null}
            {patchy ? (
              <li className="notice">
                <AlertIcon />{' '}
                <span>
                  Calories are logged on {loggedDays} of {spanDays} days, so the estimate leans more on the formula. Days off the log are often
                  the bigger days, so log those too, even as a rough guess.
                </span>
              </li>
            ) : null}
            {result.limited ? (
              <li className="notice">
                <AlertIcon />{' '}
                <span>
                  Your log points to {cal(round10(result.blended))} calories. The estimate moves at most 200 calories a week between
                  check-ins so one odd week does not swing your targets; it will keep moving if the trend holds.
                </span>
              </li>
            ) : null}
            {result.unusual ? (
              <li className="notice">
                <AlertIcon />{' '}
                <span>
                  Your log is far from what the formula expects. That can be real, but check that you log everything you eat and drink, and weigh in at the same time
                  each morning.
                </span>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <div className="card stack">
        <h2 className="card-title">Suggested targets</h2>
        <p className="card-text">
          {onBreak ? (
            'Maintain, for your break.'
          ) : (
            <>
              {GOAL_LABELS[current.goal]}
              {current.goal !== 'maintain' ? `, ${roundTo(plan.breakdown.pace * 100, 2)}% of body weight a week` : ''}. Change the goal or pace on the Plan tab.
            </>
          )}
        </p>
        <p className="big-number">
          <span data-testid="suggested-calories">{cal(plan.calories)}</span> <span className="big-unit">calories</span>
        </p>
        <p className="macro-line" data-testid="suggested-macros">
          Protein {plan.protein.grams}g · Carbs {plan.carbs.grams}g · Fats {plan.fats.grams}g
        </p>
        <p className="card-text">
          {planCalories !== null ? (
            <span data-testid="target-change">
              {difference === 0
                ? `Same as your ${comparedWith}.`
                : `${difference > 0 ? 'Up' : 'Down'} ${cal(Math.abs(difference))} from your ${comparedWith} (${cal(planCalories)}).`}
            </span>
          ) : null}
          {expected ? ` ${expected} expected.` : ''}
        </p>
        {plan.notes.length > 0 ? (
          <ul className="notices">
            {plan.notes.map(note => (
              <li key={note} className="notice">
                <AlertIcon /> <span>{note}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" className="btn btn-primary" onClick={() => onSave(result.expenditure, plan)}>
          {savedToday ? "Update today's check-in" : 'Save check-in'}
        </button>
      </div>

      <details className="card details">
        <summary>How this was worked out</summary>
        <dl className="breakdown checkin-breakdown">
          <div>
            <dt>
              Average calories logged ({result.intakeDays} days, {formatDay(result.start)} to {formatDay(addDays(result.end, -1))}
              {result.partDays.length + result.markedDays.length > 0 ? `; ${result.partDays.length + result.markedDays.length} part-logged left out` : ''})
            </dt>
            <dd>{cal(Math.round(result.averageIntake))} cal</dd>
          </div>
          <div>
            <dt>Weight change (best-fit line through {result.weighIns} weigh-ins)</dt>
            <dd>{signedWeight(result.weeklyChangeKg, unit)}</dd>
          </div>
          <div>
            <dt>Energy in a kg of your weight change</dt>
            <dd>{cal(round10(result.caloriesPerKg))} cal</dd>
          </div>
          <div>
            <dt>= Burn from your log</dt>
            <dd>{cal(Math.round(result.fromData))} cal</dd>
          </div>
          <div>
            <dt>Formula (at today&apos;s trend weight)</dt>
            <dd>{cal(Math.round(result.formula))} cal</dd>
          </div>
          <div className="breakdown-total">
            <dt>Estimate ({dataPct}% log)</dt>
            <dd>{cal(round10(result.expenditure))} cal</dd>
          </div>
        </dl>
        <p className="fine-print">
          Burn = average calories eaten minus the change in stored energy. A kg of weight change holds about 9,400 calories if it is fat and 1,800 if it is lean
          tissue and water (Hall, 2008); how much of yours is fat is estimated from your BMI, age and sex (Deurenberg, 1991; Forbes, 2000). Days with no calories
          are left out, not counted as zero, and missed weigh-ins are fine. The log and the formula are mixed by how certain each one is, so early on the formula
          counts more. It uses what you ate, not what you planned, and the last 5 weeks only.
        </p>
      </details>
    </>
  )
}
