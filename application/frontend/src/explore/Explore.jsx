// application/frontend/src/explore/Explore.jsx
import { Routes, Route } from 'react-router-dom'
import ExploreLanding from './ExploreLanding'
import H2ABrowse from './H2ABrowse'
import H2ADetail from './H2ADetail'
import A2ABrowse from './A2ABrowse'
import A2ADetail from './A2ADetail'
import ClaudeAblationsBrowse from './ClaudeAblationsBrowse'
import PrefelicBrowse from './PrefelicBrowse'
import PrefelicDetail from './PrefelicDetail'
import './Explore.css'

export default function Explore() {
  return (
    <div className="exp-root">
      <Routes>
        <Route path="/" element={<ExploreLanding />} />
        <Route path="/h2a" element={<H2ABrowse />} />
        <Route path="/h2a/:id" element={<H2ADetail />} />
        <Route path="/a2a" element={<A2ABrowse />} />
        <Route path="/a2a/:id" element={<A2ADetail />} />
        <Route path="/claude-ablations" element={<ClaudeAblationsBrowse />} />
        <Route path="/prefelic" element={<PrefelicBrowse />} />
        <Route path="/prefelic/:id" element={<PrefelicDetail />} />
      </Routes>
    </div>
  )
}
