// application/frontend/src/components/TutorialTrial.jsx
import { Clock, Crosshair } from 'lucide-react'
import StimulusPanel from './StimulusPanel'
import './Annotation.css'

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// A single, non-scored practice trial — reuses the real StimulusPanel so a
// participant experiences the actual comparison mechanics before their
// choices start counting. Nothing rendered here is ever written to
// `judgments`.
export default function TutorialTrial({ practicePair, onNext, remaining }) {
  if (!practicePair) {
    return (
      <div className="annotation bp-center">
        <div className="bp-spinner" />
      </div>
    )
  }
  return (
    <div className="annotation bp-animate">
      <header className="bp-header">
        <div className="bp-header-left">
          <span className="bp-header-title">Practice round</span>
        </div>
        {typeof remaining === 'number' && (
          <div className="bp-header-right">
            <span className={`bp-timer ${remaining < 60 ? 'bp-timer--warn' : ''}`}>
              <Clock size={14} /> {fmt(remaining)}
            </span>
          </div>
        )}
      </header>
      <p className="bp-note-text" style={{ padding: '0 20px' }}>
        This practice trial doesn&apos;t count toward your results. Every panel
        shows the whole page shrunk to fit — nothing to scroll, just compare
        the layouts as shown.
      </p>
      <main className="bp-stage">
        <StimulusPanel html={practicePair.left.html} tone="candidate" eyebrow="A" title="Candidate A" />
        <StimulusPanel
          html={practicePair.refHtml}
          tone="target"
          eyebrow={<><Crosshair size={12} /> Target</>}
          title="Reference"
          hint="match against this"
        />
        <StimulusPanel html={practicePair.right.html} tone="candidate" eyebrow="B" title="Candidate B" />
      </main>
      <footer className="bp-choices">
        <button className="bp-primary-btn" onClick={onNext}>Done practicing — start the real study →</button>
      </footer>
    </div>
  )
}
