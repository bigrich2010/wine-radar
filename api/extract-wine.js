// api/extract-wine.js
// Reads a photo of a wine label or a screenshot of a listing and extracts structured
// fields to pre-fill the "Add to Get Me Some" form. This never writes to the database
// itself - the user always reviews the pre-filled form and saves it themselves, since
// a label photo can be blurry, at an angle, or show more than one wine.
//
// POST body: { image: base64string, mediaType?: string }
// Env vars required in Vercel: ANTHROPIC_API_KEY (same key as api/newsletter.js)

const EXTRACT_TOOL = {
  name: 'extract_wine_details',
  description: 'Extract wine details actually visible in the image - never guess or fabricate anything not shown.',
  input_schema: {
    type: 'object',
    properties: {
      found_wine: { type: 'boolean', description: 'Whether a wine was actually identifiable in the image' },
      producer: { type: 'string' },
      wine: { type: 'string' },
      vintage: { type: 'string' },
      price: { type: 'string' },
      notes: { type: 'string', description: 'Any other relevant detail visible - region, variety, retailer name' },
    },
    required: ['found_wine'],
  },
}

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_BASE64_LENGTH = 6_000_000 // rough guard - Vercel's own request body limit (4.5MB) would reject larger anyway

export default async function handler(req, res) {
  return buildHandler({ fetchImpl: fetch })(req, res)
}

export function buildHandler({ fetchImpl }) {
  return async function (req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const { image, mediaType } = req.body || {}
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'No image provided' })
    }
    if (image.length > MAX_BASE64_LENGTH) {
      return res.status(413).json({ error: 'Image too large - try a smaller photo or a cropped screenshot' })
    }
    const finalMediaType = ALLOWED_MEDIA_TYPES.includes(mediaType) ? mediaType : 'image/jpeg'

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Server misconfigured: ANTHROPIC_API_KEY not set' })
    }

    try {
      const claudeRes = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          tool_choice: { type: 'tool', name: 'extract_wine_details' },
          tools: [EXTRACT_TOOL],
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: finalMediaType, data: image } },
              { type: 'text', text: 'This is a photo of a wine label or a screenshot of a wine listing. Extract whatever details are actually visible - do not guess or fabricate anything not shown. If you cannot identify a wine at all, set found_wine to false and leave the rest blank.' },
            ],
          }],
        }),
      })

      let data
      try {
        data = await claudeRes.json()
      } catch (parseErr) {
        return res.status(502).json({ error: `Invalid response from Claude API (HTTP ${claudeRes.status})` })
      }

      if (!claudeRes.ok || data.error) {
        const msg = (data.error && typeof data.error.message === 'string') ? data.error.message : `HTTP ${claudeRes.status}`
        return res.status(claudeRes.status || 500).json({ error: msg })
      }

      const toolCall = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'extract_wine_details')
      if (!toolCall || !toolCall.input) {
        return res.status(502).json({ error: 'Could not extract details from this image - try adding manually' })
      }

      const { found_wine, producer, wine, vintage, price, notes } = toolCall.input
      if (!found_wine) {
        return res.status(200).json({ ok: true, found: false })
      }

      return res.status(200).json({
        ok: true,
        found: true,
        producer: producer || '',
        wine: wine || '',
        vintage: vintage || '',
        price: price || '',
        notes: notes || '',
      })
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: err.message || 'Unknown server error' })
    }
  }
}
