// application/frontend/src/components/prolific/TutorialPractice.jsx
import { useState } from 'react'
import { Clock, HelpCircle } from 'lucide-react'
import ChatInterface from '../ChatInterface'
import ReferencePanel from './ReferencePanel'
import TutorialGuide from './TutorialGuide'

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function TutorialPractice({ authToken, remaining, onNext, practiceRef, loadError }) {
  const [showGuide, setShowGuide] = useState(true)
  if (!practiceRef) {
    // A failed lookup must say so rather than spin until the practice timer
    // expires and quietly ends the study.
    if (loadError) {
      return (
        <div className="ps-root ps-center">
          <div>
            <p>{loadError}</p>
            <p className="ps-error-note">
              Please reload this page. If it still doesn&apos;t load, the practice timer will
              run out and the study will close with your progress saved.
            </p>
          </div>
        </div>
      )
    }
    return <div className="ps-root ps-center"><div className="ps-spinner" /></div>
  }
  return (
    <div className="ps-root">
      <header className="ps-header">
        <span className="ps-title">Practice round</span>
        <span className={`ps-timer ${remaining <= 60 ? 'ps-timer--warn' : ''}`}>
          <Clock size={14} /> {fmt(remaining)} remaining
        </span>
        <button className="ps-icon-btn" onClick={() => setShowGuide(true)} title="Show walkthrough again">
          <HelpCircle size={16} />
        </button>
        <button className="ps-next-btn" onClick={onNext} data-tutorial="done-button">
          Done practicing — start the real study →
        </button>
      </header>
      {remaining > 0 && remaining <= 60 && (
        <p className="ps-timeout-banner">
          <Clock size={14} /> Less than a minute left. Click &quot;Done practicing&quot; now, or this
          page will time out and the study will end automatically.
        </p>
      )}
      <p className="ps-tutorial-note">
        This is a <strong>practice page</strong>. It doesn&apos;t count toward your results, and
        you have <strong>3 prompts</strong> here to get comfortable with the chat and the box
        labels before moving on.
      </p>
      <div className="ps-body ps-body--split">
        <div className="ps-main">
          <ChatInterface authToken={authToken} referenceId={practiceRef.id} isTutorial hideHeader />
        </div>
        <ReferencePanel html={practiceRef.html} label={practiceRef.name} />
      </div>
      {showGuide && <TutorialGuide onFinish={() => setShowGuide(false)} />}
    </div>
  )
}
