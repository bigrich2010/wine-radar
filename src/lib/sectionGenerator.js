// Framework-independent generation controller. Deliberately NOT a React hook - the guard
// against concurrent/double-tap generation must be a plain synchronous variable, not React
// state, because setState is asynchronous and two rapid clicks can both read a stale "not
// busy" value before the first re-render lands. This exact race is what caused the doubled
// API cost bug in the earlier Claude-artifact version of this app - fixing it structurally
// here rather than trusting a disabled-button prop to arrive in time.

export function createSectionGenerator(fetchImpl) {
  let busyKey = null // plain closure variable - reads/writes are synchronous, no React involved

  async function generate(key, onAcquired) {
    if (busyKey) {
      return { skipped: true, reason: `already generating "${busyKey}"` }
    }
    busyKey = key
    // Fires synchronously, in the same tick as the lock acquisition, before any await.
    // This guarantees a call that gets skipped (because it lost the race above) can never
    // reach here - so it's structurally impossible for a skipped call to touch UI state
    // that belongs to whichever call actually acquired the lock, even if two calls are
    // triggered back-to-back in the same React batch before any re-render happens.
    if (onAcquired) onAcquired(key)
    try {
      const res = await fetchImpl('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionKey: key }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        return { ok: false, key, error: json.error || `HTTP ${res.status}` }
      }
      return { ok: true, key, label: json.label, text: json.text, queries: json.queries, truncated: json.truncated, updated_at: json.updated_at }
    } catch (e) {
      return { ok: false, key, error: `Network error: ${e.message}` }
    } finally {
      busyKey = null
    }
  }

  function isBusy(key) {
    return key ? busyKey === key : !!busyKey
  }

  return { generate, isBusy }
}
