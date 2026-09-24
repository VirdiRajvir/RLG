import { useState, useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
import GenerationStudy from './components/GenerationStudy'
import Annotation from './components/Annotation'
import ProlificStudy from './components/prolific/ProlificStudy'
import PrefelicAdminDashboard from './components/PrefelicAdminDashboard'
import Explore from './explore/Explore'
import './App.css'

// Four independent, purely path-based branches on the same domain — no
// router dependency, same convention /prefelic already established.
const STUDY_ROUTE = window.location.pathname.replace(/\/+$/, '') === '/prefelic'
const ADMIN_ROUTE = window.location.pathname.replace(/\/+$/, '') === '/admin'
const PREFELIC_ADMIN_ROUTE = window.location.pathname.replace(/\/+$/, '') === '/prefelic/admin'
const EXPLORE_ROUTE = window.location.pathname.replace(/\/+$/, '').startsWith('/explore')
// Same researcher-only gate as GenerationStudy.jsx's ADMIN_EMAIL — kept as
// its own constant here rather than imported, matching that file's existing
// pattern of a local const instead of a shared config module.
const PREFELIC_ADMIN_EMAIL = 'rajvirsinghvirdi1@gmail.com'
const PROLIFIC_PID = new URLSearchParams(window.location.search).get('PROLIFIC_PID')

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    )

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (STUDY_ROUTE) {
    return <Annotation />
  }

  if (EXPLORE_ROUTE) {
    return (
      <BrowserRouter basename="/explore">
        <Explore />
      </BrowserRouter>
    )
  }

  if (ADMIN_ROUTE) {
    if (authLoading) {
      return (
        <div className="auth-loading">
          <div className="auth-loading-spinner" />
        </div>
      )
    }
    if (!session) {
      return <Auth />
    }
    return <GenerationStudy session={session} onLogout={handleLogout} />
  }

  if (PREFELIC_ADMIN_ROUTE) {
    if (authLoading) {
      return (
        <div className="auth-loading">
          <div className="auth-loading-spinner" />
        </div>
      )
    }
    if (!session) {
      return <Auth />
    }
    if (session.user?.email?.toLowerCase() !== PREFELIC_ADMIN_EMAIL) {
      return (
        <div className="auth-loading">
          <p>This account isn&apos;t authorized for the admin dashboard.</p>
        </div>
      )
    }
    return <PrefelicAdminDashboard onLogout={handleLogout} />
  }

  if (PROLIFIC_PID) {
    return <ProlificStudy />
  }

  // A stray visitor, or a misconfigured Prolific redirect missing its query
  // params — never show anything auth-shaped at the shared study root.
  return (
    <div className="auth-loading">
      <p>This link isn&apos;t valid. Please access this study via your Prolific study link.</p>
    </div>
  )
}

export default App
