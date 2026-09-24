// ── Supabase admin writes ────────────────────────────────────────────────────
// Uses the SERVICE-ROLE key, which bypasses RLS — required because the study
// tables only allow anon to READ stimuli, never write them. This key must stay
// local (never shipped to the frontend).

import { createClient } from '@supabase/supabase-js'

// Lazy client so a missing env var produces our friendly check in generate.js
// rather than a crash at import time.
let _client = null
function db() {
  if (_client) return _client
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  _client = createClient(url, key, { auth: { persistSession: false } })
  return _client
}

// Resumability: returns the id if a reference of this name is already seeded.
export async function referenceExists(name) {
  const { data, error } = await db()
    .from('study_references')
    .select('id')
    .eq('name', name)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

export async function insertReference({ name, html, boxes }) {
  const { data, error } = await db()
    .from('study_references')
    .insert({ name, html, boxes })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// Updates an existing reference's content IN PLACE (same id). Deliberately
// NOT delete-then-insert: deleteReference cascades to study_candidates/
// study_pairs via FK, which would destroy any judgments already collected
// against this reference (this project has pilot-study judgment data
// predating Prolific, likely still attached to these reference names).
// update() leaves every FK'd row pointed at a valid, unchanged reference_id.
export async function updateReference(id, { html, boxes }) {
  const { error } = await db().from('study_references').update({ html, boxes }).eq('id', id)
  if (error) throw error
}

export async function insertCandidate({
  reference_id,
  tier,
  html,
  boxes,
  is_gold_broken = false,
  meta = null,
}) {
  const { data, error } = await db()
    .from('study_candidates')
    .insert({ reference_id, tier, html, boxes, is_gold_broken, meta })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function insertPairs(pairs) {
  if (!pairs.length) return
  const { error } = await db().from('study_pairs').insert(pairs)
  if (error) throw error
}

// Rollback helper: deletes a reference (FK on delete cascade removes its
// candidates + pairs), so a mid-reference failure leaves no half-seeded group.
export async function deleteReference(id) {
  const { error } = await db().from('study_references').delete().eq('id', id)
  if (error) throw error
}
