// application/frontend/src/explore/SessionCarousel.jsx
//
// Shared browse view for H2A and A2A: reference pinned on the left, ONE
// generation session at a time on the right — both large. Left/right arrows
// (+ dots) switch which session is showing, independent of the reference's
// own left/right arrows. The visible session auto-advances through its own
// turns every 3s, looping back to turn 1 after its last turn — no
// cross-session sync needed here, since only one session's animation is
// ever on screen at once. Press-and-hold on the generation panel's image
// pauses its animation; release resumes. The image itself is never a link —
// the label below it is the actual, always-clickable link to the full
// session detail page (manual turn scrubbing, instruction text, etc.).
//
// conditionOf is optional: H2A (all-human, no conditions) omits it and gets
// the plain participant label with no border color. A2A/Claude-ablations
// pass it, which swaps the label to the condition's plain-English name,
// colors the generation frame's border to match (same colors as the paper's
// own figures, see conditions.js), and tints the session dots to match too.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import FixedViewportFrame from '../components/FixedViewportFrame'
import { referenceById } from './loadExploreData'
import { CONDITION_INFO } from './conditions'
import './SessionCarousel.css'

const TICK_MS = 3000

export default function SessionCarousel({ sessions, basePath, conditionOf }) {
  const [refIndex, setRefIndex] = useState(0)
  const [sessionIndex, setSessionIndex] = useState(0)
  const [tick, setTick] = useState(0)
  const [paused, setPaused] = useState(false)

  const byReference = useMemo(() => {
    const groups = new Map()
    for (const s of sessions) {
      if (!groups.has(s.reference_id)) groups.set(s.reference_id, [])
      groups.get(s.reference_id).push(s)
    }
    return groups
  }, [sessions])

  const referenceIds = useMemo(() => [...byReference.keys()], [byReference])
  const safeRefIndex = Math.min(refIndex, Math.max(referenceIds.length - 1, 0))
  const currentRefId = referenceIds[safeRefIndex]
  const currentRef = referenceById(currentRefId)
  // Every key in byReference was built from at least one real session, so
  // this is never empty once currentRefId is defined.
  const currentSessions = byReference.get(currentRefId) ?? []
  const safeSessionIndex = Math.min(sessionIndex, Math.max(currentSessions.length - 1, 0))
  const session = currentSessions[safeSessionIndex]

  const goToReference = (index) => {
    setRefIndex(((index % referenceIds.length) + referenceIds.length) % referenceIds.length)
    setSessionIndex(0)
  }

  const goToSession = (index) => {
    setSessionIndex(((index % currentSessions.length) + currentSessions.length) % currentSessions.length)
  }

  // A new reference or a new session both mean a new turn sequence — start
  // the animation over from turn 1 rather than resuming mid-cycle.
  useEffect(() => {
    setTick(0)
  }, [currentRefId, safeSessionIndex])

  useEffect(() => {
    if (paused || !session) return
    const id = setInterval(() => setTick((t) => (t + 1) % session.turns.length), TICK_MS)
    return () => clearInterval(id)
  }, [paused, session])

  if (referenceIds.length === 0) return <p className="sc-empty">No sessions.</p>

  const turn = session?.turns[tick]
  const condition = conditionOf && session ? conditionOf(session) : null
  const conditionColor = condition ? CONDITION_INFO[condition]?.color : null
  const sessionLabel = condition ? (CONDITION_INFO[condition]?.label ?? condition) : session?.participant

  return (
    <div className="sc-root">
      <div className="sc-pane sc-pane--ref">
        <div className="sc-frame">
          <FixedViewportFrame html={currentRef?.html} grayscale />
        </div>
        <span className="sc-label">{currentRef?.name ?? currentRefId}</span>
        <div className="sc-nav">
          <button
            type="button"
            className="sc-nav-btn"
            onClick={() => goToReference(safeRefIndex - 1)}
            aria-label="Previous reference"
          >
            ←
          </button>
          <div className="sc-dots">
            {referenceIds.map((refId, i) => (
              <button
                key={refId}
                type="button"
                className={`sc-dot${i === safeRefIndex ? ' sc-dot--active' : ''}`}
                onClick={() => goToReference(i)}
                aria-label={`Go to ${referenceById(refId)?.name ?? refId}`}
              />
            ))}
          </div>
          <button
            type="button"
            className="sc-nav-btn"
            onClick={() => goToReference(safeRefIndex + 1)}
            aria-label="Next reference"
          >
            →
          </button>
        </div>
      </div>

      <div className="sc-pane">
        <div
          className={`sc-frame${paused ? ' sc-frame--paused' : ''}`}
          style={conditionColor ? { borderColor: conditionColor, borderWidth: 3 } : undefined}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        >
          <FixedViewportFrame html={turn?.html} />
        </div>
        {/* Same pause handlers as the image above — one shared `paused`
            state drives both, so clicking either one pauses both, and the
            prompt text advances on exactly the same 3s tick as the image. */}
        <div
          className={`sc-prompt${paused ? ' sc-prompt--paused' : ''}`}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        >
          {turn?.instruction || '—'}
        </div>
        <Link to={`${basePath}/${session.id}`} className="sc-label exp-link">
          {sessionLabel} · turn {turn?.turn} · {turn?.score?.toFixed(2)}
        </Link>
        {currentSessions.length > 1 && (
          <div className="sc-nav">
            <button
              type="button"
              className="sc-nav-btn"
              onClick={() => goToSession(safeSessionIndex - 1)}
              aria-label="Previous session"
            >
              ←
            </button>
            <div className="sc-dots">
              {currentSessions.map((s, i) => {
                const c = conditionOf ? conditionOf(s) : null
                const dotColor = c ? CONDITION_INFO[c]?.color : null
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`sc-dot${i === safeSessionIndex ? ' sc-dot--active' : ''}${dotColor ? ' sc-dot--colored' : ''}`}
                    style={dotColor ? { background: dotColor } : undefined}
                    onClick={() => goToSession(i)}
                    aria-label={`Go to ${c ? (CONDITION_INFO[c]?.label ?? c) : s.participant}`}
                  />
                )
              })}
            </div>
            <button
              type="button"
              className="sc-nav-btn"
              onClick={() => goToSession(safeSessionIndex + 1)}
              aria-label="Next session"
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
