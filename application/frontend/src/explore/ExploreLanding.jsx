// application/frontend/src/explore/ExploreLanding.jsx
import { Link } from 'react-router-dom'
import { h2aData, a2aData, prefelicData, referencesData } from './loadExploreData'
import { CONDITION_INFO, BASE_A2A_CONDITIONS, CLAUDE_ABLATION_CONDITIONS } from './conditions'

const baseA2ACount = a2aData.sessions.filter((s) => BASE_A2A_CONDITIONS.includes(s.condition)).length
const claudeAblationCount = a2aData.sessions.filter((s) => CLAUDE_ABLATION_CONDITIONS.includes(s.condition)).length
const h2aParticipantCount = new Set(h2aData.sessions.map((s) => s.participant)).size
const prefelicRaterCount = new Set(prefelicData.pairs.flatMap((p) => p.raters.map((r) => r.rater))).size
// Gold/QC pairs are attention checks and are not browsable, so counting them
// here would promise more than the page shows.
const prefelicPairCount = prefelicData.pairs.filter((p) => !p.is_gold).length

function ConditionDot({ condition }) {
  return <span className="exp-dot" style={{ background: CONDITION_INFO[condition].color }} />
}

export default function ExploreLanding() {
  return (
    <div className="exp-landing">
      <div className="exp-landing-header">
        <h1>Data Explorer</h1>
        <p className="exp-landing-source">
          Data behind &quot;Measuring Human-AI and AI-AI Teams in Multi-turn Layout Creation.&quot;
        </p>
      </div>

      <p className="exp-landing-intro">
        In every session, a fixed builder model regenerates a webpage from scratch each turn,
        guided only by instructions from a speaker — a real person or another AI model — who
        can see the page and a hidden reference layout it&apos;s meant to match. This page
        holds every real session from the study, across {referencesData.references.length}{' '}
        reference layouts: the instructions as typed, the pages as generated, and the human
        judgments used to score each attempt.
      </p>

      <section className="exp-glossary" aria-label="Glossary">
        <h2 className="exp-section-heading">Reading a session</h2>
        <dl className="exp-glossary-list exp-box">
          <div className="exp-glossary-row">
            <dt>Reference</dt>
            <dd>the target wireframe a session is trying to recreate, shown grayscale beside every attempt.</dd>
          </div>
          <div className="exp-glossary-row">
            <dt>Turn</dt>
            <dd>one round: an instruction goes in, a freshly regenerated page comes back out.</dd>
          </div>
          <div className="exp-glossary-row">
            <dt>Score</dt>
            <dd>a learned geometric similarity metric, 0 to 1, fit from the real preference judgments.</dd>
          </div>
          <div className="exp-glossary-row">
            <dt>Condition</dt>
            <dd>which speaker — and, for Claude, which instruction-style variant — produced a session.</dd>
          </div>
        </dl>
      </section>

      <section aria-label="Browse the data">
        <h2 className="exp-section-heading">Browse the data</h2>
        <div className="exp-index">
          <Link className="exp-index-row" to="/layout-gen">
            <div className="exp-index-main">
              <span className="exp-index-title">Layout Generation</span>
              <p className="exp-index-desc">
                Human sessions and unrestricted AI sessions on the same references — real
                Prolific participants alongside Claude, Gemini, and Qwen, each instructing the
                same builder model.
              </p>
            </div>
            <span className="exp-index-meta">
              {h2aData.sessions.length + baseA2ACount} sessions · {h2aParticipantCount} participants
              <ConditionDot condition="claude_uncapped" />
              <ConditionDot condition="gemini" />
              <ConditionDot condition="qwen" />
            </span>
          </Link>

          <Link className="exp-index-row" to="/claude-ablations">
            <div className="exp-index-main">
              <span className="exp-index-title">Claude Ablations</span>
              <p className="exp-index-desc">
                The same Claude speaker under six instruction styles, isolating what makes it
                converge faster than everyone else.
              </p>
            </div>
            <span className="exp-index-meta">{claudeAblationCount} sessions</span>
          </Link>

          <Link className="exp-index-row" to="/prefelic">
            <div className="exp-index-main">
              <span className="exp-index-title">Preference Judgments</span>
              <p className="exp-index-desc">
                The pairwise human ratings that fit the scoring metric itself.
              </p>
            </div>
            <span className="exp-index-meta">
              {prefelicPairCount} pairs · {prefelicRaterCount} raters
            </span>
          </Link>
        </div>
      </section>

      <p className="exp-tip">
        <strong>Tip:</strong> both session pages lay each session out as a filmstrip — its
        reference stays on the left while you scroll, drag, or arrow-key along the turns on the
        right. On Layout Generation, the buttons above the strip switch between every session
        for that reference; Claude Ablations steps through its own with Prev/Next. Preference
        Judgments is a carousel instead: arrows or dots step through references, then through
        that reference&apos;s pairs.
      </p>
    </div>
  )
}
