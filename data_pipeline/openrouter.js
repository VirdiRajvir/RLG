// ── OpenRouter call ──────────────────────────────────────────────────────────
// Same endpoint + model the app uses. Statelessness is handled by the caller:
// it passes the full growing `messages` array each turn (that IS the memory).

const API_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Models sometimes wrap the HTML in a ```html fence AND/OR add a prose preamble
// before it ("Here's the updated wireframe: ```html …"). Extract just the document:
// slice from the first <!doctype/<html, and drop any trailing fence.
function stripFences(text) {
  let s = text.trim()
  const m = s.match(/<!doctype html|<html[\s>]/i)
  if (m) s = s.slice(m.index)
  else s = s.replace(/^```(?:html)?\s*/i, '') // no doctype: at least drop a leading fence
  return s.replace(/```+\s*$/, '').trim()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function callOpenRouter(messages, { retries = 4 } = {}) {
  const key = process.env.OPENROUTER_API_KEY_FREE || process.env.OPENROUTER_API_KEY
  const model = process.env.OPENROUTER_MODEL || 'arcee-ai/trinity-large-preview:free'
  if (!key) throw new Error('Missing OPENROUTER_API_KEY_FREE / OPENROUTER_API_KEY')

  let lastErr
  for (let attempt = 1; attempt <= retries; attempt++) {
    let res
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages }),
      })
    } catch (e) {
      lastErr = e // network blip — retry
      await sleep(2000 * attempt)
      continue
    }

    if (res.ok) {
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (content) return stripFences(content)
      lastErr = new Error('OpenRouter returned no content')
    } else {
      const body = await res.text()
      lastErr = new Error(`OpenRouter ${res.status}: ${body}`)
      // Retry rate-limits (429) and server errors (5xx); bail on other 4xx.
      if (res.status !== 429 && res.status < 500) break
    }

    if (attempt < retries) {
      console.log(`    … retry ${attempt}/${retries - 1} after ${lastErr.message.slice(0, 60)}`)
      await sleep(3000 * attempt) // linear backoff: 3s, 6s, 9s
    }
  }
  throw lastErr
}
