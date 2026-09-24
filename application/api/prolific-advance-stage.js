import fetch from 'node-fetch'
import { verifyToken } from './_lib/prolificToken.js'

const OUTCOME_CODES = {
  completed: () => process.env.PROLIFIC_CODE_COMPLETED,
  partial:   () => process.env.PROLIFIC_CODE_PARTIAL,
}
const OUTCOME_CODE_ENV = {
  completed: 'PROLIFIC_CODE_COMPLETED',
  partial:   'PROLIFIC_CODE_PARTIAL',
}

// See prolific-state.js for the full rationale: an unset PROLIFIC_CODE_* env var
// silently yields undefined, JSON.stringify drops it, and the participant is
// never redirected or shown a code with no error raised anywhere. Behaviour is
// unchanged for the participant; the misconfiguration is made loud in the logs.
function resolveRedirectCode(outcome) {
  if (!outcome) return null
  const code = (OUTCOME_CODES[outcome] ? OUTCOME_CODES[outcome]() : null) || null
  if (!code) {
    console.error(
      `[prolific-advance-stage] No redirect code for outcome "${outcome}" — ` +
      `${OUTCOME_CODE_ENV[outcome] || 'the matching PROLIFIC_CODE_* env var'} is unset. ` +
      'The participant cannot be redirected back to Prolific and will not be paid automatically.'
    )
  }
  return code
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const TOKEN_SECRET = process.env.PROLIFIC_TOKEN_SECRET
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!TOKEN_SECRET || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' })
  }

  const payload = verifyToken(authHeader.split(' ')[1], TOKEN_SECRET)
  if (!payload || payload.phase !== 'participant') {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { extend = false, force_outcome = null } = req.body || {}
  if (force_outcome && force_outcome !== 'partial') {
    return res.status(400).json({ error: 'force_outcome must be "partial" or omitted' })
  }

  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/prolific_advance_stage`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_prolific_pid: payload.prolific_pid,
      p_extend: !!extend,
      p_force_outcome: force_outcome,
    }),
  })
  if (!rpcRes.ok) {
    return res.status(500).json({ error: 'Failed to advance stage' })
  }
  const rows = await rpcRes.json()
  const state = Array.isArray(rows) ? rows[0] : rows
  if (!state) {
    return res.status(404).json({ error: 'No assignment found' })
  }

  const redirect_code = resolveRedirectCode(state.outcome)

  // See prolific-claim.js for the full rationale — same clock-skew correction.
  return res.status(200).json({ ...state, redirect_code, server_time: new Date().toISOString() })
}
