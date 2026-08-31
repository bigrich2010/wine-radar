import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

function ListSection({ title, table, fields, renderRow, hint }) {
  const [rows, setRows] = useState([])
  const [newValue, setNewValue] = useState('')

  async function load() {
    const { data } = await supabase.from(table).select('*').order('created_at', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  async function toggleActive(id, active) {
    await supabase.from(table).update({ active: !active }).eq('id', id)
    load()
  }

  async function add() {
    if (!newValue.trim()) return
    await supabase.from(table).insert(fields.buildInsert(newValue.trim()))
    setNewValue('')
    load()
  }

  async function remove(id) {
    await supabase.from(table).delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div className="section-title">{title}</div>
      {hint && <p className="note-hint">{hint}</p>}
      {rows.map(row => (
        <div className="list-row" key={row.id}>
          <span>{renderRow(row)}</span>
          <span>
            {'active' in row && (
              <button className="secondary" onClick={() => toggleActive(row.id, row.active)} style={{ marginRight: 6 }}>
                {row.active ? 'Active' : 'Paused'}
              </button>
            )}
            <button className="secondary" onClick={() => remove(row.id)}>Remove</button>
          </span>
        </div>
      ))}
      <div className="row">
        <input type="text" placeholder={fields.placeholder} value={newValue} onChange={e => setNewValue(e.target.value)} />
        <button className="secondary" onClick={add}>Add</button>
      </div>
    </div>
  )
}

export default function Sources() {
  return (
    <div>
      <ListSection
        title="Watchlist"
        table="watchlist"
        hint="Producers, regions, and varietals the research prioritises."
        fields={{ placeholder: 'Add producer/region/varietal', buildInsert: (v) => ({ label: v, category: 'topic', priority: 2 }) }}
        renderRow={(r) => `${r.label} (${r.category}, p${r.priority})`}
      />
      <ListSection
        title="Sources"
        table="sources"
        hint="Critic publications, tiered 0 (industry data) to 4 (local/actionable)."
        fields={{ placeholder: 'Add a publication', buildInsert: (v) => ({ name: v, tier: 2 }) }}
        renderRow={(r) => `${r.name}${r.critic ? ` — ${r.critic}` : ''} [Tier ${r.tier}]`}
      />
      <ListSection
        title="Substack Writers"
        table="substack_writers"
        hint="Tier A = read closely every issue, D = low signal. Rankings are meant to shift as the research proves them out."
        fields={{ placeholder: 'Add a writer', buildInsert: (v) => ({ name: v, tier: 'C' }) }}
        renderRow={(r) => `${r.name}${r.publication ? ` (${r.publication})` : ''} [${r.tier}]${r.strength_area ? ` — ${r.strength_area}` : ''}`}
      />
      <ListSection
        title="Recent Purchases"
        table="purchases"
        hint="Logged so the Hit List builds on these rather than repeating them."
        fields={{ placeholder: 'e.g. Elanto Ironstone Pinot 2024 x3', buildInsert: (v) => ({ description: v }) }}
        renderRow={(r) => r.description}
      />
      <ListSection
        title="Notes (forwarded emails)"
        table="captures"
        hint="Paste producer emails here — release dates, allocations. Fed into the next generation."
        fields={{ placeholder: 'Paste email text', buildInsert: (v) => ({ raw_text: v }) }}
        renderRow={(r) => r.raw_text.slice(0, 80) + (r.raw_text.length > 80 ? '…' : '')}
      />
    </div>
  )
}
