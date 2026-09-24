// application/frontend/src/components/ConsentScreen.jsx
import { useState } from 'react'
import { Clock } from 'lucide-react'
import './ConsentScreen.css'

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// NTU-IRB Ref No. IRB-2025-996 — verbatim approved consent text (adapted from
// h2a's own approved consent for this shorter, layout-judgment task). Do not
// reword or reorder without IRB sign-off.
const CONSENT_PARAGRAPHS = [
  'You are invited to participate in a research study on how people communicate and collaborate when solving tasks, both with other humans and with AI systems. This study is conducted by Dr. Yewen Pu, Assistant Professor, School of Computer Science and Engineering, Nanyang Technological University.',
  'This study will take approximately 10-15 minutes of your time per session. During the session, you will be shown a target webpage layout alongside pairs of AI-generated layouts and asked to judge which one more closely matches the target.',
  'Your participation in this study is completely voluntary, and you have the right to withdraw from the study at any time without any penalty. You may skip any questions you do not wish to answer. If you do not wish to complete this survey, just close your browser.',
  'Your participation in this research will be kept confidential. All data will be stored anonymously, and no identifying information (such as your name or IP address) will be collected. Results will be analysed in aggregate and may be disseminated through academic publications, conference presentations, and open research datasets. This study will contribute to understanding how humans and AI systems communicate and collaborate effectively.',
  'You will be compensated for your time according to the platform’s payment rules. There are no foreseeable risks to individuals participating in this study beyond those encountered in ordinary online activities.',
  'If you have questions about this project, please contact Rajvir Singh at rajvirsi001@e.ntu.edu.sg or Dr. Yewen Pu at yewen.pu@ntu.edu.sg.',
  'This project has been reviewed and approved by the NTU-Institutional Review Board (NTU-IRB). Questions about your rights as a participant may be directed to IRB@ntu.edu.sg or call 6592 2495.',
  'Please print a copy of this consent form for your records if desired.',
]

const CERTIFY_TEXT = 'I have read and understood the above consent form. I certify that I am 21 years old or older and, by clicking “Next” to enter the study, I indicate my willingness to voluntarily take part in the research.'

export default function ConsentScreen({ onDecide, remaining }) {
  const [certified, setCertified] = useState(false)

  return (
    <div className="cs-root">
      <div className="cs-card">
        <p className="cs-eyebrow">NTU-IRB Ref No.: IRB-2025-996</p>
        <h1>Understanding Human Communication and Collaboration with AI Systems</h1>
        {/* App shell (App.css) is a zero-scroll html/body/#root; the long consent
            text gets its own bounded, internally-scrollable region so the actions
            below it are always reachable regardless of content length — same
            pattern as components/prolific/ConsentScreen.css. */}
        <div className="cs-body">
          {CONSENT_PARAGRAPHS.map((p, i) => (
            <p key={i} className="cs-para">{p}</p>
          ))}
        </div>
        <label className="cs-checkbox">
          <input
            type="checkbox"
            checked={certified}
            onChange={(e) => setCertified(e.target.checked)}
          />
          <span>{CERTIFY_TEXT}</span>
        </label>
        <div className="cs-actions">
          <button className="cs-decline" onClick={() => onDecide(false)}>
            I do not wish to participate
          </button>
          <button className="cs-agree" onClick={() => onDecide(true)} disabled={!certified}>
            Next →
          </button>
        </div>
        {typeof remaining === 'number' && (
          <p className="cs-timer-note">
            <Clock size={14} /> {fmt(remaining)} remaining to decide
          </p>
        )}
      </div>
    </div>
  )
}
