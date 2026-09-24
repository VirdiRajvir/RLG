import { describe, it, expect } from 'vitest'
import { normalizeLabelText, extractLabelToken } from './labelMatch.js'

describe('normalizeLabelText', () => {
  it('lowercases and collapses whitespace/underscores to hyphens', () => {
    expect(normalizeLabelText('Box 1')).toBe('box-1')
    expect(normalizeLabelText('box_1')).toBe('box-1')
    expect(normalizeLabelText('BOX-1')).toBe('box-1')
  })

  it('inserts a hyphen between a trailing letter run and a leading digit run', () => {
    expect(normalizeLabelText('box1')).toBe('box-1')
    expect(normalizeLabelText('container1')).toBe('container-1')
  })
})

describe('extractLabelToken', () => {
  it('matches an exact label with nothing else', () => {
    expect(extractLabelToken('box-1')).toBe('box-1')
  })

  it('tolerates decoration around the label', () => {
    expect(extractLabelToken('Box 1:')).toBe('box-1')
    expect(extractLabelToken('(box-1)')).toBe('box-1')
    expect(extractLabelToken('box1 — placeholder')).toBe('box-1')
  })

  it('never merges box-1 into box-10 or box-11 (greedy digit run)', () => {
    expect(extractLabelToken('box-10')).toBe('box-10')
    expect(extractLabelToken('box10')).toBe('box-10')
    expect(extractLabelToken('box-11')).toBe('box-11')
  })

  it('returns null when there is no label-shaped token', () => {
    expect(extractLabelToken('hello world')).toBeNull()
    expect(extractLabelToken('')).toBeNull()
  })

  it('matches container labels the same way', () => {
    expect(extractLabelToken('container-1')).toBe('container-1')
    expect(extractLabelToken('Container 2:')).toBe('container-2')
  })
})
