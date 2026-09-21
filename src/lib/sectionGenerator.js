export function createSectionGenerator(fetchImpl) {
  let busyKey = null

  async function generate(key, onAcquired) {
    if (busyKey) {
      return { skipped: true, reason: `already generating "${busyKey}"` }
    }
    busyKey = key
    if (onAcquired) onAcquired(key)
    try {
      const res = await fetchImpl('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionKey: key }),
      })
      let json
      try {
        json = await res.json()
      } catch (parseErr) {
        return { ok: false, key, error: `Server didn't respond properly (HTTP ${res.status}) - likely a timeout on a search-heavy section. Try again.` }
      }
      if (!res.ok || json.error) {
        return { ok: false, key, error: json.error || `HTTP ${res.status}` }
      }
      return { ok: true, key, label: json.label, text: json.text, queries: json.queries, truncated: json.truncated, updated_at: json.updated_at, autoAddedLeads: json.autoAddedLeads }
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
