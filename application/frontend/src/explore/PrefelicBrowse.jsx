// application/frontend/src/explore/PrefelicBrowse.jsx
//
// A two-level carousel: pick a reference, then step through that reference's
// pairs one at a time — no page-scrolling list. The reference control sits
// above the frames; the pair control sits under them, next to the outcome it
// steps through.
//
// Gold/QC pairs are excluded and have no toggle. They are the attention
// checks raters were screened on — deliberately broken pages paired with
// real ones — so they say nothing about how the corpus was judged, and
// showing them here only invites them to be read as ordinary judgments.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import FixedViewportFrame from '../components/FixedViewportFrame'
import BackLink from './BackLink'
import { prefelicData, referenceById } from './loadExploreData'
import './PrefelicBrowse.css'

const FEATURE_LABELS = {
  f1_recall: 'recall',
  f8_aspect: 'aspect',
  f9_order_consistency: 'order',
  f14_section_uniformity: 'uniformity',
  f7_rel_height: 'rel. height',
}

const visiblePairs = prefelicData.pairs.filter((p) => !p.is_gold)

function CandidateCell({ candidate, won }) {
  return (
    <div className={`pb-candidate${won ? ' pb-candidate--won' : ''}`}>
      <div className="pb-candidate-frame"><FixedViewportFrame html={candidate.html} /></div>
      <table className="pb-feature-table">
        <tbody>
          {Object.entries(FEATURE_LABELS).map(([key, label]) => (
            <tr key={key}><td>{label}</td><td>{candidate.features[key].toFixed(2)}</td></tr>
          ))}
          <tr className="pb-score-row"><td>score</td><td>{candidate.score.toFixed(3)}</td></tr>
        </tbody>
      </table>
    </div>
  )
}

export default function PrefelicBrowse() {
  const [refIndex, setRefIndex] = useState(0)
  const [pairIndex, setPairIndex] = useState(0)

  const byReference = useMemo(() => {
    const groups = new Map()
    for (const p of visiblePairs) {
      if (!groups.has(p.reference_id)) groups.set(p.reference_id, [])
      groups.get(p.reference_id).push(p)
    }
    return groups
  }, [])

  const referenceIds = useMemo(() => [...byReference.keys()], [byReference])
  const safeRefIndex = Math.min(refIndex, Math.max(referenceIds.length - 1, 0))
  const currentRefId = referenceIds[safeRefIndex]
  const currentRef = referenceById(currentRefId)
  const currentPairs = byReference.get(currentRefId) ?? []
  const safePairIndex = Math.min(pairIndex, Math.max(currentPairs.length - 1, 0))
  const pair = currentPairs[safePairIndex]

  const goToReference = (index) => {
    setRefIndex(((index % referenceIds.length) + referenceIds.length) % referenceIds.length)
    setPairIndex(0)
  }

  const goToPair = (index) => {
    setPairIndex(((index % currentPairs.length) + currentPairs.length) % currentPairs.length)
  }

  return (
    <div>
      <BackLink to="/">Data Explorer</BackLink>
      <h1>Preference Judgments</h1>
      <p className="pb-intro">
        The highlighted winner was chosen by the majority of raters. Raters were instructed to
        choose the generation they perceived to be closer to the target than the other one.
      </p>

      {referenceIds.length === 0
        ? <p className="pb-empty">No pairs to show.</p>
        : (
          <>
            <div className="pb-row">
              <div className="pb-frames">
                <div className="pb-target">
                  <div className="pb-target-frame"><FixedViewportFrame html={currentRef?.html} grayscale /></div>
                  <div className="pb-nav pb-nav--ref">
                    <button type="button" className="pb-nav-btn" onClick={() => goToReference(safeRefIndex - 1)} aria-label="Previous reference">←</button>
                    <span className="pb-nav-label">{currentRef?.name ?? currentRefId}</span>
                    <button type="button" className="pb-nav-btn" onClick={() => goToReference(safeRefIndex + 1)} aria-label="Next reference">→</button>
                  </div>
                </div>
                <CandidateCell candidate={pair.candidate_a} won={pair.winner === 'a'} />
                <CandidateCell candidate={pair.candidate_b} won={pair.winner === 'b'} />
              </div>
              <div className="pb-outcome">
                <p>{pair.split.a} vs {pair.split.b} · winner: {pair.winner ?? 'tie'}</p>
                <Link to={`/prefelic/${pair.id}`} className="exp-link">Details →</Link>
              </div>
              {currentPairs.length > 1 && (
                <div className="pb-nav">
                  <button type="button" className="pb-nav-btn" onClick={() => goToPair(safePairIndex - 1)} aria-label="Previous pair">←</button>
                  <span className="pb-nav-label">Pair {safePairIndex + 1} of {currentPairs.length}</span>
                  <button type="button" className="pb-nav-btn" onClick={() => goToPair(safePairIndex + 1)} aria-label="Next pair">→</button>
                </div>
              )}
            </div>
          </>
        )}
    </div>
  )
}
