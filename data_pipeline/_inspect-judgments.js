// Read-only diagnostic: characterize the existing judgments before deciding
// whether they are stale (safe to discard) or real data to keep.
//   node _inspect-judgments.js
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const { data: js, error } = await db
  .from('judgments')
  .select('id,created_at,session_id,rater_id,prolific_pid,candidate_a,candidate_b,reference_id,is_gold,choice')
if (error) { console.error(error.message); process.exit(1) }

console.log(`\nTotal judgments: ${js.length}`)

const dates = js.map((j) => j.created_at).sort()
console.log(`Date range: ${dates[0]}  →  ${dates[dates.length - 1]}`)

const sessions = new Map()
for (const j of js) sessions.set(j.session_id, (sessions.get(j.session_id) || 0) + 1)
console.log(`\nDistinct sessions: ${sessions.size}`)
for (const [s, n] of [...sessions.entries()].sort((a, b) => b[1] - a[1])) {
  const sample = js.find((j) => j.session_id === s)
  console.log(`  ${s}  ×${n}   rater=${sample.rater_id || '∅'}  prolific=${sample.prolific_pid || '∅'}`)
}

const choices = js.reduce((m, j) => ((m[j.choice] = (m[j.choice] || 0) + 1), m), {})
console.log(`\nChoice mix: ${JSON.stringify(choices)}   gold judgments: ${js.filter((j) => j.is_gold).length}`)

// Do the judged candidates still exist? (If not, they reference the OLD corpus.)
const candIds = [...new Set(js.flatMap((j) => [j.candidate_a, j.candidate_b]))]
const { data: liveCands } = await db.from('study_candidates').select('id').in('id', candIds)
const live = new Set((liveCands || []).map((c) => c.id))
const aliveJudgments = js.filter((j) => live.has(j.candidate_a) && live.has(j.candidate_b)).length
console.log(`\nJudged candidate ids: ${candIds.length} distinct; ${live.size} still exist in study_candidates.`)
console.log(`Judgments whose BOTH candidates still exist: ${aliveJudgments} / ${js.length}`)
console.log(aliveJudgments === 0
  ? '→ ALL judgments reference candidates that no longer exist (the OLD corpus). They are stale.'
  : '→ Some judgments still point at live candidates — inspect before discarding.')
