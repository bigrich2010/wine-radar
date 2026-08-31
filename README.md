# Wine Radar

A private wine newsletter. Each section (Industry Watch, Margaret River, Hit List,
Substack Intelligence, etc.) is generated independently — one button, one AI call, full
control over cost and timing. No silent chains, no automatic retries burning quota
in the background. This is the same pattern that was tested and proven stable as a
Claude artifact before being rebuilt here with a real backend to fix what the
artifact genuinely couldn't: reliable PDF export, no shared usage-limit collisions,
persistence as a real app rather than something reopened in a chat.

## Before you deploy: this went through a real pressure-test pass, not just a first draft

Three layers of tests now exist, and this pass genuinely caught bugs rather than
just confirming what was already believed to work:

- `test/newsletter.test.js` (13 tests) - the API handler.
- `test/sectionGenerator.test.js` (5 tests) - the concurrency guard, at the level
  that actually matters for cost (no duplicate paid API calls, ever).
- `src/pages/Newsletter.test.jsx` (2 tests, via `vitest`) - the React component
  itself, rendering it for real and firing overlapping clicks.

**Bugs actually found and fixed in this pass, not hypothetical:**

1. **Silent context loss.** The six Supabase queries that build each prompt's
   context were destructuring `{ data }` and discarding `error` entirely. If a
   table query failed (RLS misconfigured, network blip), the code would silently
   proceed with an empty list and burn a real, paid API call on a context-less
   prompt with zero indication why. Fixed: failures are now collected and returned
   as `contextWarning` in the API response, and logged server-side.

2. **Wrong section shown as busy.** The frontend's "which section is generating"
   indicator was set unconditionally at the start of every click, before knowing
   whether that click would actually be allowed to proceed. Under React's
   automatic batching, firing two clicks in the same tick meant the *last*
   click's key won the display - even when the *first* click was the one
   actually still running in the background. Confirmed by writing a test that
   batches two clicks together (proved it genuinely reproduces the race by
   temporarily reverting the fix and watching the test fail with the wrong
   button showing "Working…"), then fixed by tying the UI update atomically to
   the moment the lock is actually acquired, via a synchronous callback -
   structurally impossible for a losing call to touch shared state at all now.

3. Two smaller cleanups: a dead filter in the API route that always evaluated
   true regardless of its condition, and an inconsistency where the Hit List
   section wasn't given the same critic-source context every other section got.

Run all three suites yourself before deploying:

```
npm install
npm test              # Node-native: API handler + concurrency guard (18 tests)
npm run test:component  # Vitest: real component rendering (2 tests)
```

What this genuinely *doesn't* cover: the live Supabase connection, the live
Anthropic API, or whether Supabase's default grants are actually active on your
specific project (this schema assumes standard defaults - if you get "permission
denied" errors after deploying, that's the first thing to check, and now you'll
actually see it via `contextWarning` instead of a silently-empty section).

**One more thing worth knowing, found during this pass rather than hidden:**
`vercel.json` sets the API function's timeout to 60 seconds - the actual ceiling
on Vercel's free Hobby plan (Pro allows up to 300s). Most sections should finish
well under that, but the two Substack Intelligence sections (which each search ten individual
writers) could plausibly run long. If a section ever comes back with a generic
network error rather than a real answer, suspect this timeout first, not a
broken deploy.

## 1. Create the Supabase project

1. New project at supabase.com.
2. SQL Editor → paste `supabase/schema.sql` → run it. This creates `watchlist`,
   `sources`, `substack_writers`, `purchases`, `captures`, and `issues`, and seeds
   your actual watchlist, critic sources, and ten Substack writers (Tier A: Anthony
   Rose, Jason Wilson, Jaclene Liew, Charlie Brown, George Nordahl; Tier B: Tom Wark,
   Giles MacDonogh, Sam Dixon Brown, Simon J. Woolf, Ivo).
3. Project Settings → API → copy the **Project URL**, **anon public key**, and
   **service_role key** (service role is server-side only, never expose it in the
   frontend).

Note on security: this schema does not enable Row Level Security, since it's a
single-user private tool, not a multi-tenant product. Anyone with your Supabase
anon key could read/write these tables. That's an accepted simplification here —
worth revisiting if this URL is ever shared beyond you.

## 2. Create the GitHub repo

Same pattern as Wine-Dbase-2026 — new repo, then "Add file → Create new file" for
each path below, pasting in the matching content:

```
package.json
vite.config.js
vercel.json
index.html
.gitignore
src/main.jsx
src/App.jsx
src/styles.css
src/supabaseClient.js
src/lib/sectionGenerator.js
src/pages/Newsletter.jsx
src/pages/Archive.jsx
src/pages/Sources.jsx
api/newsletter.js
supabase/schema.sql
test/newsletter.test.js
test/sectionGenerator.test.js
```

## 3. Deploy on Vercel

1. Import the repo into Vercel.
2. Environment Variables:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — from step 1
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — from step 1 (server copies)
   - `ANTHROPIC_API_KEY` — your own key, billed separately from your Claude.ai
     subscription. This is the fix for the "locked out for 3 hours" problem: this
     app no longer shares your chat usage pool at all.
3. Deploy. Add to your home screen like Marmion.

## 4. Using it

- **Latest**: one card per section. Tap Generate — one AI call, one result. Tap
  Refresh later to update just that section (it's told what it said last time and
  asked not to repeat itself). "Save current as Issue" bundles whatever you've
  generated into a dated Archive entry whenever you're happy with it.
- **Print / Save as PDF**: this is a real deployed webpage, not a sandboxed
  artifact, so the browser's native print dialog works properly — Share → Print →
  pinch to preview → Save to Files as PDF, same as any other webpage.
- **Archive**: past saved issues, each printable individually.
- **Sources**: edit the watchlist, critic sources, Substack writers, log recent
  purchases, and paste in forwarded producer emails — all in one place.

## 5. What got fixed from the artifact version

- One call per section, always — no chains, no silent retries multiplying cost.
- Real PDF export via the browser's native print, not a Blob-download workaround.
- Own API key, so generating issues never collides with your Claude.ai chat limits.
- Paragraph rendering uses a real markdown renderer (react-markdown) instead of a
  hand-rolled line-splitter, so the "grammar broken across line breaks" bug can't
  recur the same way.
- Dedup and purchases-aware Hit List logic carried over and unit-tested.
