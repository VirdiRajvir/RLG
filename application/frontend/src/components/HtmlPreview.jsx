import { useRef, useEffect, useState, useMemo } from 'react'
import { Maximize2, Minimize2, ExternalLink } from 'lucide-react'
import './HtmlPreview.css'

// Some stored messages predate the server-side fence strip in chat.js (or the
// model wraps its output despite being asked for raw HTML) — only strips when
// the ENTIRE trimmed content is one fenced block, so partial/legit backticks
// elsewhere in the page are left alone.
function stripCodeFence(text) {
  if (typeof text !== 'string') return text
  const match = text.trim().match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1] : text
}

function HtmlPreview({ html, turn }) {
  const iframeRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [iframeHeight, setIframeHeight] = useState(500)
  const cleanHtml = useMemo(() => stripCodeFence(html), [html])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !cleanHtml) return

    const doc = iframe.contentDocument || iframe.contentWindow.document
    doc.open()
    doc.write(cleanHtml)
    doc.close()

    // Adjust height after content loads
    const adjustHeight = () => {
      try {
        const body = doc.body
        const docEl = doc.documentElement
        if (body && docEl) {
          const height = Math.max(
            body.scrollHeight,
            body.offsetHeight,
            docEl.scrollHeight,
            docEl.offsetHeight
          )
          setIframeHeight(Math.max(300, Math.min(height + 20, expanded ? 90 * window.innerHeight / 100 : 600)))
        }
      } catch {
        // cross-origin restrictions won't apply here since we write directly
      }
    }

    // Wait a bit for styles/images to load
    setTimeout(adjustHeight, 200)
    setTimeout(adjustHeight, 1000)
  }, [cleanHtml, expanded])

  const toggleExpand = () => setExpanded(prev => !prev)

  const openInNewTab = () => {
    const newWindow = window.open('', '_blank')
    if (newWindow) {
      newWindow.document.open()
      newWindow.document.write(cleanHtml)
      newWindow.document.close()
    }
  }

  return (
    <div className={`html-preview ${expanded ? 'expanded' : ''}`}>
      <div className="preview-toolbar">
        <span className="preview-label">
          Live Preview {turn ? `(Turn ${turn})` : ''}
        </span>
        <div className="preview-toolbar-actions">
          <button className="expand-btn" onClick={openInNewTab} title="Open in new tab">
            <ExternalLink size={14} />
          </button>
          <button className="expand-btn" onClick={toggleExpand} title={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>
      <div className="preview-frame-wrapper" style={{ height: expanded ? '80vh' : `${iframeHeight}px` }}>
        <iframe
          ref={iframeRef}
          className="preview-iframe"
          title={`Preview turn ${turn}`}
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
        />
      </div>
    </div>
  )
}

export default HtmlPreview
