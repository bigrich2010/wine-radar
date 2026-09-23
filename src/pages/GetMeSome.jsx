import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient.js'

const CALL_COLORS = { BUY: '#8b3a2b', WATCH: '#7a6b30', PASS: '#5a5048', INVESTIGATE: '#4a5568' }

const FOLDERS = [
  { key: 'action', label: 'Action List' },
  { key: 'overseas', label: 'Overseas Intel' },
  { key: 'domestic', label: 'Domestic Watch' },
  { key: 'research', label: 'Research' },
  { key: 'bought', label: 'Bought / Cellared' },
]
const DELETED = { key: 'deleted', label: 'Deleted' }

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // reader.result is "data:image/jpeg;base64,AAAA..." - strip the prefix, the API wants raw base64
      const commaIndex = reader.result.indexOf(',')
      resolve(reader.result.slice(commaIndex + 1))
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function AddForm({ onAdded }) {
  const [producer, setProducer] = useState('')
  const [wine, setWine] = useState('')
  const [vintage, setVintage] = useState('')
  const [price, setPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [call, setCall] = useState('INVESTIGATE')
  const [folder, setFolder] = useState('action')
  const [sourceUrl, setSourceUrl] = useState('')
  const [open, setOpen] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState('')
  const fileInputRef = useRef(null)
  const extractingRef = useRef(false) // synchronous guard, same pattern used for section generation

  async function submit() {
    if (!producer.trim()) return
    await supabase.from('get_me_some').insert({
      producer: producer.trim(),
      wine: wine.trim() || null,
      vintage: vintage.trim() || null,
      price: price.trim() || null,
      notes: notes.trim() || null,
      call,
      folder,
      source_url: sourceUrl.trim() || null,
    })
    setProducer(''); setWine(''); setVintage(''); setPrice(''); setNotes(''); setCall('INVESTIGATE'); setFolder('action'); setSourceUrl(''); setOpen(false); setExtractMsg('')
    onAdded()
  }

  async function handleImageSelected(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = '' // allow selecting the same file again later
    if (!file) return
    if (extractingRef.current) return
    extractingRef.current = true
    setOpen(true) // reveal the form so the user sees fields fill in
    setExtracting(true)
    setExtractMsg('')
    try {
      const base64 = await readFileAsBase64(file)
      const res = await fetch('/api/extract-wine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: file.type }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setExtractMsg(json.error || 'Could not read that image - add the details manually.')
      } else if (!json.found) {
        setExtractMsg("Couldn't identify a wine in that image - add the details manually.")
      } else {
        if (json.producer) setProducer(json.producer)
        if (json.wine) setWine(json.wine)
        if (json.vintage) setVintage(json.vintage)
        if (json.price) setPrice(json.price)
        if (json.notes) setNotes(json.notes)
        setExtractMsg('Filled in from your photo - check it over before saving.')
      }
    } catch (err) {
      setExtractMsg(`Network error reading image: ${err.message}`)
    } finally {
      extractingRef.current = false
      setExtracting(false)
    }
  }

  if (!open) {
    return (
      <div className="row">
        <button className="secondary" onClick={() => setOpen(true)}>Add to Get Me Some</button>
        <button className="secondary" onClick={() => fileInputRef.current && fileInputRef.current.click()}>📷 Add from photo</button>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleImageSelected} />
      </div>
    )
  }

  return (
    <div className="note-item">
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="secondary" onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={extracting}>
          {extracting ? 'Reading photo…' : '📷 Fill from photo'}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleImageSelected} />
      </div>
      {extractMsg && <div className="status" style={{ marginBottom: 8 }}>{extractMsg}</div>}
      <input type="text" placeholder="Producer (required)" value={producer} onChange={e => setProducer(e.target.value)} style={{ marginBottom: 8 }} />
      <input type="text" placeholder="Wine / cuvée" value={wine} onChange={e => setWine(e.target.value)} style={{ marginBottom: 8 }} />
      <div className="row" style={{ marginBottom: 8 }}>
        <input type="text" placeholder="Vintage" value={vintage} onChange={e => setVintage(e.target.value)} style={{ flex: 1 }} />
        <input type="text" placeholder="Price" value={price} onChange={e => setPrice(e.target.value)} style={{ flex: 1 }} />
      </div>
      <input type="text" placeholder="Source URL (optional)" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} style={{ marginBottom: 8 }} />
      <textarea placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} style={{ marginBottom: 8, height: 60 }} />
      <div className="row" style={{ marginBottom: 8 }}>
        {['BUY', 'WATCH', 'PASS', 'INVESTIGATE'].map(c => (
          <button key={c} className="secondary" onClick={() => setCall(c)} style={{ background: call === c ? CALL_COLORS[c] : undefined, opacity: call === c ? 1 : 0.6 }}>{c}</button>
        ))}
      </div>
      <div className="row">
        {[...FOLDERS, DELETED].map(f => (
          <button key={f.key} className="secondary" onClick={() => setFolder(f.key)} style={{ opacity: folder === f.key ? 1 : 0.55, fontWeight: folder === f.key ? 700 : 400 }}>{f.label}</button>
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
  const [showDeleted, setShowDeleted] = useState(false)
  const [expanded, setExpanded] = useState(new Set())
  const [collapsedFolders, setCollapsedFolders] = useState(new Set())

  function toggleExpanded(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleFolder(key) {
    setCollapsedFolders(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function load() {
    const { data } = await supabase.from('get_me_some').select('*').order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function setFolder(id, folder) {
    await supabase.from('get_me_some').update({ folder, updated_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function permanentlyRemove(id) {
    await supabase.from('get_me_some').delete().eq('id', id)
    load()
  }

  if (loading) return <div className="empty-inline">Loading…</div>

  const folderList = showDeleted ? [...FOLDERS, DELETED] : FOLDERS

  return (
    <div>
      <div className="section-title">Get Me Some</div>
      <p className="note-hint">Leads worth actually tracking down - pulled from Substack Leads or Vintage &amp; Producer Watch, or added directly. File them as you go.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <AddForm onAdded={load} />
        <button className="secondary" onClick={() => setShowDeleted(s => !s)}>{showDeleted ? 'Hide deleted' : 'Show deleted'}</button>
      </div>

      {folderList.map(folder => {
        const folderItems = items.filter(i => (i.folder || 'action') === folder.key)
        const isCollapsed = collapsedFolders.has(folder.key)
        return (
          <div key={folder.key} style={{ marginBottom: 18 }}>
            <div
              onClick={() => toggleFolder(folder.key)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '6px 2px', borderBottom: '1px solid #3a322a' }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3, color: '#e0b872' }}>
                {isCollapsed ? '▸' : '▾'} {folder.label} <span style={{ color: '#8a7f70', fontWeight: 400 }}>({folderItems.length})</span>
              </span>
            </div>
            {!isCollapsed && folderItems.length === 0 && <div className="empty-inline" style={{ padding: '8px 2px' }}>Nothing filed here.</div>}
            {!isCollapsed && folderItems.map(item => {
              const isOpen = expanded.has(item.id)
              return (
                <div className="section-card" key={item.id} style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => toggleExpanded(item.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#fdf6ec' }}>
                      {item.producer}{item.wine ? ` — ${item.wine}` : ''}{item.vintage ? ` ${item.vintage}` : ''}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5, background: CALL_COLORS[item.call] || '#4a5568', color: '#fdf6ec' }}>
                      {item.call}
                    </span>
                  </div>
                  {isOpen && (
                    <div onClick={e => e.stopPropagation()} style={{ marginTop: 8 }}>
                      <div className="updated">
                        {item.price ? `${item.price} · ` : ''}
                        {item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer" style={{ color: '#e0b872' }}>source</a>}
                      </div>
                      {item.notes && <p className="body" style={{ marginTop: 6 }}>{item.notes}</p>}
                      <div className="row" style={{ marginTop: 8, gap: 4, flexWrap: 'wrap' }}>
                        {[...FOLDERS, DELETED].filter(f => f.key !== folder.key).map(f => (
                          <button key={f.key} className="secondary" onClick={() => setFolder(item.id, f.key)} style={{ padding: '4px 8px', fontSize: 12 }}>
                            → {f.label}
                          </button>
                        ))}
                        {folder.key === 'deleted' && (
                          <button className="secondary" onClick={() => permanentlyRemove(item.id)} title="Permanently remove" style={{ padding: '4px 8px', fontSize: 12, color: '#c96a52' }}>
                            🗑 Remove permanently
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
