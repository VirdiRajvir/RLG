// Dump every judgments row to a local JSON backup so a destructive rebuild
// (--force) is reversible. Read-only against the DB.
//   node _backup-judgments.js
import 'dotenv/config'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const { data, error } = await db.from('judgments').select('*')
if (error) { console.error(error.message); process.exit(1) }

const out = '_judgments_backup.json'
fs.writeFileSync(out, JSON.stringify(data, null, 2))
console.log(`Backed up ${data.length} judgments → data_pipeline/${out}`)
