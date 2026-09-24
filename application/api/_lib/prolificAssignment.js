// Shape of the study, shared by every JS consumer on both sides of the app.
//
// NUM_SLOTS / TOTAL_SESSIONS are imported by AdminDashboard.jsx and
// ProlificStudy.jsx so the "10 slots" and "2 sessions" figures live in exactly
// one place — an earlier resize from 8 to 10 slots left a hardcoded `8` behind
// in the admin dashboard, which is precisely the drift this prevents.
//
// slotForSeq / appendStageLog / isValidTransition below are INTENTIONALLY not
// called from the request path: the real slot assignment has to happen inside
// prolific_claim_assignment() in SQL, under an advisory lock, to be race-safe,
// and this module makes no claim to replace it. They are kept as a
// unit-testable mirror of that SQL logic (see prolificAssignment.test.js) so a
// future change to the SQL that contradicts the documented scheme has something
// concrete to be checked against.
export const NUM_SLOTS = 10
export const TOTAL_SESSIONS = 2

export function slotForSeq(seq) {
  return ((seq - 1) % NUM_SLOTS) + 1
}

export function appendStageLog(log, stage, enteredAt, extra = {}) {
  const entries = Array.isArray(log) ? log : []
  return [...entries, { stage, entered_at: enteredAt, ...extra }]
}

const STAGE_ORDER = ['instructions', 'tutorial', 'session', 'done']

export function isValidTransition(from, to) {
  const fromIdx = STAGE_ORDER.indexOf(from)
  const toIdx = STAGE_ORDER.indexOf(to)
  if (fromIdx === -1 || toIdx === -1) return false
  return toIdx === fromIdx + 1
}
