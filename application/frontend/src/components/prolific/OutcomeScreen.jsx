// application/frontend/src/components/prolific/OutcomeScreen.jsx
import { useEffect } from 'react'

const MESSAGES = {
  completed: 'All done — thank you for participating.',
  partial: 'Your session ended early. Thank you for the time you gave.',
  declined: 'Thanks for considering the study.',
}

export default function OutcomeScreen({ outcome, redirectCode, isTest, onReset }) {
  useEffect(() => {
    if (isTest || !redirectCode) return
    window.location.assign(`https://app.prolific.com/submissions/complete?cc=${redirectCode}`)
  }, [isTest, redirectCode])

  if (isTest) {
    return (
      <div className="ps-root ps-center">
        <div>
          <p>Test run complete — would redirect with code: <strong>{redirectCode || outcome?.toUpperCase()}</strong></p>
          <button className="ps-next-btn" onClick={onReset}>Reset and start over</button>
        </div>
      </div>
    )
  }

  return (
    <div className="ps-root ps-center">
      <div>
        <p>{MESSAGES[outcome] || 'Thank you.'}</p>
        {redirectCode ? (
          <p className="ps-outcome-code">
            If you are not redirected automatically, enter this code on Prolific: <strong>{redirectCode}</strong>
          </p>
        ) : outcome !== 'declined' && (
          <p className="ps-outcome-code">
            We couldn&apos;t determine your completion code automatically — please contact the researcher.
          </p>
        )}
      </div>
    </div>
  )
}
