// application/frontend/src/explore/A2ADetail.jsx
import { useParams, Link } from 'react-router-dom'
import SessionDetail from './SessionDetail'
import BackButton from './BackButton'
import { a2aData } from './loadExploreData'
import { CONDITION_INFO } from './conditions'

export default function A2ADetail() {
  const { id } = useParams()
  const session = a2aData.sessions.find((s) => s.id === id)
  if (!session) return <p>Session not found. <Link to="/layout-gen" className="exp-link">Back to sessions</Link></p>
  return (
    <div>
      <BackButton />
      <h1>AI session — {session.condition}</h1>
      <SessionDetail session={session} outputBorderColor={CONDITION_INFO[session.condition]?.color} />
    </div>
  )
}
