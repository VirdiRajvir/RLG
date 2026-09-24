// Render a sample trajectory (reference target + early/mid/final generations) to
// PNGs for a qualitative Method figure. Headless Puppeteer only (the existing
// screenshot pipeline) — not the dev frontend / playwright plugin.
//   node render-example.js [referenceName]
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer'
import { VIEWPORT } from '../application/api/evaluation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../analysis/v3/figs')
fs.mkdirSync(OUT, { recursive: true })
const forceRef = process.argv[2] || null

// ── pick a good trajectory from features.csv: >=4 gens, highest final-turn recall
const csv = fs.readFileSync(path.resolve(__dirname, '../analysis/features.csv'), 'utf8').trim().split('\n')
const head = csv[0].split(','); const idx = (n) => head.indexOf(n)
const iGen = idx('generation_id'), iConv = idx('conversation_id'), iRef = idx('reference_id')
const iName = idx('reference_name'), iTurn = idx('turn'), iRecall = idx('f1_recall')
const rows = csv.slice(1).map((l) => { const c = l.split(','); return {
  gen: c[iGen], conv: c[iConv], ref: c[iRef], name: c[iName].replace(/^"|"$/g, ''),
  turn: +c[iTurn], recall: +c[iRecall] } })

const byConv = new Map()
for (const r of rows) { if (!byConv.has(r.conv)) byConv.set(r.conv, []); byConv.get(r.conv).push(r) }
let best = null
for (const [, g] of byConv) {
  g.sort((a, b) => a.turn - b.turn)
  if (g.length < 4) continue
  if (forceRef && g[0].name !== forceRef) continue
  const finalRecall = g[g.length - 1].recall
  if (!best || finalRecall > best.finalRecall) best = { g, finalRecall }
}
if (!best) { console.error('no suitable trajectory'); process.exit(1) }
const g = best.g
const pick = [g[0], g[Math.floor((g.length - 1) / 2)], g[g.length - 1]]   // first, mid, last
console.log(`reference: ${g[0].name}   trajectory length: ${g.length}   final recall: ${best.finalRecall.toFixed(2)}`)
console.log(`picked turns: ${pick.map((p) => p.turn).join(', ')}  (recall ${pick.map((p) => p.recall.toFixed(2)).join(', ')})`)

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: refRow } = await db.from('study_references').select('html').eq('id', g[0].ref).single()
const { data: msgs } = await db.from('messages').select('id,content').in('id', pick.map((p) => p.gen))
const htmlById = new Map((msgs || []).map((m) => [m.id, m.content]))

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const page = await browser.newPage(); await page.setViewport(VIEWPORT)
async function shot(html, out) {
  await page.setContent(html || '', { waitUntil: 'load', timeout: 20000 })
  await page.screenshot({ path: out, fullPage: false })   // viewport-sized → uniform panels
}
await shot(refRow.html, path.join(OUT, '_ex_ref.png'))
for (let i = 0; i < pick.length; i++) await shot(htmlById.get(pick[i].gen), path.join(OUT, `_ex_t${i + 1}.png`))
await browser.close()

// stash the chosen turns for the compose step
fs.writeFileSync(path.join(OUT, '_ex_meta.json'), JSON.stringify({
  name: g[0].name, turns: pick.map((p) => p.turn), recalls: pick.map((p) => p.recall) }))
console.log(`saved panels to ${OUT}/_ex_*.png`)
