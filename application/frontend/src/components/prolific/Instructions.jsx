// application/frontend/src/components/prolific/Instructions.jsx
import { Eye, MessageSquare, Sparkles, RefreshCw, Clock, Tag, Ban } from 'lucide-react'
// Single source of truth for the study's shape across JS-land — the same
// module the API side uses, so the "2 rounds" figure cannot drift.
import { TOTAL_SESSIONS } from '../../../../api/_lib/prolificAssignment.js'
import './Instructions.css'

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// A tiny mockup of what the reference/target actually looks like — real
// labeled boxes, not an abstract stand-in — so "look at the target" and "use
// the labels" are shown, not just described. Uses currentColor so it always
// matches whatever card it's dropped into.
function TargetMockup() {
  return (
    <svg viewBox="0 0 120 84" width="100%" height="100%" className="instr-mockup">
      <rect x="2" y="2" width="116" height="80" rx="4" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" />
      <rect x="10" y="10" width="38" height="14" rx="2" fill="currentColor" fillOpacity="0.3" />
      <text x="29" y="20" fontSize="6" textAnchor="middle" fill="currentColor" opacity="0.75">box-1</text>
      <rect x="54" y="10" width="56" height="22" rx="2" fill="currentColor" fillOpacity="0.18" />
      <text x="82" y="24" fontSize="6" textAnchor="middle" fill="currentColor" opacity="0.75">box-2</text>
      <rect x="10" y="32" width="100" height="10" rx="2" fill="currentColor" fillOpacity="0.24" />
      <text x="60" y="40" fontSize="6" textAnchor="middle" fill="currentColor" opacity="0.75">box-3</text>
      <rect x="10" y="48" width="100" height="28" rx="2" fill="currentColor" fillOpacity="0.14" />
      <text x="60" y="64" fontSize="6" textAnchor="middle" fill="currentColor" opacity="0.75">box-4</text>
    </svg>
  )
}

// The "in progress" counterpart — same idea, deliberately slightly off (one
// box missing, one mis-sized) so "compare and describe changes" has
// something concrete to point at instead of two identical pictures.
function DraftMockup() {
  return (
    <svg viewBox="0 0 120 84" width="100%" height="100%" className="instr-mockup instr-mockup--draft">
      <rect x="2" y="2" width="116" height="80" rx="4" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="3 3" />
      <rect x="10" y="10" width="38" height="14" rx="2" fill="currentColor" fillOpacity="0.3" />
      <text x="29" y="20" fontSize="6" textAnchor="middle" fill="currentColor" opacity="0.75">box-1</text>
      <rect x="10" y="32" width="100" height="10" rx="2" fill="currentColor" fillOpacity="0.24" />
      <text x="60" y="40" fontSize="6" textAnchor="middle" fill="currentColor" opacity="0.75">box-3</text>
      <rect x="10" y="48" width="60" height="28" rx="2" fill="currentColor" fillOpacity="0.14" />
      <text x="40" y="64" fontSize="6" textAnchor="middle" fill="currentColor" opacity="0.75">box-4</text>
    </svg>
  )
}

const FACTS = [
  { icon: Clock, title: `${TOTAL_SESSIONS} timed rounds`, body: 'Each round is 15 minutes, with 5 more available if you need them.' },
  { icon: Tag, title: 'Use the little labels', body: 'Every part of the target has a small name on it, like box-1. Just mention it by name. Don’t ask to remove or hide these labels once they’re placed — they need to stay visible.' },
  { icon: Ban, title: 'No going back', body: 'Moving to the next round is final, so make sure before you click.' },
]

export default function Instructions({ onNext, remaining }) {
  return (
    <div className="ps-instructions">
      <div className="instr-card">
        <span className="instr-eyebrow">Before you start</span>
        <h1>How this works</h1>
        <p className="instr-lede">
          Your goal is to recreate a target layout using plain text instructions typed
          into a text box. It takes multiple turns: the AI gives you an attempt, you see
          it, and you type the next instruction to improve it.
          NOTE: The study grades only structure. Colour, styles, fonts are ignored. You must not focus on these aspects. 
        </p>

        <div className="instr-loop">
          <div className="instr-loop-card">
            <div className="instr-loop-icon"><Eye size={18} /></div>
            <div className="instr-loop-visual"><TargetMockup /></div>
            <h3>Look at the target</h3>
            <p>This is the layout you need to recreate, shown on the right the whole time.</p>
          </div>

          <div className="instr-loop-arrow">
            <MessageSquare size={18} />
            <span>type instructions in the text box</span>
          </div>

          <div className="instr-loop-card">
            <div className="instr-loop-icon"><Sparkles size={18} /></div>
            <div className="instr-loop-visual instr-loop-visual--ai">
              <Sparkles size={51} />
            </div>
            <h3>The AI gives an attempt</h3>
            <p>Click send, and the AI&apos;s attempt at the layout appears in a few seconds.</p>
          </div>

          <div className="instr-loop-arrow">
            <RefreshCw size={18} />
            <span>see it, then type your next instruction</span>
          </div>

          <div className="instr-loop-card">
            <div className="instr-loop-icon"><Eye size={18} /></div>
            <div className="instr-loop-visual instr-loop-visual--compare">
              <TargetMockup />
              <DraftMockup />
            </div>
            <h3>Check &amp; refine</h3>
            <p>Compare the AI output to the target, send next instruction to improve until satisfied.</p>
          </div>
        </div>

        <div className="instr-facts">
          {FACTS.map((f) => (
            <div className="instr-fact" key={f.title}>
              <f.icon size={18} className="instr-fact-icon" />
              <div>
                <h4>{f.title}</h4>
                <p>{f.body}</p>
              </div>
            </div>
          ))}
        </div>

        <p className={`ps-timer-note ${remaining <= 60 ? 'ps-timer--warn' : ''}`}>
          <Clock size={14} /> {fmt(remaining)} remaining on this page. This page and the
          practice round can&apos;t be extended: if either timer reaches zero the study ends
          early rather than moving on, so continue before then.
        </p>
        {remaining > 0 && remaining <= 60 && (
          <p className="ps-timeout-banner">
            <Clock size={14} /> Less than a minute left. Click &quot;Continue&quot; now, or this page
            will time out and the study will end automatically.
          </p>
        )}
        <button className="ps-start-btn" onClick={onNext}>Continue to practice round →</button>
      </div>
    </div>
  )
}
