import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { supabase } from '../supabaseClient.js'
import { createSectionGenerator } from '../lib/sectionGenerator.js'

const SECTION_DEFS = [
  { key: 'industry', label: 'Industry Watch' },
  { key: 'diverge', label: 'Where the Critics Diverge' },
  { key: 'margaretriver', label: 'Margaret River' },
  { key: 'burgundy', label: 'Cool-Climate Pinot & Chardonnay (Australia/NZ)' },
  { key: 'barolo_bordeaux', label: 'Barolo & Bordeaux' },
  { key: 'deepdive', label: 'Deep Dive' },
  { key: 'perth', label: 'Around Perth' },
  { key: 'hitlist', label: 'Hit List & Coming Up' },
  { key: 'critic_highlights', label: 'Critic Highlights — Top Scores This Cycle' },
  { key: 'substack_intel', label: 'Substack Intelligence — Authors & Overlap' },
  { key: 'substack_leads', label: 'Substack Intelligence — Buying Leads' },
  { key: 'vintage_watch', label: 'Vintage Watch — Emily\u2019s Take' },
  { key: 'producer_watch', label: 'Producer Watch — Emily\u2019s Take' },
]

const STORAGE_KEY = 'wine-radar-draft-sections'

function loadSavedSections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

export default function Newsletter() {
  const [sections, setSections] = useState(loadSavedSections)
  const [generatingKey, setGeneratingKey] = useState(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [runningAll, setRunningAll] = useState(false)
  const [allProgress, setAllProgress] = useState({ done: 0, total: 0 })
  const runningAllRef = useRef(false)

  const generatorRef = useRef(null)
  if (!generatorRef.current) generatorRef.current = createSectionGenerator(fetch.bind(window))
  const savingRef = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sections))
    } catch (e) {}
  }, [sections])

  async function generateSection(key) {
    setStatusMsg('')
    const result = await generatorRef.current.generate(key, (acquiredKey) => {
      setGeneratingKey(acquiredKey)
    })
    if (result.skipped) {
      return
    }
    if (!result.ok) {
      setSections(prev => ({ ...prev, [key]: { ...prev[key], error: result.error } }))
      setStatusMsg(`${SECTION_DEFS.find(s => s.key === key)?.label} failed: ${result.error}`)
    } else {
      setSections(prev => ({ ...prev, [key]: { text: result.text, updated_at: result.updated_at, queries: result.queries, truncated: result.truncated, error: null } }))
      const leadsNote = result.autoAddedLeads > 0 ? ` ${result.autoAddedLeads} lead${result.autoAddedLeads === 1 ? '' : 's'} added to Get Me Some.` : ''
      setStatusMsg(`${result.label} updated.${leadsNote}`)
    }
    setGeneratingKey(null)
    return result
  }

  async function generateAll() {
    if (runningAllRef.current) return
    runningAllRef.current = true
    setRunningAll(true)
    setAllProgress({ done: 0, total: SECTION_DEFS.length })
    for (let i = 0; i < SECTION_DEFS.length; i++) {
      setAllProgress({ done: i, total: SECTION_DEFS.length })
      await generateSection(SECTION_DEFS[i].key)
    }
    setAllProgress({ done: SECTION_DEFS.length, total: SECTION_DEFS.length })
    runningAllRef.current = false
    setRunningAll(false)
  }

  async function saveAsIssue() {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      const snapshot = SECTION_DEFS
        .map(def => sections[def.key] ? { key: def.key, label: def.label, text: sections[def.key].text, queries: sections[def.key].queries, updated_at: sections[def.key].updated_at, truncated: sections[def.key].truncated } : null)
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

  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="doc-title">
        <h1>🍷 Wine Radar</h1>
        <div className="doc-date">{today}</div>
      </div>
      <div className="row no-print">
        <button className="primary" onClick={generateAll} disabled={runningAll || !!generatingKey}>
          {runningAll ? `Generating ${allProgress.done + 1} of ${allProgress.total}…` : 'Generate Full Issue'}
        </button>
        <button className="secondary" onClick={saveAsIssue} disabled={saving || runningAll}>{saving ? 'Saving…' : 'Save current as Issue'}</button>
        <button className="secondary" onClick={printCurrent} disabled={runningAll}>Print / Save as PDF</button>
      </div>
      {statusMsg && <div className="status" style={{ marginBottom: 12 }}>{statusMsg}</div>}

      {SECTION_DEFS.map(def => {
        const s = sections[def.key]
        const busy = generatingKey === def.key
        const anyBusy = !!generatingKey || runningAll
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
            {s?.truncated && !s?.error && <div className="errtext">⚠️ This response was cut off due to length — hit Refresh to try again, ideally getting a more complete version.</div>}
            {s?.text ? (
              <ReactMarkdown
                components={{
                  h2: () => null,
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
