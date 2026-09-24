// application/api/_lib/labelMatch.js
//
// Pure label-matching logic shared by extractBoxes/extractRefBoxes's Puppeteer
// page.evaluate() callbacks in ../evaluation.js. Puppeteer serializes an
// evaluate() callback's source and runs it inside the browser page — it
// cannot import external modules — so this module exists purely so the
// tricky regex/normalization logic has real unit test coverage.
// evaluation.js embeds an identical inline copy of both functions inside
// each page.evaluate() callback (see Task 2). If you change the logic here,
// update both inline copies too.

const LABEL_TOKEN_RE = /([a-z]+-\d+)/

export function normalizeLabelText(s) {
  return s.toLowerCase().replace(/[\s_]+/g, '-').replace(/([a-z])(\d)/g, '$1-$2')
}

export function extractLabelToken(rawText) {
  const m = normalizeLabelText(rawText).match(LABEL_TOKEN_RE)
  return m ? m[1] : null
}
