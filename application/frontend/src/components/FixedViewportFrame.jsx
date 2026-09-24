// application/frontend/src/components/FixedViewportFrame.jsx
//
// Renders `html` at the exact viewport every geometric feature in the paper
// was measured against (VIEWPORT.width = 1080, application/api/evaluation.js:34),
// then scales the whole rendered canvas down via CSS transform to fit
// whatever box the parent gives this component — never re-flowing the
// page's own layout. This is the fixed-canvas + scale-to-fit pattern
// StimulusPanel.jsx and ReferencePanel.jsx each had their own square-only
// copy of; this is the shared, box-shaped generalization both now use.
import { useEffect, useRef, useState } from 'react'
import './FixedViewportFrame.css'

const CANVAS_WIDTH = 1080
// Generous placeholder height for the initial, not-yet-measured render —
// big enough that no real page's content is clipped before its true height
// is read back from the loaded iframe.
const MEASURING_HEIGHT = 2400

export default function FixedViewportFrame({ html, grayscale = false }) {
  const frameRef = useRef(null)
  const iframeRef = useRef(null)
  const [naturalHeight, setNaturalHeight] = useState(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [scale, setScale] = useState(1)

  // New html means a new natural height — force remeasurement rather than
  // briefly showing the previous page's scale/size.
  useEffect(() => {
    setNaturalHeight(null)
  }, [html])

  const handleIframeLoad = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.body) return
    // Some generations style html/body with `height: 100vh` or `100%`
    // instead of natural document flow. Measuring scrollHeight on THAT page
    // is circular before its real height is known — neutralizing height/
    // min-height here makes those sections size to their own content
    // instead, same as every reference and normal-flow generation already
    // does; content-flow pages that never relied on vh/% sizing are
    // unaffected.
    const style = doc.createElement('style')
    style.textContent = 'html, body { height: auto !important; min-height: 0 !important; }'
    doc.head.appendChild(style)
    setNaturalHeight(doc.body.scrollHeight)
  }

  // Deliberately NOT calling getBoundingClientRect() synchronously before
  // observe() — in a production build CSS can apply after the JS bundle
  // mounts, so a synchronous read here could capture a pre-layout, near-zero
  // frame size and lock in a bad scale. ResizeObserver's spec-guaranteed
  // initial callback fires after layout — that's the only measurement used.
  useEffect(() => {
    if (!frameRef.current) return
    const el = frameRef.current
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect()
      setBox({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!naturalHeight || !box.width || !box.height) return
    setScale(Math.min(box.width / CANVAS_WIDTH, box.height / naturalHeight, 1))
  }, [naturalHeight, box])

  return (
    <div className="fvf-frame" ref={frameRef}>
      {html
        ? (
          <div className="fvf-box" style={{ width: box.width, height: box.height }}>
            <div
              className="fvf-canvas"
              style={{
                width: CANVAS_WIDTH,
                height: naturalHeight || MEASURING_HEIGHT,
                transform: `scale(${scale})`,
                visibility: naturalHeight ? 'visible' : 'hidden',
              }}
            >
              <iframe
                ref={iframeRef}
                className={`fvf-iframe${grayscale ? ' fvf-iframe--grayscale' : ''}`}
                srcDoc={html}
                title="Rendered page"
                sandbox="allow-same-origin"
                onLoad={handleIframeLoad}
              />
            </div>
          </div>
        )
        : <div className="fvf-empty">Loading…</div>}
    </div>
  )
}
