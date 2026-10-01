// application/frontend/src/explore/H2ADetail.jsx
import { useParams, Link } from 'react-router-dom'
import SessionDetail from './SessionDetail'
import BackButton from './BackButton'
import { h2aData } from './loadExploreData'

export default function H2ADetail() {
  const { id } = useParams()
  const session = h2aData.sessions.find((s) => s.id === id)
  if (!session) return <p>Session not found. <Link to="/layout-gen" className="exp-link">Back to sessions</Link></p>
  return (
    <div>
      <BackButton />
      <h1>Human session — {session.participant}</h1>
      <SessionDetail session={session} />
    </div>
  )
}
