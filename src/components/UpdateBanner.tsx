import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Registers the service worker that keeps the app working offline. When a new version has
 * been downloaded it waits for the user: reloading by itself could throw away a half-typed log
 * entry. There is no "ready to use offline" message on purpose: it popped up during a first
 * visit and could replace the user's own "Saved" message.
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null
  return (
    <div className="update-banner" role="region" aria-label="New version">
      <p>A new version of the app is ready.</p>
      <div className="update-actions">
        <button type="button" className="btn btn-primary btn-small" onClick={() => updateServiceWorker(true)}>
          Reload
        </button>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
      </div>
    </div>
  )
}
