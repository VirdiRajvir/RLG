import crypto from 'crypto'

export function signToken(payload, secret, ttlSeconds) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const body = JSON.stringify({ ...payload, exp })
  const bodyB64 = Buffer.from(body).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(bodyB64).digest('base64url')
  return `${bodyB64}.${sig}`
}

export function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [bodyB64, sig] = token.split('.')
  if (!bodyB64 || !sig) return null

  const expectedSig = crypto.createHmac('sha256', secret).update(bodyB64).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null
  }
  return payload
}
