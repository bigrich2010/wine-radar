import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const CALL_COLORS = { BUY: '#8b3a2b', WATCH: '#7a6b30', PASS: '#5a5048', INVESTIGATE: '#4a5568' }

function AddForm({ onAdded }) {
  const [producer, setProducer] = useState('')
  const [wine, setWine] = useState('')
  const [vintage, setVintage] = useState('')
  const [price, setPrice] = useState('')
  const [call, setCall] = useState('INVESTIGATE')
  const [sourceUrl, setSourceUrl] = useState('')
  const [open, setOpen] = useState(false)

  async function submit() {
    if (!producer.trim()) return
    await supabase.from('get_me_some').insert({
      producer: producer.trim(),
      wine: wine.trim() || null,
      vintage: vintage.trim() || null,
      price: price.trim() || null,
      call,
      source_url: sourceUrl.trim() || null,
    })
    setProducer(''); setWine(''); setVintage(''); setPrice(''); setCall('INVESTIGATE'); setSourceUrl(''); setOpen(false)
    onAdded()
  }

  if (!open) {
    return <button className="secondary" onClick={() => setOpen(true)}>Add to Get Me Some</button>
  }

  return (
    <div className="note-item">
      <input type="text" placeholder="Producer (required)" value={producer} onChange={e => setProducer(e.target.value)} style={{ marginBottom: 8 }} />
      <input type="text" placeholder="Wine / cuvée" value={wine} onChange={e => setWine(e.target.value)} style={{ marginBottom: 8 }} />
      <div className="row" style={{ marginBottom: 8 }}>
        <input type="text" placeholder="Vintage" value={vintage} onChange={e => setVintage(e.target.value)} style={{ flex: 1 }} />
        <input type="text" placeholder="Price" value={price} onChange={e => setPrice(e.target.value)} style={{ flex: 1 }} />
      </div>
      <input type="text" placeholder="Source URL (optional)" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} style={{ marginBottom: 8 }} />
      <div className="row">
        {['BUY', 'WATCH', 'PASS', 'INVESTIGATE'].map(c => (
          <button key={c} className="secondary" onClick={() => setCall(c)} style={{ background: call === c ? CALL_COLORS[c] : undefined, opacity: call === c ? 1 : 0.6 }}>{c}</button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" onClick={submit}>Save</button>
        <button className="secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}

export default function GetMeSome() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPassed, setShowPassed] = useState(false)

  async function load() {
    const { data } = await supabase.from('get_me_some').select('*').order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function setStatus(id, status) {
    await supabase.from('get_me_some').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function remove(id) {
    await supabase.from('get_me_some').delete().eq('id', id)
    load()
  }

  if (loading) return <div className="empty-inline">Loading…</div>

  const visible = items.filter(i => showPassed || i.status !== 'passed')

  return (
    <div>
      <div className="section-title">Get Me Some</div>
      <p className="note-hint">Leads worth actually tracking down - pulled from Substack Leads or Vintage &amp; Producer Watch, or added directly. Mark them bought or passed as you go.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <AddForm onAdded={load} />
        <button className="secondary" onClick={() => setShowPassed(s => !s)}>{showPassed ? 'Hide passed' : 'Show passed'}</button>
      </div>
      {visible.length === 0 && <div className="empty-inline">Nothing here yet.</div>}
      {visible.map(item => (
        <div className="section-card" key={item.id} style={{ opacity: item.status === 'passed' ? 0.55 : 1 }}>
          <div className="head">
            <h2 style={{ textTransform: 'none', fontSize: 14 }}>
              {item.producer}{item.wine ? ` — ${item.wine}` : ''}{item.vintage ? ` ${item.vintage}` : ''}
            </h2>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5, background: CALL_COLORS[item.call] || '#4a5568', color: '#fdf6ec' }}>
              {item.call}
            </span>
          </div>
          <div className="updated">
            {item.price ? `${item.price} · ` : ''}{item.status === 'bought' ? '✓ Bought' : item.status === 'passed' ? 'Passed' : 'Open'}
            {item.source_url && <> · <a href={item.source_url} target="_blank" rel="noreferrer" style={{ color: '#e0b872' }}>source</a></>}
          </div>
          {item.notes && <p className="body">{item.notes}</p>}
          <div className="row" style={{ marginTop: 8 }}>
            {item.status !== 'bought' && <button className="secondary" onClick={() => setStatus(item.id, 'bought')}>Mark Bought</button>}
            {item.status !== 'passed' && <button className="secondary" onClick={() => setStatus(item.id, 'passed')}>Mark Passed</button>}
            {item.status !== 'open' && <button className="secondary" onClick={() => setStatus(item.id, 'open')}>Reopen</button>}
            <button className="secondary" onClick={() => remove(item.id)}>Remove</button>
          </div>
        </div>
      ))}
    </div>
  )
}
