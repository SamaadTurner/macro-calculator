import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateBanner } from './UpdateBanner'

// The plugin's hook is replaced so the test can say "a new version is waiting" without a real service worker.
const hook = vi.hoisted(() => ({ needRefresh: false, setNeedRefresh: vi.fn(), updateServiceWorker: vi.fn() }))
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [hook.needRefresh, hook.setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: hook.updateServiceWorker,
  }),
}))

describe('new version banner', () => {
  beforeEach(() => {
    hook.setNeedRefresh.mockReset()
    hook.updateServiceWorker.mockReset()
  })

  it('shows nothing while the app is up to date', () => {
    hook.needRefresh = false
    const { container } = render(<UpdateBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('waits for the user, then reloads into the new version or hides', async () => {
    hook.needRefresh = true
    render(<UpdateBanner />)
    expect(screen.getByRole('region', { name: 'New version' })).toHaveTextContent('A new version of the app is ready.')
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(hook.updateServiceWorker).toHaveBeenCalledWith(true)
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(hook.setNeedRefresh).toHaveBeenCalledWith(false)
  })
})
