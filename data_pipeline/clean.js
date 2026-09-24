// Clean candidates whose stored HTML has a leaked prose preamble / code fence
// before the actual document. Re-extracts boxes from the cleaned HTML so geometry
// stays consistent, then updates Supabase (service role).
//
//   node clean.js scan        list affected candidates (read-only)
//   node clean.js <id>        clean one candidate by id
//   node clean.js all         clean every affected candidate
import 'dotenv/config'
import puppeteer from 'puppeteer'
import { createClient } from '@supabase/supabase-js'
import { extractFromHtml } from './extract.js'

const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Affected = real text (prose) before the first HTML tag, OR a markdown fence
// anywhere. A bare <div>… fragment (no doctype) is NOT affected — it renders fine.
function isAffected(html) {
  const firstTag = html.indexOf('<')
  const preamble = firstTag === -1 ? html : html.slice(0, firstTag)
  return preamble.trim().length > 0 || /```/.test(html)
}

function cleanHtml(raw) {
  let s = raw.trim()
  const m = s.match(/<!doctype html|<html[\s>]/i)
  if (m) s = s.slice(m.index)
  else s = s.replace(/^```(?:html)?\s*/i, '')
  return s.replace(/```+\s*$/, '').trim()
}

const arg = process.argv[2]
const { data: cands, error } = await db.from('study_candidates').select('id,tier,reference_id,html')
if (error) throw error

const affected = cands.filter((c) => isAffected(c.html))
console.log(`scan: ${affected.length}/${cands.length} candidates have a leaked preamble/fence`)
for (const c of affected) console.log(`  ${c.tier.padEnd(12)} ${c.id}`)

if (!arg || arg === 'scan') {
  console.log('\n(run `node clean.js <id>` or `node clean.js all` to fix)')
  process.exit(0)
}

const targets = arg === 'all' ? affected : cands.filter((c) => c.id === arg)
if (!targets.length) {
  console.error(`\nNo candidate matches "${arg}".`)
  process.exit(1)
}

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
try {
  for (const c of targets) {
    const cleaned = cleanHtml(c.html)
    const boxes = await extractFromHtml(browser, cleaned, { isReference: false })
    const { error: upErr } = await db
      .from('study_candidates')
      .update({ html: cleaned, boxes })
      .eq('id', c.id)
    if (upErr) throw upErr
    console.log(`cleaned ${c.tier} ${c.id} — ${boxes.length} boxes`)
  }
} finally {
  await browser.close()
}
console.log('✓ done')
