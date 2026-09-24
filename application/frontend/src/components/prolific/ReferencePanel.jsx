// application/frontend/src/components/prolific/ReferencePanel.jsx
import FixedViewportFrame from '../FixedViewportFrame'

export default function ReferencePanel({ html, label }) {
  return (
    <aside className="ps-ref" data-tutorial="reference-panel">
      <div className="ps-ref-bar">
        <span className="ps-ref-eyebrow">Reference</span>
        {label && <span className="ps-ref-label">{label}</span>}
      </div>
      <div className="ps-ref-frame">
        <FixedViewportFrame html={html} />
      </div>
    </aside>
  )
}
