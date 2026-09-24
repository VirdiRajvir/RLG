// Token-count diagnostics for h2a input prompts (the human's own typed
// messages sent to /api/chat, role='user' on the `messages` table) — same
// study scope (STUDY_IDS) and participant/conversation filters as
// features_prolific.js, but pulling user turns instead of assistant
// generations, and counting tokens instead of computing φ features.
//
// Uses gpt-tokenizer (cl100k_base) as a standard BPE approximation — the
// app calls OpenRouter with a model set via env (OPENROUTER_MODEL, varies
// per run), so there's no single "the" tokenizer; cl100k_base is the
// common reference point for these estimates.
//
//   node token_stats_h2a.js
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { encode } from 'gpt-tokenizer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const STUDY_IDS = ['6a91c6b8b7b0d7db9ba4ff20', '6a929deb7f97fa0fc36c22fd']
// Scopes to the real-traffic window for this batch of human turns
// (2026-08-29, 04:24:59-09:27:47), isolating it from later test/dev calls.
const CUTOFF = '2026-08-29T04:00:00Z'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../analysis/A2A_analysis/prolific')

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: parts } = await db.from('study_participants')
  .select('prolific_pid')
  .not('prolific_pid', 'is', null)
  .eq('outcome', 'completed')
  .eq('is_test', false)
  .in('study_id', STUDY_IDS)
const pids = (parts || []).map((p) => p.prolific_pid)
console.log(`${pids.length} completed, non-test participants across study_ids=${STUDY_IDS.join(',')}`)

const { data: convs } = await db.from('conversations')
  .select('id,prolific_pid,reference_id,created_at')
  .in('prolific_pid', pids)
  .eq('is_tutorial', false)
  .not('reference_id', 'is', null)
const convsP = (convs || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
const convIds = convsP.map((c) => c.id)
const byConvPid = new Map(convsP.map((c) => [c.id, c.prolific_pid]))

let msgs = []
for (let i = 0; i < convIds.length; i += 50) {
  const { data } = await db.from('messages').select('id,conversation_id,turn,content,created_at')
    .eq('role', 'user').in('conversation_id', convIds.slice(i, i + 50))
  msgs = msgs.concat(data || [])
}
const msgsAll = msgs.length
msgs = msgs.filter((m) => m.created_at >= CUTOFF)
console.log(`${msgsAll} user (input-prompt) turns total; ${msgs.length} at/after ${CUTOFF}`)

const rows = msgs.map((m) => ({
  conversation_id: m.conversation_id,
  prolific_pid: byConvPid.get(m.conversation_id),
  turn: m.turn,
  chars: (m.content || '').length,
  tokens: encode(m.content || '').length,
}))

// ── overall distribution ──
const toks = rows.map((r) => r.tokens).sort((a, b) => a - b)
const mean = toks.reduce((a, b) => a + b, 0) / toks.length
const median = toks[Math.floor(toks.length / 2)]
console.log(`\nOverall (n=${toks.length}):`)
console.log(`  mean ${mean.toFixed(1)}  median ${median}  min ${toks[0]}  max ${toks[toks.length - 1]}`)
console.log(`  p25 ${toks[Math.floor(toks.length * 0.25)]}  p75 ${toks[Math.floor(toks.length * 0.75)]}  p95 ${toks[Math.floor(toks.length * 0.95)]}`)

// ── per-turn breakdown ──
const byTurn = new Map()
for (const r of rows) {
  if (!byTurn.has(r.turn)) byTurn.set(r.turn, [])
  byTurn.get(r.turn).push(r.tokens)
}
console.log(`\nBy turn:`)
console.log(`turn  n    mean   median`)
for (const turn of [...byTurn.keys()].sort((a, b) => a - b)) {
  const arr = byTurn.get(turn).slice().sort((a, b) => a - b)
  const m = arr.reduce((a, b) => a + b, 0) / arr.length
  console.log(`${String(turn).padStart(4)}  ${String(arr.length).padStart(3)}  ${m.toFixed(1).padStart(6)}  ${arr[Math.floor(arr.length / 2)]}`)
}

const header = ['conversation_id', 'prolific_pid', 'turn', 'chars', 'tokens']
const csv = [header.join(','), ...rows.map((r) => header.map((k) => r[k]).join(','))].join('\n')
const out = path.join(OUT_DIR, 'h2a_input_token_counts_after0400.csv')
fs.writeFileSync(out, csv)
console.log(`\nWrote ${rows.length} rows → ${out}`)
