// Quick corpus sanity check — scores every candidate against its own reference
// using the stored boxes (label match + center-position accuracy), to confirm
// the 5-turn ladders climb and turn_5 lands close to the reference.
//
//   node check.js
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const db = createClient(url, key, { auth: { persistSession: false } })

const { data: refs, error: e1 } = await db.from('study_references').select('id,name,boxes')
if (e1) throw e1
const { data: cands, error: e2 } = await db
  .from('study_candidates')
  .select('reference_id,tier,boxes')
if (e2) throw e2

// Label-match score: recall, precision, F1, and mean center-position accuracy
// over matched labels. overall = F1 × posAcc (0..1).
function score(refBoxes, genBoxes) {
  const ref = new Map((refBoxes || []).map((b) => [b.label, b]))
  const gen = new Map((genBoxes || []).map((b) => [b.label, b]))
  let matched = 0
  let distSum = 0
  for (const [label, rb] of ref) {
    const gb = gen.get(label)
    if (!gb) continue
    matched++
    const dx = (gb.nx ?? 0) - (rb.nx ?? 0)
    const dy = (gb.ny ?? 0) - (rb.ny ?? 0)
    distSum += Math.hypot(dx, dy)
  }
  const recall = ref.size ? matched / ref.size : 0
  const precision = gen.size ? matched / gen.size : 0
  const f1 = recall + precision ? (2 * recall * precision) / (recall + precision) : 0
  const posAcc = matched ? Math.max(0, 1 - distSum / matched / 0.4) : 0 // 0.4 norm-dist → 0
  return { recall, precision, f1, posAcc, overall: f1 * posAcc, genN: gen.size, refN: ref.size }
}

const byRef = {}
for (const r of refs) byRef[r.id] = { name: r.name, boxes: r.boxes, tiers: {} }
for (const c of cands) byRef[c.reference_id]?.tiers && (byRef[c.reference_id].tiers[c.tier] = score(byRef[c.reference_id].boxes, c.boxes))

const TURNS = ['turn_1', 'turn_2', 'turn_3', 'turn_4', 'turn_5']
const pct = (n) => (n * 100).toFixed(0).padStart(3)
const line = '─'.repeat(86)

console.log(line)
console.log('reference        recall  t1 t2 t3 t4 t5 │ overall t1 t2 t3 t4 t5 │ climb │ t5  │ gold')
console.log(line)
let climbs = 0, strongT5 = 0
for (const id in byRef) {
  const R = byRef[id]
  const rc = TURNS.map((t) => (R.tiers[t] ? pct(R.tiers[t].recall) : ' - ')).join(' ')
  const ov = TURNS.map((t) => (R.tiers[t] ? pct(R.tiers[t].overall) : ' - ')).join(' ')
  const t1 = R.tiers['turn_1']?.overall ?? 0
  const t5o = R.tiers['turn_5']?.overall ?? 0
  const t5r = R.tiers['turn_5']?.recall ?? 0
  const gold = R.tiers['gold_broken'] ? pct(R.tiers['gold_broken'].overall) : pct(0)
  const climb = t5o >= t1 + 0.05 ? ' ↑ ' : t5o >= t1 ? ' = ' : ' ↓ '
  if (t5o >= t1) climbs++
  if (t5r >= 0.6) strongT5++
  console.log(R.name.padEnd(15), '', rc, '│        ', ov, '│', climb, '│', pct(t5o) + '%', '│', gold + '%')
}
console.log(line)
console.log(`climb (turn_5 ≥ turn_1): ${climbs}/16   │   turn_5 recall ≥ 60%: ${strongT5}/16`)
console.log('(overall = F1 × position-accuracy, 0–100%. gold should be ~0%.)')
