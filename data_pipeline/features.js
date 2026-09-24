// Backfill geometric features (φ1–φ14) for ALL conforming real generations into
// analysis/features.csv, and save masked screenshots (gen + ref) for the φ15 CLIP
// step. φ15 is left blank here and filled by analysis/clip_feature.py.
//
//   node features.js                 # all generations
//   node features.js --ref steel     # test: only one reference (by name)
//   node features.js --limit 1       # test: only the first conversation
import 'dotenv/config'
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { extractBoxes, extractRefBoxes, VIEWPORT } from '../application/api/evaluation.js'
import { computeFeatures } from './features-compute.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ANALYSIS = path.resolve(__dirname, '../analysis')
const SHOTS = path.join(ANALYSIS, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

const argv = process.argv.slice(2)
const refArg = argv.includes('--ref') ? argv[argv.indexOf('--ref') + 1] : null
const limitArg = argv.includes('--limit') ? parseInt(argv[argv.indexOf('--limit') + 1], 10) : null

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Mask the type-N label text (keep boxes) before screenshotting, so CLIP can't read labels.
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
const { data: parts } = await db.from('study_participants').select('user_id,prolific_pid')
const partIds     = new Set((parts || []).map((p) => p.user_id).filter(Boolean))
const prolificIds = new Set((parts || []).map((p) => p.prolific_pid).filter(Boolean))
let { data: refs } = await db.from('study_references').select('id,name,html')
refs = (refs || []).filter((r) => (refArg ? r.name === refArg : true))
const { data: convs } = await db.from('conversations').select('id,user_id,prolific_pid,reference_id').not('reference_id', 'is', null)
let convsP = (convs || []).filter((c) =>
  (partIds.has(c.user_id) || prolificIds.has(c.prolific_pid)) && refs.some((r) => r.id === c.reference_id)
)
if (limitArg) convsP = convsP.slice(0, limitArg)

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
const header = ['generation_id', 'conversation_id', 'reference_id', 'reference_name', 'turn', 'user_id', 'prolific_pid',
  'n_ref', 'n_gen', 'k', ...FCOLS, 'f15_clip_masked']
const rows = []

const refCache = new Map()
for (const r of refs) refCache.set(r.id, { name: r.name, boxes: await renderRef(r.html, r.id) })

let n = 0
for (const c of convsP) {
  const ref = refCache.get(c.reference_id)
  for (const m of (byConv.get(c.id) || []).sort((a, b) => (a.turn || 0) - (b.turn || 0))) {
    const genBoxes = await renderGen(m.content, m.id)
    const f = computeFeatures(ref.boxes, genBoxes)
    rows.push([m.id, c.id, c.reference_id, `"${ref.name}"`, m.turn, c.user_id || '', c.prolific_pid || '',
      f.n_ref, f.n_gen, f.k, ...FCOLS.map((k) => f[k]), ''])
    n++
    if (n % 10 === 0) console.log(`  …${n} generations`)
  }
}
await browser.close()

const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n')
const out = path.join(ANALYSIS, 'features.csv')
fs.writeFileSync(out, csv)
console.log(`\nWrote ${rows.length} rows → ${out}`)
console.log(`Screenshots in ${SHOTS} (gen_<id>.png, ref_<id>.png) for the CLIP step.`)
