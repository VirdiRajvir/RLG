// Rebuilds paper/data/a2a_chars_per_turn.csv from Supabase: one row
// per (conversation_id=a2a session id, turn) with the instruction length
// (chars_prompt) and generated-HTML length (chars_html), plus driver_model
// and run_index so data.py can assign a condition. Always a full rebuild
// (not resumable/incremental) — the source data (a2a_sessions/a2a_messages)
// is small enough (a few hundred rows) that a fresh pull is simpler and
// safer than tracking what's already covered, and it's the only way to pick
// up a brand new ablation batch (e.g. run_index 12-13, the elements-per-turn
// cap) without silently leaving it out of the inner join in data.py.
//
//   node paper/scripts/build_a2a_chars_per_turn.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
dotenv.config({ path: path.join(REPO_ROOT, 'data_pipeline/.env') })
const OUT_PATH = path.resolve(__dirname, '../data/a2a_chars_per_turn.csv')

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: sessions, error: sessErr } = await db.from('a2a_sessions')
  .select('id,driver_model,run_index,stop_reason')
  .in('stop_reason', ['done', 'capped'])
if (sessErr) throw sessErr
console.log(`${sessions.length} completed a2a sessions`)

const sessById = new Map(sessions.map((s) => [s.id, s]))
const sessIds = sessions.map((s) => s.id)

let msgs = []
for (let i = 0; i < sessIds.length; i += 50) {
  const { data, error } = await db.from('a2a_messages').select('session_id,turn,instruction,html')
    .in('session_id', sessIds.slice(i, i + 50))
  if (error) throw error
  msgs = msgs.concat(data || [])
}
console.log(`${msgs.length} a2a_messages rows`)

const rows = msgs.map((m) => {
  const s = sessById.get(m.session_id)
  return {
    conversation_id: m.session_id,
    turn: m.turn,
    chars_prompt: (m.instruction || '').length,
    chars_html: (m.html || '').length,
    driver_model: s.driver_model,
    run_index: s.run_index,
  }
})
rows.sort((a, b) => (a.conversation_id < b.conversation_id ? -1 : a.conversation_id > b.conversation_id ? 1 : a.turn - b.turn))

const header = ['conversation_id', 'turn', 'chars_prompt', 'chars_html', 'driver_model', 'run_index']
const csv = [header.join(','), ...rows.map((r) => header.map((h) => r[h]).join(','))].join('\n')
fs.writeFileSync(OUT_PATH, csv + '\n')
console.log(`Wrote ${rows.length} rows (${sessIds.length} sessions) → ${OUT_PATH}`)
