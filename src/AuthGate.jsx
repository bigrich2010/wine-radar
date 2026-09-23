import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still checking, null = signed out
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function sendLink(e) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  if (session === undefined) {
    return <div className="empty-inline">Loading…</div>
  }

  if (!session) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20 }}>
        <div className="note-item" style={{ maxWidth: 340, width: '100%' }}>
          <h2 style={{ marginBottom: 12 }}>🍷 Wine Radar</h2>
          {sent ? (
            <p className="body">Check your email for a sign-in link.</p>
          ) : (
            <form onSubmit={sendLink}>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ marginBottom: 8, width: '100%' }}
              />
              <button className="primary" type="submit" style={{ width: '100%' }}>Send sign-in link</button>
              {error && <p className="status" style={{ marginTop: 8, color: '#c96a52' }}>{error}</p>}
            </form>
          )}
        </div>
      </div>
    )
  }

  return children
}
