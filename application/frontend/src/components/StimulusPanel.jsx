// application/frontend/src/components/StimulusPanel.jsx
//
// Stimuli are static HTML/CSS; FixedViewportFrame sandboxes the iframe so a
// candidate page can never run script in the rater's session. Shared
// between the real trial view (Annotation.jsx) and the tutorial's practice
// trial (TutorialTrial.jsx).
import FixedViewportFrame from './FixedViewportFrame'

export default function StimulusPanel({ html, tone, eyebrow, title, hint }) {
  return (
    <div className={`bp-panel bp-panel--${tone}`}>
      <div className="bp-panel-bar">
        <span className="bp-panel-eyebrow">{eyebrow}</span>
        <span className="bp-panel-title">{title}</span>
        {hint && <span className="bp-panel-hint">{hint}</span>}
      </div>
      <div className="bp-panel-frame">
        <FixedViewportFrame html={html} grayscale={tone === 'target'} />
      </div>
    </div>
  )
}
