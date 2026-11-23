import { useEffect, useRef, useState } from 'react'
import type { Dispatch, FormEvent } from 'react'
import type { FieldErrors, FormAction, FormState, StepId } from '../form'
import { STEPS, stepErrors } from '../form'
import { ACTIVITY_LEVELS, BULK_PACES, CUT_PACES, paceFor } from '../engine/calculate'
import type { Goal, Sex, UnitSystem } from '../engine/types'
import { Choice, FieldError, NumberField } from './fields'
import { ArrowLeftIcon, ArrowRightIcon, BalanceIcon, DumbbellIcon, FlameIcon } from './Icons'

const STEP_TITLES: Record<StepId, { title: string; subtitle: string }> = {
  about: { title: 'About you', subtitle: 'Used only for the calorie formula.' },
  body: { title: 'Your body', subtitle: 'Today\'s weight is fine. You can update it any time.' },
  activity: {
    title: 'How active are you?',
    subtitle: 'Count your job and your training. If you sit at work and lift 3 or 4 days a week, start with Lightly active or Active, and pick the lower one if unsure.',
  },
  goal: { title: 'What\'s the goal?', subtitle: 'You can switch goals later and see the new numbers right away.' },
}

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
]

const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: 'imperial', label: 'lb / ft' },
  { value: 'metric', label: 'kg / cm' },
]

export const GOAL_OPTIONS = [
  { value: 'cutting' as Goal, label: 'Lose fat', short: 'Cut', detail: 'A moderate deficit with high protein to keep muscle', icon: <FlameIcon /> },
  { value: 'maintain' as Goal, label: 'Maintain', short: 'Maintain', detail: 'Eat at maintenance, build strength, recomp slowly', icon: <BalanceIcon /> },
  { value: 'bulking' as Goal, label: 'Build muscle', short: 'Bulk', detail: 'A small surplus for lean gains', icon: <DumbbellIcon /> },
]

export function paceOptions(goal: Goal) {
  const paces = goal === 'cutting' ? CUT_PACES : BULK_PACES
  return paces.map(pace => ({ value: pace.value as number, label: pace.label }))
}

/** The detail line for the chosen pace, like "0.5% a week, the usual choice". */
export function paceHint(goal: Goal, pace: number | null): string {
  const paces: readonly { value: number; detail: string }[] = goal === 'cutting' ? CUT_PACES : BULK_PACES
  const chosen = paceFor(goal, pace ?? undefined)
  return paces.find(option => option.value === chosen)?.detail ?? ''
}

const ACTIVITY_OPTIONS = ACTIVITY_LEVELS.map(level => ({ value: level.value, label: level.label, detail: level.detail }))

interface WizardProps {
  form: FormState
  dispatch: Dispatch<FormAction>
  initialStep: number
  onFinish: () => void
}

export function Wizard({ form, dispatch, initialStep, onFinish }: WizardProps) {
  const [stepIndex, setStepIndex] = useState(initialStep)
  // Errors only show after the user presses Continue on that step, then update as they type.
  const [triedSteps, setTriedSteps] = useState<Set<StepId>>(new Set())
  const headingRef = useRef<HTMLHeadingElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const firstRender = useRef(true)

  const step = STEPS[stepIndex]
  const errors: FieldErrors = triedSteps.has(step) ? stepErrors(form, step) : {}
  const isLast = stepIndex === STEPS.length - 1

  // Move focus to the new step's heading so keyboard and screen reader users know the page changed.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [stepIndex])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const problems = stepErrors(form, step)
    if (Object.keys(problems).length > 0) {
      setTriedSteps(new Set(triedSteps).add(step))
      // Wait for the error state to render, then focus the first field with a problem.
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], .has-error input')?.focus()
      })
      return
    }
    if (isLast) onFinish()
    else setStepIndex(stepIndex + 1)
  }

  const set = (field: 'age' | 'weight' | 'heightFt' | 'heightIn' | 'heightCm') => (value: string) =>
    dispatch({ type: 'set', field, value })

  return (
    <section className="wizard" aria-labelledby="step-title">
      {stepIndex === 0 ? (
        <div className="intro">
          <p className="eyebrow">Free macro calculator</p>
          <h1 className="display">Find your macros.</h1>
          <p className="lede">Four quick questions. No sign-up, and nothing leaves your phone.</p>
        </div>
      ) : null}

      <div className="progress" aria-hidden="true">
        {STEPS.map((id, i) => (
          <span key={id} className={`progress-seg${i <= stepIndex ? ' is-done' : ''}`} />
        ))}
      </div>
      <p className="step-count">
        Step {stepIndex + 1} of {STEPS.length}
      </p>

      <form ref={formRef} className="card step-card" onSubmit={handleSubmit} noValidate>
        <h2 id="step-title" className="step-title" ref={headingRef} tabIndex={-1}>
          {STEP_TITLES[step].title}
        </h2>
        <p className="step-subtitle">{STEP_TITLES[step].subtitle}</p>

        {step === 'about' ? (
          <div className="stack">
            <Choice
              legend="Sex"
              name="sex"
              variant="segmented"
              options={SEX_OPTIONS}
              value={form.sex}
              onChange={value => dispatch({ type: 'set', field: 'sex', value })}
              error={errors.sex}
              hint={'"Other" uses the average of the two formulas.'}
            />
            <NumberField id="age" label="Age" suffix="years" value={form.age} onChange={set('age')} error={errors.age} placeholder="25" hint="13 to 100" />
          </div>
        ) : null}

        {step === 'body' ? (
          <div className="stack">
            <Choice
              legend="Units"
              name="unit"
              variant="segmented"
              options={UNIT_OPTIONS}
              value={form.unit}
              onChange={unit => dispatch({ type: 'switchUnit', unit })}
            />
            <NumberField
              id="weight"
              label="Weight"
              suffix={form.unit === 'imperial' ? 'lb' : 'kg'}
              value={form.weight}
              onChange={set('weight')}
              error={errors.weight}
              placeholder={form.unit === 'imperial' ? '180' : '82'}
              decimals
            />
            {form.unit === 'imperial' ? (
              <fieldset className="height-group">
                <legend className="field-label">Height</legend>
                <div className="height-row">
                  <NumberField id="height-ft" label="Feet" hideLabel suffix="ft" value={form.heightFt} onChange={set('heightFt')} error={errors.height} placeholder="5" describedBy="height-error" />
                  <NumberField id="height-in" label="Inches" hideLabel suffix="in" value={form.heightIn} onChange={set('heightIn')} error={errors.height} placeholder="10" describedBy="height-error" decimals />
                </div>
                <FieldError id="height-error" message={errors.height} />
              </fieldset>
            ) : (
              <>
                <NumberField id="height-cm" label="Height" suffix="cm" value={form.heightCm} onChange={set('heightCm')} error={errors.height} placeholder="178" describedBy="height-error" decimals />
                <FieldError id="height-error" message={errors.height} />
              </>
            )}
          </div>
        ) : null}

        {step === 'activity' ? (
          <Choice
            legend="Activity level"
            hideLegend
            name="activity"
            variant="cards"
            options={ACTIVITY_OPTIONS}
            value={form.activity}
            onChange={value => dispatch({ type: 'set', field: 'activity', value })}
            error={errors.activity}
          />
        ) : null}

        {step === 'goal' ? (
          <Choice
            legend="Goal"
            hideLegend
            name="goal"
            variant="cards"
            options={GOAL_OPTIONS}
            value={form.goal}
            onChange={value => dispatch({ type: 'set', field: 'goal', value })}
            error={errors.goal}
          />
        ) : null}

        {step === 'goal' && (form.goal === 'cutting' || form.goal === 'bulking') ? (
          <div className="pace-choice">
            <Choice
              legend={form.goal === 'cutting' ? 'How fast do you want to lose?' : 'How fast do you want to gain?'}
              name="pace"
              variant="segmented"
              options={paceOptions(form.goal)}
              value={paceFor(form.goal, form.pace ?? undefined)}
              onChange={value => dispatch({ type: 'set', field: 'pace', value })}
              hint={paceHint(form.goal, form.pace)}
            />
          </div>
        ) : null}

        <div className="step-actions">
          {stepIndex > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStepIndex(stepIndex - 1)}>
              <ArrowLeftIcon /> Back
            </button>
          ) : (
            <span />
          )}
          <button type="submit" className="btn btn-primary">
            {isLast ? 'See my macros' : 'Continue'} <ArrowRightIcon />
          </button>
        </div>
      </form>
    </section>
  )
}
