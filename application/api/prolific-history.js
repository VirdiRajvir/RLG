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

  const { reference_id = null, is_tutorial = false } = req.body || {}
  const dbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

  let convUrl = `${SUPABASE_URL}/rest/v1/conversations?prolific_pid=eq.${encodeURIComponent(payload.prolific_pid)}&order=created_at.desc&limit=1&select=id`
  if (reference_id) convUrl += `&reference_id=eq.${encodeURIComponent(reference_id)}`
  const convRes = await fetch(convUrl, { headers: dbHeaders })
  if (!convRes.ok) return res.status(500).json({ error: 'Failed to load history' })
  const convs = await convRes.json()
  const conv = Array.isArray(convs) ? convs[0] : null

  let messages = []
  if (conv) {
    const msgsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${conv.id}&order=created_at.asc&select=role,content,turn,requirements`,
      { headers: dbHeaders }
    )
    if (!msgsRes.ok) return res.status(500).json({ error: 'Failed to load history' })
    messages = await msgsRes.json()
  }

  const PROMPT_LIMIT = parseInt(process.env.PROMPT_LIMIT || '50', 10)
  const TUTORIAL_PROMPT_LIMIT = parseInt(process.env.TUTORIAL_PROMPT_LIMIT || '3', 10)

  let remaining

  if (is_tutorial) {
    // Tutorial budget is scoped to only this participant's tutorial-flagged
    // conversation(s), and uses TUTORIAL_PROMPT_LIMIT instead of the global
    // PROMPT_LIMIT — same is_tutorial=eq.true filter as chat.js's tutorial check.
    const tutorialConvsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?prolific_pid=eq.${encodeURIComponent(payload.prolific_pid)}&select=id&is_tutorial=eq.true`,
      { headers: dbHeaders }
    )
    if (!tutorialConvsRes.ok) return res.status(500).json({ error: 'Failed to load history' })
    const tutorialConvs   = await tutorialConvsRes.json()
    const tutorialConvIds = Array.isArray(tutorialConvs) ? tutorialConvs.map((c) => c.id) : []

    let tutorialUserMsgCount = 0
    if (tutorialConvIds.length > 0) {
      const tutorialCountRes = await fetch(
        `${SUPABASE_URL}/rest/v1/messages?select=id&role=eq.user&conversation_id=in.(${tutorialConvIds.join(',')})`,
        { headers: dbHeaders }
      )
      if (!tutorialCountRes.ok) return res.status(500).json({ error: 'Failed to load history' })
      const tutorialUserMsgs = await tutorialCountRes.json()
      tutorialUserMsgCount = Array.isArray(tutorialUserMsgs) ? tutorialUserMsgs.length : 0
    }

    remaining = TUTORIAL_PROMPT_LIMIT - tutorialUserMsgCount
  } else {
    // `remaining` must be computed across ALL of this participant's conversations,
    // matching chat.js's rate-limit methodology (PROMPT_LIMIT - totalUserMessages
    // across every conversation for the identity, not just the single latest one
    // used for the message history above).
    const allConvsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?prolific_pid=eq.${encodeURIComponent(payload.prolific_pid)}&select=id`,
      { headers: dbHeaders }
    )
    if (!allConvsRes.ok) return res.status(500).json({ error: 'Failed to load history' })
    const allConvs   = await allConvsRes.json()
    const allConvIds = Array.isArray(allConvs) ? allConvs.map((c) => c.id) : []

    let userMsgCount = 0
    if (allConvIds.length > 0) {
      const countRes = await fetch(
        `${SUPABASE_URL}/rest/v1/messages?select=id&role=eq.user&conversation_id=in.(${allConvIds.join(',')})`,
        { headers: dbHeaders }
      )
      if (!countRes.ok) return res.status(500).json({ error: 'Failed to load history' })
      const userMsgs = await countRes.json()
      userMsgCount = Array.isArray(userMsgs) ? userMsgs.length : 0
    }

    remaining = PROMPT_LIMIT - userMsgCount
  }

  return res.status(200).json({
    conversation_id: conv ? conv.id : null,
    messages,
    remaining,
  })
}
