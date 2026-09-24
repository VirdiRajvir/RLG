// Backfill geometric features (φ1–φ14) for completed, non-test Prolific
// participants from the box/container-relabeling-era studies into
// analysis/A2A_analysis/prolific/features_prolific.csv. Otherwise identical
// to features_prolific.js (see that file for the pipeline this mirrors) —
// only the study_id filter and output directory differ, so the original
// prolific/ run from the earlier study stays untouched as a separate,
// comparable dataset.
//
// Scoped to ONLY the current 5-reference controlled-pair release. Prolific
// listings for this release were re-created partway through (a fresh
// study_id per re-opened batch, not one listing reused throughout), so this
// is TWO study_ids, not one: 6a91c6b8b7b0d7db9ba4ff20 (the bulk of the
// release) and 6a929deb7f97fa0fc36c22fd (a single-participant listing
// created to collect the final C,E pair after the first listing closed).
// Earlier study_ids (6a8fc5cc201cf7d295b378df, 6a8ffe944741b0c093de220a,
// 6a8b23b44802a29ecaaa1ab1) predate this release's design and are
// deliberately excluded from prefelic's pool, not merged in.
//
//   node features_prolific.js                 # all completed, non-test participants in the current study
//   node features_prolific.js --limit 1        # test: only the first participant
import 'dotenv/config'
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { extractBoxes, extractRefBoxes, VIEWPORT } from '../application/api/evaluation.js'
import { computeFeatures } from './features-compute.js'

const STUDY_IDS = ['6a91c6b8b7b0d7db9ba4ff20', '6a929deb7f97fa0fc36c22fd']

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../analysis/A2A_analysis/prolific')
const SHOTS = path.join(OUT_DIR, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

const argv = process.argv.slice(2)
const limitArg = argv.includes('--limit') ? parseInt(argv[argv.indexOf('--limit') + 1], 10) : null

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Mask the type-N label text (keep boxes) before screenshotting, so scores
// aren't influenced by label legibility — same convention as features.js.
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

// ── pull data ──
const { data: parts } = await db.from('study_participants')
  .select('prolific_pid')
  .not('prolific_pid', 'is', null)
  .eq('outcome', 'completed')
  .eq('is_test', false)
  .in('study_id', STUDY_IDS)
let pids = (parts || []).map((p) => p.prolific_pid)
if (limitArg) pids = pids.slice(0, limitArg)
if (pids.length === 0) {
  console.log(`No completed, non-test Prolific participants found for study_ids=${STUDY_IDS.join(',')}.`)
  await browser.close()
  process.exit(0)
}
console.log(`Found ${pids.length} completed participant(s) across study_ids=${STUDY_IDS.join(',')}: ${pids.join(', ')}`)

const { data: convs } = await db.from('conversations')
  .select('id,prolific_pid,reference_id,is_tutorial,created_at')
  .in('prolific_pid', pids)
  .eq('is_tutorial', false)
  .not('reference_id', 'is', null)
const convsP = (convs || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

// Session index (1 or 2) per participant, by chronological order of their
// two real conversations — not stored directly on the row, so derived here
// purely for readable collage row labels.
const sessionIndex = new Map()
for (const pid of pids) {
  convsP.filter((c) => c.prolific_pid === pid).forEach((c, i) => sessionIndex.set(c.id, i + 1))
}

const refIds = [...new Set(convsP.map((c) => c.reference_id))]
const { data: refs } = await db.from('study_references').select('id,name,html').in('id', refIds)
const refById = new Map((refs || []).map((r) => [r.id, r]))

const convIds = convsP.map((c) => c.id)
let msgs = []
for (let i = 0; i < convIds.length; i += 50) {
  const { data } = await db.from('messages').select('id,conversation_id,turn,content').eq('role', 'assistant').in('conversation_id', convIds.slice(i, i + 50))
  msgs = msgs.concat(data || [])
}
const byConv = new Map()
for (const m of msgs) { if (!byConv.has(m.conversation_id)) byConv.set(m.conversation_id, []); byConv.get(m.conversation_id).push(m) }

// ── compute ──
const FCOLS = ['f1_recall', 'f2_precision', 'f3_area_recall', 'f4_pos_euclid', 'f5_pos_chebyshev', 'f6_rel_width',
  'f7_rel_height', 'f8_aspect', 'f9_order_consistency', 'f10_quadrant_agreement', 'f11_alignment_delta',
  'f12_overlap_delta', 'f13_group_count', 'f14_section_uniformity']
const header = ['generation_id', 'conversation_id', 'reference_id', 'reference_name', 'turn', 'prolific_pid',
  'session', 'session_created_at', 'n_ref', 'n_gen', 'k', ...FCOLS, 'f15_clip_masked']
const rows = []

const refCache = new Map()
for (const refId of refIds) {
  const r = refById.get(refId)
  if (r) refCache.set(refId, { name: r.name, boxes: await renderRef(r.html, r.id) })
}

let n = 0
for (const c of convsP) {
  const ref = refCache.get(c.reference_id)
  if (!ref) continue
  for (const m of (byConv.get(c.id) || []).sort((a, b) => (a.turn || 0) - (b.turn || 0))) {
    const genBoxes = await renderGen(m.content, m.id)
    const f = computeFeatures(ref.boxes, genBoxes)
    rows.push([m.id, c.id, c.reference_id, `"${ref.name}"`, m.turn, c.prolific_pid, sessionIndex.get(c.id), c.created_at,
      f.n_ref, f.n_gen, f.k, ...FCOLS.map((k) => f[k]), ''])
    n++
    if (n % 10 === 0) console.log(`  …${n} generations`)
  }
}
await browser.close()

const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n')
const out = path.join(OUT_DIR, 'features_prolific.csv')
fs.writeFileSync(out, csv)
console.log(`\nWrote ${rows.length} rows → ${out}`)
console.log(`Screenshots in ${SHOTS} (gen_<id>.png, ref_<id>.png).`)
