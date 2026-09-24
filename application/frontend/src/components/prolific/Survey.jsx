// application/frontend/src/components/prolific/Survey.jsx
import { useState } from 'react'
import { Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import './Survey.css'

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

const SCALE = [1, 2, 3, 4, 5]

export default function Survey({ onNext, remaining, prolificPid }) {
  const [strategyDescription, setStrategyDescription] = useState('')
  const [strategyChange, setStrategyChange] = useState('')
  const [correctionApproach, setCorrectionApproach] = useState('')
  const [usedLabels, setUsedLabels] = useState(null) // true | false | null (unanswered)
  const [usedLabelsDetail, setUsedLabelsDetail] = useState('')
  const [elementVsGoal, setElementVsGoal] = useState(null)
  const [confidenceMatch, setConfidenceMatch] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // All fields optional — a blank submit is a valid submit, same as leaving
  // fields blank ahead of the timeout below. Failures are logged, never
  // surfaced: same convention as the judgments insert in Annotation.jsx —
  // a lost survey row must never trap a participant short of their
  // completion code.
  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const { error } = await supabase.from('survey_responses').insert({
        prolific_pid: prolificPid,
        strategy_description: strategyDescription || null,
        strategy_change_across_sessions: strategyChange || null,
        correction_approach: correctionApproach || null,
        used_box_container_labels: usedLabels,
        used_box_container_labels_detail: usedLabelsDetail || null,
        element_vs_goal_balance: elementVsGoal,
        confidence_match: confidenceMatch,
      })
      if (error) console.warn('[study] survey insert failed:', error.message)
    } catch (e) {
      console.warn('[study] survey not recorded:', e.message)
    } finally {
      onNext()
    }
  }

  return (
    <div className="sv-root">
      <div className="sv-card">
        <span className="sv-eyebrow">Almost done</span>
        <h1>A few questions about how you worked</h1>
        <p className="sv-lede">
          This isn&apos;t about the app itself — we&apos;re interested in how you approached the
          task. Every question is optional, and this doesn&apos;t affect your completion or payment.
        </p>

        <div className="sv-field">
          <label>What overall strategy did you use to describe what you wanted to the AI?</label>
          <textarea
            rows={3}
            value={strategyDescription}
            onChange={(e) => setStrategyDescription(e.target.value)}
          />
        </div>

        <div className="sv-field">
          <label>Did your approach change between your two sessions? If so, how?</label>
          <textarea
            rows={3}
            value={strategyChange}
            onChange={(e) => setStrategyChange(e.target.value)}
          />
        </div>

        <div className="sv-field">
          <label>When the page didn&apos;t match, how did you decide what to say next?</label>
          <textarea
            rows={3}
            value={correctionApproach}
            onChange={(e) => setCorrectionApproach(e.target.value)}
          />
        </div>

        <div className="sv-field">
          <label>Did you refer to the labels from the reference image (e.g. &quot;box-3&quot;, &quot;container-1&quot;) directly in your prompts?</label>
          <div className="sv-yesno">
            <label className="sv-radio">
              <input type="radio" name="used-labels" checked={usedLabels === true} onChange={() => setUsedLabels(true)} />
              <span>Yes</span>
            </label>
            <label className="sv-radio">
              <input type="radio" name="used-labels" checked={usedLabels === false} onChange={() => setUsedLabels(false)} />
              <span>No</span>
            </label>
          </div>
          {usedLabels === true && (
            <textarea
              className="sv-detail"
              rows={2}
              placeholder="Anything about how you used them?"
              value={usedLabelsDetail}
              onChange={(e) => setUsedLabelsDetail(e.target.value)}
            />
          )}
        </div>

        <div className="sv-field">
          <label>How did you balance describing individual elements vs. the overall look/goal?</label>
          <div className="sv-scale">
            <span className="sv-scale-end">Individual elements</span>
            {SCALE.map((n) => (
              <label className="sv-radio sv-radio--scale" key={n}>
                <input type="radio" name="element-vs-goal" checked={elementVsGoal === n} onChange={() => setElementVsGoal(n)} />
                <span>{n}</span>
              </label>
            ))}
            <span className="sv-scale-end">Overall goal</span>
          </div>
        </div>

        <div className="sv-field">
          <label>How confident are you that your final page matched the target?</label>
          <div className="sv-scale">
            <span className="sv-scale-end">Not confident</span>
            {SCALE.map((n) => (
              <label className="sv-radio sv-radio--scale" key={n}>
                <input type="radio" name="confidence-match" checked={confidenceMatch === n} onChange={() => setConfidenceMatch(n)} />
                <span>{n}</span>
              </label>
            ))}
            <span className="sv-scale-end">Very confident</span>
          </div>
        </div>

        <p className={`sv-timer-note ${remaining <= 60 ? 'sv-timer--warn' : ''}`}>
          <Clock size={14} /> {fmt(remaining)} remaining on this page. Submitting or timing out
          both take you to your completion code — nothing here affects that.
        </p>
        <button className="sv-submit-btn" onClick={handleSubmit} disabled={submitting}>
          Submit and finish →
        </button>
      </div>
    </div>
  )
}
