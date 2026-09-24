import { useState, useRef, useEffect, useCallback } from 'react'
import { Ban, Check, Clock, Crosshair, Eye, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { loadStudy, buildTrials, toJudgment, loadPracticePair } from '../study/studyData'
import ConsentScreen from './ConsentScreen'
import StimulusPanel from './StimulusPanel'
import TutorialTrial from './TutorialTrial'
import { redirectToProlific, getProlificCode } from '../study/prolificRedirect'
import './Annotation.css'

// Persisted rater session — a page refresh CONTINUES the same session instead of
// starting a new pass, so a refresh + re-judge is one (dedup-able) session rather
// than two anonymous ones. Keyed per rater so a different person on the same
// browser starts fresh; cleared on completion.
const SESSION_KEY = 'bp_study_session'
const readSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
}
const writeSession = (s) => {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}
const clearSession = () => {
  try { localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}

// The phase to resume into on mount. SESSION_KEY is one global localStorage
// slot, not namespaced per participant — so a stored session must only be
// trusted if it actually belongs to THIS page load's participant. Without
// this check, a stale session left behind by a different prolific_pid (a
// second test run in the same browser, a shared device, a participant who
// gets issued a fresh link after an earlier attempt broke) could let someone
// skip straight past consent/instructions/tutorial into 'study' — the exact
// kind of silent, unwarned state-skip this whole audit is trying to rule out.
function resumablePhase() {
  const stored = readSession()
  if (!stored) return 'consent'
  const urlPid = new URLSearchParams(window.location.search).get('PROLIFIC_PID')
  if (urlPid && stored.prolificPid && stored.prolificPid !== urlPid) return 'consent'
  return stored.phase || 'consent'
}

// Every stage gets a client-side timeout — no backend token system, unlike
// h2a, since nothing server-side needs to enforce or even know about this.
// The 40-trial phase's 5 minutes (+1 one-time 3-minute extension) is the
// firm, visible requirement; consent/instructions get the same 1-minute
// extend-or-end modal treatment (mirrors h2a's ConsentTimeoutModal/
// StageTimeoutModal, minus the server-side clock-skew correction — nothing
// server-side needs to know about these timers). Tutorial is the one
// exception: it has no extension at all — its modal is purely informational
// and always resolves by moving on to the real study, never by ending it.
const STAGE_SECONDS = { consent: 5 * 60, instructions: 5 * 60, tutorial: 3 * 60, study: 5 * 60 }
const EXTEND_SECONDS = { consent: 2 * 60, instructions: 2 * 60, study: 3 * 60 } // tutorial: no entry, no extension offered
const MODAL_GRACE_SECONDS = 60

// Confirmation step after the last trial — unlike the stage timeouts above,
// both paths (clicking Yes and letting the minute run out) lead to the exact
// same completion action. It's a deliberate pause before the redirect fires,
// not a way to end the study differently.
const CONFIRM_SECONDS = 60

// Every elapsed-time calculation below uses performance.now(), not Date.now().
// h2a hit a real incident where participants were instantly kicked because
// their absolute wall-clock time (skewed relative to the server) was compared
// against a server-issued timestamp. This app never compares against a
// server timestamp at all — every timer here is purely local (start, then
// diff against the same clock) — so that specific failure can't happen here.
// performance.now() is used anyway, as a second, independent safeguard: it's
// monotonic, so it can't jump even if the device's own OS clock changes
// mid-session (NTP sync, DST, manual adjustment, sleep/resume) the way
// Date.now() can.

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// ── Stage timeout modal — shared shape across consent/instructions/tutorial/
// study. `extendLabel`/`onExtend` are omitted for tutorial, which offers no
// extension: its single button is the same "move on" action that also fires
// automatically if the 1-minute grace period elapses unanswered.
function TimeoutModal({ message, remaining, extendLabel, onExtend, secondaryLabel, onSecondary }) {
  return (
    <div className="bp-modal-overlay">
      <div className="bp-modal">
        <h3>Time&apos;s up</h3>
        <p>{message}</p>
        <p className="bp-modal-note">
          Please answer within {fmt(remaining)} — if you don&apos;t, this happens automatically.
        </p>
        <div className="bp-modal-actions">
          <button className="bp-ghost-btn" onClick={onSecondary}>{secondaryLabel}</button>
          {extendLabel && (
            <button className="bp-primary-btn" onClick={onExtend}>{extendLabel}</button>
          )}
        </div>
      </div>
    </div>
  )
}

const MODAL_COPY = {
  consent: {
    message: "Your 5 minutes to review and decide are up. Take 2 more minutes to finish reading and decide, or let us know you don't wish to participate. This is the only extension available on this page.",
    extendLabel: '+2 minutes',
    secondaryLabel: 'I do not consent',
  },
  instructions: {
    message: 'Your 5 minutes on instructions are up. Take 2 more minutes to finish up, or end the study now. This is the only extension available on this page.',
    extendLabel: '+2 minutes',
    secondaryLabel: 'End the study',
  },
  tutorial: {
    message: "Your 3 minutes for the practice round are up. You'll move on to the real study now.",
    extendLabel: null,
    secondaryLabel: 'Continue to the real study →',
  },
  study: {
    message: 'Your 5 minutes for the real study are up. Take 3 more minutes to finish, or end the study now. This is the only extension available.',
    extendLabel: '+3 minutes',
    secondaryLabel: 'End the study',
  },
}

// A tiny wireframe mockup — abstract, unlabeled blocks standing in for a real
// layout — shown instead of described. 'target'/'close' share the same block
// arrangement (same shapes, same rough positions) so the visual similarity
// itself demonstrates "closer match"; 'far' uses a visibly different
// arrangement. Greyscale by default, matching the real target panel's own
// greyscale treatment (see .bp-panel--target .bp-iframe).
function MiniLayout({ variant }) {
  const BOX_SETS = {
    target: [[6, 6, 38, 14], [48, 6, 46, 14], [6, 24, 88, 10], [6, 38, 88, 26]],
    close: [[6, 6, 38, 14], [48, 6, 46, 14], [6, 24, 88, 10], [6, 38, 88, 26]],
    far: [[6, 6, 60, 14], [6, 24, 50, 10], [6, 38, 32, 26]],
  }
  const boxes = BOX_SETS[variant] || BOX_SETS.target
  return (
    <svg viewBox="0 0 100 68" width="100%" height="100%">
      <rect x="1" y="1" width="98" height="66" rx="4" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      {boxes.map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="2" fill="currentColor" fillOpacity={0.16 + i * 0.06} />
      ))}
    </svg>
  )
}

const INSTR_FACTS = [
  { icon: Eye, title: 'Structure, not style', body: 'Ignore colour, fonts, and placeholder text — only layout matters.' },
  { icon: Check, title: 'Pick one, or tie', body: 'Choose the closer candidate, or "No clear preference" if they\'re level.' },
  { icon: Ban, title: 'No going back', body: 'Each choice is final and moves you straight to the next comparison.' },
]

// ── Instructions (first screen, full-page — not a modal) ──────────────────────
// Deliberately visual over verbal: a worked mini-example (which candidate is
// closer, and why) does the explaining that paragraphs of prose used to,
// mirroring h2a's own Prolific instructions page.
function Instructions({ raterName, onRaterNameChange, trialCount, onBegin, isProlific, remaining }) {
  return (
    <div className="bp-instructions bp-animate">
      <div className="bp-instr-card">
        <div className="bp-instr-head">
          <div className="bp-instr-head-row">
            <span className="bp-kicker">Binary Preference Study</span>
            {typeof remaining === 'number' && (
              <span className={`bp-timer ${remaining < 60 ? 'bp-timer--warn' : ''}`}>
                <Clock size={14} /> {fmt(remaining)}
              </span>
            )}
          </div>
          <h1>Which one matches the target?</h1>
          <p className="bp-lede">Pick the candidate whose layout looks more like the target — like this:</p>
        </div>

        <div className="bp-instr-compare">
          <div className="bp-instr-compare-item bp-instr-compare-item--match">
            <div className="bp-instr-compare-visual">
              <MiniLayout variant="close" />
              <span className="bp-instr-check"><Check size={13} /></span>
            </div>
            <span className="bp-instr-compare-label">Candidate A</span>
          </div>
          <div className="bp-instr-compare-item bp-instr-compare-item--target">
            <div className="bp-instr-compare-visual bp-instr-compare-visual--target">
              <MiniLayout variant="target" />
            </div>
            <span className="bp-instr-compare-label"><Crosshair size={11} /> Target</span>
          </div>
          <div className="bp-instr-compare-item">
            <div className="bp-instr-compare-visual">
              <MiniLayout variant="far" />
            </div>
            <span className="bp-instr-compare-label">Candidate B</span>
          </div>
        </div>
        <p className="bp-instr-compare-caption">
          Here, <strong>A</strong> matches — same blocks, same rough positions. B doesn&apos;t.
        </p>

        <div className="bp-instr-facts">
          {INSTR_FACTS.map((f) => (
            <div className="bp-instr-fact" key={f.title}>
              <f.icon size={16} className="bp-instr-fact-icon" />
              <div>
                <h4>{f.title}</h4>
                <p>{f.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bp-keys">
          <span className="bp-keys-label">Shortcuts</span>
          <kbd className="bp-kbd">←</kbd><span>Left is closer</span>
          <kbd className="bp-kbd">Space</kbd><span>Tie</span>
          <kbd className="bp-kbd">→</kbd><span>Right is closer</span>
        </div>

        {!isProlific && (
          <div className="bp-rater">
            <label htmlFor="bp-rater-name">Your name or a short ID</label>
            <input
              id="bp-rater-name"
              className="bp-rater-input"
              type="text"
              placeholder="e.g. Alex or Rater_3"
              value={raterName}
              onChange={(e) => onRaterNameChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && raterName.trim()) onBegin() }}
              autoFocus
            />
          </div>
        )}

        <div className="bp-instr-foot">
          <span className="bp-trial-note">{trialCount} comparisons</span>
          <button
            className="bp-primary-btn"
            onClick={onBegin}
            disabled={!isProlific && !raterName.trim()}
          >
            Start study →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Completion screen ─────────────────────────────────────────────────────────
// Reached in three cases: (1) a real Prolific session where no VITE_PROLIFIC_CODE_*
// var is configured (redirectToProlific returned false — local dev/testing), (2)
// an internal/non-Prolific rater finishing normally, (3) any session that
// declined consent with no PROLIFIC_CODE_DECLINED configured. A genuine Prolific
// session WITH a code configured never reaches this screen at all — it's
// redirected away before phase ever becomes 'done'. isTest is the fourth case:
// a real code IS configured, but the tester's own session should never actually
// leave the app — see the test_code handling in sessionRef.current below.
const DONE_MESSAGES = {
  completed: (count) => `All ${count} comparisons are recorded. You can close this tab.`,
  partial: () => 'Your session ended early, but everything you completed is already saved.',
  declined: () => 'Thanks for considering the study.',
}

function DoneScreen({ outcome, count, isTest, redirectCode, onReset }) {
  if (isTest) {
    return (
      <div className="bp-done bp-animate">
        <div className="bp-done-mark"><Sparkles size={30} /></div>
        <h2>Test run complete</h2>
        <p>
          A real participant would be redirected now with code:{' '}
          <strong>{redirectCode || outcome?.toUpperCase()}</strong>
        </p>
        <button className="bp-primary-btn" onClick={onReset} style={{ marginTop: 16 }}>
          Reset and start over
        </button>
      </div>
    )
  }
  const message = (DONE_MESSAGES[outcome] || DONE_MESSAGES.completed)(count)
  return (
    <div className="bp-done bp-animate">
      <div className="bp-done-mark"><Sparkles size={30} /></div>
      <h2>{outcome === 'declined' ? 'Thank you.' : "That's everything — thank you."}</h2>
      <p>{message}</p>
    </div>
  )
}

// ── Post-study confirmation — a deliberate pause between the last trial and
// the actual completion action, so a rater sees a clear "you're done" moment
// instead of silently redirecting away mid-thought. Single button by design:
// there's nothing to decide here (unlike the stage TimeoutModal's extend/end
// choice) — Yes and the 1-minute timeout both do the same thing.
function ConfirmCompleteModal({ remaining, onConfirm }) {
  return (
    <div className="bp-modal-overlay">
      <div className="bp-modal">
        <h3>Complete study?</h3>
        <p>You&apos;ve finished all comparisons. Confirm to submit and get your completion code.</p>
        <p className="bp-modal-note">
          This happens automatically in {fmt(remaining)} if you don&apos;t respond.
        </p>
        <div className="bp-modal-actions">
          <button className="bp-primary-btn" onClick={onConfirm}>Yes</button>
        </div>
      </div>
    </div>
  )
}

// ── Main study component ──────────────────────────────────────────────────────
export default function Annotation() {
  // Restored from storage on mount, not hardcoded to 'consent' — a plain
  // browser refresh (or crash/sleep-wake hiccup) mid-study must resume where
  // the participant left off, not silently bounce them back to square one
  // with no warning. Persisted on every change by the effect below.
  const [phase, setPhase] = useState(resumablePhase) // 'consent' | 'instructions' | 'tutorial' | 'study' | 'confirm' | 'done'
  const [outcome, setOutcome] = useState(null)  // null | 'completed' | 'partial' | 'declined'
  const [status, setStatus] = useState('loading')     // 'loading' | 'ready' | 'empty'
  const [trials, setTrials] = useState([])
  const [trialIdx, setTrialIdx] = useState(0)
  const [confirmRemaining, setConfirmRemaining] = useState(CONFIRM_SECONDS)

  const [raterName, setRaterName] = useState(() => readSession()?.raterId || '')
  const [practicePair, setPracticePair] = useState(null)
  const [stageRemaining, setStageRemaining] = useState(null)
  const [showTimeoutModal, setShowTimeoutModal] = useState(false)
  const [modalRemaining, setModalRemaining] = useState(MODAL_GRACE_SECONDS)
  const [extendUsed, setExtendUsed] = useState(false)
  const stageStartedAtRef = useRef(null)
  const stageLimitRef = useRef(null) // current effective limit for the active phase — grows by EXTEND_SECONDS[phase] on extend

  useEffect(() => {
    let cancelled = false
    loadPracticePair().then((p) => { if (!cancelled) setPracticePair(p) })
    return () => { cancelled = true }
  }, [])

  // One session per rater pass, persisted across refresh (see SESSION_KEY notes).
  // Same guard as resumablePhase() above: a stored session is only reused —
  // sessionId included — if it belongs to the SAME prolific_pid this page
  // load is for. sessionId specifically matters beyond just identity: the
  // trial-resume filter below queries judgments by sessionId, so inheriting
  // a stale one from a different participant could wrongly mark real,
  // unanswered trials as already-judged for someone who never touched them.
  const sessionRef = useRef(null)
  if (!sessionRef.current) {
    const params = new URLSearchParams(window.location.search)
    const urlPid = params.get('PROLIFIC_PID')
    const stored = readSession()
    const trusted = stored && (!urlPid || !stored.prolificPid || stored.prolificPid === urlPid) ? stored : null
    // Test mode: no backend round-trip (unlike h2a's PROLIFIC_TEST_CODE, which
    // is checked server-side) — nothing server-side needs to know about this
    // for prefelic, so it's a plain client-side comparison against the
    // VITE_PROLIFIC_TEST_CODE env var. A wrong or missing ?test_code= is
    // simply not test mode; it never blocks a real participant either way.
    const testCode = params.get('test_code')
    const isTest = !!(testCode && import.meta.env.VITE_PROLIFIC_TEST_CODE && testCode === import.meta.env.VITE_PROLIFIC_TEST_CODE)
    sessionRef.current = {
      sessionId: trusted?.sessionId || crypto.randomUUID(),
      prolificPid: urlPid || trusted?.prolificPid || null,
      prolificStudyId: params.get('STUDY_ID') || trusted?.prolificStudyId || null,
      prolificSessionId: params.get('SESSION_ID') || trusted?.prolificSessionId || null,
      raterId: trusted?.raterId || null,
      referenceId: null,
      isTest: isTest || trusted?.isTest || false,
    }
  }
  const shownAtRef = useRef(0)
  // Guards recordChoice against re-entrant calls for the SAME trial — a held
  // arrow key fires the browser's native key-repeat keydown events (no debounce
  // on the listener below), and since recordChoice is async, a second repeat
  // event can fire before the first insert's setTrialIdx has committed, so both
  // still see the same stale `trial`. Without this lock that inserts a
  // duplicate judgment for the trial just answered AND advances trialIdx an
  // extra time — silently skipping whatever trial would have been shown next.
  // Confirmed in production data: a participant holding a key produced 2-3
  // near-identical judgments (milliseconds apart, same choice) for one pair
  // while a couple of that reference's other pairs were never shown at all.
  const submittingRef = useRef(false)

  // Persist phase on every change (merged with whatever's already stored, so
  // this never clobbers raterId etc. set elsewhere) — this is what makes the
  // phase-restore above actually durable across a refresh.
  useEffect(() => {
    writeSession({ ...readSession(), sessionId: sessionRef.current.sessionId, prolificPid: sessionRef.current.prolificPid, prolificStudyId: sessionRef.current.prolificStudyId, prolificSessionId: sessionRef.current.prolificSessionId, isTest: sessionRef.current.isTest, phase })
  }, [phase])

  // Load the corpus + build this rater's randomized trial list once. Trial
  // order is freshly reshuffled on every load (see buildTrials), so a
  // refresh mid-study can't resume at "trial N" of the old order — instead,
  // if we're resuming directly into 'study' (phase was restored from
  // storage, not freshly entered), drop whichever pairs THIS session already
  // judged from the list, so nothing gets shown twice and nothing gets
  // silently skipped. Answered-pair ids come from localStorage, not a DB
  // read — `judgments` deliberately has no SELECT policy for the anon role
  // (write-only, for participant privacy), so the browser can't query its
  // own past judgments back even for this. If every pair turns out already
  // answered (e.g. refreshed right as the completion redirect was firing),
  // treat it as completed rather than showing a confusing empty screen.
  useEffect(() => {
    let cancelled = false
    loadStudy()
      .then((study) => {
        if (cancelled) return
        let built = buildTrials(study)
        if (phase === 'study') {
          const answeredIds = new Set(readSession()?.answeredPairIds || [])
          if (answeredIds.size > 0) {
            const remaining = built.filter((t) => !answeredIds.has(t.pairId))
            if (remaining.length === 0) {
              // Refreshed right as the last trial's completion was landing —
              // route through the same confirm step as the normal path below,
              // rather than re-deriving the completion action here too.
              setPhase('confirm')
              return
            }
            built = remaining
          }
        }
        setTrials(built)
        setStatus(built.length ? 'ready' : 'empty')
      })
      .catch((e) => {
        if (cancelled) return
        console.warn('[study] failed to load corpus:', e.message)
        setStatus('empty')
      })
    return () => { cancelled = true }
    // `phase` is intentionally read only for its value at mount time (was
    // this session resuming into 'study'?), not to be re-triggered on every
    // later phase change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const trial = trials[trialIdx]
  const total = trials.length
  const progress = total ? (trialIdx / total) * 100 : 0

  // Reset the response timer and the recordChoice re-entrancy guard each time
  // a new trial is shown.
  useEffect(() => {
    if (phase === 'study' && trial) { shownAtRef.current = performance.now(); submittingRef.current = false }
  }, [phase, trialIdx, trial])

  // Reset the stage clock whenever phase changes to a timed one. Does NOT
  // reset when trialIdx changes within 'study' — the clock runs continuously
  // across all 40 trials, not per-trial. Also clears any leftover modal state
  // from the previous stage.
  useEffect(() => {
    setShowTimeoutModal(false)
    setExtendUsed(false)
    if (!(phase in STAGE_SECONDS)) { stageStartedAtRef.current = null; stageLimitRef.current = null; return }
    stageStartedAtRef.current = performance.now()
    stageLimitRef.current = STAGE_SECONDS[phase]
  }, [phase])

  // What happens when a stage's time (including any extension) is fully
  // exhausted — either because the participant chose it explicitly (the
  // modal's non-extend button) or the modal's own 1-minute grace elapsed
  // unanswered. Tutorial is the only stage this doesn't end the study for:
  // it always just moves on to 'study'.
  const stageTimeoutDefault = (p) => {
    if (p === 'consent') {
      setOutcome('declined')
      if (sessionRef.current.isTest || !redirectToProlific('declined')) setPhase('done')
    } else if (p === 'tutorial') {
      setPhase('study')
    } else {
      clearSession()
      setOutcome('partial')
      if (sessionRef.current.isTest || !redirectToProlific('partial')) setPhase('done')
    }
  }

  // Main stage countdown — frozen while the timeout modal is up (the modal
  // runs its own independent 1-minute grace timer below).
  useEffect(() => {
    if (!(phase in STAGE_SECONDS) || stageStartedAtRef.current == null || showTimeoutModal) return
    const tick = () => {
      const rem = Math.max(0, stageLimitRef.current - (performance.now() - stageStartedAtRef.current) / 1000)
      setStageRemaining(rem)
      if (rem <= 0) {
        const canExtend = EXTEND_SECONDS[phase] && !extendUsed
        if (canExtend || phase === 'tutorial') {
          setShowTimeoutModal(true)
        } else {
          stageTimeoutDefault(phase)
        }
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [phase, showTimeoutModal, extendUsed])

  // The timeout modal's own 1-minute grace period. If it elapses unanswered,
  // the same default action fires as if the participant had picked the
  // modal's non-extend button.
  useEffect(() => {
    if (!showTimeoutModal) return
    setModalRemaining(MODAL_GRACE_SECONDS)
    const startedAt = performance.now()
    const tick = () => {
      const rem = Math.max(0, MODAL_GRACE_SECONDS - (performance.now() - startedAt) / 1000)
      setModalRemaining(rem)
      if (rem <= 0) {
        setShowTimeoutModal(false)
        stageTimeoutDefault(phase)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [showTimeoutModal, phase])

  const handleModalExtend = () => {
    const bonus = EXTEND_SECONDS[phase]
    // Reset the clock's zero-point to now, not just add the bonus onto the
    // existing budget — stageStartedAtRef never pauses while the modal is up,
    // so an additive bonus would be measured from the ORIGINAL stage start,
    // silently eating into the promised "+N minutes" by however long the
    // stage had already overrun plus however long the modal was open before
    // this click. "+3 minutes" means 3 more minutes starting now.
    if (bonus) {
      stageStartedAtRef.current = performance.now()
      stageLimitRef.current = bonus
    }
    setExtendUsed(true)
    setShowTimeoutModal(false)
  }

  const handleModalSecondary = () => {
    setShowTimeoutModal(false)
    stageTimeoutDefault(phase)
  }

  const recordChoice = useCallback(
    async (side) => {
      if (!trial || submittingRef.current) return
      submittingRef.current = true
      // response_ms is an integer column — performance.now() carries
      // sub-millisecond precision (unlike Date.now()), so it must be rounded
      // before insert or the write fails outright.
      const responseMs = Math.round(performance.now() - shownAtRef.current)

      // Build the research record and append-only insert it immediately, so a
      // rater who quits mid-session still leaves every prior choice behind.
      // toJudgment owns the screen-side → identity mapping. Failures (e.g. the
      // judgments table not migrated yet) are logged for the researcher, never
      // surfaced to the rater — there is nothing they could do about it.
      try {
        const record = toJudgment(trial, side, responseMs, {
          raterId: raterName,
          sessionId: sessionRef.current.sessionId,
          prolificPid: sessionRef.current.prolificPid,
          prolificStudyId: sessionRef.current.prolificStudyId,
          prolificSessionId: sessionRef.current.prolificSessionId,
        })
        const { error } = await supabase.from('judgments').insert(record)
        if (error) console.warn('[study] judgment insert failed:', error.message)
      } catch (e) {
        console.warn('[study] judgment not recorded:', e.message)
      }

      // Tracked regardless of insert success/failure above — this is about
      // never re-showing the SAME trial to the SAME person after a refresh,
      // not about data-write confirmation. See the resume-filter note on the
      // loadStudy effect for why this lives in localStorage, not a DB read.
      const stored = readSession() || {}
      const answeredPairIds = [...new Set([...(stored.answeredPairIds || []), trial.pairId])]
      writeSession({ ...stored, answeredPairIds })

      if (trialIdx + 1 >= total) {
        // Last trial answered — pause on the confirm step (see ConfirmCompleteModal)
        // instead of completing immediately; completeStudy() below fires the
        // actual clearSession/outcome/redirect once the rater confirms or the
        // confirm step's own minute runs out.
        setPhase('confirm')
      } else {
        setTrialIdx((i) => i + 1)
      }
    },
    [trial, trialIdx, total, raterName]
  )

  // The confirm step's completion action — same function whether the rater
  // clicks Yes or the 1-minute grace period elapses unanswered (see the
  // 'confirm' phase effect below).
  const completeStudy = useCallback(() => {
    clearSession() // completed — free the slot for the next rater on this browser
    setOutcome('completed')
    if (sessionRef.current.isTest || !redirectToProlific('completed')) setPhase('done')
  }, [])

  // Test-mode-only reset — unlike h2a's handleTestReset, there's no server-side
  // participant row to reset (prefelic has no backend token system at all), so
  // clearing the local session and reloading is the whole story: a fresh mount
  // re-derives phase='consent' and a new sessionId, while the URL's
  // PROLIFIC_PID/test_code carry over unchanged for the next test pass.
  const handleTestReset = useCallback(() => {
    clearSession()
    window.location.reload()
  }, [])

  // 'confirm' phase countdown — independent of the stage-timeout machinery
  // above (STAGE_SECONDS/showTimeoutModal), since this isn't a stage with an
  // extend option; it's a single fixed grace period before completeStudy()
  // fires either way.
  useEffect(() => {
    if (phase !== 'confirm') return
    setConfirmRemaining(CONFIRM_SECONDS)
    const startedAt = performance.now()
    const tick = () => {
      const rem = Math.max(0, CONFIRM_SECONDS - (performance.now() - startedAt) / 1000)
      setConfirmRemaining(rem)
      if (rem <= 0) completeStudy()
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [phase, completeStudy])

  // Keyboard: ←/→ pick a side, Space/↓ ties. Active only during the study.
  // The study is forward-only — once a choice commits there is no going back.
  useEffect(() => {
    if (phase !== 'study') return
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); recordChoice('left') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); recordChoice('right') }
      else if (e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); recordChoice('tie') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, recordChoice])

  const handleConsentDecision = (agreed) => {
    if (!agreed) {
      setOutcome('declined')
      if (sessionRef.current.isTest || !redirectToProlific('declined')) setPhase('done')
      return
    }
    setPhase('instructions')
  }

  // Resolve the session when the rater starts: same name as the stored session →
  // resume it; a new/different rater → fresh session. Persist either way.
  const handleBegin = () => {
    const isProlific = !!sessionRef.current.prolificPid
    const name = isProlific ? null : raterName.trim()
    if (sessionRef.current.raterId && sessionRef.current.raterId !== name) {
      sessionRef.current.sessionId = crypto.randomUUID()
    }
    sessionRef.current.raterId = name
    writeSession({
      sessionId: sessionRef.current.sessionId,
      prolificPid: sessionRef.current.prolificPid,
      prolificStudyId: sessionRef.current.prolificStudyId,
      prolificSessionId: sessionRef.current.prolificSessionId,
      raterId: name,
    })
    setPhase('tutorial')
  }

  if (status === 'loading') {
    return (
      <div className="annotation bp-center">
        <div className="bp-spinner" />
      </div>
    )
  }

  if (status === 'empty') {
    return (
      <div className="annotation bp-center" style={{ gap: 14 }}>
        <p className="bp-empty-text">
          No study data loaded. Check the <code>study_references</code> /{' '}
          <code>study_pairs</code> tables in Supabase.
        </p>
      </div>
    )
  }

  if (phase === 'consent') {
    return (
      <div className="annotation">
        <ConsentScreen onDecide={handleConsentDecision} remaining={stageRemaining} />
        {showTimeoutModal && (
          <TimeoutModal
            remaining={modalRemaining}
            onExtend={handleModalExtend}
            onSecondary={handleModalSecondary}
            {...MODAL_COPY.consent}
          />
        )}
      </div>
    )
  }

  if (phase === 'tutorial') {
    return (
      <>
        <TutorialTrial
          practicePair={practicePair}
          onNext={() => setPhase('study')}
          remaining={stageRemaining}
        />
        {showTimeoutModal && (
          <TimeoutModal
            remaining={modalRemaining}
            onExtend={handleModalExtend}
            onSecondary={handleModalSecondary}
            {...MODAL_COPY.tutorial}
          />
        )}
      </>
    )
  }

  if (phase === 'instructions') {
    return (
      <div className="annotation">
        <Instructions
          raterName={raterName}
          onRaterNameChange={setRaterName}
          trialCount={total}
          onBegin={handleBegin}
          isProlific={!!sessionRef.current.prolificPid}
          remaining={stageRemaining}
        />
        {showTimeoutModal && (
          <TimeoutModal
            remaining={modalRemaining}
            onExtend={handleModalExtend}
            onSecondary={handleModalSecondary}
            {...MODAL_COPY.instructions}
          />
        )}
      </div>
    )
  }

  if (phase === 'confirm') {
    return (
      <div className="annotation">
        <ConfirmCompleteModal remaining={confirmRemaining} onConfirm={completeStudy} />
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="annotation">
        <DoneScreen
          outcome={outcome}
          count={total}
          isTest={sessionRef.current.isTest}
          redirectCode={getProlificCode(outcome)}
          onReset={handleTestReset}
        />
      </div>
    )
  }

  // ── Study phase ──
  return (
    <div className="annotation">
      <header className="bp-header">
        <div className="bp-header-left">
          <span className="bp-header-title">Binary Preference Study</span>
        </div>
        <div className="bp-header-right">
          <span className={`bp-timer ${stageRemaining != null && stageRemaining < 60 ? 'bp-timer--warn' : ''}`}>
            <Clock size={14} /> {fmt(stageRemaining ?? stageLimitRef.current ?? STAGE_SECONDS.study)}
          </span>
          <span className="bp-count">{trialIdx + 1} <span>/ {total}</span></span>
          <div className="bp-progress">
            <div className="bp-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </header>

      {/* Three identically-sized panels so every page reflows at the same width.
          Target sits in the centre — equal eye-distance to A and B neutralises
          proximity bias; A/B still align with the buttons below (A-left, B-right). */}
      <main className="bp-stage">
        <StimulusPanel html={trial.left.html} tone="candidate" eyebrow="A" title="Candidate A" />
        <StimulusPanel
          html={trial.refHtml}
          tone="target"
          eyebrow={<><Crosshair size={12} /> Target</>}
          title="Reference"
          hint="match against this"
        />
        <StimulusPanel html={trial.right.html} tone="candidate" eyebrow="B" title="Candidate B" />
      </main>

      <footer className="bp-choices">
        <button className="bp-choice bp-choice--side" onClick={() => recordChoice('left')}>
          <kbd className="bp-kbd">←</kbd>
          <span className="bp-choice-main">A is closer</span>
        </button>
        <button className="bp-choice bp-choice--tie" onClick={() => recordChoice('tie')}>
          <kbd className="bp-kbd">Space</kbd>
          <span className="bp-choice-main">No clear preference</span>
        </button>
        <button className="bp-choice bp-choice--side" onClick={() => recordChoice('right')}>
          <kbd className="bp-kbd">→</kbd>
          <span className="bp-choice-main">B is closer</span>
        </button>
      </footer>

      {showTimeoutModal && (
        <TimeoutModal
          remaining={modalRemaining}
          onExtend={handleModalExtend}
          onSecondary={handleModalSecondary}
          {...MODAL_COPY.study}
        />
      )}
    </div>
  )
}
