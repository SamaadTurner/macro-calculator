import { useId } from 'react'
import type { ReactNode } from 'react'
import { AlertIcon, CheckIcon } from './Icons'

export function FieldError({ id, message }: { id: string; message?: string }) {
  // The element is always there so screen readers announce the message when it appears.
  return (
    <p id={id} className="field-error" aria-live="polite">
      {message ? (
        <>
          <AlertIcon /> <span>{message}</span>
        </>
      ) : null}
    </p>
  )
}

interface NumberFieldProps {
  id: string
  label: string
  value: string
  suffix: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  placeholder?: string
  decimals?: boolean
  /** Lets two boxes share one label and one error, like feet and inches. */
  describedBy?: string
  hideLabel?: boolean
}

export function NumberField(props: NumberFieldProps) {
  const errorId = `${props.id}-error`
  const hintId = `${props.id}-hint`
  const describedBy = props.describedBy ?? [props.hint ? hintId : '', errorId].filter(Boolean).join(' ')
  return (
    <div className="field">
      <label htmlFor={props.id} className={props.hideLabel ? 'visually-hidden' : 'field-label'}>
        {props.label}
      </label>
      <div className={`number-input${props.error ? ' has-error' : ''}`}>
        {/* A text box with a number keyboard: type="number" lets the scroll wheel change values and hides bad input. */}
        <input
          id={props.id}
          type="text"
          inputMode={props.decimals ? 'decimal' : 'numeric'}
          autoComplete="off"
          placeholder={props.placeholder}
          value={props.value}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={describedBy}
          onChange={e => props.onChange(e.target.value)}
        />
        <span className="suffix" aria-hidden="true">
          {props.suffix}
        </span>
      </div>
      {props.hint && !props.describedBy ? (
        <p id={hintId} className="field-hint">
          {props.hint}
        </p>
      ) : null}
      {props.describedBy ? null : <FieldError id={errorId} message={props.error} />}
    </div>
  )
}

interface Option<T extends string | number> {
  value: T
  label: string
  detail?: string
  icon?: ReactNode
}

interface ChoiceProps<T extends string | number> {
  legend: string
  name: string
  options: readonly Option<T>[]
  value: T | null | ''
  onChange: (value: T) => void
  error?: string
  /** "segmented" is a row of pills, "cards" is a stack of large tappable cards. */
  variant: 'segmented' | 'cards'
  hideLegend?: boolean
  hint?: string
}

/** A set of real radio buttons styled as pills or cards, so arrow keys and screen readers work as normal. */
export function Choice<T extends string | number>(props: ChoiceProps<T>) {
  const groupId = useId()
  const errorId = `${props.name}-error`
  const hintId = `${groupId}-hint`
  return (
    <fieldset
      className={`choice choice-${props.variant}${props.error ? ' has-error' : ''}`}
      aria-describedby={[props.hint ? hintId : '', errorId].filter(Boolean).join(' ')}
    >
      <legend className={props.hideLegend ? 'visually-hidden' : 'field-label'}>{props.legend}</legend>
      {props.hint ? (
        <p id={hintId} className="field-hint choice-hint">
          {props.hint}
        </p>
      ) : null}
      <div className="choice-options">
        {props.options.map(option => {
          const optionId = `${groupId}-${option.value}`
          const checked = props.value === option.value
          return (
            <label key={String(option.value)} htmlFor={optionId} className={`choice-option${checked ? ' is-checked' : ''}`}>
              <input
                id={optionId}
                type="radio"
                name={props.name}
                value={String(option.value)}
                checked={checked}
                onChange={() => props.onChange(option.value)}
              />
              {option.icon ? <span className="choice-icon">{option.icon}</span> : null}
              <span className="choice-text">
                <span className="choice-label">{option.label}</span>
                {option.detail ? <span className="choice-detail">{option.detail}</span> : null}
              </span>
              {props.variant === 'cards' ? (
                <span className="choice-check" aria-hidden="true">
                  <CheckIcon size={16} />
                </span>
              ) : null}
            </label>
          )
        })}
      </div>
      <FieldError id={errorId} message={props.error} />
    </fieldset>
  )
}
