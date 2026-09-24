import { useState, useEffect, useCallback } from 'react'
import { LogOut, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './AdminDashboard.css'

// A real Prolific PID is always a 24-char hex string. Every value used for
// manual/dev testing this session (verify-panel-1, timeout-test-5,
// diag-scale-1, resumetest1, ...) fails this — a reliable real-vs-test signal
// without needing an is_test column judgments doesn't have.
const looksReal = (pid) => /^[a-f0-9]{24}$/i.test(pid || '')

const fmtRelative = (iso) => {
  if (!iso) return '—'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return `${Math.round(s)}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export default function PrefelicAdminDashboard({ onLogout }) {
  const [rows, setRows] = useState(null)
  const [totalPairs, setTotalPairs] = useState(null)
  const [showTest, setShowTest] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    const [progress, pairs] = await Promise.all([
      supabase.rpc('admin_prefelic_progress'),
      // study_pairs is anon-readable (public stimuli), no RPC needed here.
      supabase.from('study_pairs').select('id', { count: 'exact', head: true }).eq('is_practice', false),
    ])
    if (progress.error) { setError(progress.error.message); setRows([]); return }
    setRows(progress.data || [])
    setTotalPairs(pairs.count ?? null)
  }, [])

  useEffect(() => { load() }, [load])

  if (rows === null) return <div className="adm-center"><div className="adm-spinner" /></div>

  const visible = rows.filter((r) => showTest || looksReal(r.prolific_pid))

  return (
    <div className="adm-root">
      <header className="adm-header">
        <div className="adm-header-left">
          <span className="adm-title">refinr · prefelic admin</span>
          <span className="adm-subtitle">judgment progress</span>
        </div>
        <div className="adm-header-right">
          <button className="adm-btn" onClick={load} title="Refresh"><RefreshCw size={15} /></button>
          <button className="adm-btn adm-btn--icon" onClick={onLogout} title="Log out"><LogOut size={16} /></button>
        </div>
      </header>

      <div className="adm-body">
        <p className="adm-empty" style={{ marginBottom: 16 }}>
          No live stage tracking — prefelic has no backend session system, so nothing is written until a
          participant submits their first real judgment. A row with 0 judgments could be anywhere from
          &quot;never opened the link&quot; to mid-tutorial; this table shows judgment counts only, not
          consent/instructions/tutorial position.
        </p>

        {error && <p className="adm-empty">Failed to load: {error}</p>}

        <div className="adm-participants-head">
          <h2 className="adm-section">Participants ({visible.length})</h2>
          <label className="adm-checkbox">
            <input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} />
            Show test runs
          </label>
        </div>

        <table className="adm-table">
          <thead>
            <tr>
              <th>PID</th><th>Study ID</th><th>Judgments</th><th>Avg response</th><th>First</th><th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const complete = totalPairs != null && r.judgment_count >= totalPairs
              return (
                <tr key={r.prolific_pid}>
                  <td>{r.prolific_pid} {!looksReal(r.prolific_pid) && <span className="adm-badge">test</span>}</td>
                  <td>{r.prolific_study_id || '—'}</td>
                  <td>
                    {r.judgment_count}{totalPairs != null ? ` / ${totalPairs}` : ''}
                    {complete && <span className="adm-badge">complete</span>}
                  </td>
                  <td>{r.avg_response_ms != null ? `${Math.round(r.avg_response_ms)}ms` : '—'}</td>
                  <td>{fmtRelative(r.first_at)}</td>
                  <td>{fmtRelative(r.last_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
