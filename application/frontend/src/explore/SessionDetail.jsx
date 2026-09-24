// application/frontend/src/explore/SessionDetail.jsx
import { useState } from 'react'
import FixedViewportFrame from '../components/FixedViewportFrame'
import { referenceById } from './loadExploreData'
import './SessionDetail.css'

export default function SessionDetail({ session, outputBorderColor }) {
  const [turnIndex, setTurnIndex] = useState(session.turns.length - 1)
  const turn = session.turns[turnIndex]
  const ref = referenceById(session.reference_id)

  return (
    <div className="sd-root">
      <div className="sd-panels">
        <div className="sd-panel">
          <span className="sd-panel-label">Reference</span>
          <div className="sd-frame"><FixedViewportFrame html={ref?.html} grayscale /></div>
        </div>
        <div className="sd-panel">
          <span className="sd-panel-label">Turn {turn.turn} output</span>
          <div
            className="sd-frame"
            style={outputBorderColor ? { borderColor: outputBorderColor, borderWidth: 3, borderStyle: 'solid' } : undefined}
          >
            <FixedViewportFrame html={turn.html} />
          </div>
        </div>
      </div>
      <div className="sd-scrubber">
        {session.turns.map((t, i) => (
          <button
            key={t.turn}
            className={`sd-scrub-btn${i === turnIndex ? ' sd-scrub-btn--active' : ''}`}
            onClick={() => setTurnIndex(i)}
          >
            Turn {t.turn}
          </button>
        ))}
      </div>
      <div className="sd-turn-detail">
        <p className="sd-instruction">{turn.instruction}</p>
        <p className="sd-score">score: {turn.score.toFixed(3)}</p>
      </div>
    </div>
  )
}
