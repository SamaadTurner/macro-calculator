import { useEffect, useReducer, useRef, useState } from 'react'
import { emptyForm, firstIncompleteStep, formReducer, STEPS, toPerson } from './form'
import { calculatePlan } from './engine/calculate'
import { checkGoal } from './engine/validate'
import { parseNumber } from './engine/units'
import type { Goal } from './engine/types'
import { clearForm, deletePlan, loadForm, loadPlans, saveForm, savePlan } from './storage'
import type { SavedPlan } from './storage'
import { Wizard } from './components/Wizard'
import { planAsText, Results } from './components/Results'
import { LogView } from './components/LogView'
import { CheckInView } from './components/CheckInView'
import { SupportLine } from './components/SupportLine'
import { UpdateBanner } from './components/UpdateBanner'
import { loadCheckIns } from './coach/checkins'
import { isBreakActive, loadBreak } from './coach/phases'
import { todayIso } from './log/dates'

type View = { name: 'steps'; step: number } | { name: 'results' }
type Tab = 'plan' | 'log' | 'checkin'

function activeBreakEnd(): string | null {
  const value = loadBreak()
  return isBreakActive(value, todayIso()) ? value.end : null
}

// The tab lives in the address (#log, #checkin) so a reload or a home screen bookmark opens the same tab.
const tabFromHash = (): Tab => (window.location.hash === '#log' ? 'log' : window.location.hash === '#checkin' ? 'checkin' : 'plan')

export default function App() {
  // Returning visitors see their last answers; if those are complete, they land on their results.
  const [form, dispatch] = useReducer(formReducer, undefined, () => loadForm() ?? emptyForm)
  const [view, setView] = useState<View>(() => (toPerson(form) ? { name: 'results' } : { name: 'steps', step: 0 }))
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>(() => loadPlans())
  const [toast, setToast] = useState('')
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const toastTimer = useRef<number>()

  useEffect(() => {
    const onHashChange = () => {
      setTab(tabFromHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    saveForm(form)
  }, [form])

  const person = toPerson(form)
  const plan = person ? calculatePlan(person) : null

  function showToast(message: string) {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2500)
  }

  function showResults() {
    setView({ name: 'results' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    requestAnimationFrame(() => document.getElementById('results-title')?.focus())
  }

  function changeGoal(goal: Goal) {
    const problem = checkGoal(goal, parseNumber(form.age))
    if (problem) {
      showToast(problem)
      return
    }
    dispatch({ type: 'set', field: 'goal', value: goal })
  }

  function handleSave() {
    if (!plan || !form.goal) return
    const plans = savePlan(plan, form.goal)
    if (plans) {
      setSavedPlans(plans)
      showToast('Plan saved on this device')
    } else {
      showToast('Could not save. Your browser is blocking storage.')
    }
  }

  async function handleCopy() {
    if (!plan) return
    try {
      await navigator.clipboard.writeText(planAsText(plan, form.goal))
      showToast('Copied')
    } catch {
      showToast('Could not copy. Select the numbers and copy them by hand.')
    }
  }

  async function handleShare() {
    if (!plan) return
    try {
      await navigator.share({ title: 'My macros', text: planAsText(plan, form.goal) })
    } catch {
      // The user closed the share sheet, nothing to do.
    }
  }

  function startOver() {
    clearForm()
    dispatch({ type: 'reset' })
    setView({ name: 'steps', step: 0 })
    window.scrollTo({ top: 0 })
  }

  const showingResults = view.name === 'results' && plan !== null && form.goal !== ''

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="./">
          <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
            <circle className="brand-mark" cx="32" cy="32" r="22" fill="none" strokeWidth="9" strokeDasharray="100 38" strokeLinecap="round" transform="rotate(-90 32 32)" />
          </svg>
          <span className="brand-name">Macros</span>
        </a>
        <nav className="tabs" aria-label="Sections">
          <a className="tab" href="#plan" aria-current={tab === 'plan' ? 'page' : undefined}>
            Plan
          </a>
          <a className="tab" href="#log" aria-current={tab === 'log' ? 'page' : undefined}>
            Log
          </a>
          <a className="tab" href="#checkin" aria-current={tab === 'checkin' ? 'page' : undefined}>
            Check-in
          </a>
        </nav>
      </header>

      <main className="shell">
        {tab === 'checkin' ? (
          <CheckInView person={person} planCalories={plan?.calories ?? null} unit={form.unit} showToast={showToast} />
        ) : tab === 'log' ? (
          <LogView unit={form.unit} onUnitChange={unit => dispatch({ type: 'switchUnit', unit })} showToast={showToast} />
        ) : showingResults ? (
          <Results
            plan={plan}
            goal={form.goal as Goal}
            pace={form.pace}
            unit={form.unit}
            savedPlans={savedPlans}
            latestCheckIn={loadCheckIns().pop() ?? null}
            breakEnd={activeBreakEnd()}
            canShare={typeof navigator.share === 'function'}
            onGoalChange={changeGoal}
            onPaceChange={pace => dispatch({ type: 'set', field: 'pace', value: pace })}
            onEdit={() => setView({ name: 'steps', step: 0 })}
            onStartOver={startOver}
            onSave={handleSave}
            onCopy={handleCopy}
            onShare={handleShare}
            onDeletePlan={id => setSavedPlans(deletePlan(id))}
          />
        ) : (
          <Wizard
            key={view.name === 'steps' ? view.step : 0}
            form={form}
            dispatch={dispatch}
            initialStep={view.name === 'steps' ? view.step : STEPS.indexOf(firstIncompleteStep(form) ?? 'about')}
            onFinish={showResults}
          />
        )}
      </main>

      <footer className="footer">
        <SupportLine />
        <p>
          Made by{' '}
          <a href="https://instagram.com/maad.lifts" target="_blank" rel="noreferrer">
            @maad.lifts
          </a>{' '}
          · Your answers stay on this device ·{' '}
          <a href="https://github.com/SamaadTurner/macro-calculator" target="_blank" rel="noreferrer">
            Source
          </a>
        </p>
      </footer>

      <UpdateBanner />

      <div className={`toast${toast ? ' is-visible' : ''}`} role="status">
        {toast}
      </div>
    </div>
  )
}
