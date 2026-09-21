// api/_extractLeads.js
// Shared logic for extracting candidate buying leads from already-generated text,
// used by both api/extract-leads.js (manual "+ Add mentions" button on any section
// card) and api/newsletter.js (automatic extraction right after Substack Buying
// Leads finishes generating).
//
// This is deliberately a SEPARATE, focused, no-search call with a FORCED tool
// choice - not the same call that does the research and writing. Asking one long
// call to remember "also call this tool, as your final action, after everything
// else you've been doing" is exactly the kind of soft instruction that's proven
// unreliable tonight (the narration bug was the same failure shape). Forcing the
// tool choice in a dedicated follow-up call is the same reliable pattern already
// used in extract-wine.js.

export const EXTRACT_LEADS_TOOL = {
  name: 'record_leads',
  description: 'Record every genuine, specific wine/producer mention in the given text as structured data - do not invent anything not actually in the text.',
  input_schema: {
    type: 'object',
    properties: {
      leads: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            producer: { type: 'string' },
            wine: { type: 'string' },
            vintage: { type: 'string' },
            price: { type: 'string' },
            call: { type: 'string', enum: ['BUY', 'WATCH', 'PASS', 'INVESTIGATE'] },
            source_url: { type: 'string' },
            notes: { type: 'string', description: 'One sentence summary of what the text said about it' },
          },
          required: ['producer', 'call'],
        },
      },
    },
    required: ['leads'],
  },
}

export async function extractLeadsFromText({ fetchImpl, apiKey, text, sectionLabel }) {
  const claudeRes = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      tool_choice: { type: 'tool', name: 'record_leads' },
      tools: [EXTRACT_LEADS_TOOL],
      messages: [{
        role: 'user',
        content: `Extract every genuine, specific wine or producer mention worth tracking as a buying lead from this section${sectionLabel ? ` ("${sectionLabel}")` : ''}. Only include wines actually named in the text - do not invent anything. If a specific call (BUY/WATCH/PASS) isn't stated in the text, use INVESTIGATE. If there is genuinely nothing worth tracking (e.g. purely event listings with no specific wine recommendation), return an empty leads array. Text:\n\n${text}`,
      }],
    }),
  })

  let data
  try {
    data = await claudeRes.json()
  } catch (parseErr) {
    return { ok: false, status: 502, error: `Invalid response from Claude API (HTTP ${claudeRes.status})` }
  }
  if (!claudeRes.ok || data.error) {
    const msg = (data.error && typeof data.error.message === 'string') ? data.error.message : `HTTP ${claudeRes.status}`
    return { ok: false, status: claudeRes.status || 500, error: msg }
  }

  const toolCall = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'record_leads')
  const leads = (toolCall && toolCall.input && Array.isArray(toolCall.input.leads)) ? toolCall.input.leads : []
  const validLeads = leads.filter(l => l && l.producer)

  return { ok: true, leads: validLeads }
}
