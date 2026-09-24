// Shared across decline (Consent), timeout (any stage), and normal completion
// (last trial) — one place that knows the three VITE_ env vars and the
// redirect URL shape, so all three call sites stay in sync.

const CODES = {
  completed: import.meta.env.VITE_PROLIFIC_CODE_COMPLETED,
  declined: import.meta.env.VITE_PROLIFIC_CODE_DECLINED,
  partial: import.meta.env.VITE_PROLIFIC_CODE_PARTIAL,
}

/**
 * redirectToProlific — navigates to Prolific's completion URL for the given
 * outcome. Returns `false` (and does NOT navigate) if no code is configured
 * for that outcome, so the caller can fall back to an in-app screen instead
 * of navigating to a broken URL — this is the common case for internal/
 * non-Prolific raters and local dev, where no VITE_PROLIFIC_CODE_* vars are
 * set at all.
 */
export function redirectToProlific(outcome) {
  const code = CODES[outcome]
  if (!code) return false
  window.location.assign(`https://app.prolific.com/submissions/complete?cc=${code}`)
  return true
}

/** getProlificCode — looks up the configured code for an outcome without
 * navigating, for test-mode screens that display "would redirect with
 * code: X" instead of actually redirecting. */
export function getProlificCode(outcome) {
  return CODES[outcome] || null
}
