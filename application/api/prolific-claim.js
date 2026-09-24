import fetch from 'node-fetch'
import { signToken, verifyToken } from './_lib/prolificToken.js'

const OUTCOME_CODES = {
  completed: () => process.env.PROLIFIC_CODE_COMPLETED,
  partial:   () => process.env.PROLIFIC_CODE_PARTIAL,
}
const OUTCOME_CODE_ENV = {
  completed: 'PROLIFIC_CODE_COMPLETED',
  partial:   'PROLIFIC_CODE_PARTIAL',
}

// Same helper as prolific-state.js / prolific-advance-stage.js. A claim can
// legitimately return an already-finished participant (re-claiming after the
// Prolific redirect failed to fire, or any repeat run in test mode), so this
// endpoint has to be able to hand back a redirect code too.
function resolveRedirectCode(outcome) {
  if (!outcome) return null
  const code = (OUTCOME_CODES[outcome] ? OUTCOME_CODES[outcome]() : null) || null
  if (!code) {
    console.error(
      `[prolific-claim] No redirect code for outcome "${outcome}" — ` +
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

  if (!TOKEN_SECRET) {
    return res.status(500).json({ error: 'Server misconfigured' })
  }

  const payload = verifyToken(authHeader.split(' ')[1], TOKEN_SECRET)
  if (!payload || payload.phase !== 'pre_consent') {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { prolific_pid, study_id, session_id, is_test } = payload
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SERVICE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' })
  }

  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/prolific_claim_assignment`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_prolific_pid: prolific_pid,
      p_study_id: study_id,
      p_session_id: session_id,
      p_is_test: !!is_test,
    }),
  })
  if (!rpcRes.ok) {
    return res.status(500).json({ error: 'Failed to claim assignment' })
  }
  const rows = await rpcRes.json()
  const assignment = Array.isArray(rows) ? rows[0] : rows
  if (!assignment) {
    return res.status(500).json({ error: 'No assignment returned' })
  }

  const participantToken = signToken(
    { prolific_pid, study_id, session_id, is_test: !!is_test, phase: 'participant' },
    TOKEN_SECRET,
    2 * 60 * 60 // 2 hours — covers instructions + tutorial + 2×15min sessions with slack
  )

  // redirect_code rides inside `assignment` because that is the object the
  // frontend hands straight to applyState(), which reads data.outcome and
  // data.redirect_code off the same object.
  const redirect_code = resolveRedirectCode(assignment.outcome)

  return res.status(200).json({
    token: participantToken,
    assignment: { ...assignment, redirect_code },
    redirect_code,
    // Server's own clock at response time. The client uses this to correct
    // for its own device clock being wrong relative to the server — the
    // per-stage countdown compares a server-issued timestamp against
    // Date.now(), and a participant with a skewed system clock would
    // otherwise see stages read as already-expired from the first tick.
    server_time: new Date().toISOString(),
  })
}
