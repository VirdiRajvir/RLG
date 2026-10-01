// application/frontend/src/explore/LayoutGenBrowse.jsx
//
// Human and unrestricted-AI sessions on one page. They were two separate
// pages, which made the comparison the study is actually about — the same
// reference, attempted by a person and by each model — something you had to
// do from memory across a navigation. Here every session for a reference is
// a button on one row, and switching between them swaps only the strip.
//
// Scoped to the three base speakers. The six Claude instruction-style
// variants keep their own page: they are a comparison between each other,
// not against the humans, and 55 sessions would not fit this control.
import SessionFilmstrip from './SessionFilmstrip'
import BackLink from './BackLink'
import { h2aData, a2aData } from './loadExploreData'
import { BASE_A2A_CONDITIONS, CONDITION_INFO } from './conditions'

// Short enough to sit on a button. The full condition name still shows
// under the picker, so nothing is lost by abbreviating here.
const SHORT_LABEL = {
  claude_uncapped: 'Claude',
  gemini: 'Gemini',
  qwen: 'Qwen',
}

// Sessions keep their own dataset's detail route: the two have separate
// pages (participant vs condition in the heading, score colouring) and the
// Claude-ablations page links into the a2a one as well.
const DETAIL_PATH = { h2a: '/h2a', a2a: '/a2a' }

function buildSessions() {
  const merged = [
    ...h2aData.sessions.map((s) => ({ ...s, source: 'h2a' })),
    ...a2aData.sessions
      .filter((s) => BASE_A2A_CONDITIONS.includes(s.condition))
      .map((s) => ({ ...s, source: 'a2a' })),
  ]

  // Every model ran each reference more than once, so a bare model name
  // would label several different sessions identically. Numbering the
  // repeats keeps each button pointing at exactly one session — and only
  // where there IS a repeat, so a one-off stays plain. Participants are
  // already unique within a reference and are never numbered.
  const countsByReference = new Map()
  for (const s of merged) {
    if (s.source !== 'a2a') continue
    const key = `${s.reference_id}|${s.condition}`
    countsByReference.set(key, (countsByReference.get(key) ?? 0) + 1)
  }

  const seen = new Map()
  const labelled = merged.map((s) => {
    if (s.source === 'h2a') return { ...s, pickerLabel: s.participant }
    const key = `${s.reference_id}|${s.condition}`
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    const name = SHORT_LABEL[s.condition] ?? s.condition
    return { ...s, pickerLabel: countsByReference.get(key) > 1 ? `${name} ${n}` : name, run: n }
  })

  // The datasets interleave the models' repeat runs, which would lay the
  // picker out as Claude 1, Gemini 1, Qwen 1, Claude 2... Grouping each
  // model's runs together reads as what it is — the humans, then each
  // speaker's attempts at the same reference.
  const order = (s) => (s.source === 'h2a' ? -1 : BASE_A2A_CONDITIONS.indexOf(s.condition))
  return labelled.sort((a, b) => order(a) - order(b) || (a.run ?? 0) - (b.run ?? 0))
}

const sessions = buildSessions()

export default function LayoutGenBrowse() {
  return (
    <div>
      <BackLink to="/">Data Explorer</BackLink>
      <h1>Layout Generation</h1>
      <SessionFilmstrip
        sessions={sessions}
        basePath={(s) => DETAIL_PATH[s.source]}
        conditionOf={(s) => s.condition ?? null}
        picker="radio"
        pickerLabelOf={(s) => s.pickerLabel}
      />
    </div>
  )
}
