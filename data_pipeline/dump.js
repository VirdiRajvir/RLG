// Dump a reference + its candidates' HTML to references/_inspect/ for visual review.
//   node dump.js <reference-name>
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../references/_inspect')
const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const name = process.argv[2]
const { data: refs, error: e1 } = await db.from('study_references').select('id,html').eq('name', name)
if (e1) throw e1
if (!refs.length) throw new Error(`no reference "${name}"`)
const { data: cands, error: e2 } = await db
  .from('study_candidates')
  .select('tier,html')
  .eq('reference_id', refs[0].id)
if (e2) throw e2

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, `${name}__reference.html`), refs[0].html)
for (const c of cands) writeFileSync(join(OUT, `${name}__${c.tier}.html`), c.html)
console.log(`wrote ${cands.length + 1} files for ${name} -> references/_inspect/`)
