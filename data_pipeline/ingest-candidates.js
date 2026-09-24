// ── PE-study ingest: real generations → study_candidates + study_pairs ────────
//
// Bridges the GENERATION corpus (conversations/messages) into the PE-STUDY schema
// (study_candidates/study_pairs) that the annotation frontend reads.
//
// Source of truth = analysis/A2A_analysis/prolific/features_prolific.csv — the
// same φ-bearing manifest features_prolific.js writes and fig_prolific_trend.py
// plots, covering every completed, non-test participant across both
// box/container-relabeling-era study_ids (see that script's STUDY_IDS). This
// script:
//   1. reads the manifest, restricts it to QUALIFYING SESSIONS ONLY — a session
//      (conversation_id) counts only if it reaches k>=2 (matched, non-vacuous
//      boxes) at least once in its trajectory, identical to the trend chart's
//      rule — then drops any generation_id listed in excluded_generations.json
//      (curated via review-prolific.js's remove-checkbox + copy-list workflow)
//   2. groups the survivors by reference, then by conversation (person/session)
//   3. selects K per reference: split across people AS EVENLY AS POSSIBLE (floor(K/n)
//      each, capped at that person's own availability, remainder going to whoever
//      has the longer trajectory), then evenly-spaced turns (by rank) within a person
//   4. fetches the selected gens' HTML from messages
//   5. inserts them as study_candidates (tier='real', source_message_id=gen id)
//   6. synthesizes one gold-broken candidate per reference
//   7. builds study_pairs: exhaustive C(n,2) reals + 1 gold (strongest real vs broken)
//
// DRY-RUN by default (prints the plan, writes nothing). Pass --write to insert.
//   node ingest-candidates.js                 # dry run — show the plan
//   node ingest-candidates.js --ref steel     # dry run, one reference only
//   node ingest-candidates.js --write         # actually rebuild the study tables
//   node ingest-candidates.js --write --force # rebuild even if judgments exist (DANGER)
//
// Re-runnable: --write first DELETES all study_candidates (FK-cascades study_pairs),
// then rebuilds. Safe only BEFORE any judgments are collected — once raters start,
// deleting candidates cascades their judgments, so --force is required past that.

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV = path.resolve(__dirname, '../analysis/A2A_analysis/prolific/features_prolific.csv')
const EXCLUDED = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'excluded_generations.json'), 'utf8')))

// References dropped from the prefelic pool entirely (by name, not deleted from
// study_references — that table is shared with h2a's live study, which is still
// actively assigning some of these to real participants). Empty for now:
// 'stickynotes' used to sit here (every qualifying generation had been
// excluded via excluded_generations.json under the old corpus), but it's one
// of the 5 references in the current live study_id and now has fresh
// candidates — keeping the drop would have silently discarded them.
const DROPPED_REFERENCES = new Set([])

const argv = process.argv.slice(2)
const WRITE = argv.includes('--write')
const FORCE = argv.includes('--force')
const refArg = argv.includes('--ref') ? argv[argv.indexOf('--ref') + 1] : null
const K = 5

// Lazy client so a DRY-RUN needs no credentials (it never touches the DB); only
// the --write path constructs it.
let _db = null
function db() {
  if (_db) return _db
  _db = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
  return _db
}

// ── 1. read the manifest ──────────────────────────────────────────────────────
// Minimal CSV read: only reference_name is quoted (and has no internal commas),
// so a plain split is safe here. We keep just the columns the ingest needs.
function readManifest() {
  const text = fs.readFileSync(CSV, 'utf8').trim()
  const [head, ...lines] = text.split('\n')
  const cols = head.split(',')
  const idx = (name) => cols.indexOf(name)
  const iGen = idx('generation_id'), iConv = idx('conversation_id'), iRef = idx('reference_id')
  const iName = idx('reference_name'), iTurn = idx('turn'), iUser = idx('user_id')
  const iProlific = idx('prolific_pid'), iRecall = idx('f1_recall'), iK = idx('k')
  return lines.filter(Boolean).map((l) => {
    const c = l.split(',')
    return {
      generation_id: c[iGen],
      conversation_id: c[iConv],
      reference_id: c[iRef],
      reference_name: c[iName].replace(/^"|"$/g, ''),
      turn: parseInt(c[iTurn], 10),
      user_id: iUser >= 0 ? (c[iUser] || null) : null,
      prolific_pid: iProlific >= 0 ? (c[iProlific] || null) : null,
      f1_recall: parseFloat(c[iRecall]),
      k: parseInt(c[iK], 10),
    }
  })
}

// ── 2a. allocate K across people: as even as possible, capped at availability ───
// Previously proportional to trajectory length (a 10-turn session got 3x a 3-turn
// session's slots) — that let one long trajectory dominate a reference's candidate
// pool instead of surfacing genuine between-person diversity. Now everyone starts
// at floor(K/n), and only the leftover remainder (K mod n) goes to whoever has the
// longer trajectory — so K=4 across 2 people is 2+2, not 3+1, unless one person's
// own availability can't cover their share (then the shortfall rolls to the other).
function allocate(sizes, k) {
  const n = sizes.length
  const total = sizes.reduce((a, b) => a + b, 0)
  if (total <= k) return sizes.slice() // tiny reference: take everything
  const base = Math.floor(k / n)
  let alloc = sizes.map((s) => Math.min(s, Math.max(1, base)))
  let cur = alloc.reduce((a, b) => a + b, 0)
  // top up: prefer the person with the longer trajectory, only where capacity remains
  while (cur < k) {
    let best = -1
    for (let i = 0; i < alloc.length; i++) {
      if (alloc[i] >= sizes[i]) continue
      if (best < 0 || sizes[i] > sizes[best]) best = i
    }
    if (best < 0) break
    alloc[best]++; cur++
  }
  // trim: prefer the person with the shorter trajectory, never below the floor of 1
  while (cur > k) {
    let worst = -1
    for (let i = 0; i < alloc.length; i++) {
      if (alloc[i] <= 1) continue
      if (worst < 0 || sizes[i] < sizes[worst]) worst = i
    }
    if (worst < 0) break
    alloc[worst]--; cur--
  }
  return alloc
}

// ── 2b. evenly-spaced positions (by rank) within one person's trajectory ────────
function spacedRanks(n, m) {
  if (m >= n) return Array.from({ length: n }, (_, i) => i)
  if (m === 1) return [Math.floor((n - 1) / 2)] // single slot → middle turn
  const out = []
  for (let i = 0; i < m; i++) out.push(Math.round((i * (n - 1)) / (m - 1)))
  return [...new Set(out)] // endpoints included; dedupe defensively
}

// ── select the K candidates for one reference ──────────────────────────────────
function selectForReference(rows) {
  // group by conversation (= one person's refinement trajectory), sorted by turn
  const byConv = new Map()
  for (const r of rows) {
    if (!byConv.has(r.conversation_id)) byConv.set(r.conversation_id, [])
    byConv.get(r.conversation_id).push(r)
  }
  const convs = [...byConv.values()].map((g) => g.sort((a, b) => a.turn - b.turn))
  convs.sort((a, b) => b.length - a.length) // largest trajectory first (stable display)

  const alloc = allocate(convs.map((c) => c.length), K)
  const selected = []
  convs.forEach((conv, i) => {
    for (const rank of spacedRanks(conv.length, alloc[i])) selected.push(conv[rank])
  })
  return { selected, sizes: convs.map((c) => c.length), alloc }
}

// ── gold sentinel: one deliberately-broken page (clearly a worse match) ─────────
const BROKEN_HTML =
  `<!doctype html><html><head><meta charset="utf-8"></head>` +
  `<body style="margin:0;height:100vh;background:#fafafa;position:relative;font-family:system-ui,sans-serif;">` +
  `<div style="position:absolute;top:40%;left:34%;width:30%;height:16%;background:#fecaca;` +
  `border:1px solid #f87171;border-radius:6px;display:flex;align-items:center;justify-content:center;` +
  `color:#991b1b;font:600 12px system-ui;">unrendered</div></body></html>`

// ── build the within-reference pairs (stable a<b ordering by turn) ──────────────
function buildPairs(referenceId, realCandidateIds, goldCandidateId, strongestRealId) {
  const pairs = []
  for (let i = 0; i < realCandidateIds.length; i++) {
    for (let j = i + 1; j < realCandidateIds.length; j++) {
      pairs.push({ reference_id: referenceId, candidate_a: realCandidateIds[i], candidate_b: realCandidateIds[j], is_gold: false })
    }
  }
  if (goldCandidateId && strongestRealId) {
    pairs.push({ reference_id: referenceId, candidate_a: strongestRealId, candidate_b: goldCandidateId, is_gold: true })
  }
  return pairs
}

// ── main ──────────────────────────────────────────────────────────────────────
const fullManifest = readManifest()

// Session-level qualification — IDENTICAL rule to fig_prolific_trend.py and
// review-prolific.js: a session (conversation_id) is in the pool only if it
// reaches k>=2 at least once anywhere in its trajectory. Everything else is
// excluded from candidature outright, not filtered per-row.
const qualifyingSessions = new Set(fullManifest.filter((r) => r.k >= 2).map((r) => r.conversation_id))
const manifest = fullManifest
  .filter((r) => qualifyingSessions.has(r.conversation_id))
  .filter((r) => !EXCLUDED.has(r.generation_id))
  .filter((r) => !DROPPED_REFERENCES.has(r.reference_name))
  .filter((r) => (refArg ? r.reference_name === refArg : true))

const refs = new Map() // reference_id → { name, rows }
for (const r of manifest) {
  if (!refs.has(r.reference_id)) refs.set(r.reference_id, { name: r.reference_name, rows: [] })
  refs.get(r.reference_id).rows.push(r)
}

console.log(`\n${WRITE ? 'WRITE' : 'DRY-RUN'} — ${qualifyingSessions.size} qualifying sessions, ${EXCLUDED.size} manually excluded, ${DROPPED_REFERENCES.size} reference(s) dropped (${[...DROPPED_REFERENCES].join(',')}), ${manifest.length} candidate generations, ${refs.size} references, K=${K}`)
console.log(`source: ${path.relative(process.cwd(), CSV)}\n`)
console.log(`${'reference'.padEnd(16)} ${'people'.padStart(6)} ${'gens'.padStart(5)} ${'split'.padStart(12)} ${'pairs'.padStart(6)}`)
console.log('-'.repeat(54))

// Plan every reference first (pure computation, no DB), so dry-run shows the full
// picture and --write has a vetted plan to execute.
const plan = []
let totalPairs = 0
for (const [refId, { name, rows }] of refs) {
  const { selected, sizes, alloc } = selectForReference(rows)
  const strongest = selected.reduce((a, b) => (b.f1_recall > a.f1_recall ? b : a), selected[0])
  const nPairs = (selected.length * (selected.length - 1)) / 2 + 1 // +1 gold
  totalPairs += nPairs
  plan.push({ refId, name, selected, strongest })
  const splitStr = alloc.length > 1 ? alloc.join('+') : String(alloc[0])
  console.log(`${name.padEnd(16)} ${String(sizes.length).padStart(6)} ${String(rows.length).padStart(5)} ${splitStr.padStart(12)} ${String(nPairs).padStart(6)}`)
}
console.log('-'.repeat(54))
console.log(`${'TOTAL'.padEnd(16)} ${''.padStart(6)} ${''.padStart(5)} ${''.padStart(12)} ${String(totalPairs).padStart(6)}`)
const totalReal = plan.reduce((a, p) => a + p.selected.length, 0)
console.log(`\n${totalReal} real candidates + ${plan.length} gold = ${totalReal + plan.length} study_candidates; ${totalPairs} pairs.\n`)

if (!WRITE) {
  console.log('Dry run only — nothing written. Re-run with --write to rebuild the study tables.')
  console.log('Per-reference selected turns:')
  for (const p of plan) {
    const turns = p.selected.map((s) => s.turn).sort((a, b) => a - b).join(',')
    console.log(`  ${p.name.padEnd(16)} turns [${turns}]   gold-anchor=gen@turn${p.strongest.turn} (recall ${p.strongest.f1_recall.toFixed(2)})`)
  }
  process.exit(0)
}

// ── WRITE path ─────────────────────────────────────────────────────────────────
// Safety: refuse to wipe candidates if judgments already exist (cascade would
// delete real data) unless --force is given.
const { count: judgeCount, error: jErr } = await db().from('judgments').select('*', { count: 'exact', head: true })
if (jErr) { console.error('Could not check judgments:', jErr.message); process.exit(1) }
if (judgeCount > 0 && !FORCE) {
  console.error(`\nABORT: ${judgeCount} judgments already exist. Rebuilding would cascade-delete them.`)
  console.error('Re-run with --force only if you are certain you want to discard collected judgments.')
  process.exit(1)
}

// Fetch HTML for every selected generation (batched .in, like features.js).
const selIds = plan.flatMap((p) => p.selected.map((s) => s.generation_id))
const htmlById = new Map()
for (let i = 0; i < selIds.length; i += 50) {
  const { data, error } = await db().from('messages').select('id,content').in('id', selIds.slice(i, i + 50))
  if (error) { console.error('messages fetch failed:', error.message); process.exit(1) }
  for (const m of data) htmlById.set(m.id, m.content)
}

// Clean rebuild: delete all NON-PRACTICE candidates (cascades their pairs).
// tier='practice' is excluded — that's the one-time tutorial seed from
// study_prefelic_prolific_migration.sql, not part of this rebuild's output,
// and must survive every corpus refresh. study_references untouched either way.
console.log('Deleting existing non-practice study_candidates (cascades their study_pairs)…')
{
  const { error } = await db().from('study_candidates').delete().neq('tier', 'practice')
  if (error) { console.error('delete failed:', error.message); process.exit(1) }
}

let allPairs = []
for (const p of plan) {
  // real candidates — one insert each so we can map generation_id → new candidate id
  const idByGen = new Map()
  for (const s of p.selected) {
    const html = htmlById.get(s.generation_id)
    if (html == null) { console.error(`missing HTML for ${s.generation_id}`); process.exit(1) }
    const { data, error } = await db().from('study_candidates').insert({
      reference_id: p.refId,
      tier: 'real',
      html,
      source_message_id: s.generation_id,
      meta: { turn: s.turn, user_id: s.user_id, prolific_pid: s.prolific_pid, conversation_id: s.conversation_id },
    }).select('id').single()
    if (error) { console.error('candidate insert failed:', error.message); process.exit(1) }
    idByGen.set(s.generation_id, data.id)
  }
  // gold-broken candidate
  const { data: goldRow, error: gErr } = await db().from('study_candidates').insert({
    reference_id: p.refId,
    tier: 'gold_broken',
    html: BROKEN_HTML,
    is_gold_broken: true,
    meta: { synthetic: true },
  }).select('id').single()
  if (gErr) { console.error('gold insert failed:', gErr.message); process.exit(1) }

  // stable a<b ordering by turn, then build pairs
  const ordered = [...p.selected].sort((a, b) => a.turn - b.turn).map((s) => idByGen.get(s.generation_id))
  allPairs = allPairs.concat(buildPairs(p.refId, ordered, goldRow.id, idByGen.get(p.strongest.generation_id)))
  console.log(`  ${p.name}: ${p.selected.length} real + 1 gold inserted`)
}

// bulk insert pairs
for (let i = 0; i < allPairs.length; i += 200) {
  const { error } = await db().from('study_pairs').insert(allPairs.slice(i, i + 200))
  if (error) { console.error('pairs insert failed:', error.message); process.exit(1) }
}

console.log(`\nDone: ${totalReal} real + ${plan.length} gold candidates, ${allPairs.length} pairs written.`)
