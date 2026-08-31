import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSectionGenerator } from '../src/lib/sectionGenerator.js'

function mockJsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body }
}

test('two generate() calls fired back-to-back before either resolves: only ONE actual fetch happens', async () => {
  let fetchCallCount = 0
  const fetchImpl = async () => {
    fetchCallCount++
    // simulate real network latency - if the guard were async/state-based, both calls
    // would already be in flight before either finishes, which is exactly the bug
    await new Promise(r => setTimeout(r, 30))
    return mockJsonResponse({ ok: true, key: 'industry', label: 'Industry Watch', text: 'x' })
  }
  const gen = createSectionGenerator(fetchImpl)

  // Fire both synchronously, in the same tick - this is what a rapid double-tap looks like
  const p1 = gen.generate('industry')
  const p2 = gen.generate('industry')
  const [r1, r2] = await Promise.all([p1, p2])

  assert.equal(fetchCallCount, 1, 'only one real API call should have been made')
  const skippedCount = [r1, r2].filter(r => r.skipped).length
  assert.equal(skippedCount, 1, 'exactly one of the two calls should have been rejected as a duplicate')
})

test('generating a DIFFERENT section while one is in flight is also blocked (global lock, not per-key)', async () => {
  let fetchCallCount = 0
  const fetchImpl = async () => {
    fetchCallCount++
    await new Promise(r => setTimeout(r, 30))
    return mockJsonResponse({ ok: true, key: 'x', label: 'X', text: 'y' })
  }
  const gen = createSectionGenerator(fetchImpl)
  const p1 = gen.generate('industry')
  const p2 = gen.generate('margaretriver') // different key, should still be blocked
  await Promise.all([p1, p2])
  assert.equal(fetchCallCount, 1)
})

test('after a generation completes, a new one is allowed (guard releases properly)', async () => {
  let fetchCallCount = 0
  const fetchImpl = async () => {
    fetchCallCount++
    return mockJsonResponse({ ok: true, key: 'industry', label: 'Industry Watch', text: 'x' })
  }
  const gen = createSectionGenerator(fetchImpl)
  await gen.generate('industry')
  await gen.generate('industry')
  assert.equal(fetchCallCount, 2, 'sequential calls after completion should both go through')
})

test('guard releases even when the fetch throws (no permanent lockout after an error)', async () => {
  let attempt = 0
  const fetchImpl = async () => {
    attempt++
    if (attempt === 1) throw new Error('network down')
    return mockJsonResponse({ ok: true, key: 'industry', label: 'Industry Watch', text: 'recovered' })
  }
  const gen = createSectionGenerator(fetchImpl)
  const r1 = await gen.generate('industry')
  assert.equal(r1.ok, false)
  const r2 = await gen.generate('industry')
  assert.equal(r2.ok, true, 'guard should not be stuck locked after a failed call')
})

test('an API-level error (non-2xx) is surfaced, not thrown', async () => {
  const fetchImpl = async () => mockJsonResponse({ error: 'usage limit reached' }, false, 429)
  const gen = createSectionGenerator(fetchImpl)
  const r = await gen.generate('industry')
  assert.equal(r.ok, false)
  assert.match(r.error, /usage limit reached/)
})
