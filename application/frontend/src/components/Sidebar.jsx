

import { PanelRightOpen, PanelRightClose } from 'lucide-react'
import './Sidebar.css'

const MIN_WIDTH = 280
const MAX_WIDTH = 900
const DEFAULT_WIDTH = 380


function Sidebar({ isOpen, onToggle }) {
  // Use the public directory for static assets in Vite/React
  const referenceHtmlSrc = '/reference.html' // This should match the file in public/



  return (
    <>
      {/* Toggle button - always visible */}

      <button
        className={`sidebar-toggle ${isOpen ? 'open' : 'closed'}`}
        onClick={onToggle}
        title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        style={isOpen ? { right: '50vw' } : undefined}
      >
        {isOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
      </button>

      {/* Sidebar panel */}
      <div
        className={`sidebar ${isOpen ? 'open' : 'closed'}`}
        style={isOpen ? { width: '50vw' } : undefined}
      >
        <div className="sidebar-content" style={isOpen ? { width: '100%' } : undefined}>
          <h3 className="sidebar-heading">Reference image for prompting and constraints</h3>
          <div className="sidebar-preview-container">
            <iframe
              src={referenceHtmlSrc}
              className="sidebar-preview-iframe"
              title="Reference HTML preview"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            />
          </div>
        </div>
      </div>
    </>
  )
}

export default Sidebar
