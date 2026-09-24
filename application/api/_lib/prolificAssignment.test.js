import { describe, it, expect } from 'vitest'
import { slotForSeq, appendStageLog, isValidTransition, NUM_SLOTS } from './prolificAssignment.js'

describe('slotForSeq', () => {
  it('wraps around after NUM_SLOTS', () => {
    expect(slotForSeq(1)).toBe(1)
    expect(slotForSeq(10)).toBe(10)
    expect(slotForSeq(11)).toBe(1)
    expect(slotForSeq(20)).toBe(10)
  })

  it('covers every slot exactly once across any 10 consecutive seq values, regardless of offset', () => {
    for (const offset of [0, 3, 7, 25]) {
      const slots = new Set()
      for (let i = 1; i <= NUM_SLOTS; i++) slots.add(slotForSeq(offset + i))
      expect(slots.size).toBe(NUM_SLOTS)
    }
  })
})

describe('appendStageLog', () => {
  it('appends an entry to an empty log', () => {
    const log = appendStageLog([], 'instructions', '2026-01-01T00:00:00Z')
    expect(log).toEqual([{ stage: 'instructions', entered_at: '2026-01-01T00:00:00Z' }])
  })

  it('does not mutate the input array', () => {
    const original = [{ stage: 'instructions', entered_at: 't0' }]
    appendStageLog(original, 'tutorial', 't1')
    expect(original).toHaveLength(1)
  })

  it('merges extra fields onto the entry', () => {
    const log = appendStageLog([], 'done', 't2', { outcome: 'completed' })
    expect(log[0]).toEqual({ stage: 'done', entered_at: 't2', outcome: 'completed' })
  })
})

describe('isValidTransition', () => {
  it('allows only forward one-step moves', () => {
    expect(isValidTransition('instructions', 'tutorial')).toBe(true)
    expect(isValidTransition('tutorial', 'session')).toBe(true)
    expect(isValidTransition('session', 'done')).toBe(true)
  })

  it('rejects skips and backward moves', () => {
    expect(isValidTransition('instructions', 'session')).toBe(false)
    expect(isValidTransition('session', 'instructions')).toBe(false)
    expect(isValidTransition('done', 'instructions')).toBe(false)
  })

  it('rejects unknown stages', () => {
    expect(isValidTransition('bogus', 'tutorial')).toBe(false)
    expect(isValidTransition('instructions', 'bogus')).toBe(false)
  })
})
