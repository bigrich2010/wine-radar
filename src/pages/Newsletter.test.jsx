import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock the Supabase client entirely - Newsletter.jsx only touches it in saveAsIssue,
// but importing the real client module would try to call createClient() with
// possibly-missing env vars in a test environment and blow up at import time.
vi.mock('../supabaseClient.js', () => ({
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
}))

import Newsletter from './Newsletter.jsx'

function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

describe('Newsletter - concurrency guard UI correctness', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('when two clicks land in the same React batch, the busy indicator reflects the call that actually won the race, not whichever called setState last', async () => {
    const first = deferred()
    let callCount = 0

    global.fetch = vi.fn(() => {
      callCount++
      return callCount === 1 ? first.promise : Promise.resolve({ ok: true, json: async () => ({ ok: true, key: 'diverge', label: 'Where the Critics Diverge', text: 'x' }) })
    })

    render(<Newsletter />)
    const industryBtn = screen.getByText('Industry Watch').closest('.section-card').querySelector('button')
    const divergeBtn = screen.getByText('Where the Critics Diverge').closest('.section-card').querySelector('button')

    // Batch both clicks inside one act() so React's automatic batching defers the
    // re-render (and the resulting disabled state) until after BOTH handlers have
    // already started executing - this is what genuinely reproduces "two taps land
    // before the UI updates," not two separate fireEvent calls (which flush a render,
    // and thus disable the second button, in between).
    act(() => {
      fireEvent.click(industryBtn)
      fireEvent.click(divergeBtn)
    })

    // Only one real fetch should have gone out - the second was blocked by the
    // synchronous, atomic lock in sectionGenerator.
    expect(callCount).toBe(1)

    // The card that actually acquired the lock (Industry Watch, clicked first) must be
    // the one showing as busy - not Diverge, even though Diverge's click ran second and
    // would have "won" under the old (buggy) unconditional setGeneratingKey approach.
    expect(industryBtn.textContent).toBe('Working…')
    expect(divergeBtn.textContent).toBe('Generate')

    first.resolve({ ok: true, json: async () => ({ ok: true, key: 'industry', label: 'Industry Watch', text: '## Industry Watch\nReal content here.' }) })

    await waitFor(() => expect(industryBtn.textContent).not.toBe('Working…'))
    expect(industryBtn.textContent).toBe('Refresh')
    expect(screen.getByText(/Real content here/)).toBeInTheDocument()
  })

  it('after a completed generation, a fresh click on the same section works normally', async () => {
    let callCount = 0
    global.fetch = vi.fn(async () => {
      callCount++
      return { ok: true, json: async () => ({ ok: true, key: 'industry', label: 'Industry Watch', text: `## Industry Watch\nRun ${callCount}.` }) }
    })

    render(<Newsletter />)
    const btn = screen.getByText('Industry Watch').closest('.section-card').querySelector('button')

    fireEvent.click(btn)
    await waitFor(() => expect(screen.getByText(/Run 1/)).toBeInTheDocument())

    fireEvent.click(btn)
    await waitFor(() => expect(screen.getByText(/Run 2/)).toBeInTheDocument())

    expect(callCount).toBe(2)
  })
})
