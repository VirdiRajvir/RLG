// data_pipeline/reseed-references.js
//
// Rebuilds study_references from references.js's current content — no
// OpenRouter involved. study_references is the only thing that needs to be
// current for the live app and the analysis pipeline (both read it from the
// DB, not from references.js in-process) to see the new box-N/container-N
// convention. Candidate/pair regeneration is a separate, optional concern
// (generate.js for synthetic, ingest-candidates.js for real) — this script
// does neither, and never deletes a reference (see updateReference's note
// on why: it would cascade-delete any existing candidates/judgments).
//
//   node reseed-references.js          # all references
//   node reseed-references.js steel    # one reference only (smoke test)

import 'dotenv/config'
import puppeteer from 'puppeteer'

import { REFERENCES } from './references.js'
import { extractFromHtml } from './extract.js'
import { referenceExists, insertReference, updateReference } from './supabase.js'

async function main() {
  const only = process.argv[2]
  const todo = only ? REFERENCES.filter((r) => r.name === only) : REFERENCES
  if (only && !todo.length) {
    console.error(`No reference named "${only}". Available:\n  ${REFERENCES.map((r) => r.name).join('\n  ')}`)
    process.exit(1)
  }

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  try {
    for (const ref of todo) {
      const boxes = await extractFromHtml(browser, ref.html, { isReference: true })

      const existingId = await referenceExists(ref.name)
      if (existingId) {
        await updateReference(existingId, { html: ref.html, boxes })
        console.log(`↻ updated "${ref.name}" in place (${boxes.length} boxes) — existing candidates/judgments, if any, untouched`)
      } else {
        await insertReference({ name: ref.name, html: ref.html, boxes })
        console.log(`✓ inserted "${ref.name}": ${boxes.length} boxes`)
      }
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('\n✗ reseed failed:', err.message)
  process.exit(1)
})
