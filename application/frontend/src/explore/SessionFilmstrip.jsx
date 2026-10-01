// application/frontend/src/explore/SessionFilmstrip.jsx
//
// Shared browse view for H2A, A2A and the Claude ablations: the reference on
// the left, and one session's entire turn timeline laid out left-to-right as
// a filmstrip on the right. Each frame of the strip is one turn — turn number
// above the artifact, the real instruction below it, then that turn's score —
// so the strip reads as a number line along the turn axis.
//
// The reference picker over the left pane is always a `← label →` control.
// Which session is showing is chosen above the strip, one of two ways.
// `picker='arrows'` is prev/next, which is the only workable control for a
// page with dozens of sessions. `picker='radio'` lays every session for the
// current reference out as its own button, which reads far better when a
// handful of them are directly comparable — then pickerLabelOf supplies each
// button's text. Both drive the same sessionIndex.
//
// basePath takes a function as well as a string, for pages whose sessions do
// not all share one detail route (the merged layout-generation page draws
// from both the h2a and a2a datasets, which have separate detail pages).
//
// Nothing animates and nothing is on a timer. The reader moves along the
// timeline themselves, three ways, all driving the same scroll container:
// wheel/trackpad (vertical wheel is translated to horizontal), dragging the
// strip, or the arrow/Home/End keys once the strip has focus.
//
// conditionOf is optional: H2A (all-human, no conditions) omits it and gets
// the plain participant label with no border color. A2A/Claude-ablations
// pass it, which swaps the label to the condition's plain-English name and
// colors each artifact frame's border to match (the same colors as the
// paper's own figures, see conditions.js).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import FixedViewportFrame from '../components/FixedViewportFrame'
import { referenceById } from './loadExploreData'
import { CONDITION_INFO } from './conditions'
import './SessionFilmstrip.css'

// How far outside the viewport a cell starts rendering its iframe. Roughly
// two cells' worth, so frames are ready before they are scrolled into view.
const PRELOAD_MARGIN = '0px 800px'

function NavRow({ label, labelStyle, onPrev, onNext, prevLabel, nextLabel, className = '' }) {
  return (
    <div className={`sf-nav ${className}`}>
      <button type="button" className="sf-nav-btn" onClick={onPrev} aria-label={prevLabel}>←</button>
      <span className="sf-nav-label" style={labelStyle}>{label}</span>
      <button type="button" className="sf-nav-btn" onClick={onNext} aria-label={nextLabel}>→</button>
    </div>
  )
}

function TurnCell({ turn, borderColor }) {
  const cellRef = useRef(null)
  const [mounted, setMounted] = useState(false)

  // A single session runs up to 22 turns, and every cell is a full-document
  // iframe — mounting all of them on load is what would make this layout
  // crawl. A cell mounts its frame once it comes within PRELOAD_MARGIN of
  // the viewport and then stays mounted, so scrolling back is instant and
  // no frame ever has to re-measure itself.
  useEffect(() => {
    if (mounted || !cellRef.current) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setMounted(true)
      },
      { rootMargin: PRELOAD_MARGIN }
    )
    io.observe(cellRef.current)
    return () => io.disconnect()
  }, [mounted])

  return (
    <li className="sf-cell" ref={cellRef}>
      <div className="sf-tick">
        <span className="sf-tick-label">{turn.turn}</span>
      </div>
      <div
        className="sf-cell-frame"
        style={borderColor ? { borderColor, borderWidth: 3 } : undefined}
      >
        {mounted ? <FixedViewportFrame html={turn.html} /> : null}
      </div>
      <p className="sf-cell-prompt">{turn.instruction || '—'}</p>
      <p className="sf-cell-score">{turn.score.toFixed(3)}</p>
    </li>
  )
}

export default function SessionFilmstrip({
  sessions,
  basePath,
  conditionOf,
  picker = 'arrows',
  pickerLabelOf,
}) {
  const [refIndex, setRefIndex] = useState(0)
  const [sessionIndex, setSessionIndex] = useState(0)
  const [dragging, setDragging] = useState(false)
  const stripRef = useRef(null)
  const dragRef = useRef(null)

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
  // Every key in byReference came from at least one real session, so this is
  // never empty once currentRefId is defined.
  const currentSessions = byReference.get(currentRefId) ?? []
  const safeSessionIndex = Math.min(sessionIndex, Math.max(currentSessions.length - 1, 0))
  const session = currentSessions[safeSessionIndex]

  // A different session is a different timeline — start it at turn 1 rather
  // than wherever along the previous strip the reader had scrolled to.
  useEffect(() => {
    stripRef.current?.scrollTo({ left: 0 })
  }, [currentRefId, safeSessionIndex])

  // React attaches its own wheel listener passively, which would make
  // preventDefault a no-op, so this one is registered directly.
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const onWheel = (e) => {
      // A trackpad's horizontal gesture already scrolls the strip natively.
      // Only vertical wheel movement needs redirecting.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const max = el.scrollWidth - el.clientWidth
      // At either end, let the event through so the page carries on
      // scrolling vertically instead of the strip swallowing it.
      if (e.deltaY < 0 && el.scrollLeft <= 0) return
      if (e.deltaY > 0 && el.scrollLeft >= max - 1) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  if (referenceIds.length === 0) return <p className="sf-empty">No sessions.</p>

  const reference = referenceById(currentRefId)
  const condition = conditionOf ? conditionOf(session) : null
  const conditionColor = condition ? CONDITION_INFO[condition]?.color : null
  const sessionLabel = condition
    ? (CONDITION_INFO[condition]?.label ?? condition)
    : session.participant

  // basePath is a plain string for single-dataset pages, or a function when
  // the sessions on screen come from datasets with different detail routes.
  const detailPathFor = (s) => (typeof basePath === 'function' ? basePath(s) : basePath)

  const goToReference = (next) => {
    setRefIndex(((next % referenceIds.length) + referenceIds.length) % referenceIds.length)
    setSessionIndex(0)
  }

  const goToSession = (next) => {
    setSessionIndex(((next % currentSessions.length) + currentSessions.length) % currentSessions.length)
  }

  // One cell's width is the natural step for a keypress; clientWidth is only
  // the fallback for the frame before any cell has laid out.
  const cellStep = () => {
    const el = stripRef.current
    return el?.firstElementChild?.getBoundingClientRect().width || el?.clientWidth || 0
  }

  const onKeyDown = (e) => {
    const el = stripRef.current
    if (!el) return
    const moves = {
      ArrowRight: () => el.scrollBy({ left: cellStep(), behavior: 'smooth' }),
      ArrowLeft: () => el.scrollBy({ left: -cellStep(), behavior: 'smooth' }),
      Home: () => el.scrollTo({ left: 0, behavior: 'smooth' }),
      End: () => el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' }),
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    move()
  }

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    const el = stripRef.current
    // The horizontal scrollbar sits inside this element's box, below its
    // content area, so a press on it lands here too. Taking that press over
    // would replace the browser's own scrollbar drag with ours — and pointer
    // capture would then swallow every follow-up event, leaving the
    // scrollbar dead. clientHeight excludes the scrollbar, so anything below
    // it belongs to the browser.
    if (e.clientY - el.getBoundingClientRect().top >= el.clientHeight) return
    // Instruction text stays selectable so a prompt can be copied out.
    if (e.target.closest('.sf-cell-prompt')) return
    dragRef.current = { x: e.clientX, scrollLeft: el.scrollLeft }
    setDragging(true)
    // Capture only keeps the drag alive when the pointer wanders outside the
    // strip — the scrollLeft math below works regardless. It throws outright
    // for a pointer id the browser has no active pointer for, so it goes
    // last and guarded rather than taking the whole drag down with it.
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* no capture: a drag that leaves the strip just ends early */
    }
  }

  const onPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    stripRef.current.scrollLeft = drag.scrollLeft - (e.clientX - drag.x)
  }

  const endDrag = () => {
    dragRef.current = null
    setDragging(false)
  }

  return (
    <div className="sf-root">
      <NavRow
        className="sf-nav--ref"
        label={reference?.name ?? currentRefId}
        onPrev={() => goToReference(safeRefIndex - 1)}
        onNext={() => goToReference(safeRefIndex + 1)}
        prevLabel="Previous reference"
        nextLabel="Next reference"
      />

      <div className="sf-head">
        <div className="sf-head-id">
          {picker === 'radio'
            ? (
              /* aria-pressed rather than role="radio": a real radiogroup
                 promises arrow-key roving between the options, and the arrow
                 keys already belong to the strip below. These stay ordinary
                 buttons reachable by Tab, each reporting whether it is the
                 one currently showing. */
              <div className="sf-picker" aria-label="Choose a session">
                {currentSessions.map((s, i) => {
                  const c = conditionOf ? conditionOf(s) : null
                  const color = c ? CONDITION_INFO[c]?.color : null
                  const active = i === safeSessionIndex
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`sf-picker-btn${active ? ' sf-picker-btn--active' : ''}`}
                      style={active && color ? { borderColor: color, color } : undefined}
                      aria-pressed={active}
                      onClick={() => goToSession(i)}
                    >
                      {pickerLabelOf ? pickerLabelOf(s) : s.id}
                    </button>
                  )
                })}
              </div>
            )
            : (
              <NavRow
                label={sessionLabel}
                labelStyle={conditionColor ? { color: conditionColor } : undefined}
                onPrev={() => goToSession(safeSessionIndex - 1)}
                onNext={() => goToSession(safeSessionIndex + 1)}
                prevLabel="Previous session"
                nextLabel="Next session"
              />
            )}
          <span className="sf-head-count">
            {picker === 'radio'
              ? sessionLabel
              : `session ${safeSessionIndex + 1} of ${currentSessions.length}`}
            {' · '}{session.turns.length}{' '}
            {session.turns.length === 1 ? 'turn' : 'turns'}
          </span>
        </div>
        <Link to={`${detailPathFor(session)}/${session.id}`} className="exp-link sf-head-link">
          Full session →
        </Link>
      </div>

      {/* The spacer above the frame is what lines the reference up with the
          artifacts across the strip, which sit below their own turn-number
          row — see --sf-tick-h in the stylesheet. */}
      <div className="sf-reference">
        <div className="sf-reference-frame">
          <FixedViewportFrame html={reference?.html} grayscale />
        </div>
      </div>

      <div className="sf-timeline">
        {/* tabIndex makes the strip focusable so the arrow keys reach
            onKeyDown; role="group" keeps that focus stop meaningful to a
            screen reader rather than a bare focusable div. */}
        <ol
          className={`sf-strip${dragging ? ' sf-strip--dragging' : ''}`}
          ref={stripRef}
          tabIndex={0}
          role="group"
          aria-label={`Turn timeline for ${sessionLabel}, scroll or use arrow keys`}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {session.turns.map((turn) => (
            <TurnCell key={turn.turn} turn={turn} borderColor={conditionColor} />
          ))}
        </ol>
        <p className="sf-hint">Scroll, drag, or use ← → to move along the turns.</p>
      </div>
    </div>
  )
}
