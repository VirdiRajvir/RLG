import fetch from 'node-fetch'
import { signToken } from './_lib/prolificToken.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prolific_pid, study_id, session_id, test_code } = req.body || {}
  if (!prolific_pid || !study_id || !session_id) {
    return res.status(400).json({ error: 'Missing prolific_pid/study_id/session_id' })
  }

  const TOKEN_SECRET = process.env.PROLIFIC_TOKEN_SECRET
  const TEST_CODE    = process.env.PROLIFIC_TEST_CODE
  const API_TOKEN    = process.env.PROLIFIC_API_TOKEN
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!TOKEN_SECRET || !SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' })
  }

  let isTest = false
  if (test_code && TEST_CODE && test_code === TEST_CODE) {
    isTest = true
  } else {
    // study_participants.prolific_pid has no study_id scoping anywhere in this
    // app (claim/advance/state, and conversations/messages, all key purely on
    // prolific_pid) — a repeat participant from an earlier study run here
    // would resume/leak into this one. Rather than thread study_id scoping
    // through every one of those, reject repeats up front, before consent or
    // any Prolific API spend: a prolific_pid already in our table (any study)
    // is turned away with the same declined path the consent screen's own
    // decline button uses. Skipped for test runs — test mode intentionally
    // reuses one PID across repeated resets (prolific-test-reset).
    const seenRes = await fetch(
      `${SUPABASE_URL}/rest/v1/study_participants?prolific_pid=eq.${encodeURIComponent(prolific_pid)}&select=id&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    )
    if (!seenRes.ok) {
      return res.status(500).json({ error: 'Failed to check prior participation' })
    }
    const seenRows = await seenRes.json()
    if (Array.isArray(seenRows) && seenRows.length > 0) {
      return res.status(200).json({
        already_participated: true,
        decline_redirect_code: process.env.PROLIFIC_CODE_DECLINED || null,
        server_time: new Date().toISOString(),
      })
    }

    // API_TOKEN is only required on THIS branch — test mode never talks to
    // Prolific — so the guard lives here rather than beside TOKEN_SECRET above.
    // Without it an unset token would be sent as the literal string
    // "Token undefined", come back 401, and surface to the participant as a
    // generic 502 indistinguishable from a real Prolific outage.
    if (!API_TOKEN) {
      console.error('[prolific-verify] PROLIFIC_API_TOKEN is not set — cannot verify submissions against the Prolific API.')
      return res.status(500).json({ error: 'Server misconfigured' })
    }
    // NOTE: verify against Prolific's actual submissions API shape before
    // launch — this is the one block that should need adjusting.
    let verifyRes
    try {
      verifyRes = await fetch(
        `https://api.prolific.com/api/v1/studies/${encodeURIComponent(study_id)}/submissions/?participant=${encodeURIComponent(prolific_pid)}`,
        { headers: { Authorization: `Token ${API_TOKEN}` } }
      )
    } catch (err) {
      return res.status(502).json({ error: `Prolific API request failed: ${err.message}` })
    }
    if (!verifyRes.ok) {
      return res.status(502).json({ error: 'Prolific API error' })
    }
    const data = await verifyRes.json()
    const results = Array.isArray(data.results) ? data.results : []
    const match = results.find((s) => s.id === session_id || s.session_id === session_id)
    if (!match || !['ACTIVE', 'STARTED'].includes(match.status)) {
      return res.status(403).json({ error: 'No active Prolific submission found for this session' })
    }
  }

  const preConsentToken = signToken(
    { prolific_pid, study_id, session_id, is_test: isTest, phase: 'pre_consent' },
    TOKEN_SECRET,
    600 // 10 minutes to get through consent
  )

  // Handed over up-front so a declining participant can be redirected without
  // ever calling the backend again — consent must precede any further call.
  return res.status(200).json({
    token: preConsentToken,
    is_test: isTest,
    decline_redirect_code: process.env.PROLIFIC_CODE_DECLINED || null,
    // Seeds the client's clock-offset correction as early as possible, before
    // the first server-timestamp-anchored stage (instructions) is ever
    // reached. See prolific-claim.js for the full rationale.
    server_time: new Date().toISOString(),
  })
}
