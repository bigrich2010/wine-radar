// api/newsletter.js
// Generates ONE section at a time - same pattern that proved reliable in testing:
// one API call, no silent retry chains, caller controls when calls happen.
//
// POST body: { sectionKey: string }
// Env vars required in Vercel: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'

export const SECTIONS = [
  { key: 'industry', label: 'Industry Watch', instruction: 'Write "## Industry Watch" - structural/data news from Wine Australia, Winetitles, ozwinereview.com. 3-4 searches.' },
  { key: 'diverge', label: 'Where the Critics Diverge', instruction: 'Write "## Where the Critics Diverge" - find a genuine case where Tier 1 (Winefront, Erin Larkin) and Tier 2 (Halliday, Ray Jordan, Jukes) disagree on the same wine this cycle. Name the wine, both scores, both critics. If nothing genuinely diverges, say so briefly rather than manufacturing a gap.' },
  { key: 'margaretriver', label: 'Margaret River', instruction: 'Write "## Margaret River" - search individually for each active watchlist producer in this region. Prioritise anything genuinely new.' },
  { key: 'burgundy', label: 'Burgundy, Champagne & Beyond', instruction: 'Write "## Burgundy, Champagne & Beyond" - Burgundy, Champagne, and cool-climate Pinot/Chardonnay producers from the watchlist. Search individually per producer, not combined.' },
  { key: 'barolo_bordeaux', label: 'Barolo & Bordeaux', instruction: 'Write "## Barolo & Bordeaux". This is a priority region, not a filler section - go deep. For Barolo: Massolino specifically (the collector holds Parafada and Parussi), plus the broader Barolo/Piedmont picture, weighting Kerin O\u2019Keefe (Wine Enthusiast) and Antonio Galloni/Vinous as the relevant specialists - the general Tier 1-4 system does not apply here, these are the right names. For Bordeaux: Pontet-Canet (the collector buys this on regular allocation) and the left bank generally, weighting Jane Anson and Galloni/Vinous. Search individually per producer/critic, not combined. Name specific vintages and scores where found.' },
  { key: 'deepdive', label: 'Deep Dive', instruction: 'Write "## Deep Dive" - find one substantive piece of narrative wine journalism and summarise it properly in your own words across a few paragraphs. Explain why it matters, not just what it says.' },
  { key: 'perth', label: 'Around Perth', instruction: 'Write "## Around Perth" - Lamont\'s Cottesloe and WA-local happenings, only upcoming events given today\'s date, never past ones.' },
  { key: 'hitlist', label: 'Hit List & Coming Up', instruction: 'Write "## Hit List — Things to Try" and "## Coming Up". If recent purchases are provided below, actively build the Hit List around them - name the purchase and build outward from it - rather than just avoiding repeats. Coming Up: release dates, allocations, events for watchlist producers.' },
  { key: 'substack_intel', label: 'Substack Intelligence — Authors & Overlap', maxTokens: 3000, instruction: `Produce an intelligence briefing from the tracked Substack authors listed below - not a newsletter summary. Read across each author's recent output and extract what's genuinely useful, not a list of what they published.

PRIMARY FOCUS: Bordeaux, Barolo, and Burgundy. This is deliberate - the domestic Hit List, Margaret River, and Around Perth sections elsewhere in this newsletter already cover Australian wine thoroughly using Halliday/Ray Jordan/Winefront. Substack's actual value is the opposite: these authors are the primary source for Bordeaux, Barolo and Burgundy specifically, regions where Australian critics have little presence. Do not spend space re-covering Australian wine here unless an author is explicitly drawing a comparison between an Australian wine and one of these three regions (e.g. Margaret River Cabernet vs Bordeaux, Australian Pinot vs Burgundy) - that comparison IS in scope and valuable.

EVERY specific claim (a piece an author wrote, an argument they made, a wine they named) must include the actual source URL and approximate date, not just the author's name. If you cannot find a working link for a claim, do not include it as fact - note it as unverified or leave it out.

For EACH active author:
- Identify their most significant recent piece(s) on Bordeaux, Barolo or Burgundy specifically, with a real URL, and summarise the actual argument in your own words.
- Name specific wines, producers, vintages or price points worth investigating.
- Distinguish clearly between reported fact, the author's own opinion, and your interpretation - label which is which.
- Flag if they're taking a contrarian position against mainstream critical opinion (e.g. Wark's argument that expensive wine's value comes from scarcity, not just quality).

OVERLAP (the most valuable part - do not skip it):
- Note any subject multiple authors are independently discussing on these three regions, or any wine/producer appearing across feeds.
- Preserve genuine disagreements explicitly - what they disagree about, why, and which view seems better supported. Never average opinions into a mushy middle.
- Structure this like "Burgundy is getting expensive - but there's still a way in" (Author A + B + C, what they agree on, where they diverge, what to investigate) rather than a Q&A-style author roundup.

AUTHOR RANKING: For each author, note whether their current tier (A-D) still seems right based on this cycle's Bordeaux/Barolo/Burgundy output specifically, and their strength area. If a ranking should change, say why, citing the actual piece that justifies it.

Write this as "## Substack Intelligence — Authors & Overlap" with clear sub-headers for the overlap themes first, then author notes, then ranking changes.` },
  { key: 'substack_leads', label: 'Substack Intelligence — Buying Leads', maxTokens: 2600, instruction: `Based on the same tracked Substack authors, produce Bordeaux/Barolo/Burgundy-focused buying-lead intelligence for "## Substack Intelligence — Buying Leads". This is deliberately international-focused - the domestic Hit List elsewhere in this newsletter already covers Australian buying opportunities.

For every genuinely interesting Bordeaux, Barolo or Burgundy wine or producer surfaced, record: producer/wine/vintage, approximate price, the source author AND a real URL, what they actually said, any independent critical cross-check (Jane Anson, Galloni/Vinous, Kerin O'Keefe, Jancis Robinson, Decanter), and a clear call: BUY / WATCH / PASS / INVESTIGATE. For Australian availability, check the relevant specialist directly rather than guessing: Mountain & Row for Barolo/Piedmont, Boccaccio/Rathdowne/Vintrepid/Heart & Soil for Burgundy, 1533 Cellars/Ethereal for either, Prince Wine Store as a broad check, MW Wines if it's a mature/back-vintage wine, Langtons for auction/secondary market (only report Langtons results that are live/current listings - Langtons has extensive press about past completed auctions and historical collections, which must never be presented as current availability). If unconfirmed, say so.

Do NOT recommend something purely because a Substack author liked it - cross-check where possible. Explicitly watch for the trap one of these authors names directly: a fascinating expensive bottle getting 2,000 words of attention when a cheaper bottle next to it (declassified fruit, a producer's second label, Langhe Nebbiolo instead of Barolo) is the actually better buy. Call this out whenever it appears - it's exactly the kind of signal this section exists to catch.

If recent purchases are provided below, do not recommend those again.

Finish with:
## THE 5-10 MOST IMPORTANT SIGNALS (ranked by importance)
## NEW WINES TO INVESTIGATE
## PRODUCERS TO WATCH
## BUYING OPPORTUNITIES
## NOISE — THINGS TO IGNORE
## THE EMILY TAKE (a concise, opinionated read on what Bordeaux/Barolo/Burgundy Substack intelligence is telling us that the major critics alone wouldn't show)` },
  { key: 'vintage_watch', label: 'Vintage & Producer Watch — Emily\u2019s Take', maxTokens: 2800, instruction: `Produce a standing vintage AND producer assessment across the priority regions below - this is a reference the collector checks back on, not a one-off article. Search each region's current/recent vintage individually, and check named producers individually too.

REGIONS TO COVER: Margaret River (Cabernet and Chardonnay), Burgundy (2024 and any other current release), Barolo (2021 and any other current release), Bordeaux left bank (current release), Champagne (current release if notable), Yarra Valley / Mornington Peninsula / Tasmania cool-climate Pinot and Chardonnay.

NAMED PRODUCERS TO CHECK SPECIFICALLY (Barolo/Piedmont, in addition to the full watchlist provided below): Massolino, Paolo Scavino, Gaja (technically Barbaresco - note this distinction if it comes up rather than blurring it), Monchiero. Also actively search for lesser-known, currently-excellent producers in these regions that aren't on the list yet - the collector wants genuine discoveries here, not just the famous names repeated back.

For each region or producer with something genuinely current to report, give ONE clear, opinionated call - not a hedge: **PURSUE NOW**, **CELLAR FOR LATER**, **WAIT AND SEE**, or **AVOID** - with 2-3 sentences of actual reasoning citing real evidence: critic convergence across tiers, independent corroboration, growing conditions, and crucially any market/availability dynamics (e.g. importer caution due to exchange rates creating genuine scarcity, versus manufactured urgency).

AUSTRALIAN AVAILABILITY - check specifically, don't just assume: for anything called PURSUE NOW or CELLAR FOR LATER, search for where it can actually be bought in Australia. This is a real retailer network, not a single fallback - check the specialist most likely to carry it first:
- Burgundy/Piedmont crossover: 1533 Cellars / Ethereal Wines
- Barolo/Piedmont/Nebbiolo specifically: Mountain & Row
- Burgundy specifically: Boccaccio Cellars, Rathdowne Cellars, Vintrepid, Heart & Soil / Vin de Garde
- Mature/back-vintage Bordeaux, Burgundy, Barolo, or Australian icon back-vintages (Cullen, Moss Wood, Giaconda etc.): MW Wines
- Broad fine wine (France/Italy/Australia), including checking their producer pages directly which often quote critic scores (as verified with Prince Wine Store and Massolino/Galloni): Prince Wine Store
- Hard-to-find, lesser-known, or obscure bottles as a broad search: Nicks Wine Merchants
- Secondary/auction market: Langtons - check for a direct per-producer/vintage product page (Langtons runs these individually, e.g. a specific Massolino Vigna Rionda vintage page) as well as current live auction listings. Critical: Langtons runs a lot of historical press about past single-vendor collections and completed auctions (e.g. major collections from previous years) - these are NOT current availability. Only report something as available via Langtons if you can confirm it's a live, currently-open listing or an active product page, and explicitly say if something you found is historical/past rather than current.

Record where possible: price, vintage, pre-arrival vs in-stock, and any critic quote the retailer itself displays (retailers quoting a specific critic score on their own product page is a strong signal worth citing directly). If you cannot confirm Australian availability at all after checking the relevant specialists, say so explicitly rather than assuming it's available.

Be willing to say a heavily-hyped vintage or producer isn't actually worth pursuing yet, or that an under-discussed one is - the point of this section is a real opinion, not consensus-following. If nothing has changed for a region or producer since it was last covered, say so briefly rather than restating the same case again. Do not pad every region - skip any with nothing genuinely new to say this cycle.

Write this as "## Vintage & Producer Watch — Emily's Take" with clear sub-headings, and end with a short "Where to Buy" list of the specific Australian sources that came up.` },
]

const SYSTEM_PROMPT_BASE = `You are Emily, the most knowledgeable wine professional in Australia, writing for a serious, well-informed collector - not a beginner. Be opinionated, not just a reporter. Disagree with critic consensus when the wine doesn't back it up. Be blunt and willing to take the piss out of overhyped wines or pretentious marketing language - but never sacrifice substance for the joke.

SOURCE TIERS:
- Tier 0, Industry Intelligence: structural data, not tasting notes
- Tier 1, Independent anchor: trust this first
- Tier 2, Commercially embedded: discount scores 3-5 points mentally, value notes over numbers
- Tier 3, Narrative journalism
- Tier 4, Local/actionable: read broker/merchant language skeptically

Write ONLY the single section requested, starting with its "## " heading. Do not write other sections. Paraphrase everything, never quote more than a few words verbatim. Be specific: name producers, vintages, scores, critics, dates. Do not fabricate. If there's genuinely nothing new, say so briefly rather than padding.

CRITICAL: your response must contain ONLY the finished, polished section - nothing else. Do not narrate your research process. Do not write things like "Let me check...", "I now have...", "Good, I've confirmed...", or any other commentary about what you're doing or have found. If you need to think through what to search for or how to interpret results, do that silently - only the final, publication-ready text should appear in your response.`

function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status <= 599)
}

function describeError(status, data) {
  if (data && data.error && typeof data.error.message === 'string') {
    return data.error.message + (isRetryableStatus(status) ? ' (transient - try again)' : ' (will not fix itself by retrying)')
  }
  return `HTTP ${status} - unexpected response`
}

export default async function handler(req, res) {
  return buildHandler({ createClient, fetchImpl: fetch })(req, res)
}

export function buildHandler({ createClient: createClientDep, fetchImpl }) {
  return async function (req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { sectionKey } = req.body || {}
  const sectionDef = SECTIONS.find(s => s.key === sectionKey)
  if (!sectionDef) {
    return res.status(400).json({ error: `Unknown sectionKey: ${sectionKey}` })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: ANTHROPIC_API_KEY not set' })
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: Supabase env vars not set' })
  }

  const supabase = createClientDep(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  try {
    const [watchlistRes, sourcesRes, writersRes, purchasesRes, capturesRes, lastIssuesRes] = await Promise.all([
      supabase.from('watchlist').select('*').eq('active', true).order('priority'),
      supabase.from('sources').select('*').eq('active', true),
      supabase.from('substack_writers').select('*').eq('active', true),
      supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('captures').select('*').eq('consumed', false),
      supabase.from('issues').select('*').order('created_at', { ascending: false }).limit(1),
    ])

    // Each of these can fail independently (RLS misconfiguration, network blip) without
    // throwing - Supabase returns { data: null, error }. Silently ignoring that error and
    // proceeding with an empty list would waste a real, paid API call on a context-less
    // prompt with no way to tell why. Collect and surface them instead.
    const dbChecks = [
      ['watchlist', watchlistRes], ['sources', sourcesRes], ['substack_writers', writersRes],
      ['purchases', purchasesRes], ['captures', capturesRes], ['issues', lastIssuesRes],
    ]
    const dbErrors = dbChecks.filter(([, r]) => r.error).map(([name, r]) => `${name}: ${r.error.message}`)
    if (dbErrors.length > 0) {
      console.warn('Wine Radar: context queries failed:', dbErrors.join('; '))
    }

    const watchlist = watchlistRes.data
    const sources = sourcesRes.data
    const writers = writersRes.data
    const purchases = purchasesRes.data
    const captures = capturesRes.data
    const lastIssues = lastIssuesRes.data

    const watchlistText = (watchlist || []).map(w => `- ${w.label} [${w.category}, priority ${w.priority}]`).join('\n')
    const sourcesText = (sources || []).map(s => `- ${s.name}${s.critic ? ` (${s.critic})` : ''} [Tier ${s.tier}]`).join('\n')
    const writersText = (writers || []).map(w => `- ${w.name}${w.publication ? ` (${w.publication})` : ''} [Tier ${w.tier}]${w.strength_area ? ` - strength: ${w.strength_area}` : ''}${w.ranking_notes ? ` - notes: ${w.ranking_notes}` : ''}`).join('\n')
    const purchasesText = (purchases || []).map(p => `- ${p.description}`).join('\n')
    const capturesText = (captures || []).map(c => `- ${c.raw_text}`).join('\n')

    const lastIssue = (lastIssues && lastIssues[0]) || null
    const priorSection = lastIssue ? (lastIssue.sections || []).find(s => s.key === sectionKey) : null

    const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

    let prompt = `Today's date: ${today}. ${sectionDef.instruction}\n\nWATCHLIST:\n${watchlistText || '(none configured)'}`
    if (sectionDef.key === 'substack_intel' || sectionDef.key === 'substack_leads') {
      prompt += `\n\nSUBSTACK WRITERS:\n${writersText || '(none configured)'}`
    } else {
      prompt += `\n\nSOURCES:\n${sourcesText || '(none configured)'}`
    }
    if (purchasesText) prompt += `\n\nRECENT PURCHASES (do not recommend these again; build Hit List around them if relevant):\n${purchasesText}`
    if (capturesText) prompt += `\n\nFORWARDED EMAILS/NOTES (subscriber-only info, weave into Coming Up if relevant):\n${capturesText}`
    if (priorSection && priorSection.text) {
      prompt += `\n\nYou already reported this for this section on ${priorSection.updated_at || 'the last issue'} - do NOT repeat it. Only report genuine changes since then, or say briefly "No change since last update":\n---PREVIOUS---\n${priorSection.text}\n---END PREVIOUS---`
    }

    const claudeRes = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: sectionDef.maxTokens || 1800,
        system: SYSTEM_PROMPT_BASE,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
    })

    let data
    try {
      data = await claudeRes.json()
    } catch (parseErr) {
      return res.status(502).json({ error: `Invalid response from Claude API (HTTP ${claudeRes.status})` })
    }

    if (!claudeRes.ok || data.error) {
      return res.status(claudeRes.status || 500).json({ error: describeError(claudeRes.status, data) })
    }

    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text)
    const queries = (data.content || [])
      .filter(b => b.type === 'server_tool_use' && b.name === 'web_search')
      .map(b => b.input && b.input.query)
      .filter(Boolean)
    // Join with a space, not a forced paragraph break. When Claude does multiple searches
    // within one section, it sometimes writes its answer in fragments between tool calls -
    // joining those with '\n\n' was forcing artificial paragraph breaks mid-sentence (e.g.
    // splitting "Jukes has died at 58" across three separate paragraphs). Genuine paragraph
    // breaks the model intends WITHIN a single block (its own internal '\n\n') are left
    // completely untouched - only trimming each block's own leading/trailing whitespace
    // before stitching the blocks together, so we don't collapse real paragraph structure.
    const text = textBlocks.map(t => t.trim()).join(' ').trim()
    const truncated = data.stop_reason === 'max_tokens'

    if (!text) {
      return res.status(502).json({ error: truncated ? 'Ran out of room before writing anything - try again' : 'No content returned' })
    }

    return res.status(200).json({
      ok: true,
      key: sectionDef.key,
      label: sectionDef.label,
      text,
      queries,
      truncated,
      updated_at: today,
      contextWarning: dbErrors.length > 0 ? `Some context failed to load, section may be less accurate: ${dbErrors.join('; ')}` : undefined,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message || 'Unknown server error' })
  }
  }
}
