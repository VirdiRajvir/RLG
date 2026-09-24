// ── Box extraction ───────────────────────────────────────────────────────────
// Reuses the PRODUCTION extractors from the app, so candidate/reference geometry
// is byte-identical to what the live metric computes (no extraction drift at
// calibration time). The only app machinery we skip is getRefCache (which is
// wired to the single hardcoded reference) — we render our own HTML instead.

import { extractBoxes, extractRefBoxes, VIEWPORT } from '../application/api/evaluation.js'

/**
 * Render an HTML string in a fresh page and return its labeled boxes.
 * @param browser  a live Puppeteer browser (reused across the whole run)
 * @param html     the page to render
 * @param isReference  use extractRefBoxes (adds per-box `section`) for targets
 * @returns the boxes array (x/y/w/h + normalized coords + label)
 */
export async function extractFromHtml(browser, html, { isReference = false } = {}) {
  const page = await browser.newPage()
  try {
    // Same viewport for references AND candidates — coordinates are only
    // comparable if everything was measured in the same window.
    await page.setViewport(VIEWPORT)
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const data = isReference ? await extractRefBoxes(page) : await extractBoxes(page)
    return data.boxes
  } finally {
    await page.close()
  }
}
