// Same as features_a2a_v2.js, but scoped to the run_index>=6 batch — the
// re-run under the corrected A2A prompts (driver.py's SYSTEM prompt updated
// to the current box-N/container-N convention, generator.py's
// BASE_SYSTEM_PROMPT brought in line with application/api/chat.js's — see
// those files' history). run_start=6 avoids colliding with run_index 1-3
// (pre-relabeling corpus) and run_index 4-5 (relabeled corpus, but still the
// outdated prompts — kept in a2a_v2/ as its own comparison point).
// Writes into its own a2a/ subdirectory rather than overwriting
// features_a2a.csv or a2a_v2/features_a2a.csv.
//
//   node features_a2a.js                 # all references, run_index>=6
//   node features_a2a.js --ref steel     # test: only one reference (by name)
import 'dotenv/config'
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { extractBoxes, extractRefBoxes, VIEWPORT } from '../application/api/evaluation.js'
import { computeFeatures } from './features-compute.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ANALYSIS = path.resolve(__dirname, '../analysis/A2A_analysis/a2a')
fs.mkdirSync(ANALYSIS, { recursive: true })
const SHOTS = path.join(ANALYSIS, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

const slug = (s) => String(s).replace(/[^a-zA-Z0-9._-]+/g, '-')

const argv = process.argv.slice(2)
const refArg = argv.includes('--ref') ? argv[argv.indexOf('--ref') + 1] : null

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const page = await browser.newPage()
await page.setViewport(VIEWPORT)

async function renderRef(html, refName) {
  await page.setContent(html || '', { waitUntil: 'load', timeout: 20000 })
  const { boxes } = await extractRefBoxes(page)
  fs.writeFileSync(path.join(SHOTS, `ref_${slug(refName)}.png`), await page.screenshot({ fullPage: true, type: 'png' }))
  return boxes
}
async function renderGen(html, refName, model, runIndex, turn) {
  await page.setContent(html || '', { waitUntil: 'load', timeout: 20000 })
  const { boxes } = await extractBoxes(page)
  const run = String(runIndex).padStart(2, '0')
  const t = String(turn).padStart(2, '0')
  fs.writeFileSync(path.join(SHOTS, `gen_${slug(refName)}_${slug(model)}_run${run}_turn${t}.png`),
    await page.screenshot({ fullPage: true, type: 'png' }))
  return boxes
}

let { data: refs } = await db.from('study_references').select('id,name,html')
refs = (refs || []).filter((r) => (refArg ? r.name === refArg : true))
const { data: sessions } = await db.from('a2a_sessions')
  .select('id,reference_id,driver_model,gen_model,run_index,stop_reason')
  .gte('run_index', 6)
let sessP = (sessions || []).filter((s) =>
  (s.stop_reason === 'done' || s.stop_reason === 'capped') &&
  refs.some((r) => r.id === s.reference_id))

const sessIds = sessP.map((s) => s.id)
let msgs = []
for (let i = 0; i < sessIds.length; i += 50) {
  const { data } = await db.from('a2a_messages').select('id,session_id,turn,html').in('session_id', sessIds.slice(i, i + 50))
  msgs = msgs.concat(data || [])
}
const bySess = new Map()
for (const m of msgs) { if (!bySess.has(m.session_id)) bySess.set(m.session_id, []); bySess.get(m.session_id).push(m) }

const FCOLS = ['f1_recall', 'f2_precision', 'f3_area_recall', 'f4_pos_euclid', 'f5_pos_chebyshev', 'f6_rel_width',
  'f7_rel_height', 'f8_aspect', 'f9_order_consistency', 'f10_quadrant_agreement', 'f11_alignment_delta',
  'f12_overlap_delta', 'f13_group_count', 'f14_section_uniformity']
const header = ['generation_id', 'conversation_id', 'reference_id', 'reference_name', 'turn', 'driver_model',
  'gen_model', 'run_index', 'generator_type', 'n_ref', 'n_gen', 'k', ...FCOLS, 'f15_clip_masked']
const rows = []

const refCache = new Map()
for (const r of refs) refCache.set(r.id, { name: r.name, boxes: await renderRef(r.html, r.name) })

let n = 0
for (const s of sessP) {
  const ref = refCache.get(s.reference_id)
  if (!ref) continue
  for (const m of (bySess.get(s.id) || []).sort((a, b) => (a.turn || 0) - (b.turn || 0))) {
    const genBoxes = await renderGen(m.html, ref.name, s.driver_model, s.run_index, m.turn)
    const f = computeFeatures(ref.boxes, genBoxes)
    rows.push([m.id, s.id, s.reference_id, `"${ref.name}"`, m.turn, s.driver_model, s.gen_model, s.run_index,
      'vlm', f.n_ref, f.n_gen, f.k, ...FCOLS.map((k) => f[k]), ''])
    n++
    console.log(`  …${n} generations`)
  }
}
await browser.close()

const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n')
const out = path.join(ANALYSIS, 'features_a2a.csv')
fs.writeFileSync(out, csv)
console.log(`\nWrote ${rows.length} rows from ${sessP.length} sessions (run_index>=6) → ${out}`)
console.log(`Screenshots in ${SHOTS} (ref_<name>.png, gen_<refName>_<model>_runNN_turnNN.png)`)
