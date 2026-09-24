// ── Corpus references & their 5-turn prompt ladders ──────────────────────────
//
// 6 references (5 scored study references + the apothecary practice
// reference). HTML is loaded from the repo-root /references folder (single
// source of truth — the verified wireframes), so this file stays readable.
//
// Each `prompts` array is a 5-turn conversation that iteratively builds a
// labeled grey-box wireframe toward the reference. The runner feeds them turn by
// turn (the model sees its own previous output each turn = memory), capturing
// each turn as a candidate (tier = turn_1 … turn_5). Quality climbs across turns.
//
// Why the prompts look the way they do — the metric matches a candidate's boxes
// to the reference's boxes BY LABEL (text-1 ↔ text-1). So every ladder:
//   • states the labeling rule in turn 1, and
//   • introduces labels sequentially in reading order (text-1, text-2, …),
//     matching how the references are labeled — so omitting later sections in an
//     early turn is a recall miss, not a label mismatch.

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const REF_DIR = join(dirname(fileURLToPath(import.meta.url)), '../references')
const html = (file) => readFileSync(join(REF_DIR, file), 'utf8')

// Shared labeling rule, prepended to every turn-1 prompt.
const RULE =
  'Build ONE self-contained HTML page with inline CSS — a grey-box WIREFRAME on a ' +
  'light background. Every block is a plain rounded grey placeholder box containing ' +
  'exactly one short monospace label of the form letters-number (text-1, link-2, ' +
  'image-3, button-1) and NO other words. Label text blocks text-1, text-2, … in ' +
  'reading order, links link-1, link-2, …, images image-1, …, buttons button-1, …. ' +
  'Return only the HTML.'

export const REFERENCES = [
  {
    name: 'midcentury',
    html: html('midcentury-wireframe.html'),
    prompts: [
      `${RULE} Start with a muted blue header bar: two stacked title boxes text-1 (large) and text-2 on the left, and a cluster of navigation links link-1 … link-6 on the right.`,
      `Below the header add a row of three equal large image cards image-1, image-2, image-3.`,
      `Under the cards add a two-column body: a narrow left column with heading text-3 and two paragraphs text-4, text-5.`,
      `In the wide right column add heading text-6 then alternating subheadings and paragraphs: text-7, text-8, subheading text-9, text-10, subheading text-11, text-12, subheading text-13, text-14.`,
      `Add a footer bar with links link-7, link-8, link-9, a label text-15, and link-10. Balance the column widths (narrow left ~230px) so it matches a clean mid-century three-card layout.`,
    ],
  },
  {
    name: 'stickynotes',
    html: html('stickynotes-wireframe.html'),
    prompts: [
      `${RULE} Use a warm tan background. Start with a cream header bar: a small logo image-1, a title text-1, and three dropdown-style boxes link-1, link-2, link-3 on the right.`,
      `Below the header add an intro row: a square image image-2 on the left next to a paragraph text-2 and two small download links link-4, link-5.`,
      `Add a horizontal row of FIVE equal card columns. In card 1 put heading text-3 and paragraphs text-4, text-5; in card 2 heading text-6 and paragraphs text-7, text-8.`,
      `Fill the remaining cards: card 3 heading text-9 and a tall paragraph text-10; card 4 heading text-11 and paragraphs text-12, text-13.`,
      `In card 5 add heading text-14, paragraphs text-15, text-16, and a small link link-6. Make the five cards look like equal sticky-note columns with light shadows.`,
    ],
  },
  {
    name: 'retro',
    html: html('retro-wireframe.html'),
    prompts: [
      `${RULE} Use a bright blue page background with a single narrow centered cream column (~520px) holding everything. Start the column with a colourful banner title text-1 and a subtitle text-2.`,
      `Add a row with a badge image image-1 beside a paragraph text-3, then a row of two small icons image-2, image-3 with a label text-4, then a heading text-5 and two paragraphs text-6, text-7.`,
      `Add a dashed-border box with heading text-8 and paragraph text-9, a dark banner image-4, a paragraph text-10, and a bright yellow paragraph box text-11.`,
      `Add a badge image-5 beside paragraph text-12, a rainbow banner image-6, paragraphs text-13, text-14, text-15, and a row of five small buttons link-1 … link-5.`,
      `Add a dark banner image-7, a boxed design list link-6 … link-10, a small banner image-8, and a final row of three badges image-9, image-10, image-11. Keep everything centered and busy like a 90s page.`,
    ],
  },
  {
    name: 'darkminimal',
    html: html('darkminimal-wireframe.html'),
    prompts: [
      `${RULE} Use a dark charcoal background with faint grey boxes. Start with a left sidebar (~210px): a small round image image-1 next to a label text-1, then a design list of links link-1 … link-8.`,
      `Continue the sidebar: a round image image-2 with label text-2 and links link-9, link-10, then a round image image-3 with label text-3 and links link-11 … link-15.`,
      `In the large right area place a big image image-4 at the top, then a wide intro paragraph text-4. Keep lots of empty space.`,
      `Add two sparse content rows, each a content box on the left and a large faint section-label box on the right: text-6 with faint label text-5, and text-8 with faint label text-7.`,
      `Add two more such rows — text-10 with faint label text-9, and text-12 with faint label text-11 — and a small link link-16 at the bottom. Keep it minimal and very dark.`,
    ],
  },
  {
    name: 'steel',
    html: html('steel-wireframe.html'),
    prompts: [
      `${RULE} Use a very dark background with steel grey-blue panels, slightly skewed/angled. Put a skewed banner image-1 across the top.`,
      `Add a left sidebar of angled panels: a heading text-1 with a design list link-1 … link-8, a heading text-2 with links link-9, link-10, and a heading text-3 with links link-11 … link-15.`,
      `In the centre add a column of angled content panels: heading text-4 with paragraph text-5, and heading text-6 with paragraph text-7.`,
      `Add two more centre panels: heading text-8 with paragraph text-9, and heading text-10 with paragraph text-11.`,
      `On the right add a narrow column: a heading text-12 with a tall paragraph text-13, and a small panel text-14 with a link link-16. Skew the panels a few degrees so it looks industrial.`,
    ],
  },
  {
    name: 'apothecary',
    html: html('apothecary-wireframe.html'),
    prompts: [
      `${RULE} Use a light cream background. Make a narrow left sidebar holding an intro paragraph text-1 and a lotus image image-1 at the bottom.`,
      `In the wide main area add a top row with a heading text-2 on the left and a red torii image image-2 in the top-right corner (not overlapping the text), then a wide paragraph text-3.`,
      `Add two sections of wide text rows: heading text-4 with paragraphs text-5, text-6, and heading text-7 with paragraph text-8.`,
      `Add two more sections: heading text-9 with paragraph text-10, and heading text-11 with paragraphs text-12, text-13.`,
      `Add a wide image image-3 anchored to the bottom-right and a footer row of five small links link-1 … link-5. Keep the text rows full-width and airy.`,
    ],
  },
]

// Mirrors application/api/chat.js BASE_SYSTEM_PROMPT exactly.
export const BASE_SYSTEM_PROMPT =
  'Return only full HTML code. Do not include any explanations, comments, or text outside of the HTML.'

// The deliberately-broken sentinel candidate (one per reference). An attentive
// rater must never prefer this over a real candidate; pairs against it are
// flagged is_gold and used to filter inattentive raters.
export const GOLD_BROKEN_HTML =
  '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body></body></html>'
