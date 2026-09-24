import { useState, useRef, useEffect } from 'react'
import { SendHorizontal, RotateCcw, Loader2, LogOut, ChevronDown, ChevronUp, BookOpen, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import HtmlPreview from './HtmlPreview'
import './ChatInterface.css'

// ── Component ─────────────────────────────────────────────────────────────────

function ChatInterface({ session, onLogout, referenceId = null, hideHeader = false, authToken = null, isTutorial = false }) {
  // ── Existing state ──────────────────────────────────────
  const [messages,        setMessages]        = useState([])
  const [loading,         setLoading]         = useState(false)
  const [historyLoading,  setHistoryLoading]  = useState(true)
  const [historyError,    setHistoryError]    = useState('')
  const [conversationId,  setConversationId]  = useState(null)
  const [remaining,       setRemaining]       = useState(null)
  const [input,           setInput]           = useState('')

  // ── New composite-input state ───────────────────────────
  const [requirements, setRequirements] = useState([])
  const [pendingSubmit, setPendingSubmit] = useState(null)
  const [confirmVisible, setConfirmVisible] = useState(false)

  const messagesEndRef = useRef(null)
  const textareaRef    = useRef(null)

  // ── Lifecycle ───────────────────────────────────────────
  // Reload whenever the bound reference changes — a new study session targets a
  // different reference, so reset to a fresh conversation scoped to it.
  useEffect(() => {
    setMessages([])
    setConversationId(null)
    setRequirements([])
    loadLatestConversation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  // ── Data loading (unchanged logic) ─────────────────────
  const loadLatestConversation = async () => {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      if (authToken) {
        const res = await fetch('/api/prolific-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ reference_id: referenceId, is_tutorial: isTutorial }),
        })
        // Without this check a failed response is parsed as if it were valid:
        // data.conversation_id is undefined, that lands in conversationId state,
        // and the NEXT prompt reaches /api/chat with no conversation_id — forking
        // a second conversation on the same reference and losing both the visible
        // history and the LLM's context. Fail loudly instead.
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error(errBody.error || `Failed to load conversation (${res.status})`)
        }
        const data = await res.json()
        setConversationId(data.conversation_id)
        if (data.messages?.length > 0) {
          setMessages(data.messages.map(m => ({ role: m.role, content: m.content, turn: m.turn })))
          const lastUserMsg = [...data.messages].reverse().find(m => m.role === 'user')
          setRequirements(
            lastUserMsg?.requirements?.length > 0
              ? lastUserMsg.requirements.map(r => typeof r === 'string' ? { text: r, satisfied: false } : r)
              : []
          )
        }
        setRemaining(data.remaining)
        return
      }

      let convQuery = supabase
        .from('conversations')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
      // In study mode, resume only THIS reference's conversation (one per session).
      if (referenceId) convQuery = convQuery.eq('reference_id', referenceId)
      const { data: convs } = await convQuery

      if (convs && convs.length > 0) {
        const conv = convs[0]
        setConversationId(conv.id)

        const { data: msgs } = await supabase
          .from('messages')
          .select('role, content, turn, requirements')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true })

        if (msgs && msgs.length > 0) {
          setMessages(msgs.map(m => ({ role: m.role, content: m.content, turn: m.turn })))

          // Restore requirements from the most recent user message snapshot
          const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user')
          if (lastUserMsg?.requirements?.length > 0) {
            setRequirements(lastUserMsg.requirements.map(r =>
              typeof r === 'string' ? { text: r, satisfied: false } : r
            ))
          } else {
            setRequirements([])
          }
        }
        await loadRemainingCount()
      }
    } catch (err) {
      console.error('Failed to load conversation:', err)
      // Sending on top of an unknown conversation state is what forks the
      // conversation, so block sending until the page is reloaded successfully.
      setHistoryError('Your conversation could not be loaded. Please reload the page before sending another prompt.')
    } finally {
      setHistoryLoading(false)
    }
  }

  const loadRemainingCount = async () => {
    try {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'user')

      setRemaining(50 - (count || 0))
    } catch (err) {
      console.error('Failed to load remaining count:', err)
    }
  }

  // Requirements logic removed

  // ── Send logic ──────────────────────────────────────────
  const handleSend = async (prompt, reqs = requirements) => {
    if (remaining !== null && remaining <= 0) return
    if (historyError) return

    const userMsg = { role: 'user', content: prompt }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken || session?.access_token}`,
        },
        body: JSON.stringify({
          prompt,
          conversation_id: conversationId,
          requirements: reqs,
          reference_id: referenceId,
          is_tutorial: isTutorial,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setConversationId(data.conversation_id)
        setMessages(prev => [...prev, {
          role:    'assistant',
          content: data.html,
          turn:    data.turn,
          usage:   data.usage,
        }])
        if (data.requirements) {
          setRequirements(Array.isArray(data.requirements)
            ? data.requirements.map(r => typeof r === 'string' ? { text: r, satisfied: false } : r)
            : [])
        }
        if (data.remaining !== undefined) setRemaining(data.remaining)
      } else {
        setMessages(prev => [...prev, {
          role:    'assistant',
          content: `<html><body><h2 style="color:red;">Error</h2><p>${data.error || 'Unknown error'}</p></body></html>`,
          turn:    null,
          error:   true,
        }])
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role:    'assistant',
        content: `<html><body><h2 style="color:red;">Connection Error</h2><p>${err.message}</p></body></html>`,
        turn:    null,
        error:   true,
      }])
    } finally {
      setLoading(false)
    }
  }

  // ── Reset ───────────────────────────────────────────────
  const handleReset = () => {
    setConversationId(null)
    setMessages([])
    setRequirements([])
    setConfirmVisible(false)
    setPendingSubmit(null)
  }

  // ── Submit flow (with confirm gate) ────────────────────
  const buildPayload = () => ({
    prompt: input.trim(),
    requirements,
  })

  const handleSubmit = (e) => {
    e?.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const payload = buildPayload()
    setPendingSubmit(payload)
    setConfirmVisible(true)
  }

  const handleConfirm = () => {
    if (!pendingSubmit) return
    const { prompt, requirements: reqs } = pendingSubmit
    setConfirmVisible(false)
    setPendingSubmit(null)
    setInput('')
    handleSend(prompt, reqs)
  }

  const handleCancelConfirm = () => {
    setConfirmVisible(false)
    setPendingSubmit(null)
  }

  const atLimit = (remaining !== null && remaining <= 0) || !!historyError

  const [showInstructions, setShowInstructions] = useState(false)

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="chat-interface">

      {/* ── Instructions Modal ── */}
      {showInstructions && (
        <div className="instructions-overlay" onClick={() => setShowInstructions(false)}>
          <div className="instructions-modal" onClick={e => e.stopPropagation()}>
            <div className="instructions-header">
              <h2>Participant Instructions</h2>
              <button className="instructions-close" onClick={() => setShowInstructions(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="instructions-body">
              <section>
                <h3>Overview</h3>
                <p>
                  You will recreate a reference wireframe (visible in the right sidebar) by
                  describing it to the AI over multiple conversational turns. The AI generates
                  raw HTML each turn — your goal is to progressively refine it until it matches
                  the reference as closely as possible.
                </p>
              </section>

              <section>
                <h3>Labelling Elements</h3>
                <ul>
                  <li>Every box in the reference wireframe has a <strong>unique label</strong> inside it in the format <code>type-N</code> — for example <code>text-6</code>, <code>link-12</code>, <code>button-3</code>.</li>
                  <li>When describing elements in your prompts, <strong>always refer to them by their label number</strong> (e.g. "add a heading box labelled text-6").</li>
                  <li>Ask the AI to write the label text inside each box exactly as shown — this is how accuracy is measured.</li>
                  <li>The reference contains <strong>61 labeled elements</strong> across three types: <code>text-1</code>–<code>text-35</code>, <code>link-1</code>–<code>link-21</code>, <code>button-1</code>–<code>button-5</code>.</li>
                </ul>
              </section>

              <section>
                <h3>Session Length</h3>
                <ul>
                  <li>Aim for <strong>10–15 turns</strong> per session.</li>
                  <li>Build the page <strong>section by section</strong> — do not try to describe everything in one prompt.</li>
                  <li>A good order: header → intro strip → main content → sidebar → footer.</li>
                </ul>
              </section>

              <section>
                <h3>Tips</h3>
                <ul>
                  <li>Be specific about <strong>sizes, colours, and positions</strong> relative to other elements.</li>
                  <li>Describe widths as percentages of the parent container (e.g. "covering 40% of the sidebar width").</li>
                  <li>If the AI drops previously added elements, describe what&apos;s missing and ask it to restore them.</li>
                  <li>You have <strong>50 prompts total</strong> across all sessions — use them carefully.</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ── Header (hidden in study mode — GenerationStudy provides its own) ── */}
      {!hideHeader && (
      <div className="chat-header">
        <h1 className="chat-title">Reiterative Web Generation & Refinement</h1>
        <div className="chat-header-actions">
          {remaining !== null && (
            <span className="remaining-badge" title="Prompts remaining">
              {remaining} / 50 remaining
            </span>
          )}
          <button className="reset-btn instructions-btn" onClick={() => setShowInstructions(true)} title="Read instructions">
            <BookOpen size={16} />
            <span>Instructions</span>
          </button>
          <button className="reset-btn" onClick={handleReset} title="Start new conversation">
            <RotateCcw size={16} />
            <span>New Chat</span>
          </button>
          <button className="reset-btn" onClick={onLogout} title="Log out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
      )}

      {/* ── Messages (unchanged) ── */}
      <div className="chat-messages">
        {historyLoading ? (
          <div className="empty-state">
            <Loader2 size={32} className="spinner" />
            <p style={{ marginTop: 12 }}>Loading conversation...</p>
          </div>
        ) : historyError ? (
          <div className="empty-state">
            <h2>Couldn&apos;t load your conversation</h2>
            <p>{historyError}</p>
          </div>
        ) : messages.length === 0 && !loading ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <h2>What would you like to build?</h2>
            <p>Describe a webpage and the AI will generate interactive HTML for you.</p>
          </div>
        ) : null}

        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-label">
              {msg.role === 'user' ? 'You' : 'Assistant'}
              {msg.role === 'assistant' && msg.turn && (
                <span className="turn-badge">Turn {msg.turn}</span>
              )}
            </div>
            <div className="message-content">
              {msg.role === 'user' ? (
                <div className="user-text">{msg.content}</div>
              ) : (
                <HtmlPreview html={msg.content} turn={msg.turn} />
              )}
            </div>
            {msg.role === 'assistant' && msg.usage && (
              <div className="usage-info">
                Tokens: {msg.usage.prompt_tokens?.toLocaleString()} prompt ·{' '}
                {msg.usage.completion_tokens?.toLocaleString()} completion ·{' '}
                {msg.usage.total_tokens?.toLocaleString()} total
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="message assistant">
            <div className="message-label">Assistant</div>
            <div className="message-content">
              <div className="loading-indicator">
                <Loader2 size={20} className="spinner" />
                <span>Generating HTML...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>


      {/* Requirements sidebar removed (manual adding disabled) */}

      {/* ── Confirm overlay ── */}
      {confirmVisible && pendingSubmit && (
        <div className="confirm-overlay">
          <div className="confirm-panel">
            <p className="confirm-title">Confirm your prompt</p>

            <div className="confirm-section confirm-section--col">
              <span className="confirm-label">Prompt</span>
              <p className="confirm-prompt-text">{pendingSubmit.prompt}</p>
            </div>

            <div className="confirm-actions">
              <button className="confirm-btn cancel" onClick={handleCancelConfirm}>
                Edit
              </button>
              <button className="confirm-btn send" onClick={handleConfirm}>
                <SendHorizontal size={14} />
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Composite input area (requirements disabled) ── */}
      <form className="chat-input-area" onSubmit={handleSubmit}>
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={historyError ? 'Reload the page to continue' : atLimit ? 'Prompt limit reached' : 'Describe the webpage you want to generate…'}
            rows={1}
            disabled={loading || atLimit}
            data-tutorial="prompt-input"
          />
          <button
            type="submit"
            className="send-btn"
            disabled={!input.trim() || loading || atLimit}
            title="Send message"
            data-tutorial="send-button"
          >
            {loading
              ? <Loader2 size={18} className="spinner" />
              : <SendHorizontal size={18} />
            }
          </button>
        </div>
        <div className="input-hint">
          Click send to review &amp; submit your prompt
        </div>
      </form>
    </div>
  )
}

export default ChatInterface