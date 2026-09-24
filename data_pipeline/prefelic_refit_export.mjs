// Exports the two CSVs analysis/prefelic_refit/refit_prefelic.py needs to
// refit the metric weights on prefelic's real Prolific judgments
// (judgments.csv: session_id,rater_id,reference_id,a_msg,b_msg,choice,
// is_gold,response_ms — features.csv: generation_id,...,f1..f15). Writes
// only to analysis/prefelic_refit/.
//
// Excludes: test/dev prolific_pids (not a 24-char hex Prolific PID), and
// 6a916c90d383af9bc7599129 (confirmed duplicate-insert/skipped-trials bug
// from Annotation.jsx's recordChoice re-entrancy hole, fixed going forward
// but this participant's existing data is not a clean pass).
//
//   node prefelic_refit_export.mjs
import 'dotenv/config'
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { extractBoxes, extractRefBoxes, VIEWPORT } from '../application/api/evaluation.js'
import { computeFeatures } from './features-compute.js'

const looksReal = (pid) => /^[a-f0-9]{24}$/i.test(pid || '')
const EXCLUDE_PIDS = new Set(['6a916c90d383af9bc7599129'])

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../analysis/prefelic_refit')
const SHOTS = path.join(OUT_DIR, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Mask box-N/container-N label text before screenshotting — identical
// convention to features_prolific.js, so scores aren't influenced by
// label legibility.
const MASK = () => {
  const RE = /^[a-z]+-\d+$/i
  for (const el of document.querySelectorAll('*')) {
    if (RE.test(el.textContent.trim())) { el.style.color = 'transparent'; el.style.webkitTextFillColor = 'transparent' }
  }
}

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const page = await browser.newPage()
await page.setViewport(VIEWPORT)

async function renderRef(html, refId) {
  await page.setContent(html || '', { waitUntil: 'load', timeout: 20000 })
  const { boxes } = await extractRefBoxes(page)
  await page.evaluate(MASK)
  fs.writeFileSync(path.join(SHOTS, `ref_${refId}.png`), await page.screenshot({ fullPage: true, type: 'png' }))
  return boxes
}
async function renderGen(html, genId) {
  await page.setContent(html || '', { waitUntil: 'load', timeout: 20000 })
  const { boxes } = await extractBoxes(page)
  await page.evaluate(MASK)
  fs.writeFileSync(path.join(SHOTS, `gen_${genId}.png`), await page.screenshot({ fullPage: true, type: 'png' }))
  return boxes
}

// ── 1. pull judgments, real participants only ──────────────────────────────
let judgments = []
{
  let from = 0
  while (true) {
    const { data, error } = await db.from('judgments').select('*').range(from, from + 999)
    if (error) { console.error(error); process.exit(1) }
    judgments = judgments.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
}
const real = judgments.filter((j) => looksReal(j.prolific_pid) && !EXCLUDE_PIDS.has(j.prolific_pid))
console.log(`${real.length} real judgments (of ${judgments.length} total rows) from ${new Set(real.map((j) => j.prolific_pid)).size} participants`)

// ── 2. candidates + references referenced by those judgments ───────────────
const candIds = new Set()
for (const j of real) { candIds.add(j.candidate_a); candIds.add(j.candidate_b) }
const { data: cands } = await db.from('study_candidates').select('id,reference_id,html,tier').in('id', [...candIds])
const { data: refs } = await db.from('study_references').select('id,name,html')
const nameByRef = new Map(refs.map((r) => [r.id, r.name]))
console.log(`${cands.length} distinct candidates across ${refs.length} references`)

// ── 3. render + extract every reference once, every candidate once ─────────
const refBoxesById = new Map()
for (const r of refs) refBoxesById.set(r.id, await renderRef(r.html, r.id))

const featureRows = []
const FCOLS = ['f1_recall', 'f2_precision', 'f3_area_recall', 'f4_pos_euclid', 'f5_pos_chebyshev', 'f6_rel_width',
  'f7_rel_height', 'f8_aspect', 'f9_order_consistency', 'f10_quadrant_agreement', 'f11_alignment_delta',
  'f12_overlap_delta', 'f13_group_count', 'f14_section_uniformity']
let n = 0
for (const c of cands) {
  const genBoxes = await renderGen(c.html, c.id)
  const refBoxes = refBoxesById.get(c.reference_id)
  const f = computeFeatures(refBoxes, genBoxes)
  featureRows.push([c.id, c.reference_id, `"${nameByRef.get(c.reference_id)}"`, c.tier, f.n_ref, f.n_gen, f.k, ...FCOLS.map((k) => f[k]), ''])
  n++
  console.log(`  …${n}/${cands.length} candidates rendered`)
}
await browser.close()

const featHeader = ['generation_id', 'reference_id', 'reference_name', 'tier', 'n_ref', 'n_gen', 'k', ...FCOLS, 'f15_clip_masked']
fs.writeFileSync(path.join(OUT_DIR, 'features.csv'), [featHeader.join(','), ...featureRows.map((r) => r.join(','))].join('\n'))

// ── 4. judgments.csv, in reanalyze_latest.py's exact expected schema ───────
const jRows = real.map((j) => [j.session_id, j.prolific_pid, j.reference_id, j.candidate_a, j.candidate_b, j.choice, j.is_gold, j.response_ms])
const jHeader = ['session_id', 'rater_id', 'reference_id', 'a_msg', 'b_msg', 'choice', 'is_gold', 'response_ms']
fs.writeFileSync(path.join(OUT_DIR, 'judgments.csv'), [jHeader.join(','), ...jRows.map((r) => r.join(','))].join('\n'))

console.log(`\nWrote ${OUT_DIR}/features.csv (${featureRows.length} candidates) and judgments.csv (${jRows.length} judgments)`)
