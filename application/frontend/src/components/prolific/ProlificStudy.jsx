// application/frontend/src/components/prolific/ProlificStudy.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import ChatInterface from '../ChatInterface'
import ConsentScreen from './ConsentScreen'
import Instructions from './Instructions'
import TutorialPractice from './TutorialPractice'
import Survey from './Survey'
import OutcomeScreen from './OutcomeScreen'
import ReferencePanel from './ReferencePanel'
// Single source of truth for the study's shape across JS-land — the same module
// the API side uses, so the "2 sessions" figure cannot drift between files.
import { TOTAL_SESSIONS } from '../../../../api/_lib/prolificAssignment.js'
import './ProlificStudy.css'

const STAGE_SECONDS = { consent: 5 * 60, instructions: 5 * 60, tutorial: 5 * 60, session: 15 * 60, survey: 5 * 60 }
// The extend grant resets current_session_started_at to now() server-side and
// flips extend_used, so an extended session's clock is "5 minutes from that
// timestamp" — not another full 15, which is what the UI copy promises.
const EXTEND_SECONDS = 5 * 60
// Grace period on the "time's up" offer. Without it an unanswered modal is a
// soft dead end: the countdown has already fired, both buttons wait on a click,
// and a participant who walks away is never recorded as anything. After this
// long with no answer the study is closed out as a partial.
const EXTEND_PROMPT_GRACE_SECONDS = 2 * 60
// Same idea, shorter fuse, for the short "reading" stages (consent,
// instructions, tutorial) — none of these have a real task in progress the
// way a session does, so a shorter answer window before falling back to the
// same automatic ending is appropriate.
const SHORT_STAGE_PROMPT_GRACE_SECONDS = 60
const TOKEN_KEY = 'prolific_participant_token'

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

async function api(path, token, body) {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request to ${path} failed`)
  return data
}

function ConfirmModal({ isLast, onCancel, onConfirm }) {
  return (
    <div className="ps-modal-overlay" onClick={onCancel}>
      <div className="ps-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{isLast ? 'Finish the study?' : 'Move to the next reference?'}</h3>
        <p>
          This is <strong>irreversible</strong>. Your current page is saved exactly as
          it is now, and you {isLast ? 'will end the study' : 'cannot come back to this reference'}.
        </p>
        <div className="ps-modal-actions">
          <button className="ps-btn-ghost" onClick={onCancel}>Stay</button>
          <button className="ps-btn-danger" onClick={onConfirm}>{isLast ? 'Finish' : 'Move on'}</button>
        </div>
      </div>
    </div>
  )
}

function TimeoutModal({ isLast, onExtend, onMoveOn }) {
  return (
    <div className="ps-modal-overlay">
      <div className="ps-modal">
        <h3>Time&apos;s up</h3>
        <p>
          Your 15 minutes for this session are up. Take 5 more minutes to wrap up what
          you&apos;re working on, or move on now. This is the only extension available for this session.
        </p>
        <p className="ps-modal-note">
          Please answer within 2 minutes — if you don&apos;t, the study ends here and is
          submitted as partial.
        </p>
        <div className="ps-modal-actions">
          <button className="ps-btn-ghost" onClick={onMoveOn}>{isLast ? 'Finish' : 'Move on'}</button>
          <button className="ps-btn-danger" onClick={onExtend}><Clock size={15} /> +5 minutes</button>
        </div>
      </div>
    </div>
  )
}

// Consent's one-and-only timeout prompt — mirrors TimeoutModal's shape
// exactly, but "declining" here has no backend call to make (no assignment
// exists yet), so the two choices are just "give me a bit more time" and
// "I do not wish to participate" (same wording as ConsentScreen's own
// decline button, for consistency).
function ConsentTimeoutModal({ onContinue, onDecline }) {
  return (
    <div className="ps-modal-overlay">
      <div className="ps-modal">
        <h3>Time&apos;s up</h3>
        <p>
          Your 5 minutes to review and decide are up. Take 5 more minutes to finish
          reading and decide, or let us know you don&apos;t wish to participate. This is
          the only extension available on this page.
        </p>
        <p className="ps-modal-note">
          Please answer within 1 minute — if you don&apos;t, the study ends here as if
          you had chosen not to participate.
        </p>
        <div className="ps-modal-actions">
          <button className="ps-btn-ghost" onClick={onDecline}>I do not wish to participate</button>
          <button className="ps-btn-danger" onClick={onContinue}><Clock size={15} /> +5 minutes</button>
        </div>
      </div>
    </div>
  )
}

// Same treatment for 'instructions' and 'tutorial' — both used to hard-kick
// straight to a partial outcome at 5:00 with no warning at all (a real
// participant hit this on tutorial: force_outcome fired exactly 5:01 after
// entering, with no modal). One extension, same grace/fallback shape as
// every other stage's timeout prompt.
function StageTimeoutModal({ label, onExtend, onEnd }) {
  return (
    <div className="ps-modal-overlay">
      <div className="ps-modal">
        <h3>Time&apos;s up</h3>
        <p>
          Your 5 minutes on {label} are up. Take 5 more minutes to finish up, or end
          the study now. This is the only extension available on this page.
        </p>
        <p className="ps-modal-note">
          Please answer within 1 minute — if you don&apos;t, the study ends here and is
          submitted as partial.
        </p>
        <div className="ps-modal-actions">
          <button className="ps-btn-ghost" onClick={onEnd}>End the study</button>
          <button className="ps-btn-danger" onClick={onExtend}><Clock size={15} /> +5 minutes</button>
        </div>
      </div>
    </div>
  )
}

// Shown when the extra 5 minutes ALSO run out on a non-last session. There's
// no further extension to offer, so this is a straight choice between ending
// now and moving on to the next session, rather than an automatic partial.
function SessionTimeoutChoiceModal({ nextSession, onExit, onContinue }) {
  return (
    <div className="ps-modal-overlay">
      <div className="ps-modal">
        <h3>Timeout</h3>
        <p>
          Your extra 5 minutes are also up. You can end the study now, or move on to
          session {nextSession}.
        </p>
        <p className="ps-modal-note">
          Please answer within 2 minutes. If you don&apos;t, the study ends here and is
          submitted as partial.
        </p>
        <div className="ps-modal-actions">
          <button className="ps-btn-ghost" onClick={onExit}>Exit study</button>
          <button className="ps-btn-danger" onClick={onContinue}>Move to session {nextSession}</button>
        </div>
      </div>
    </div>
  )
}

export default function ProlificStudy() {
  // loading | consent | instructions | tutorial | session | outcome | error
  const [phase, setPhase] = useState('loading')
  const [error, setError] = useState('')
  const [token, setToken] = useState(null)
  const [isTest, setIsTest] = useState(false)
  const [currentSession, setCurrentSession] = useState(1)
  const [stageStartedAt, setStageStartedAt] = useState(null)
  const [currentSessionStartedAt, setCurrentSessionStartedAt] = useState(null)
  const [extendUsed, setExtendUsed] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [outcome, setOutcome] = useState(null)
  const [redirectCode, setRedirectCode] = useState(null)
  const [declineRedirectCode, setDeclineRedirectCode] = useState(null)
  const [refIds, setRefIds] = useState([])
  const [refs, setRefs] = useState({})
  const [practiceRef, setPracticeRef] = useState(null)
  const [practiceRefError, setPracticeRefError] = useState('')
  const [sessionRefsError, setSessionRefsError] = useState('')
  const [showExtendModal, setShowExtendModal] = useState(false)
  const [showFinishConfirm, setShowFinishConfirm] = useState(false)
  const [showSessionTimeoutChoice, setShowSessionTimeoutChoice] = useState(false)
  // Consent's own one-time extension. Purely client-side — like the rest of
  // the consent timer, there's no participant row yet to persist this on.
  const [consentExtendUsed, setConsentExtendUsed] = useState(false)
  const [showConsentTimeoutModal, setShowConsentTimeoutModal] = useState(false)
  // One-time extension for 'instructions'/'tutorial', reset on every phase
  // change below so tutorial gets its own fresh allowance after instructions
  // uses its one. No server column for this — same as consent's, these two
  // stages precede any real work the server needs to protect against replay.
  const [stageExtendUsed, setStageExtendUsed] = useState(false)
  const [showStageTimeoutModal, setShowStageTimeoutModal] = useState(false)
  const advancingRef = useRef(false)
  // Client-side fallback anchor per timed stage. The server timestamp is the
  // source of truth, but if it ever arrives null the countdown must still run —
  // a frozen timer is a dead end with no path to an outcome.
  const stageEnteredAtRef = useRef({})
  // Correction for the participant's own device clock being wrong relative to
  // the server: every API response carries server_time, and this is
  // (server's clock - this device's clock) at the moment of the most recent
  // response. Every timer computation below uses correctedNow() instead of a
  // raw Date.now() so a skewed local clock can't make a stage read as
  // already-expired the instant it's entered — a real participant hit
  // exactly this, force-ended 0.9s after entering 'instructions'.
  const clockOffsetRef = useRef(0)
  const correctedNow = () => Date.now() + clockOffsetRef.current
  const updateClockOffset = (serverTimeIso) => {
    if (!serverTimeIso) return
    clockOffsetRef.current = new Date(serverTimeIso).getTime() - Date.now()
  }

  const params = useRef(new URLSearchParams(window.location.search)).current
  const prolificPid = params.get('PROLIFIC_PID')
  const studyId = params.get('STUDY_ID')
  const sessionId = params.get('SESSION_ID')
  const testCode = params.get('test_code')

  // instructions -> tutorial is a real phase change with its own fresh
  // 5-minute budget, so its one-time extension allowance resets too.
  useEffect(() => {
    setStageExtendUsed(false)
    setShowStageTimeoutModal(false)
  }, [phase])

  const applyState = useCallback((data) => {
    setCurrentSession(data.current_session || 1)
    setStageStartedAt(data.stage_started_at ? new Date(data.stage_started_at).getTime() : null)
    setCurrentSessionStartedAt(data.current_session_started_at ? new Date(data.current_session_started_at).getTime() : null)
    setExtendUsed(!!data.extend_used)
    // All three modals are cleared on every state application: leaving one
    // mounted across a stage/session advance can fire its handler against the
    // NEW state (e.g. a wrongful mid-session-2 partial).
    setShowExtendModal(false)
    setShowFinishConfirm(false)
    setShowSessionTimeoutChoice(false)
    if (typeof data.is_test === 'boolean') setIsTest(data.is_test)
    if (Array.isArray(data.ref_ids)) setRefIds(data.ref_ids)
    if (data.outcome) {
      setOutcome(data.outcome)
      setRedirectCode(data.redirect_code || null)
      setPhase('outcome')
    } else if (data.stage === 'done') {
      // Belt and braces: 'done' has no renderer, so falling through to
      // setPhase('done') would leave the participant on a blank page. Any
      // 'done' without a recognised outcome is treated as a finished study —
      // OutcomeScreen's generic copy and missing-code fallback both apply.
      setOutcome('completed')
      setRedirectCode(data.redirect_code || null)
      setPhase('outcome')
    } else {
      setPhase(data.stage)
    }
  }, [])

  // Practice reference — a single global lookup, independent of claim state.
  // A swallowed failure here leaves TutorialPractice on a permanent spinner, so
  // both the query error and the empty-result case are surfaced to the UI.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error: qError } = await supabase
          .from('study_references')
          .select('id,name,html')
          .eq('is_practice', true)
          .limit(1)
          .maybeSingle()
        if (cancelled) return
        if (qError) {
          setPracticeRefError('The practice reference could not be loaded.')
          return
        }
        if (!data) {
          setPracticeRefError('No practice reference is available.')
          return
        }
        setPracticeRef(data)
        setPracticeRefError('')
      } catch {
        if (!cancelled) setPracticeRefError('The practice reference could not be loaded.')
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Real session references — fetched once refIds is known from claim/resume.
  // Same treatment: a silent failure here would hide the whole session view
  // (timer and extend modal included) behind a loading state forever.
  useEffect(() => {
    if (refIds.length === 0) return
    let cancelled = false
    ;(async () => {
      try {
        const { data, error: qError } = await supabase
          .from('study_references')
          .select('id,name,html')
          .in('id', refIds)
        if (cancelled) return
        if (qError || !Array.isArray(data)) {
          setSessionRefsError('The reference for this session could not be loaded.')
          return
        }
        const map = {}
        data.forEach((r) => { map[r.id] = r })
        setRefs(map)
        setSessionRefsError(
          refIds.some((id) => !map[id])
            ? 'The reference for this session could not be loaded.'
            : ''
        )
      } catch {
        if (!cancelled) setSessionRefsError('The reference for this session could not be loaded.')
      }
    })()
    return () => { cancelled = true }
  }, [refIds])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const stored = localStorage.getItem(TOKEN_KEY)
      if (stored) {
        try {
          const data = await api('prolific-state', stored)
          if (cancelled) return
          updateClockOffset(data.server_time)
          setToken(stored)
          applyState(data)
          return
        } catch {
          localStorage.removeItem(TOKEN_KEY)
        }
      }
      if (!prolificPid || !studyId || !sessionId) {
        if (!cancelled) { setError('Missing Prolific parameters.'); setPhase('error') }
        return
      }
      try {
        const data = await api('prolific-verify', null, {
          prolific_pid: prolificPid, study_id: studyId, session_id: sessionId, test_code: testCode,
        })
        if (cancelled) return
        updateClockOffset(data.server_time)
        // A prolific_pid already in study_participants from any earlier study
        // run here — no token was issued, no Prolific API call was made.
        // Handled identically to an explicit decline: straight to the
        // outcome screen, never through consent.
        if (data.already_participated) {
          setOutcome('declined')
          setRedirectCode(data.decline_redirect_code || null)
          setPhase('outcome')
          return
        }
        setToken(data.token)
        setIsTest(!!data.is_test)
        setDeclineRedirectCode(data.decline_redirect_code || null)
        setPhase('consent')
      } catch (e) {
        if (!cancelled) { setError(e.message); setPhase('error') }
      }
    })()
    return () => { cancelled = true }
  }, [applyState, prolificPid, studyId, sessionId, testCode])

  const handleConsent = async (agreed) => {
    if (!agreed) {
      setOutcome('declined')
      setRedirectCode(declineRedirectCode)
      setPhase('outcome')
      return
    }
    try {
      const data = await api('prolific-claim', token)
      updateClockOffset(data.server_time)
      localStorage.setItem(TOKEN_KEY, data.token)
      setToken(data.token)
      applyState(data.assignment)
    } catch (e) {
      setError(e.message)
      setPhase('error')
    }
  }

  // Test-mode only: wipes this pid's study_participants row (if any — a
  // 'declined' outcome never created one, since decline short-circuits before
  // prolific-claim) and re-runs prolific-verify with the same URL params to
  // land back on a fresh consent screen. Lets a tester walk the whole flow
  // repeatedly without hand-editing the database between runs.
  const handleTestReset = useCallback(async () => {
    try {
      if (outcome !== 'declined') {
        await api('prolific-test-reset', token)
      }
      localStorage.removeItem(TOKEN_KEY)
      stageEnteredAtRef.current = {}
      setCurrentSession(1)
      setStageStartedAt(null)
      setCurrentSessionStartedAt(null)
      setExtendUsed(false)
      setConsentExtendUsed(false)
      setShowConsentTimeoutModal(false)
      setStageExtendUsed(false)
      setShowStageTimeoutModal(false)
      setRemaining(0)
      setRefIds([])
      setRefs({})
      setSessionRefsError('')
      setOutcome(null)
      setRedirectCode(null)
      setPhase('loading')
      const data = await api('prolific-verify', null, {
        prolific_pid: prolificPid, study_id: studyId, session_id: sessionId, test_code: testCode,
      })
      updateClockOffset(data.server_time)
      setToken(data.token)
      setIsTest(!!data.is_test)
      setDeclineRedirectCode(data.decline_redirect_code || null)
      setPhase('consent')
    } catch (e) {
      setError(e.message)
      setPhase('error')
    }
  }, [outcome, token, prolificPid, studyId, sessionId, testCode])

  const advance = useCallback(async (opts = {}) => {
    if (advancingRef.current) return
    advancingRef.current = true
    try {
      const data = await api('prolific-advance-stage', token, opts)
      updateClockOffset(data.server_time)
      applyState(data)
    } catch (e) {
      setError(e.message)
      setPhase('error')
    } finally {
      advancingRef.current = false
    }
  }, [token, applyState])

  // Whether the real session view can actually render: its reference must have
  // loaded. Computed here (not inside the render branch) because the countdown
  // needs it — offering "+5 minutes" on an interface that never appeared is
  // meaningless, and the modal would render behind the loading state anyway.
  const currentRefId = phase === 'session' ? refIds[currentSession - 1] : null
  const currentRef = currentRefId ? refs[currentRefId] : null
  const sessionViewReady = phase === 'session' && !!currentRef

  // Per-stage countdown, derived from the SERVER-stored timestamp for that
  // stage — current_session_started_at for real sessions (so session 2 gets
  // its own clock, not session 1's leftover one), stage_started_at otherwise.
  useEffect(() => {
    if (!['consent', 'instructions', 'tutorial', 'session', 'survey'].includes(phase)) return
    const stageKey = phase === 'session' ? `session-${currentSession}` : phase
    if (!stageEnteredAtRef.current[stageKey]) {
      stageEnteredAtRef.current[stageKey] = correctedNow()
    }
    const serverStartedAt = phase === 'session' ? currentSessionStartedAt : stageStartedAt
    // Consent has no server-side stage record (it precedes prolific-claim), so
    // it always falls back to the client-side entry timestamp below. Same for
    // instructions/tutorial once their one-time extension is used: stageStartedAt
    // still holds the ORIGINAL server entry time (nothing server-side moves it
    // for these two stages the way extend:true does for sessions), so without
    // this the `??` below would keep preferring that stale value and "Continue"
    // would immediately re-expire on the next tick instead of granting time.
    const usesClientAnchor = phase === 'consent' || ((phase === 'instructions' || phase === 'tutorial') && stageExtendUsed)
    const activeStartedAt = usesClientAnchor ? stageEnteredAtRef.current[stageKey] : (serverStartedAt ?? stageEnteredAtRef.current[stageKey])
    const limit = phase === 'session' && extendUsed ? EXTEND_SECONDS
      : phase === 'consent' && consentExtendUsed ? EXTEND_SECONDS
      : (phase === 'instructions' || phase === 'tutorial') && stageExtendUsed ? EXTEND_SECONDS
      : STAGE_SECONDS[phase]
    const tick = () => {
      const rem = Math.max(0, limit - (correctedNow() - activeStartedAt) / 1000)
      setRemaining(rem)
      if (rem <= 0 && !advancingRef.current) {
        // Consent has no participant token to advance with — no assignment
        // has been claimed yet — so there's no backend call either way here.
        // First expiry offers one extension via the modal below; the SECOND
        // expiry (extension already used) declines outright, same shape as
        // the session stage's one-extension-then-no-more-modals pattern.
        if (phase === 'consent' && !consentExtendUsed) {
          setShowConsentTimeoutModal(true)
        } else if (phase === 'consent') {
          setOutcome('declined')
          setRedirectCode(declineRedirectCode)
          setPhase('outcome')
        // The extend offer is only meaningful when the participant actually had
        // a working session in front of them. If the interface never rendered
        // (reference still loading, or failed to load), the modal would be
        // hidden behind the loading state and nothing would ever end the study
        // — so record a partial outcome directly instead.
        } else if (phase === 'session' && !extendUsed && sessionViewReady) {
          setShowExtendModal(true)
        // The one extension has also run out. On the last session there's
        // nowhere left to move on TO, so advance() straight to completion —
        // its normal fallthrough already sets outcome='completed' once
        // current_session >= TOTAL_SESSIONS, same as a manual "Finish study"
        // click. Earlier sessions get a choice instead of an automatic
        // partial, since ending outright here would discard a real shot at
        // a second, real session.
        } else if (phase === 'session' && extendUsed && sessionViewReady) {
          if (currentSession >= TOTAL_SESSIONS) {
            advance()
          } else {
            setShowSessionTimeoutChoice(true)
          }
        // The survey is additive data collection, not a gate on completion —
        // timing out here calls plain advance() (same as a submit), which
        // resolves to outcome='completed', never 'partial'.
        } else if (phase === 'survey') {
          advance()
        // 'instructions'/'tutorial' first expiry: offer the same one-time
        // extension every other stage gets, instead of an immediate partial.
        } else if ((phase === 'instructions' || phase === 'tutorial') && !stageExtendUsed) {
          setShowStageTimeoutModal(true)
        } else {
          advance({ force_outcome: 'partial' })
        }
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [phase, currentSession, stageStartedAt, currentSessionStartedAt, extendUsed, consentExtendUsed, stageExtendUsed, sessionViewReady, advance, declineRedirectCode])

  // Grace period on the timeout offer. The countdown above has already fired by
  // the time this modal is up, so nothing else is left to end the study — both
  // of its buttons wait on a click. If neither is clicked within the grace
  // period the study is closed out as a partial, which is what the instructions
  // now promise. Both handlers call setShowExtendModal(false) BEFORE advancing,
  // so this effect's cleanup clears the pending timeout on either choice; and
  // advance() itself is guarded by advancingRef, so it cannot run twice.
  useEffect(() => {
    if (!showExtendModal) return
    const id = setTimeout(() => {
      setShowExtendModal(false)
      advance({ force_outcome: 'partial' })
    }, EXTEND_PROMPT_GRACE_SECONDS * 1000)
    return () => clearTimeout(id)
  }, [showExtendModal, advance])

  // Same safety net for consent's timeout prompt. Declines rather than
  // advances — there's no backend call to make, same as the immediate
  // timeout path this modal now sits in front of.
  useEffect(() => {
    if (!showConsentTimeoutModal) return
    const id = setTimeout(() => {
      setShowConsentTimeoutModal(false)
      setOutcome('declined')
      setRedirectCode(declineRedirectCode)
      setPhase('outcome')
    }, SHORT_STAGE_PROMPT_GRACE_SECONDS * 1000)
    return () => clearTimeout(id)
  }, [showConsentTimeoutModal, declineRedirectCode])

  // Same safety net for instructions/tutorial's timeout prompt. Unlike
  // consent, an assignment already exists by this point, so an unanswered
  // prompt ends the study the same way it always did before this modal
  // existed: a partial via the real advance() call.
  useEffect(() => {
    if (!showStageTimeoutModal) return
    const id = setTimeout(() => {
      setShowStageTimeoutModal(false)
      advance({ force_outcome: 'partial' })
    }, SHORT_STAGE_PROMPT_GRACE_SECONDS * 1000)
    return () => clearTimeout(id)
  }, [showStageTimeoutModal, advance])

  // Same grace-period safety net, for the choice modal shown once the
  // extension has also run out on a non-last session. Defaults to partial —
  // the same outcome that would have happened automatically before this
  // modal existed — rather than silently moving them on to a session they
  // never chose to start.
  useEffect(() => {
    if (!showSessionTimeoutChoice) return
    const id = setTimeout(() => {
      setShowSessionTimeoutChoice(false)
      advance({ force_outcome: 'partial' })
    }, EXTEND_PROMPT_GRACE_SECONDS * 1000)
    return () => clearTimeout(id)
  }, [showSessionTimeoutChoice, advance])

  if (phase === 'loading') {
    return <div className="ps-root ps-center"><div className="ps-spinner" /></div>
  }
  if (phase === 'error') {
    return (
      <div className="ps-root ps-center">
        <div>
          <p>{error || 'Something went wrong.'}</p>
          {token && <p className="ps-error-note">Your progress is saved — reloading this page should pick up where you left off.</p>}
        </div>
      </div>
    )
  }
  if (phase === 'consent') {
    return (
      <>
        <ConsentScreen onDecide={handleConsent} remaining={remaining} />
        {showConsentTimeoutModal && (
          <ConsentTimeoutModal
            onContinue={() => {
              stageEnteredAtRef.current.consent = correctedNow()
              setConsentExtendUsed(true)
              setShowConsentTimeoutModal(false)
            }}
            onDecline={() => {
              setShowConsentTimeoutModal(false)
              setOutcome('declined')
              setRedirectCode(declineRedirectCode)
              setPhase('outcome')
            }}
          />
        )}
      </>
    )
  }
  if (phase === 'instructions' || phase === 'tutorial') {
    const onExtend = () => {
      stageEnteredAtRef.current[phase] = correctedNow()
      setStageExtendUsed(true)
      setShowStageTimeoutModal(false)
    }
    const onEnd = () => {
      setShowStageTimeoutModal(false)
      advance({ force_outcome: 'partial' })
    }
    const stageView = phase === 'instructions'
      ? <Instructions onNext={() => advance()} remaining={remaining} />
      : (
        <TutorialPractice
          authToken={token}
          remaining={remaining}
          onNext={() => advance()}
          practiceRef={practiceRef}
          loadError={practiceRefError}
        />
      )
    return (
      <>
        {stageView}
        {showStageTimeoutModal && (
          <StageTimeoutModal
            label={phase === 'instructions' ? 'this page' : 'the practice round'}
            onExtend={onExtend}
            onEnd={onEnd}
          />
        )}
      </>
    )
  }
  if (phase === 'session') {
    const isLast = currentSession >= TOTAL_SESSIONS
    if (!sessionViewReady) {
      // Distinguish "still loading" from "failed": the failure case must not be
      // a bare spinner, and must always leave a way to reach an outcome — the
      // countdown keeps running and force-records a partial at zero, plus an
      // explicit button here so the participant never has to wait it out.
      const failed = !!sessionRefsError || refIds.length === 0
      if (!failed) {
        return <div className="ps-root ps-center"><div className="ps-spinner" /></div>
      }
      return (
        <div className="ps-root ps-center">
          <div>
            <p>{sessionRefsError || 'This session could not be loaded.'}</p>
            <p className="ps-error-note">
              Reloading this page usually fixes it, and your progress is saved. The
              session timer is still running ({fmt(remaining)} left) — if it reaches zero
              the study ends and your completion code is issued. You can also end it now.
            </p>
            <button className="ps-next-btn" onClick={() => advance({ force_outcome: 'partial' })}>
              End the study and get my completion code
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="ps-root">
        <header className="ps-header">
          <span className="ps-title">Web Generation Study</span>
          <span className="ps-session">Session {currentSession} / {TOTAL_SESSIONS}</span>
          <span className={`ps-timer ${remaining < 60 ? 'ps-timer--warn' : ''}`}>
            <Clock size={14} /> {fmt(remaining)}
          </span>
          <button className="ps-next-btn" onClick={() => setShowFinishConfirm(true)}>
            {isLast ? 'Finish study' : 'Move to next'}
          </button>
        </header>
        <div className="ps-body ps-body--split">
          <div className="ps-main">
            <ChatInterface key={currentRefId} authToken={token} referenceId={currentRefId} hideHeader />
          </div>
          <ReferencePanel html={currentRef.html} label={currentRef.name} />
        </div>
        {showExtendModal && (
          <TimeoutModal
            isLast={isLast}
            onExtend={() => { setShowExtendModal(false); advance({ extend: true }) }}
            onMoveOn={() => { setShowExtendModal(false); advance() }}
          />
        )}
        {showSessionTimeoutChoice && (
          <SessionTimeoutChoiceModal
            nextSession={currentSession + 1}
            onExit={() => { setShowSessionTimeoutChoice(false); advance({ force_outcome: 'partial' }) }}
            onContinue={() => { setShowSessionTimeoutChoice(false); advance() }}
          />
        )}
        {showFinishConfirm && (
          <ConfirmModal
            isLast={isLast}
            onCancel={() => setShowFinishConfirm(false)}
            onConfirm={() => { setShowFinishConfirm(false); advance() }}
          />
        )}
      </div>
    )
  }
  if (phase === 'survey') {
    return <Survey onNext={() => advance()} remaining={remaining} prolificPid={prolificPid} />
  }
  if (phase === 'outcome') {
    return <OutcomeScreen outcome={outcome} redirectCode={redirectCode} isTest={isTest} onReset={handleTestReset} />
  }
  return null
}
