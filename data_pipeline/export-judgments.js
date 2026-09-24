// Export judgments joined to source_message_id, so the analysis can map each
// judged candidate back to its φ vector in features.csv. Writes analysis/judgments.csv.
//   node export-judgments.js
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Optional --out <path> (resolved from cwd) to write elsewhere; default unchanged.
const _argv = process.argv.slice(2)
const _outArg = _argv.includes('--out') ? _argv[_argv.indexOf('--out') + 1] : null
const OUT = _outArg ? path.resolve(process.cwd(), _outArg)
                    : path.resolve(__dirname, '../analysis/judgments.csv')

const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const { data: cands } = await db.from('study_candidates').select('id,source_message_id,tier')
const srcById = new Map(cands.map((c) => [c.id, c.source_message_id]))

const { data: js, error } = await db.from('judgments')
  .select('session_id,rater_id,reference_id,candidate_a,candidate_b,choice,presented_left,response_ms,is_gold,created_at')
if (error) { console.error(error.message); process.exit(1) }

const header = ['session_id', 'rater_id', 'reference_id', 'a_msg', 'b_msg', 'choice', 'is_gold', 'response_ms']
const rows = js.map((j) => [
  j.session_id,
  (j.rater_id || '').replace(/,/g, ' '),
  j.reference_id,
  srcById.get(j.candidate_a) || '',   // '' for gold_broken (no source_message_id)
  srcById.get(j.candidate_b) || '',
  j.choice,
  j.is_gold,
  j.response_ms ?? '',
])

fs.writeFileSync(OUT, [header.join(','), ...rows.map((r) => r.join(','))].join('\n'))

const raters = new Map()
for (const j of js) raters.set(j.session_id, (raters.get(j.session_id) || 0) + 1)
const ties = js.filter((j) => j.choice === 'tie').length
const gold = js.filter((j) => j.is_gold).length
console.log(`Wrote ${js.length} judgments → ${path.relative(process.cwd(), OUT)}`)
console.log(`raters (sessions): ${raters.size}   ties: ${ties}   gold: ${gold}   non-gold decisive: ${js.length - ties - gold}`)
for (const [s, n] of [...raters.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s}  ×${n}  rater=${js.find((j) => j.session_id === s).rater_id || '∅'}`)
}
