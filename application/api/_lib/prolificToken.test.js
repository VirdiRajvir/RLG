import { describe, it, expect } from 'vitest'
import { signToken, verifyToken } from './prolificToken.js'

describe('prolificToken', () => {
  const secret = 'test-secret'

  it('round-trips a valid payload', () => {
    const token = signToken({ prolific_pid: 'abc123', study_id: 's1', session_id: 'sess1' }, secret, 3600)
    const payload = verifyToken(token, secret)
    expect(payload).not.toBeNull()
    expect(payload.prolific_pid).toBe('abc123')
    expect(payload.study_id).toBe('s1')
    expect(payload.session_id).toBe('sess1')
  })

  it('rejects a token signed with a different secret', () => {
    const token = signToken({ prolific_pid: 'abc123' }, secret, 3600)
    expect(verifyToken(token, 'wrong-secret')).toBeNull()
  })

  it('rejects an expired token', () => {
    const token = signToken({ prolific_pid: 'abc123' }, secret, -10)
    expect(verifyToken(token, secret)).toBeNull()
  })

  it('rejects a malformed or empty token', () => {
    expect(verifyToken('not-a-real-token', secret)).toBeNull()
    expect(verifyToken('', secret)).toBeNull()
    expect(verifyToken(null, secret)).toBeNull()
  })
})
