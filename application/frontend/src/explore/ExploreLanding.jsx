// application/frontend/src/explore/ExploreLanding.jsx
import { Link } from 'react-router-dom'
import { h2aData, a2aData, prefelicData, referencesData } from './loadExploreData'
import { CONDITION_INFO, BASE_A2A_CONDITIONS, CLAUDE_ABLATION_CONDITIONS } from './conditions'

const baseA2ACount = a2aData.sessions.filter((s) => BASE_A2A_CONDITIONS.includes(s.condition)).length
const claudeAblationCount = a2aData.sessions.filter((s) => CLAUDE_ABLATION_CONDITIONS.includes(s.condition)).length
const h2aParticipantCount = new Set(h2aData.sessions.map((s) => s.participant)).size
const prefelicRaterCount = new Set(prefelicData.pairs.flatMap((p) => p.raters.map((r) => r.rater))).size

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
          <Link className="exp-index-row" to="/h2a">
            <div className="exp-index-main">
              <span className="exp-index-title">Human Sessions</span>
              <p className="exp-index-desc">
                Real Prolific participants typing instructions themselves, turn by turn.
              </p>
            </div>
            <span className="exp-index-meta">
              {h2aData.sessions.length} sessions · {h2aParticipantCount} participants
            </span>
          </Link>

          <Link className="exp-index-row" to="/a2a">
            <div className="exp-index-main">
              <span className="exp-index-title">AI Sessions</span>
              <p className="exp-index-desc">
                Claude, Gemini, and Qwen as the speaker in place of a human, each instructing
                the same builder model.
              </p>
            </div>
            <span className="exp-index-meta">
              {baseA2ACount} sessions
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
              {prefelicData.pairs.length} pairs · {prefelicRaterCount} raters
            </span>
          </Link>
        </div>
      </section>

      <p className="exp-tip">
        <strong>Tip:</strong> each page below is a two-level carousel — arrows or dots step
        through references, then through that reference&apos;s sessions or pairs. Press and hold
        an image or prompt to pause its animation; release to resume.
      </p>
    </div>
  )
}
