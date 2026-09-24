// Render the largest metric downshift (reference target + before/after generations)
// to confirm whether the "after" HTML is genuinely faulty. Reads analysis/v3/downshifts.csv.
//   node render-downshift.js
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer'
import { VIEWPORT } from '../application/api/evaluation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../analysis/v3/figs')

const csv = fs.readFileSync(path.resolve(__dirname, '../analysis/v3/downshifts.csv'), 'utf8').trim().split('\n')
const head = csv[0].split(','); const idx = (n) => head.indexOf(n)
const top = csv[1].split(',')  // sorted by dscore → most negative first
const ref = top[idx('ref')], t0 = top[idx('t0')], t1 = top[idx('t1')]
const gen0 = top[idx('gen0')], gen1 = top[idx('gen1')], dscore = top[idx('dscore')]
console.log(`largest downshift: ${ref}  turn ${t0} -> ${t1}  Δscore ${dscore}`)

const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: refRow } = await db.from('study_references').select('html').eq('name', ref).single()
const { data: msgs } = await db.from('messages').select('id,content,modification_reason').in('id', [gen0, gen1])
const byId = new Map((msgs || []).map((m) => [m.id, m]))
console.log(`turn ${t0} modification_reason: ${byId.get(gen0)?.modification_reason ?? 'null (generate)'}`)
console.log(`turn ${t1} modification_reason: ${byId.get(gen1)?.modification_reason ?? 'null (generate)'}`)
console.log(`turn ${t1} html length: ${(byId.get(gen1)?.content || '').length} chars`)

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const page = await browser.newPage(); await page.setViewport(VIEWPORT)
async function shot(html, out) {
  await page.setContent(html || '', { waitUntil: 'load', timeout: 20000 })
  await page.screenshot({ path: out, fullPage: false })
}
await shot(refRow.html, path.join(OUT, '_ds_ref.png'))
await shot(byId.get(gen0)?.content, path.join(OUT, '_ds_before.png'))
await shot(byId.get(gen1)?.content, path.join(OUT, '_ds_after.png'))
await browser.close()
fs.writeFileSync(path.join(OUT, '_ds_meta.json'), JSON.stringify({ ref, t0, t1, dscore }))
console.log('saved _ds_ref / _ds_before / _ds_after .png')
