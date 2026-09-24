// application/frontend/src/explore/A2ABrowse.jsx
//
// The 6 Claude ablation variants (capped/no-thinking/element-cap/human-style
// /human-style-no-numbers, plus uncapped again) live in their own dedicated
// section — see ClaudeAblationsBrowse.jsx — so this page is scoped to the 3
// base speakers only. claude_uncapped intentionally appears in both places.
import SessionCarousel from './SessionCarousel'
import BackLink from './BackLink'
import { a2aData } from './loadExploreData'
import { BASE_A2A_CONDITIONS } from './conditions'

const baseSessions = a2aData.sessions.filter((s) => BASE_A2A_CONDITIONS.includes(s.condition))

export default function A2ABrowse() {
  return (
    <div>
      <BackLink to="/">Data Explorer</BackLink>
      <h1>AI Sessions</h1>
      <SessionCarousel sessions={baseSessions} basePath="/a2a" conditionOf={(s) => s.condition} />
    </div>
  )
}
