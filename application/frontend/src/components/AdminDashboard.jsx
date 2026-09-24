import { useState, useEffect, useCallback } from 'react'
import { LogOut, ArrowLeft, PenLine, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
// Single source of truth for the study's shape across JS-land — the same module
// the API handlers use, so these figures cannot drift between files.
import { NUM_SLOTS, TOTAL_SESSIONS } from '../../../api/_lib/prolificAssignment.js'
import './AdminDashboard.css'

const short = (id) => (id ? id.slice(0, 8) : '—')
// A conversation is keyed on EITHER a Supabase user_id (legacy pilot) or a
// Prolific PID — never both. Show whichever identity is actually populated.
const participantLabel = (row) => (row.user_id ? short(row.user_id) : (row.prolific_pid || '—'))
const fmtDate = (s) => {
  if (!s) return ''
  const d = new Date(s)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STAGE_LIMITS = { instructions: 5 * 60, tutorial: 10 * 60, session: 15 * 60 }
// Mirrors ProlificStudy.jsx: granting an extension resets
// current_session_started_at to now() server-side, so an extended session's
// window is 5 minutes from that new anchor — not another full 15.
const EXTEND_SECONDS = 5 * 60
// The participant-facing timeout modal allows 2 minutes to answer before the
// study auto-closes as partial. Someone sitting in that modal is not yet stuck,
// so don't flag them the instant their session clock hits zero.
const REVIEW_GRACE_SECONDS = 2 * 60

// stage_started_at only moves when a participant ENTERS the 'session' stage
// (i.e. session 1). The session-1 -> session-2 transition moves
// current_session_started_at instead, so using stage_started_at during a session
// reports session 2 participants as having been in-stage since session 1 began.
function stageAnchor(row) {
  if (row.stage === 'session') return row.current_session_started_at || row.stage_started_at
  return row.stage_started_at
}

function stageDuration(row) {
  if (row.outcome) return null // finished — see stage_log for the full history instead
  const anchor = stageAnchor(row)
  if (!anchor) return null
  const started = new Date(anchor).getTime()
  if (Number.isNaN(started)) return null
  return (Date.now() - started) / 1000
}

function stageLimit(row) {
  if (row.stage === 'session') {
    return (row.extend_used ? EXTEND_SECONDS : STAGE_LIMITS.session) + REVIEW_GRACE_SECONDS
  }
  return STAGE_LIMITS[row.stage] || Infinity
}

function needsReview(row) {
  if (row.outcome || row.is_test) return false
  const elapsed = stageDuration(row)
  return elapsed != null && elapsed > stageLimit(row)
}

// stage_log's 'session_N' entry is written once, on entering that session, and
// is never touched again — unlike current_session_started_at, which resets to
// now() when an extend is granted (correct for the participant's own extended
// countdown, but it makes stageDuration() report 0m for a session that's
// actually 15+ minutes in). Display-only: needsReview/stageLimit above
// deliberately keep using the reset anchor, since flagging needs "time since
// the CURRENT window started", not total time in the session.
function sessionEnteredAt(row) {
  if (!Array.isArray(row.stage_log)) return null
  const key = `session_${row.current_session}`
  for (let i = row.stage_log.length - 1; i >= 0; i--) {
    if (row.stage_log[i]?.stage === key) return row.stage_log[i].entered_at
  }
  return null
}

function displayElapsed(row) {
  if (row.outcome) return null
  const anchor = row.stage === 'session' ? (sessionEnteredAt(row) || stageAnchor(row)) : stageAnchor(row)
  if (!anchor) return null
  const started = new Date(anchor).getTime()
  if (Number.isNaN(started)) return null
  return (Date.now() - started) / 1000
}

// ── Participants tab ────────────────────────────────────────────────────────
function Participants() {
  const [rows, setRows] = useState(null)
  const [showTest, setShowTest] = useState(true)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_participants')
    if (error) { console.warn('[admin] participants load failed:', error.message); setRows([]); return }
    setRows(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  if (rows === null) return <div className="adm-center"><div className="adm-spinner" /></div>

  const visible = rows.filter((r) => showTest || !r.is_test)
  const review = visible.filter(needsReview)

  return (
    <div className="adm-participants">
      <div className="adm-participants-head">
        <h2 className="adm-section">Participants</h2>
        <label className="adm-checkbox">
          <input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} />
          Show test runs
        </label>
        <button className="adm-btn" onClick={load} title="Refresh"><RefreshCw size={15} /></button>
      </div>

      {review.length > 0 && (
        <div className="adm-review-banner">{review.length} participant(s) past their stage timeout — needs manual review</div>
      )}

      <table className="adm-table">
        <thead>
          <tr>
            <th>PID</th><th>Outcome</th><th>Stage</th><th>Session</th><th>Elapsed</th><th></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => {
            const elapsed = displayElapsed(r)
            return (
              <tr key={r.prolific_pid} className={needsReview(r) ? 'adm-row--flag' : ''}>
                <td>{r.prolific_pid} {r.is_test && <span className="adm-badge">test</span>}</td>
                <td>{r.outcome || 'in progress'}</td>
                <td>{r.stage}</td>
                <td>{r.current_session} / {TOTAL_SESSIONS}</td>
                <td>{elapsed != null ? `${Math.round(elapsed / 60)}m` : '—'}</td>
                <td>{needsReview(r) && <span className="adm-badge adm-badge--warn">needs review</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── A single participant's session (collapsible to keep iframes lazy) ─────────
function Thread({ thread, index }) {
  const [open, setOpen] = useState(false)
  const turns = thread.messages
  const finalHtml = [...turns].reverse().find((m) => m.role === 'assistant')?.content

  return (
    <div className="adm-thread">
      <button className="adm-thread-head" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="adm-thread-title">Participant {index + 1}</span>
        <span className="adm-thread-meta">{participantLabel(thread)} · {fmtDate(thread.created_at)} · {turns.filter(m => m.role === 'user').length} prompts</span>
      </button>

      {!open && finalHtml && (
        <div className="adm-thread-peek">
          <iframe className="adm-frame adm-frame--sm" title="final" srcDoc={finalHtml} sandbox="" />
          <span className="adm-peek-label">final result — click to expand full conversation</span>
        </div>
      )}

      {open && (
        <div className="adm-turns">
          {turns.map((m, i) => (
            <div key={i} className={`adm-turn adm-turn--${m.role}`}>
              {m.role === 'user' ? (
                <>
                  <span className="adm-turn-tag">Prompt {m.turn ?? ''}</span>
                  <p className="adm-turn-text">{m.content}</p>
                </>
              ) : (
                <>
                  <span className="adm-turn-tag">Generated</span>
                  <iframe className="adm-frame" title={`gen-${i}`} srcDoc={m.content} sandbox="" />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminDashboard({ onLogout, onGenerate }) {
  const [view, setView] = useState('overview')   // 'overview' | 'participants'
  const [overview, setOverview] = useState(null)
  const [refs, setRefs] = useState([])
  const [refHtml, setRefHtml] = useState({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)   // {reference_id, name}
  const [threads, setThreads] = useState(null)      // grouped conversations

  const load = useCallback(async () => {
    setLoading(true)
    const [ov, rs, rh] = await Promise.all([
      supabase.rpc('admin_overview'),
      supabase.rpc('admin_reference_stats'),
      supabase.from('study_references').select('id,html'),
    ])
    setOverview(Array.isArray(ov.data) ? ov.data[0] : ov.data)
    setRefs(rs.data || [])
    const map = {}
    ;(rh.data || []).forEach((r) => { map[r.id] = r.html })
    setRefHtml(map)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openRef = async (r) => {
    setSelected(r)
    setThreads(null)
    const { data, error } = await supabase.rpc('admin_reference_conversations', { p_reference_id: r.reference_id })
    if (error) console.warn('[admin] conversations load failed:', error.message)
    const groups = {}
    for (const row of data || []) {
      if (!groups[row.conversation_id]) {
        groups[row.conversation_id] = {
          id: row.conversation_id,
          user_id: row.user_id,
          // admin_reference_conversations returns prolific_pid too — without
          // carrying it here every Prolific participant renders as "—".
          prolific_pid: row.prolific_pid,
          created_at: row.conversation_created_at,
          messages: [],
        }
      }
      groups[row.conversation_id].messages.push(row)
    }
    setThreads(Object.values(groups))
  }

  // ── Reference drill-down view ──
  if (selected) {
    return (
      <div className="adm-root">
        <header className="adm-header">
          <div className="adm-header-left">
            <button className="adm-back" onClick={() => { setSelected(null); setThreads(null) }}>
              <ArrowLeft size={15} /> All references
            </button>
            <span className="adm-title">{selected.name}</span>
          </div>
        </header>
        <div className="adm-detail">
          {threads === null ? (
            <div className="adm-center"><div className="adm-spinner" /></div>
          ) : threads.length === 0 ? (
            <p className="adm-empty">No participant has generated on this reference yet.</p>
          ) : (
            threads.map((t, i) => <Thread key={t.id} thread={t} index={i} />)
          )}
        </div>
      </div>
    )
  }

  // ── Main dashboard ──
  const p = overview?.participants_total ?? 0
  // Only Prolific-keyed rows fill the round-robin schedule — legacy user_id-keyed
  // pilot rows predate it and are counted in `participants_total` only.
  const filled = Math.min(overview?.participants_prolific ?? 0, NUM_SLOTS)
  const stats = overview ? [
    { label: 'References', value: overview.references_total },
    { label: 'Participants', value: p },
    { label: 'Slots filled (round 1)', value: `${filled} / ${NUM_SLOTS}`, sub: `${NUM_SLOTS - filled} remaining` },
    { label: 'Completed', value: overview.participants_completed },
    { label: 'In progress', value: overview.participants_in_progress },
    { label: 'Sessions', value: overview.sessions_total },
    { label: 'Generations', value: overview.generations_total },
  ] : []

  return (
    <div className="adm-root">
      <header className="adm-header">
        <div className="adm-header-left">
          <span className="adm-title">refinr · admin</span>
          <span className="adm-subtitle">study dashboard</span>
        </div>
        <div className="adm-tabs">
          <button className={`adm-tab${view === 'overview' ? ' adm-tab--active' : ''}`} onClick={() => setView('overview')}>Overview</button>
          <button className={`adm-tab${view === 'participants' ? ' adm-tab--active' : ''}`} onClick={() => setView('participants')}>Participants</button>
        </div>
        <div className="adm-header-right">
          <button className="adm-btn" onClick={load} title="Refresh"><RefreshCw size={15} /></button>
          <button className="adm-btn" onClick={onGenerate}><PenLine size={15} /> Generate</button>
          <button className="adm-btn adm-btn--icon" onClick={onLogout} title="Log out"><LogOut size={16} /></button>
        </div>
      </header>

      {view === 'participants' ? (
        <div className="adm-body">
          <Participants />
        </div>
      ) : loading ? (
        <div className="adm-center"><div className="adm-spinner" /></div>
      ) : (
        <div className="adm-body">
          <div className="adm-stats">
            {stats.map((s) => (
              <div className="adm-stat" key={s.label}>
                <div className="adm-stat-value">{s.value}</div>
                <div className="adm-stat-label">{s.label}</div>
                {s.sub && <div className="adm-stat-sub">{s.sub}</div>}
              </div>
            ))}
          </div>

          <h2 className="adm-section">References</h2>
          <div className="adm-grid">
            {refs.map((r) => (
              <button className="adm-card" key={r.reference_id} onClick={() => openRef(r)}>
                <div className="adm-card-thumb">
                  {refHtml[r.reference_id]
                    ? <iframe className="adm-frame" title={r.name} srcDoc={refHtml[r.reference_id]} sandbox="" />
                    : <div className="adm-frame adm-frame--empty" />}
                </div>
                <div className="adm-card-meta">
                  <span className="adm-card-name">{r.name}</span>
                  <span className="adm-card-stats">{r.generations} gens · {r.generators} people</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
