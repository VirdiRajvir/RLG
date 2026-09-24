// application/frontend/src/explore/BackLink.jsx
//
// Fixed-destination back link — used by the top-level browse ("directory")
// pages to return to the landing page. Always the same destination
// regardless of how the page was reached, so a plain Link is correct here
// (unlike BackButton, which drill-down pages use instead).
import { Link } from 'react-router-dom'
import './BackNav.css'

export default function BackLink({ to, children }) {
  return (
    <Link to={to} className="bn-back exp-link">← {children}</Link>
  )
}
