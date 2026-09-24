import { useState } from 'react'
import { Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import ParticleField from './ParticleField'
import './Auth.css'

function Auth({ onAnnotate }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'signup') {
        const expectedCode = import.meta.env.VITE_INVITE_CODE
        if (inviteCode.trim() !== expectedCode) {
          setError('Invalid invite code')
          setLoading(false)
          return
        }

        const { error, data } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })
        if (error) {
          setError(error.message)
        } else if (data?.user && !data?.session) {
          // User created but no session = email confirmation required
          setConfirmationSent(true)
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) {
          setError(error.message)
        }
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`auth-split ${onAnnotate ? '' : 'auth-split--solo'}`}>
      <ParticleField />
      {onAnnotate && (
        <div className="auth-pane auth-pane-left">
          <div className="auth-left-inner">
            <button className="auth-bigbtn" onClick={onAnnotate}>
              Metric evaluation study →
            </button>
          </div>
        </div>
      )}
      <div className="auth-pane auth-pane-right">
        <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-wordmark">refinr</h1>
          <p className="auth-subtitle">A study in prompt-driven web generation</p>
        </div>

        {confirmationSent ? (
          <div className="auth-confirmation">
            <div className="auth-confirmation-icon"><Mail size={26} strokeWidth={1.9} /></div>
            <h2>Check your email</h2>
            <p>We've sent a confirmation link to <strong>{email}</strong>. Click the link in the email to verify your account, then come back here to log in.</p>
            <button
              className="auth-submit"
              onClick={() => { setConfirmationSent(false); setMode('login'); setEmail(''); setPassword(''); setInviteCode('') }}
            >
              Back to log in
            </button>
          </div>
        ) : (<>
        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError('') }}
          >
            Log in
          </button>
          <button
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => { setMode('signup'); setError('') }}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={loading}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              disabled={loading}
            />
          </div>

          {mode === 'signup' && (
            <div className="auth-field">
              <label htmlFor="invite">Invite code</label>
              <input
                id="invite"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Enter your invite code"
                required
                disabled={loading}
              />
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        </>)}
        </div>
      </div>
    </div>
  )
}

export default Auth
