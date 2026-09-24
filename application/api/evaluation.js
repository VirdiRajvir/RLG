/**
 * api/evaluation.js
 * Wireframe accuracy evaluation pipeline — v3.0
 *
 * Main export:
 *   evaluateGeneration(browser, genHtml) → payload | null
 *
 * v3.0 approach: label-based exact matching
 * ───────────────────────────────────────────
 * The reference HTML gives every box a unique numbered text label
 * ("text-1", "text-2", "link-1", "button-3", …). Users prompt the LLM
 * using these labels. The evaluator then:
 *
 *   1. Extracts all elements whose textContent matches /^[a-z]+-\d+$/i
 *      from both pages (position + size per element).
 *   2. Matches by EXACT label string — no Hungarian, no cost function.
 *   3. Computes geometric accuracy (IoU, position, size) per matched pair.
 *   4. Penalises:
 *        - Missing labels  → recall penalty  (ref box absent from generated)
 *        - Extra labels    → precision penalty (gen box label not in reference)
 *   5. Returns a JSONB-ready payload for Supabase.
 *
 * Composite: F1(0.40) + mean_IoU(0.40) + mean_size_accuracy(0.20)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const REF_PATH = path.resolve(__dirname, '../frontend/public/reference.html');
export const VIEWPORT = { width: 1080, height: 900 };
const ALGO_VER = '4.0';

// Pattern that every labeled box must match: one-or-more letters, a dash, digits.
// e.g. "text-1", "link-12", "button-3", "image-2", "icon-5"
const LABEL_PATTERN = /^[a-z]+-\d+$/i;

// Module-level cache: reference boxes extracted once per cold start.
// Cleared automatically if the server restarts.
let _refCache = null;

// ── Utilities ──────────────────────────────────────────────────────────────────

const r3 = v => {
  const n = Number(v);
  return (!isFinite(n) || isNaN(n)) ? 0 : Math.round(n * 1000) / 1000;
};

function spatialDist(a, b) {
  const cx1 = a.nx + a.nw / 2, cy1 = a.ny + a.nh / 2;
  const cx2 = b.nx + b.nw / 2, cy2 = b.ny + b.nh / 2;
  return Math.min(1, Math.sqrt((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2));
}

function sizeDiff(a, b) {
  const ar = a.nw * a.nh, bg = b.nw * b.nh;
  if (ar === 0 && bg === 0) return 0;
  return 1 - Math.min(ar, bg) / Math.max(ar, bg);
}

function boxIoU(a, b) {
  const xo = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const yo = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = xo * yo;
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

// ── Label-based matching ───────────────────────────────────────────────────────

/**
 * Match reference and generated box arrays by exact label string.
 *
 * - ref box found in gen   → match (compute geometry)
 * - ref box NOT in gen     → unmatchedRef (recall penalty)
 * - gen box NOT in ref     → unmatchedGen (precision penalty)
 *
 * Duplicate labels within one page are resolved by keeping the element with
 * the largest bounding-box area (outermost visual container wins).
 * This is already handled by extractBoxes/extractRefBoxes at extraction time.
 */
function matchBoxes(refBoxes, genBoxes) {
  if (refBoxes.length === 0) {
    return {
      matches:      [],
      unmatchedRef: [],
      unmatchedGen: genBoxes.map((_, i) => i),
    };
  }

  // Index both lists by label (labels are already lowercased at extraction)
  const refByLabel = {};
  refBoxes.forEach((b, i) => { refByLabel[b.label] = { box: b, idx: i }; });

  const genByLabel = {};
  genBoxes.forEach((b, i) => { genByLabel[b.label] = { box: b, idx: i }; });

  const matches      = [];
  const matchedRefIdx = new Set();
  const matchedGenIdx = new Set();

  for (const [label, { box: r, idx: ri }] of Object.entries(refByLabel)) {
    if (!(label in genByLabel)) continue;

    const { box: g, idx: gi } = genByLabel[label];
    matchedRefIdx.add(ri);
    matchedGenIdx.add(gi);

    const iouVal   = r3(boxIoU(r, g));
    const posAcc   = r3(Math.max(0, 1 - spatialDist(r, g)));

    // Viewport-relative width accuracy: how closely do the boxes occupy
    // the same fraction of the viewport width?
    const maxNw    = Math.max(r.nw, g.nw);
    const relWidth = maxNw > 0 ? r3(1 - Math.abs(r.nw - g.nw) / maxNw) : 1;

    // Aspect ratio accuracy: shape similarity independent of absolute size.
    // ar = height / width; guard against zero-width elements.
    const arRef  = r.nw > 0 ? r.nh / r.nw : 0;
    const arGen  = g.nw > 0 ? g.nh / g.nw : 0;
    const maxAr  = Math.max(arRef, arGen);
    const aspAcc = maxAr > 0 ? r3(1 - Math.abs(arRef - arGen) / maxAr) : 1;

    matches.push({
      label,
      ref_id:              ri,
      gen_id:              gi,
      iou:                 iouVal,
      position_accuracy:   posAcc,
      rel_width_accuracy:  relWidth,
      aspect_ratio_accuracy: aspAcc,
      match_score: r3(0.20 * posAcc + 0.30 * relWidth + 0.25 * aspAcc),
    });
  }

  return {
    matches,
    unmatchedRef: refBoxes.map((_, i) => i).filter(i => !matchedRefIdx.has(i)),
    unmatchedGen:  genBoxes.map((_, i) => i).filter(i => !matchedGenIdx.has(i)),
  };
}

// ── Aggregate metrics ──────────────────────────────────────────────────────────

function computeMetrics(matches, refBoxes, genBoxes) {
  const n = refBoxes.length;   // total reference labels
  const m = genBoxes.length;   // total labeled boxes found in generated
  const k = matches.length;    // exact-label matches

  const recall    = n > 0 ? k / n : 0;
  const precision = m > 0 ? k / m : 0;
  const f1 = (recall + precision) > 0
    ? 2 * recall * precision / (recall + precision)
    : 0;

  const avg = key => k > 0 ? matches.reduce((s, x) => s + x[key], 0) / k : 0;

  const meanIou      = avg('iou');
  const meanPosAcc   = avg('position_accuracy');
  const meanRelWidth = avg('rel_width_accuracy');
  const meanAspAcc   = avg('aspect_ratio_accuracy');

  // Composite v4.0 — recall-weighted spatial terms:
  //   recall × (0.25 + 0.20·pos + 0.30·rel_width + 0.25·aspect_ratio)
  //
  // Factoring recall out of all spatial terms guarantees monotonicity:
  // matching more labeled boxes always increases the composite, even if
  // the new boxes have lower spatial quality than previously matched ones.
  // Equivalent to: each spatial sum is divided by n_ref (not k), so
  // missing boxes contribute 0 rather than dragging down the mean.
  const composite = recall * (0.25 + 0.20 * meanPosAcc + 0.30 * meanRelWidth + 0.25 * meanAspAcc);

  return {
    ref_box_count:              n,
    gen_box_count:              m,
    matched_count:              k,
    recall:                     r3(recall),
    precision:                  r3(precision),
    f1:                         r3(f1),
    mean_iou:                   r3(meanIou),
    mean_position_accuracy:     r3(meanPosAcc),
    mean_rel_width_accuracy:    r3(meanRelWidth),
    mean_aspect_ratio_accuracy: r3(meanAspAcc),
    composite_score:            r3(composite),
  };
}

// ── Section scores ─────────────────────────────────────────────────────────────

function computeSectionScores(matches, refBoxes) {
  const secs = {};

  for (const rb of refBoxes) {
    const s = rb.section || 'other';
    if (!secs[s]) secs[s] = { matches: [], refCount: 0 };
    secs[s].refCount++;
  }
  for (const m of matches) {
    const s = refBoxes[m.ref_id]?.section || 'other';
    secs[s]?.matches.push(m);
  }

  const result = {};
  for (const [sec, { matches: sm, refCount }] of Object.entries(secs)) {
    const k       = sm.length;
    const recall  = refCount > 0 ? k / refCount : 0;
    const meanIou = k > 0 ? sm.reduce((s, x) => s + x.iou, 0) / k : 0;
    result[sec] = {
      recall:    r3(recall),
      mean_iou:  r3(meanIou),
      composite: r3(0.5 * recall + 0.5 * meanIou),
      matched:   k,
      total:     refCount,
    };
  }
  return result;
}

// ── DOM extraction (injected into Puppeteer pages) ────────────────────────────
//
// Both functions query every DOM element, filter to those whose trimmed
// textContent matches the label pattern (e.g. "text-1", "link-4"), then
// deduplicate by keeping the element with the LARGEST bounding-box area for
// each label (i.e. the outermost visual container wins over inner children).

/**
 * extractBoxes — for generated pages.
 * Returns { boxes, viewportWidth, pageHeight }.
 */
export async function extractBoxes(page) {
  return page.evaluate(() => {
    // Kept in sync with application/api/_lib/labelMatch.js (unit-tested
    // there) — this is a literal duplicate because Puppeteer's
    // page.evaluate() serializes this callback's source to run in the
    // browser page, which cannot import external modules.
    function normalizeLabelText(s) {
      return s.toLowerCase().replace(/[\s_]+/g, '-').replace(/([a-z])(\d)/g, '$1-$2');
    }
    const LABEL_TOKEN_RE = /([a-z]+-\d+)/;
    const VW = document.documentElement.clientWidth || 1080;
    const PH = Math.max(
      document.body?.scrollHeight    ?? 0,
      document.documentElement.scrollHeight,
    );

    // label → best candidate (largest area). Restricted to LEAF elements (no
    // element children) — this is what makes lenient "contains" matching
    // safe: a wrapper's textContent is the concatenation of everything
    // nested inside it, so without the leaf restriction every ancestor of a
    // real label would also "contain" it, and the largest-area tie-break
    // below would always pick the wrong, huge ancestor instead of the real
    // box. A wrapper always has children, so it can never enter this loop.
    const candidates = {};

    for (const el of document.querySelectorAll('*')) {
      if (el.children.length > 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 3 || rect.height < 3) continue;

      const m = normalizeLabelText(el.textContent.trim()).match(LABEL_TOKEN_RE);
      if (!m) continue;
      const text = m[1];

      const area = rect.width * rect.height;
      if (!candidates[text] || area > candidates[text].area) {
        candidates[text] = { el, rect, area };
      }
    }

    // geometryEl is retained only for the childLabels containment pass
    // below, then dropped along with `boxMeta` — Puppeteer can't serialize
    // live DOM elements back out of page.evaluate() to Node.
    const boxes = [];
    const boxMeta = [];
    for (const [label, { el, rect: tagRect }] of Object.entries(candidates)) {
      // Containers: the corner tag itself is small and not the box of
      // interest — its PARENT is the actual wrapping element. This resolves
      // nesting for free: a container-2 tag nested inside container-1
      // independently resolves to its own (inner) parent, regardless of
      // depth — no ancestor search, no ambiguity.
      const isContainer = label.startsWith('container-');
      const geometryEl  = isContainer ? el.parentElement : el;
      const rect        = isContainer ? geometryEl.getBoundingClientRect() : tagRect;

      const style  = getComputedStyle(geometryEl);
      const br     = parseFloat(style.borderRadius) || 0;
      const absY   = rect.top + window.scrollY;
      boxes.push({
        x:  rect.left,
        y:  absY,
        w:  rect.width,
        h:  rect.height,
        nx: rect.left   / VW,
        ny: absY        / PH,
        nw: rect.width  / VW,
        nh: rect.height / PH,
        label,
        tag:      geometryEl.tagName,
        isCircle: br >= rect.width * 0.4 && Math.abs(rect.width - rect.height) < 8,
        childLabels: [],
      });
      boxMeta.push({ label, geometryEl });
    }

    // childLabels: for every container box, find every OTHER box whose
    // geometryEl is a DOM descendant of this container's geometryEl — exact
    // structural containment (not geometric/IoU guesswork), possible
    // because this runs inside the real page DOM. Transitive by
    // construction: a leaf two containers deep shows up in both the inner
    // and outer container's childLabels with no extra code for depth.
    const byLabel = new Map(boxes.map((b) => [b.label, b]));
    for (const { label, geometryEl } of boxMeta) {
      if (!label.startsWith('container-')) continue;
      const box = byLabel.get(label);
      box.childLabels = boxMeta
        .filter((o) => o.label !== label && geometryEl.contains(o.geometryEl))
        .map((o) => o.label);
    }

    return { boxes, viewportWidth: VW, pageHeight: PH };
  });
}

/**
 * extractRefBoxes — for the reference page.
 * Same as extractBoxes but also annotates each box with its page `section`
 * (header, sidebar, main_content, …) for per-section metrics.
 */
export async function extractRefBoxes(page) {
  return page.evaluate(() => {
    // Kept in sync with application/api/_lib/labelMatch.js (unit-tested
    // there) — this is a literal duplicate because Puppeteer's
    // page.evaluate() serializes this callback's source to run in the
    // browser page, which cannot import external modules.
    function normalizeLabelText(s) {
      return s.toLowerCase().replace(/[\s_]+/g, '-').replace(/([a-z])(\d)/g, '$1-$2');
    }
    const LABEL_TOKEN_RE = /([a-z]+-\d+)/;
    const VW = document.documentElement.clientWidth || 1080;
    const PH = Math.max(
      document.body?.scrollHeight    ?? 0,
      document.documentElement.scrollHeight,
    );

    function getSection(el) {
      let cur = el;
      while (cur && cur !== document.body) {
        if (cur.tagName === 'HEADER') return 'header';
        if (cur.tagName === 'FOOTER') return 'footer';
        const cl = cur.classList;
        if (cl.contains('footer-icons'))                                  return 'footer_icons';
        if (cl.contains('footer-attr'))                                   return 'footer';
        if (cl.contains('intro-strip'))                                   return 'intro';
        if (cl.contains('sidebar-designs')  ||
            cl.contains('sidebar-archives') ||
            cl.contains('sidebar-resources')||
            cl.contains('sidebar'))                                       return 'sidebar';
        if (cl.contains('tinted-main') || cl.contains('lower-sections')) return 'lower_sections';
        if (cur.tagName === 'MAIN' || cl.contains('main-content'))        return 'main_content';
        cur = cur.parentElement;
      }
      return 'other';
    }

    // label → best candidate (largest area). Restricted to LEAF elements (no
    // element children) — this is what makes lenient "contains" matching
    // safe: a wrapper's textContent is the concatenation of everything
    // nested inside it, so without the leaf restriction every ancestor of a
    // real label would also "contain" it, and the largest-area tie-break
    // below would always pick the wrong, huge ancestor instead of the real
    // box. A wrapper always has children, so it can never enter this loop.
    const candidates = {};

    for (const el of document.querySelectorAll('*')) {
      if (el.children.length > 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 3 || rect.height < 3) continue;

      const m = normalizeLabelText(el.textContent.trim()).match(LABEL_TOKEN_RE);
      if (!m) continue;
      const text = m[1];

      const area = rect.width * rect.height;
      if (!candidates[text] || area > candidates[text].area) {
        candidates[text] = { el, rect, area };
      }
    }

    const boxes = [];
    const boxMeta = [];
    for (const [label, { el, rect: tagRect }] of Object.entries(candidates)) {
      const isContainer = label.startsWith('container-');
      const geometryEl  = isContainer ? el.parentElement : el;
      const rect        = isContainer ? geometryEl.getBoundingClientRect() : tagRect;

      const style  = getComputedStyle(geometryEl);
      const br     = parseFloat(style.borderRadius) || 0;
      const absY   = rect.top + window.scrollY;
      boxes.push({
        x:  rect.left,
        y:  absY,
        w:  rect.width,
        h:  rect.height,
        nx: rect.left   / VW,
        ny: absY        / PH,
        nw: rect.width  / VW,
        nh: rect.height / PH,
        label,
        tag:      geometryEl.tagName,
        isCircle: br >= rect.width * 0.4 && Math.abs(rect.width - rect.height) < 8,
        section:  getSection(geometryEl),
        childLabels: [],
      });
      boxMeta.push({ label, geometryEl });
    }

    const byLabel = new Map(boxes.map((b) => [b.label, b]));
    for (const { label, geometryEl } of boxMeta) {
      if (!label.startsWith('container-')) continue;
      const box = byLabel.get(label);
      box.childLabels = boxMeta
        .filter((o) => o.label !== label && geometryEl.contains(o.geometryEl))
        .map((o) => o.label);
    }

    return { boxes, viewportWidth: VW, pageHeight: PH };
  });
}

// ── Reference caching ──────────────────────────────────────────────────────────

async function getRefCache(browser) {
  if (_refCache) return _refCache;

  const refHtml = fs.readFileSync(REF_PATH, 'utf8');
  const page    = await browser.newPage();
  try {
    await page.setViewport(VIEWPORT);
    await page.setContent(refHtml, { waitUntil: 'networkidle0' });
    const data = await extractRefBoxes(page);
    _refCache  = data;
    console.log(`[eval] Reference cached: ${data.boxes.length} labeled boxes`);
    if (data.boxes.length === 0) {
      console.warn(
        '[eval] WARNING: 0 reference boxes found. ' +
        'Make sure reference.html box text contents match pattern /^[a-z]+-\\d+$/i ' +
        '(e.g. "text-1", "link-3", "button-2").'
      );
    }
    return data;
  } finally {
    await page.close();
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * evaluateGeneration(browser, genHtml)
 *
 * Runs the full v3.0 evaluation pipeline against the reference wireframe.
 * Reuses the already-open Puppeteer browser instance from the screenshot step.
 *
 * @param {import('puppeteer').Browser} browser
 * @param {string} genHtml  Raw HTML string of the generated page
 * @returns {object|null}   JSONB payload or null on any failure
 */
export async function evaluateGeneration(browser, genHtml) {
  const t0 = Date.now();
  try {
    // 1. Reference boxes (cached after first call per server instance)
    const refData = await getRefCache(browser);

    // 2. Generated boxes
    const genPage = await browser.newPage();
    let genData;
    try {
      await genPage.setViewport(VIEWPORT);
      await genPage.setContent(genHtml, { waitUntil: 'networkidle0' });
      genData = await extractBoxes(genPage);
    } finally {
      await genPage.close();
    }
    const tExtract = Date.now();

    console.log(
      `[eval] ref=${refData.boxes.length} labeled boxes, ` +
      `gen=${genData.boxes.length} labeled boxes`
    );

    // 3. Match by exact label
    const { matches, unmatchedRef, unmatchedGen } =
      matchBoxes(refData.boxes, genData.boxes);
    const tMatch = Date.now();

    // 4. Metrics
    const metrics       = computeMetrics(matches, refData.boxes, genData.boxes);
    const sectionScores = computeSectionScores(matches, refData.boxes);

    const payload = {
      viewport:          VIEWPORT,
      page_height_ref:   refData.pageHeight,
      page_height_gen:   genData.pageHeight,
      reference_boxes:   refData.boxes,
      generated_boxes:   genData.boxes,
      matches,
      unmatched_ref:     unmatchedRef,
      unmatched_gen:     unmatchedGen,
      metrics,
      section_scores:    sectionScores,
      algorithm_version: ALGO_VER,
      label_pattern:     LABEL_PATTERN.toString(),
      extraction_time_ms: tExtract - t0,
      matching_time_ms:   tMatch - tExtract,
      total_eval_time_ms: Date.now() - t0,
    };

    console.log(
      `[eval] composite=${metrics.composite_score} ` +
      `matched=${metrics.matched_count}/${metrics.ref_box_count} ` +
      `(recall=${metrics.recall} precision=${metrics.precision} f1=${metrics.f1}) ` +
      `(${Date.now() - t0}ms)`
    );

    return payload;

  } catch (err) {
    console.error('[eval] Evaluation failed:', err.message, err.stack);
    return null;
  }
}
