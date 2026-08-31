import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { supabase } from '../supabaseClient.js'
import { createSectionGenerator } from '../lib/sectionGenerator.js'

const SECTION_DEFS = [
  { key: 'industry', label: 'Industry Watch' },
  { key: 'diverge', label: 'Where the Critics Diverge' },
  { key: 'margaretriver', label: 'Margaret River' },
  { key: 'burgundy', label: 'Burgundy, Champagne & Beyond' },
  { key: 'barolo_bordeaux', label: 'Barolo & Bordeaux' },
  { key: 'deepdive', label: 'Deep Dive' },
  { key: 'perth', label: 'Around Perth' },
  { key: 'hitlist', label: 'Hit List & Coming Up' },
  { key: 'substack_intel', label: 'Substack Intelligence — Authors & Overlap' },
  { key: 'substack_leads', label: 'Substack Intelligence — Buying Leads' },
  { key: 'vintage_watch', label: 'Vintage & Producer Watch — Emily\u2019s Take' },
]

export default function Newsletter() {
  const [sections, setSections] = useState({}) // key -> { text, updated_at, queries, error }
  const [generatingKey, setGeneratingKey] = useState(null) // for UI display only - not the actual guard
  const [statusMsg, setStatusMsg] = useState('')
  const [saving, setSaving] = useState(false)

  // The real concurrency guard lives here, in a ref - synchronous and unaffected by React's
  // render/state timing, unlike the `generatingKey` state above (which is display-only).
  const generatorRef = useRef(null)
  if (!generatorRef.current) generatorRef.current = createSectionGenerator(fetch.bind(window))
  const savingRef = useRef(false)

  async function generateSection(key) {
    setStatusMsg('')
    const result = await generatorRef.current.generate(key, (acquiredKey) => {
      // This only ever fires for the call that actually won the race, synchronously
      // at the moment it acquires the lock - never for a call that gets skipped.
      setGeneratingKey(acquiredKey)
    })
    if (result.skipped) {
      // This call never acquired the lock, so it never touched generatingKey at all -
      // nothing to undo here, whatever is currently displayed belongs to the real one.
      return
    }
    if (!result.ok) {
      setSections(prev => ({ ...prev, [key]: { ...prev[key], error: result.error } }))
      setStatusMsg(`${SECTION_DEFS.find(s => s.key === key)?.label} failed: ${result.error}`)
    } else {
      setSections(prev => ({ ...prev, [key]: { text: result.text, updated_at: result.updated_at, queries: result.queries, truncated: result.truncated, error: null } }))
      setStatusMsg(`${result.label} updated.`)
    }
    setGeneratingKey(null)
  }

  async function saveAsIssue() {
    if (savingRef.current) return // same synchronous-guard pattern for the save button
    savingRef.current = true
    setSaving(true)
    try {
      const snapshot = SECTION_DEFS
        .map(def => sections[def.key] ? { key: def.key, label: def.label, text: sections[def.key].text, queries: sections[def.key].queries, updated_at: sections[def.key].updated_at } : null)
        .filter(s => s && s.text)
      if (snapshot.length === 0) {
        setStatusMsg('Nothing generated yet to save.')
        return
      }
      const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
      const { error } = await supabase.from('issues').insert({
        title: `Wine Radar — ${today}`,
        sections: snapshot,
        status: snapshot.length === SECTION_DEFS.length ? 'complete' : 'partial',
      })
      setStatusMsg(error ? `Save failed: ${error.message}` : 'Saved as an issue in Archive.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function printCurrent() {
    window.print()
  }

  return (
    <div>
      <div className="row no-print">
        <button className="secondary" onClick={saveAsIssue} disabled={saving}>{saving ? 'Saving…' : 'Save current as Issue'}</button>
        <button className="secondary" onClick={printCurrent}>Print / Save as PDF</button>
      </div>
      {statusMsg && <div className="status" style={{ marginBottom: 12 }}>{statusMsg}</div>}

      {SECTION_DEFS.map(def => {
        const s = sections[def.key]
        const busy = generatingKey === def.key
        const anyBusy = !!generatingKey
        return (
          <div className="section-card" key={def.key}>
            <div className="head">
              <h2>{def.label}</h2>
              <button className="primary no-print" disabled={anyBusy} onClick={() => generateSection(def.key)}>
                {busy ? 'Working…' : (s?.text ? 'Refresh' : 'Generate')}
              </button>
            </div>
            {s?.updated_at && <div className="updated">Updated {s.updated_at}{s.queries?.length ? ` · ${s.queries.length} searches` : ''}</div>}
            {s?.error && <div className="errtext">{s.error}</div>}
            {s?.text ? (
              <ReactMarkdown
                components={{
                  h2: () => null, // the "## Heading" from the model is redundant with the card's own h2
                  p: ({ children }) => <p className="body">{children}</p>,
                }}
              >
                {s.text}
              </ReactMarkdown>
            ) : (!s?.error && <div className="empty-inline">Not generated yet.</div>)}
          </div>
        )
      })}
    </div>
  )
}
