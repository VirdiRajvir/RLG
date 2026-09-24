// Read-only post-ingest verification: counts, integrity, judgments cleared.
//   node _verify-ingest.js
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const { data: cands } = await db.from('study_candidates').select('id,reference_id,tier,source_message_id')
const { data: pairs } = await db.from('study_pairs').select('id,reference_id,candidate_a,candidate_b,is_gold')
const { data: refs } = await db.from('study_references').select('id,name')
const { count: judgeCount } = await db.from('judgments').select('*', { count: 'exact', head: true })

const byTier = cands.reduce((m, c) => ((m[c.tier] = (m[c.tier] || 0) + 1), m), {})
console.log(`\nstudy_candidates: ${cands.length}   by tier: ${JSON.stringify(byTier)}`)
console.log(`study_pairs:      ${pairs.length}   gold: ${pairs.filter((p) => p.is_gold).length}  real: ${pairs.filter((p) => !p.is_gold).length}`)
console.log(`judgments:        ${judgeCount}  ${judgeCount === 0 ? '(cleared ✓)' : '(!! expected 0)'}`)

// integrity: every pair points at existing candidates in the SAME reference
const cand = new Map(cands.map((c) => [c.id, c]))
let orphan = 0, crossRef = 0
for (const p of pairs) {
  const a = cand.get(p.candidate_a), b = cand.get(p.candidate_b)
  if (!a || !b) { orphan++; continue }
  if (a.reference_id !== p.reference_id || b.reference_id !== p.reference_id) crossRef++
}
console.log(`\nintegrity: orphan-pair refs=${orphan}  cross-reference pairs=${crossRef}  ${orphan + crossRef === 0 ? '✓' : '✗'}`)

// real candidates must carry source_message_id; gold must not
const realNoSrc = cands.filter((c) => c.tier === 'real' && !c.source_message_id).length
const goldWithSrc = cands.filter((c) => c.tier === 'gold_broken' && c.source_message_id).length
console.log(`provenance: real missing source_message_id=${realNoSrc}  gold with source=${goldWithSrc}  ${realNoSrc + goldWithSrc === 0 ? '✓' : '✗'}`)

// per-reference breakdown
const refName = new Map(refs.map((r) => [r.id, r.name]))
const perRef = {}
for (const c of cands) {
  perRef[c.reference_id] = perRef[c.reference_id] || { real: 0, gold: 0, pairs: 0 }
  if (c.tier === 'real') perRef[c.reference_id].real++; else perRef[c.reference_id].gold++
}
for (const p of pairs) perRef[p.reference_id].pairs++
console.log(`\n${'reference'.padEnd(16)} ${'real'.padStart(5)} ${'gold'.padStart(5)} ${'pairs'.padStart(6)}`)
for (const [rid, v] of Object.entries(perRef)) {
  console.log(`${(refName.get(rid) || rid).padEnd(16)} ${String(v.real).padStart(5)} ${String(v.gold).padStart(5)} ${String(v.pairs).padStart(6)}`)
}
