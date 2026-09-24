// application/frontend/src/components/prolific/TutorialGuide.jsx
import { useLayoutEffect, useRef, useState } from 'react'
import './TutorialGuide.css'

const STEPS = [
  {
    target: '[data-tutorial="reference-panel"]',
    title: 'The reference',
    body: 'This is what you’ll recreate. Every box has a label like box-6 or box-12 — refer to these labels in your prompts. Don’t ask to remove or hide these labels — they need to stay visible for the study to track your changes.',
  },
  {
    target: '[data-tutorial="prompt-input"]',
    title: 'Describe one section at a time',
    body: 'Type what to build here. Reference elements by their box label, and build section by section rather than all at once. You have 3 prompts on this practice page, so use them wisely.',
  },
  {
    target: '[data-tutorial="send-button"]',
    title: 'Send it',
    body: 'Press Enter or click here. You’ll see a confirmation step before anything is actually sent.',
  },
  {
    target: '[data-tutorial="done-button"]',
    title: 'Ready for the real thing',
    body: 'Practice as many turns as you like here — none of it counts. When you’re comfortable, click here to begin the timed study.',
  },
]

const MARGIN = 10

export default function TutorialGuide({ onFinish }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState(null)
  const [cardPos, setCardPos] = useState({ top: MARGIN, left: MARGIN })
  const cardRef = useRef(null)
  const step = STEPS[stepIndex]

  // The tutorial page's own layout never moves under normal use, but a window
  // resize (or a participant zooming) would otherwise leave the spotlight out
  // of sync with the element it's supposed to be pointing at.
  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(step.target)
      setRect(el ? el.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step.target])

  // Second pass: place the card beside the target using the card's OWN
  // measured size (its text length varies per step), falling back to above
  // the target when there isn't room below.
  useLayoutEffect(() => {
    if (!rect || !cardRef.current) return
    const card = cardRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const placeBelow = spaceBelow >= card.height + MARGIN * 2 || spaceBelow >= rect.top
    const top = placeBelow
      ? Math.min(rect.bottom + MARGIN, window.innerHeight - card.height - MARGIN)
      : Math.max(rect.top - card.height - MARGIN, MARGIN)
    const left = Math.min(
      Math.max(rect.left, MARGIN),
      window.innerWidth - card.width - MARGIN
    )
    setCardPos({ top, left })
  }, [rect, stepIndex])

  const isFirst = stepIndex === 0
  const isLast = stepIndex === STEPS.length - 1

  return (
    <div className="tg-root">
      {rect && (
        <>
          <div className="tg-dim" style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top - MARGIN) }} />
          <div className="tg-dim" style={{ top: rect.bottom + MARGIN, left: 0, right: 0, bottom: 0 }} />
          <div className="tg-dim" style={{ top: rect.top - MARGIN, left: 0, width: Math.max(0, rect.left - MARGIN), height: rect.height + MARGIN * 2 }} />
          <div className="tg-dim" style={{ top: rect.top - MARGIN, left: rect.right + MARGIN, right: 0, height: rect.height + MARGIN * 2 }} />
          <div
            className="tg-ring"
            style={{ top: rect.top - MARGIN, left: rect.left - MARGIN, width: rect.width + MARGIN * 2, height: rect.height + MARGIN * 2 }}
          />
        </>
      )}
      <div ref={cardRef} className="tg-card" style={{ top: cardPos.top, left: cardPos.left }}>
        <span className="tg-step-count">Step {stepIndex + 1} of {STEPS.length}</span>
        <h4>{step.title}</h4>
        <p>{step.body}</p>
        <div className="tg-actions">
          <button className="tg-skip" onClick={onFinish}>Skip walkthrough</button>
          <div className="tg-nav">
            <button className="tg-prev" onClick={() => setStepIndex((i) => i - 1)} disabled={isFirst}>
              Previous
            </button>
            <button className="tg-next" onClick={() => (isLast ? onFinish() : setStepIndex((i) => i + 1))}>
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
