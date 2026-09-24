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

// An unset PROLIFIC_CODE_* env var makes the lookup return undefined, which
// JSON.stringify then drops from the response entirely — the participant is
// simply never redirected and never shown a code, with no error anywhere.
// Participant-facing behaviour is deliberately unchanged (OutcomeScreen already
// renders a fallback message when redirectCode is falsy); the point here is to
// make the misconfiguration loud in the server logs so it is discoverable.
function resolveRedirectCode(outcome) {
  if (!outcome) return null
  const code = (OUTCOME_CODES[outcome] ? OUTCOME_CODES[outcome]() : null) || null
  if (!code) {
    console.error(
      `[prolific-state] No redirect code for outcome "${outcome}" — ` +
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

  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/prolific_get_state`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_prolific_pid: payload.prolific_pid }),
  })
  if (!rpcRes.ok) {
    return res.status(500).json({ error: 'Failed to read state' })
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
