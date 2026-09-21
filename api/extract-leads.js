// api/extract-leads.js
// Extracts candidate buying leads from a block of already-generated newsletter text
// and writes them straight into get_me_some. Powers the "+ Add mentions" button on
// every section card - lets a wine mentioned anywhere in the newsletter (not just
// Substack Buying Leads) get added without retyping it by hand.
//
// POST body: { text: string, sectionLabel?: string }
// Env vars required in Vercel: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'
import { extractLeadsFromText } from './_extractLeads.js'

export default async function handler(req, res) {
  return buildHandler({ createClient, fetchImpl: fetch })(req, res)
}

export function buildHandler({ createClient: createClientDep, fetchImpl }) {
  return async function (req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const { text, sectionLabel } = req.body || {}
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'No text provided' })
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Server misconfigured: ANTHROPIC_API_KEY not set' })
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Server misconfigured: Supabase env vars not set' })
    }

    const supabase = createClientDep(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    try {
      const extraction = await extractLeadsFromText({ fetchImpl, apiKey: process.env.ANTHROPIC_API_KEY, text, sectionLabel })
      if (!extraction.ok) {
        return res.status(extraction.status || 500).json({ error: extraction.error })
      }

      let added = 0
      for (const lead of extraction.leads) {
        const { error: insertError } = await supabase.from('get_me_some').insert({
          producer: lead.producer,
          wine: lead.wine || null,
          vintage: lead.vintage || null,
          price: lead.price || null,
          call: ['BUY', 'WATCH', 'PASS', 'INVESTIGATE'].includes(lead.call) ? lead.call : 'INVESTIGATE',
          source_name: sectionLabel || null,
          source_url: lead.source_url || null,
          notes: lead.notes || null,
        })
        if (!insertError) added++
      }

      return res.status(200).json({ ok: true, added })
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: err.message || 'Unknown server error' })
    }
  }
}
