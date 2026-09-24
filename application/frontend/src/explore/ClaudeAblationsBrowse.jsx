// application/frontend/src/explore/ClaudeAblationsBrowse.jsx
//
// All 6 Claude conditions (including claude_uncapped, which also appears in
// the main A2A section as the baseline to compare the other 5 against).
// Reuses A2ADetail as the detail page (basePath="/a2a") since these are the
// same underlying a2a sessions, just a different browse-time grouping.
import SessionCarousel from './SessionCarousel'
import BackLink from './BackLink'
import { a2aData } from './loadExploreData'
import { CLAUDE_ABLATION_CONDITIONS } from './conditions'

const claudeSessions = a2aData.sessions.filter((s) => CLAUDE_ABLATION_CONDITIONS.includes(s.condition))

export default function ClaudeAblationsBrowse() {
  return (
    <div>
      <BackLink to="/">Data Explorer</BackLink>
      <h1>Claude Ablations</h1>
      <SessionCarousel sessions={claudeSessions} basePath="/a2a" conditionOf={(s) => s.condition} />
    </div>
  )
}
