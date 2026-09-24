// application/frontend/src/explore/PrefelicBrowse.jsx
//
// Same two-level carousel pattern as SessionCarousel: pick a reference
// (arrows + dots), then step through that reference's pairs one at a time
// (arrows + dots) — no page-scrolling list. Toggling gold/QC pairs changes
// which references/pairs exist at all, so it resets back to the first of
// each rather than leaving stale indices pointing at whatever used to be
// there.
import { useEffect, useMemo, useState } from 'react'
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
  const [showGold, setShowGold] = useState(false)
  const [refIndex, setRefIndex] = useState(0)
  const [pairIndex, setPairIndex] = useState(0)

  const visiblePairs = useMemo(
    () => prefelicData.pairs.filter((p) => (showGold ? true : !p.is_gold)),
    [showGold]
  )

  const byReference = useMemo(() => {
    const groups = new Map()
    for (const p of visiblePairs) {
      if (!groups.has(p.reference_id)) groups.set(p.reference_id, [])
      groups.get(p.reference_id).push(p)
    }
    return groups
  }, [visiblePairs])

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

  // Toggling gold pairs changes which references/pairs even exist — start
  // over at the first of each rather than an index that may now point
  // somewhere else entirely.
  useEffect(() => {
    setRefIndex(0)
    setPairIndex(0)
  }, [showGold])

  return (
    <div>
      <BackLink to="/">Data Explorer</BackLink>
      <h1>Preference Judgments</h1>
      <label className="pb-gold-toggle">
        <input type="checkbox" checked={showGold} onChange={() => setShowGold((v) => !v)} />
        Show gold/QC pairs
      </label>

      {referenceIds.length === 0
        ? <p className="pb-empty">No pairs match the current filter.</p>
        : (
          <>
            <div className="pb-nav">
              <button type="button" className="pb-nav-btn" onClick={() => goToReference(safeRefIndex - 1)} aria-label="Previous reference">←</button>
              <span className="pb-nav-label">{currentRef?.name ?? currentRefId}</span>
              <div className="pb-dots">
                {referenceIds.map((refId, i) => (
                  <button
                    key={refId}
                    type="button"
                    className={`pb-dot${i === safeRefIndex ? ' pb-dot--active' : ''}`}
                    onClick={() => goToReference(i)}
                    aria-label={`Go to ${referenceById(refId)?.name ?? refId}`}
                  />
                ))}
              </div>
              <button type="button" className="pb-nav-btn" onClick={() => goToReference(safeRefIndex + 1)} aria-label="Next reference">→</button>
            </div>

            <div className="pb-row">
              <div className="pb-frames">
                <div className="pb-target">
                  <div className="pb-target-frame"><FixedViewportFrame html={currentRef?.html} grayscale /></div>
                  <span>{currentRef?.name}</span>
                </div>
                <CandidateCell candidate={pair.candidate_a} won={pair.winner === 'a'} />
                <CandidateCell candidate={pair.candidate_b} won={pair.winner === 'b'} />
              </div>
              <div className="pb-outcome">
                <p>{pair.split.a} vs {pair.split.b} · winner: {pair.winner ?? 'tie'}</p>
                <Link to={`/prefelic/${pair.id}`} className="exp-link">Details →</Link>
              </div>
            </div>

            {currentPairs.length > 1 && (
              <div className="pb-nav">
                <button type="button" className="pb-nav-btn" onClick={() => goToPair(safePairIndex - 1)} aria-label="Previous pair">←</button>
                <span className="pb-nav-label">Pair {safePairIndex + 1} of {currentPairs.length}</span>
                <div className="pb-dots">
                  {currentPairs.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`pb-dot${i === safePairIndex ? ' pb-dot--active' : ''}`}
                      onClick={() => goToPair(i)}
                      aria-label={`Go to pair ${i + 1}`}
                    />
                  ))}
                </div>
                <button type="button" className="pb-nav-btn" onClick={() => goToPair(safePairIndex + 1)} aria-label="Next pair">→</button>
              </div>
            )}
          </>
        )}
    </div>
  )
}
