import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { supabase } from '../supabaseClient.js'

export default function Archive() {
  const [issues, setIssues] = useState([])
  const [openId, setOpenId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('issues').select('*').order('created_at', { ascending: false })
      setIssues(data || [])
      setLoading(false)
    })()
  }, [])

  if (loading) return <div className="empty-inline">Loading…</div>

  const open = issues.find(i => i.id === openId)

  if (open) {
    return (
      <div>
        <button className="back no-print" onClick={() => setOpenId(null)}>&larr; Back to archive</button>
        <div className="row no-print">
          <button className="secondary" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
        <div className="section-card">
          <h2 style={{ textTransform: 'none', color: '#e0b872', fontSize: 16 }}>{open.title}</h2>
          {(open.sections || []).map(s => (
            <div key={s.key}>
              <h3 className="h3sec">{s.label}</h3>
              {s.truncated && <div className="errtext">⚠️ This section was cut off due to length when originally generated.</div>}
              <ReactMarkdown components={{ h2: () => null, p: ({ children }) => <p className="body">{children}</p> }}>
                {s.text}
              </ReactMarkdown>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (issues.length === 0) {
    return <div className="empty-inline">No saved issues yet. Generate some sections on the Latest tab, then "Save current as Issue".</div>
  }

  return (
    <div>
      <div className="section-title">Back issues</div>
      {issues.map(iss => (
        <button className="archive-item" key={iss.id} onClick={() => setOpenId(iss.id)}>
          <div className="t">{iss.title}{iss.status === 'partial' ? ' (partial)' : ''}</div>
          <div className="d">{new Date(iss.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </button>
      ))}
    </div>
  )
}
