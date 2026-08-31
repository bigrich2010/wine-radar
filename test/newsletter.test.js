import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHandler, SECTIONS } from '../api/newsletter.js'

// --- Mock helpers ---

function makeMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
  }
  return res
}

// Chainable, thenable mock query builder mimicking @supabase/supabase-js's client.from(table)...
function makeMockSupabaseClient(tableData) {
  function builder(table) {
    const result = tableData[table] || { data: [], error: null }
    const chain = {
      select() { return chain },
      eq() { return chain },
      order() { return chain },
      limit() { return chain },
      then(resolve) { return Promise.resolve(result).then(resolve) },
    }
    return chain
  }
  return { from: builder }
}

function baseTableData(overrides = {}) {
  return {
    watchlist: { data: [{ label: 'Moss Wood', category: 'producer', priority: 1 }], error: null },
    sources: { data: [{ name: 'Winefront', critic: null, tier: 1 }], error: null },
    substack_writers: { data: [{ name: 'Anthony Rose', publication: 'x', tier: 'A' }], error: null },
    purchases: { data: [], error: null },
    captures: { data: [], error: null },
    issues: { data: [], error: null },
    ...overrides,
  }
}

function withEnv(vars, fn) {
  const prev = {}
  for (const k of Object.keys(vars)) { prev[k] = process.env[k]; process.env[k] = vars[k] }
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(vars)) process.env[k] = prev[k]
  })
}

const ENV = { ANTHROPIC_API_KEY: 'test-key', SUPABASE_URL: 'https://x.test', SUPABASE_SERVICE_ROLE_KEY: 'test-role' }

// --- Tests ---

test('rejects non-POST requests', async () => {
  const handler = buildHandler({ createClient: () => makeMockSupabaseClient(baseTableData()), fetchImpl: async () => { throw new Error('should not be called') } })
  const res = makeMockRes()
  await handler({ method: 'GET' }, res)
  assert.equal(res.statusCode, 405)
})

test('rejects unknown sectionKey', async () => {
  const handler = buildHandler({ createClient: () => makeMockSupabaseClient(baseTableData()), fetchImpl: async () => { throw new Error('should not be called') } })
  const res = makeMockRes()
  await handler({ method: 'POST', body: { sectionKey: 'not-a-real-section' } }, res)
  assert.equal(res.statusCode, 400)
})

test('fails fast with a clear error if env vars are missing (no wasted API call)', async () => {
  let fetchCalled = false
  const handler = buildHandler({ createClient: () => makeMockSupabaseClient(baseTableData()), fetchImpl: async () => { fetchCalled = true } })
  const res = makeMockRes()
  await withEnv({ ANTHROPIC_API_KEY: '', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' }, async () => {
    await handler({ method: 'POST', body: { sectionKey: 'industry' } }, res)
  })
  assert.equal(res.statusCode, 500)
  assert.ok(!fetchCalled, 'should not call the AI API if misconfigured')
})

test('happy path: generates a section successfully with exactly one fetch call', async () => {
  let fetchCallCount = 0
  const handler = buildHandler({
    createClient: () => makeMockSupabaseClient(baseTableData()),
    fetchImpl: async () => {
      fetchCallCount++
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: 'text', text: '## Industry Watch\nSome real content.' }],
          stop_reason: 'end_turn',
        }),
      }
    },
  })
  const res = makeMockRes()
  await withEnv(ENV, async () => {
    await handler({ method: 'POST', body: { sectionKey: 'industry' } }, res)
  })
  assert.equal(fetchCallCount, 1)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.ok, true)
  assert.match(res.body.text, /Some real content/)
})

test('for every SECTIONS entry, the handler runs without throwing', async () => {
  for (const section of SECTIONS) {
    const handler = buildHandler({
      createClient: () => makeMockSupabaseClient(baseTableData()),
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: `## ${section.label}\nContent.` }], stop_reason: 'end_turn' }),
      }),
    })
    const res = makeMockRes()
    await withEnv(ENV, async () => {
      await handler({ method: 'POST', body: { sectionKey: section.key } }, res)
    })
    assert.equal(res.statusCode, 200, `section ${section.key} should succeed`)
  }
})

test('Claude API error response is surfaced cleanly, not swallowed', async () => {
  const handler = buildHandler({
    createClient: () => makeMockSupabaseClient(baseTableData()),
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
    }),
  })
  const res = makeMockRes()
  await withEnv(ENV, async () => {
    await handler({ method: 'POST', body: { sectionKey: 'industry' } }, res)
  })
  assert.equal(res.statusCode, 401)
  assert.match(res.body.error, /invalid x-api-key/)
  assert.match(res.body.error, /will not fix itself/)
})

test('transient 500 is labeled as worth retrying, distinct from a permanent failure', async () => {
  const handler = buildHandler({
    createClient: () => makeMockSupabaseClient(baseTableData()),
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { type: 'api_error', message: 'internal error' } }),
    }),
  })
  const res = makeMockRes()
  await withEnv(ENV, async () => {
    await handler({ method: 'POST', body: { sectionKey: 'industry' } }, res)
  })
  assert.equal(res.statusCode, 500)
  assert.match(res.body.error, /transient - try again/)
})

test('malformed (non-JSON-parseable) response from Claude API does not crash the handler', async () => {
  const handler = buildHandler({
    createClient: () => makeMockSupabaseClient(baseTableData()),
    fetchImpl: async () => ({
      ok: false,
      status: 502,
      json: async () => { throw new Error('Unexpected token < in JSON') },
    }),
  })
  const res = makeMockRes()
  await withEnv(ENV, async () => {
    await handler({ method: 'POST', body: { sectionKey: 'industry' } }, res)
  })
  assert.equal(res.statusCode, 502)
  assert.match(res.body.error, /Invalid response/)
})

test('empty text response (e.g. only tool calls, no final answer) is reported, not silently accepted', async () => {
  const handler = buildHandler({
    createClient: () => makeMockSupabaseClient(baseTableData()),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'server_tool_use', name: 'web_search', input: { query: 'x' } }], stop_reason: 'max_tokens' }),
    }),
  })
  const res = makeMockRes()
  await withEnv(ENV, async () => {
    await handler({ method: 'POST', body: { sectionKey: 'industry' } }, res)
  })
  assert.equal(res.statusCode, 502)
  assert.match(res.body.error, /Ran out of room/)
})

test('a Supabase query failure does not crash the whole handler', async () => {
  const handler = buildHandler({
    createClient: () => ({ from: () => { throw new Error('connection refused') } }),
    fetchImpl: async () => { throw new Error('should not reach fetch') },
  })
  const res = makeMockRes()
  await withEnv(ENV, async () => {
    await handler({ method: 'POST', body: { sectionKey: 'industry' } }, res)
  })
  assert.equal(res.statusCode, 500)
  assert.ok(res.body.error)
})

test('dedup: when a prior issue has a matching section, its text is included in the prompt as "do not repeat" context', async () => {
  let capturedPrompt = null
  const dataWithPriorIssue = baseTableData({
    issues: {
      data: [{
        id: '1',
        sections: [{ key: 'industry', label: 'Industry Watch', text: 'PRIOR CONTENT MARKER', updated_at: '1 January 2026' }],
      }],
      error: null,
    },
  })
  const handler = buildHandler({
    createClient: () => makeMockSupabaseClient(dataWithPriorIssue),
    fetchImpl: async (url, opts) => {
      capturedPrompt = JSON.parse(opts.body).messages[0].content
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '## Industry Watch\nNew.' }], stop_reason: 'end_turn' }) }
    },
  })
  const res = makeMockRes()
  await withEnv(ENV, async () => {
    await handler({ method: 'POST', body: { sectionKey: 'industry' } }, res)
  })
  assert.match(capturedPrompt, /PRIOR CONTENT MARKER/)
  assert.match(capturedPrompt, /do NOT repeat/)
})

test('purchases are included in the prompt when present', async () => {
  let capturedPrompt = null
  const dataWithPurchase = baseTableData({ purchases: { data: [{ description: 'Elanto Ironstone Pinot 2024 x3' }], error: null } })
  const handler = buildHandler({
    createClient: () => makeMockSupabaseClient(dataWithPurchase),
    fetchImpl: async (url, opts) => {
      capturedPrompt = JSON.parse(opts.body).messages[0].content
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '## Hit List — Things to Try\nX.' }], stop_reason: 'end_turn' }) }
    },
  })
  const res = makeMockRes()
  await withEnv(ENV, async () => {
    await handler({ method: 'POST', body: { sectionKey: 'hitlist' } }, res)
  })
  assert.match(capturedPrompt, /Elanto Ironstone Pinot 2024/)
})

test('a failed context query (e.g. RLS misconfiguration) does not silently proceed unnoticed - it is surfaced in the response', async () => {
  const dataWithFailingWatchlist = baseTableData({
    watchlist: { data: null, error: { message: 'permission denied for table watchlist' } },
  })
  const handler = buildHandler({
    createClient: () => makeMockSupabaseClient(dataWithFailingWatchlist),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '## Industry Watch\nStill works.' }], stop_reason: 'end_turn' }) }),
  })
  const res = makeMockRes()
  await withEnv(ENV, async () => {
    await handler({ method: 'POST', body: { sectionKey: 'industry' } }, res)
  })
  // The section still generates (graceful degradation - one bad table shouldn't block everything)...
  assert.equal(res.statusCode, 200)
  // ...but the failure must be visible, not silently swallowed.
  assert.match(res.body.contextWarning, /permission denied for table watchlist/)
})
