// application/frontend/src/explore/Explore.jsx
import { Routes, Route } from 'react-router-dom'
import ExploreLanding from './ExploreLanding'
import LayoutGenBrowse from './LayoutGenBrowse'
import H2ADetail from './H2ADetail'
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
        <Route path="/layout-gen" element={<LayoutGenBrowse />} />
        {/* The browse pages for these two merged into /layout-gen, but each
            dataset keeps its own session detail page, and the Claude
            ablations page links into the a2a one too. */}
        <Route path="/h2a/:id" element={<H2ADetail />} />
        <Route path="/a2a/:id" element={<A2ADetail />} />
        <Route path="/claude-ablations" element={<ClaudeAblationsBrowse />} />
        <Route path="/prefelic" element={<PrefelicBrowse />} />
        <Route path="/prefelic/:id" element={<PrefelicDetail />} />
      </Routes>
    </div>
  )
}
