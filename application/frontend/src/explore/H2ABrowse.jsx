// application/frontend/src/explore/H2ABrowse.jsx
import SessionCarousel from './SessionCarousel'
import BackLink from './BackLink'
import { h2aData } from './loadExploreData'

export default function H2ABrowse() {
  return (
    <div>
      <BackLink to="/">Data Explorer</BackLink>
      <h1>Human Sessions</h1>
      <SessionCarousel sessions={h2aData.sessions} basePath="/h2a" />
    </div>
  )
}
