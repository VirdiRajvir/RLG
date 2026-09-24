import fetch from 'node-fetch'
import { verifyToken } from './_lib/prolificToken.js'

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

  // Reset is only ever a test-run convenience. A real participant's finished
  // assignment must never be deletable from the client — this is the token's
  // own signed claim, not a value the client can influence after issuance.
  if (!payload.is_test) {
    return res.status(403).json({ error: 'Reset is only available for test runs' })
  }

  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/prolific_test_reset`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_prolific_pid: payload.prolific_pid }),
  })
  if (!rpcRes.ok) {
    return res.status(500).json({ error: 'Failed to reset test assignment' })
  }

  return res.status(200).json({ ok: true })
}
