// application/frontend/src/explore/BackButton.jsx
//
// Real browser-history back — used by drill-down detail pages. Several of
// these can be reached from more than one parent context: an A2A session
// detail page from either /a2a or /claude-ablations; an H2A session detail
// page from either /h2a or a preference-pair detail page's "From H2A
// session" link. A fixed Link back to one specific parent would be wrong
// whenever the other path was actually used — navigate(-1) always returns
// to wherever the visitor actually came from.
import { useNavigate } from 'react-router-dom'
import './BackNav.css'

export default function BackButton({ children = 'Back' }) {
  const navigate = useNavigate()
  return (
    <button type="button" className="bn-back bn-back--button exp-link" onClick={() => navigate(-1)}>
      ← {children}
    </button>
  )
}
