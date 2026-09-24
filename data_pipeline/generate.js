// ── Corpus generator (runner) ────────────────────────────────────────────────
//
// For each reference in references.js:
//   1. extract its boxes → insert into study_references
//   2. run a 5-turn conversation (one growing messages array = the memory)
//      against the same model/system-prompt the app uses; after each turn,
//      extract the generation's boxes and insert a study_candidates row
//   3. insert the gold-broken sentinel candidate
//   4. precompute study_pairs (C(5,2)=10 real + 1 gold)
//
// Idempotent: a reference already present (by name) is skipped, so a failed run
// can be re-run without regenerating (and re-paying for) finished references.
//
//   node generate.js
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config'
import puppeteer from 'puppeteer'

import { REFERENCES, BASE_SYSTEM_PROMPT, GOLD_BROKEN_HTML } from './references.js'
import { callOpenRouter } from './openrouter.js'
import { extractFromHtml } from './extract.js'
import { referenceExists, insertReference, insertCandidate, insertPairs, deleteReference } from './supabase.js'
import { buildPairs } from './pairs.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function assertEnv() {
  const missing = []
  if (!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) missing.push('SUPABASE_URL')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!(process.env.OPENROUTER_API_KEY_FREE || process.env.OPENROUTER_API_KEY)) {
    missing.push('OPENROUTER_API_KEY_FREE')
  }
  if (missing.length) {
    console.error(`Missing env: ${missing.join(', ')}\nCopy .env.example → .env and fill it in.`)
    process.exit(1)
  }
}

function validateReference(ref) {
  if (!ref.name) throw new Error('reference is missing a `name`')
  if (!ref.html || !ref.html.trim()) throw new Error(`reference "${ref.name}" has empty html`)
  if (!Array.isArray(ref.prompts) || ref.prompts.some((p) => !p || !p.trim())) {
    throw new Error(`reference "${ref.name}" has empty/placeholder prompts`)
  }
  if (ref.prompts.length !== 5) {
    console.warn(`  ! "${ref.name}" has ${ref.prompts.length} prompts (expected 5) — proceeding`)
  }
}

async function processReference(browser, ref) {
  validateReference(ref)

  const existing = await referenceExists(ref.name)
  if (existing) {
    console.log(`↷ skip "${ref.name}" (already seeded)`)
    return
  }

  console.log(`▸ ${ref.name}`)

  // 1. reference → study_references
  const refBoxes = await extractFromHtml(browser, ref.html, { isReference: true })
  const referenceId = await insertReference({ name: ref.name, html: ref.html, boxes: refBoxes })
  console.log(`  reference inserted (${refBoxes.length} boxes)`)

  try {
  // 2. 5-turn conversation. `messages` is the memory: it grows each turn and is
  //    resent in full, so the model edits its own prior output. A fresh array per
  //    reference guarantees no context bleeds between references.
  const messages = [{ role: 'system', content: BASE_SYSTEM_PROMPT }]
  const turnCandidates = []

  for (let turn = 1; turn <= ref.prompts.length; turn++) {
    const prompt = ref.prompts[turn - 1]
    messages.push({ role: 'user', content: prompt })

    const html = await callOpenRouter(messages)
    messages.push({ role: 'assistant', content: html }) // persist reply for next turn

    const boxes = await extractFromHtml(browser, html, { isReference: false })
    const id = await insertCandidate({
      reference_id: referenceId,
      tier: `turn_${turn}`,
      html,
      boxes,
      meta: { turn, prompt },
    })
    turnCandidates.push({ id, turn })
    console.log(`  turn ${turn}: ${boxes.length} boxes`)

    await sleep(1000) // gentle pacing for the shared free-tier key
  }

  // 3. gold-broken sentinel
  const goldId = await insertCandidate({
    reference_id: referenceId,
    tier: 'gold_broken',
    html: GOLD_BROKEN_HTML,
    boxes: [],
    is_gold_broken: true,
    meta: { note: 'sentinel' },
  })

  // 4. precompute pairs
  const pairs = buildPairs({ referenceId, turnCandidates, goldCandidate: { id: goldId } })
  await insertPairs(pairs)
  console.log(`  ${pairs.length} pairs inserted (incl. 1 gold)`)
  } catch (err) {
    // Don't leave a half-seeded group: delete the reference (cascade removes its
    // candidates + pairs) so a re-run regenerates it cleanly.
    console.error(`  ✗ failed mid-reference — rolling back "${ref.name}"`)
    await deleteReference(referenceId)
    throw err
  }
}

async function main() {
  assertEnv()

  if (!REFERENCES.length) {
    console.log(
      'references.js has no references yet.\n' +
        'Populate REFERENCES (name, html, 5 prompts) and re-run `node generate.js`.'
    )
    return
  }

  // Optional: `node generate.js <name>` runs ONLY that reference (smoke test).
  const only = process.argv[2]
  const todo = only ? REFERENCES.filter((r) => r.name === only) : REFERENCES
  if (only && !todo.length) {
    console.error(
      `No reference named "${only}". Available:\n  ${REFERENCES.map((r) => r.name).join('\n  ')}`
    )
    process.exit(1)
  }
  console.log(only ? `Running 1 reference: ${only}` : `Running all ${todo.length} references`)

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    for (const ref of todo) {
      await processReference(browser, ref)
    }
    console.log('✓ corpus generation complete')
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('\n✗ corpus generation failed:', err.message)
  process.exit(1)
})
