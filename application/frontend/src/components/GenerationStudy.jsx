import { useState, useEffect } from 'react'
import { LogOut, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import ChatInterface from './ChatInterface'
import AdminDashboard from './AdminDashboard'
import './GenerationStudy.css'

// Researcher account: sees all 10 references, no timer, and is excluded from the
// corpus (never claims a slot → no study_participants row → skipped at ingest).
const ADMIN_EMAIL = 'rajvirsinghvirdi1@gmail.com'

// ── Reference panel (always-visible target, right side) ───────────────────────
function ReferencePanel({ html, label }) {
  return (
    <aside className="gs-ref">
      <div className="gs-ref-bar">
        <span className="gs-ref-eyebrow">Reference</span>
        {label && <span className="gs-ref-label">{label}</span>}
      </div>
      <div className="gs-ref-frame">
        {html
          ? <iframe className="gs-ref-iframe" srcDoc={html} title="Reference" sandbox="" />
          : <div className="gs-ref-empty">Loading reference…</div>}
      </div>
    </aside>
  )
}

// ── Admin flow (all 10 references, no timer, excluded from data) ──────────────
function AdminStudy({ session, onLogout, onDashboard }) {
  const [refs, setRefs] = useState([])
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('study_references').select('id,name,html').order('name')
      if (cancelled) return
      setRefs(data || [])
      if (data && data.length) setSelectedId(data[0].id)
    })()
    return () => { cancelled = true }
  }, [])

  const current = refs.find((r) => r.id === selectedId)
  if (!current) return <div className="gs-root gs-center"><div className="gs-spinner" /></div>

  return (
    <div className="gs-root">
      <header className="gs-header">
        <div className="gs-header-left">
          <button className="gs-back-btn" onClick={onDashboard}><ArrowLeft size={14} /> Dashboard</button>
          <span className="gs-title">Admin · all references</span>
          <span className="gs-session">excluded from study data</span>
        </div>
        <div className="gs-header-right">
          <select className="gs-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {refs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button className="gs-logout" onClick={onLogout} title="Log out"><LogOut size={16} /></button>
        </div>
      </header>
      <div className="gs-body">
        <div className="gs-main">
          <ChatInterface session={session} onLogout={onLogout} referenceId={selectedId} hideHeader />
        </div>
        <ReferencePanel html={current.html} label={current.name} />
      </div>
    </div>
  )
}

// Admin lands on the dashboard; a tab switches to the free-roam generate mode.
function AdminView({ session, onLogout }) {
  const [mode, setMode] = useState('dashboard') // 'dashboard' | 'generate'
  return mode === 'generate'
    ? <AdminStudy session={session} onLogout={onLogout} onDashboard={() => setMode('dashboard')} />
    : <AdminDashboard onLogout={onLogout} onGenerate={() => setMode('generate')} />
}

// Anyone who signs up at /admin without the researcher's email lands here —
// a harmless dead end rather than a blank screen, since only ADMIN_EMAIL has
// any view to render.
function NotAuthorized({ onLogout }) {
  return (
    <div className="gs-root gs-center">
      <div>
        <p>This account isn&apos;t authorized for the admin dashboard.</p>
        <button className="gs-logout" onClick={onLogout}><LogOut size={16} /> Log out</button>
      </div>
    </div>
  )
}

export default function GenerationStudy({ session, onLogout }) {
  const isAdmin = session?.user?.email?.toLowerCase() === ADMIN_EMAIL
  return isAdmin
    ? <AdminView session={session} onLogout={onLogout} />
    : <NotAuthorized onLogout={onLogout} />
}
