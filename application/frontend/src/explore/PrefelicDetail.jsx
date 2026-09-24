// application/frontend/src/explore/PrefelicDetail.jsx
import { useParams, Link } from 'react-router-dom'
import FixedViewportFrame from '../components/FixedViewportFrame'
import BackButton from './BackButton'
import { prefelicData, referenceById } from './loadExploreData'

export default function PrefelicDetail() {
  const { id } = useParams()
  const pair = prefelicData.pairs.find((p) => p.id === id)
  if (!pair) return <p>Pair not found. <Link to="/prefelic" className="exp-link">Back to pairs</Link></p>
  const ref = referenceById(pair.reference_id)
  const chose = { a: pair.raters.filter((r) => r.choice === 'a'), b: pair.raters.filter((r) => r.choice === 'b') }

  return (
    <div>
      <BackButton />
      <h1>Preference pair</h1>
      <div className="pd-panels">
        <div className="pd-panel">
          <span>Reference — {ref?.name}</span>
          <div className="pd-frame"><FixedViewportFrame html={ref?.html} grayscale /></div>
        </div>
        <div className="pd-panel">
          <span>Candidate A</span>
          <div className="pd-frame"><FixedViewportFrame html={pair.candidate_a.html} /></div>
          {pair.candidate_a.h2a_session_id
            ? (
              <Link to={`/h2a/${pair.candidate_a.h2a_session_id}`} className="exp-link">
                From H2A session, turn {pair.candidate_a.h2a_turn} →
              </Link>
            )
            /* the gold_broken QC sentinel candidate has no h2a_session_id —
               it was never a real H2A turn, so there's nothing to link to */
            : <span className="pd-no-link">Synthetic QC candidate (no source session)</span>}
        </div>
        <div className="pd-panel">
          <span>Candidate B</span>
          <div className="pd-frame"><FixedViewportFrame html={pair.candidate_b.html} /></div>
          {pair.candidate_b.h2a_session_id
            ? (
              <Link to={`/h2a/${pair.candidate_b.h2a_session_id}`} className="exp-link">
                From H2A session, turn {pair.candidate_b.h2a_turn} →
              </Link>
            )
            : <span className="pd-no-link">Synthetic QC candidate (no source session)</span>}
        </div>
      </div>
      <h2>Rater choices ({pair.raters.length})</h2>
      <div className="pd-raters">
        <div className="pd-rater-group">
          <span className="pd-rater-group-label">Chose A ({chose.a.length})</span>
          <div className="pd-rater-chips">
            {chose.a.map((r) => <span key={r.rater} className="pd-rater-chip">{r.rater}</span>)}
          </div>
        </div>
        <div className="pd-rater-group">
          <span className="pd-rater-group-label">Chose B ({chose.b.length})</span>
          <div className="pd-rater-chips">
            {chose.b.map((r) => <span key={r.rater} className="pd-rater-chip">{r.rater}</span>)}
          </div>
        </div>
      </div>
    </div>
  )
}
