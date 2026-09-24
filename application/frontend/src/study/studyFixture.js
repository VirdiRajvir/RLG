// ── Binary Preference Study — local FIXTURE corpus ────────────────────────────
//
// Lets the annotation frontend run END-TO-END with no backend. Navigate to
//   /prefelic?mock=1
// and loadStudy() returns this fixture instead of querying Supabase, so the full
// rater flow (instructions → all-pairs judging → done screen, with progress bar,
// gold interleaving, and left/right randomization) can be verified before the real
// messages → study_candidates ingest exists.
//
// The pairing here MIRRORS what the backend must produce: exhaustive C(K,2) among
// the real candidates + one gold pair (strongest real vs a deliberately-broken
// page). The real study uses K=6; the fixture uses K=4 per reference to keep a
// verification pass short (3 refs × (C(4,2)=6 + 1 gold) = 21 trials).

// Tiny deterministic RNG so the fixture renders identically on every load (the
// per-trial shuffle/left-right randomization still uses Math.random at runtime).
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

// Minimal wireframe renderer: absolutely-positioned labeled boxes (% units) into
// a sandboxed, inline-styled document (no external resources — works under
// iframe sandbox=""). Mirrors the "labeled box" aesthetic of the real corpus.
function wf(boxes, bg = '#ffffff') {
  const blocks = boxes
    .map(
      (b) => `<div style="position:absolute;top:${b.top}%;left:${b.left}%;` +
        `width:${b.w}%;height:${b.h}%;background:${b.fill || '#e5e7eb'};` +
        `border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;` +
        `display:flex;align-items:center;justify-content:center;color:#64748b;` +
        `font:600 11px system-ui,sans-serif;letter-spacing:.05em;` +
        `text-transform:uppercase;overflow:hidden;">${b.label}</div>`
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"></head>` +
    `<body style="margin:0;height:100vh;background:${bg};position:relative;` +
    `font-family:system-ui,sans-serif;">${blocks}</body></html>`
}

// Degrade a base layout by `sev` (0 = pristine): jitter each box's position/size,
// and at high severity drop the last box (a missing section). Deterministic per
// (base, seed) so candidates are stable across reloads.
function perturb(boxes, sev, seed) {
  const r = rng(seed)
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  let out = boxes.map((b) => {
    const jx = (r() - 0.5) * sev * 30
    const jy = (r() - 0.5) * sev * 30
    const sw = 1 + (r() - 0.5) * sev
    const sh = 1 + (r() - 0.5) * sev
    return {
      ...b,
      left: clamp(b.left + jx, 0, 95),
      top: clamp(b.top + jy, 0, 95),
      w: clamp(b.w * sw, 4, 95),
      h: clamp(b.h * sh, 3, 95),
    }
  })
  if (sev > 0.7 && out.length > 3) out = out.slice(0, -1) // drop a section
  return out
}

const ACCENT = '#c7d2fe'

// Three reference archetypes (the Targets), each a coherent labeled layout.
const BASES = [
  {
    id: 'ref-landing',
    boxes: [
      { label: 'header', top: 4, left: 5, w: 90, h: 8 },
      { label: 'hero', top: 16, left: 5, w: 90, h: 26, fill: ACCENT },
      { label: 'card-1', top: 48, left: 5, w: 28, h: 22 },
      { label: 'card-2', top: 48, left: 36, w: 28, h: 22 },
      { label: 'card-3', top: 48, left: 67, w: 28, h: 22 },
      { label: 'footer', top: 74, left: 5, w: 90, h: 18 },
    ],
  },
  {
    id: 'ref-blog',
    boxes: [
      { label: 'header', top: 4, left: 5, w: 90, h: 8 },
      { label: 'title', top: 16, left: 5, w: 58, h: 10 },
      { label: 'article', top: 30, left: 5, w: 58, h: 64 },
      { label: 'sidebar', top: 16, left: 67, w: 28, h: 78, fill: ACCENT },
    ],
  },
  {
    id: 'ref-dashboard',
    boxes: [
      { label: 'sidebar', top: 4, left: 3, w: 18, h: 92, fill: ACCENT },
      { label: 'topbar', top: 4, left: 24, w: 73, h: 10 },
      { label: 'stat-1', top: 18, left: 24, w: 16, h: 18 },
      { label: 'stat-2', top: 18, left: 43, w: 16, h: 18 },
      { label: 'stat-3', top: 18, left: 62, w: 16, h: 18 },
      { label: 'chart', top: 40, left: 24, w: 73, h: 54, fill: ACCENT },
    ],
  },
]

// Gold sentinel: a deliberately-broken page (one stray box) — obviously a worse
// match than any real candidate, so it filters careless raters.
const BROKEN = wf([{ label: '404', top: 42, left: 38, w: 24, h: 14, fill: '#fecaca' }], '#fafafa')

// K real candidates per reference at rising severity → visibly better/worse pages.
const SEVERITIES = [0.12, 0.38, 0.62, 0.85]

function buildFixture() {
  const references = []
  const candidates = []
  const pairs = []
  let pid = 0

  BASES.forEach((base, bi) => {
    references.push({ id: base.id, html: wf(base.boxes) })

    // real candidates (stable identity order = severity order)
    const reals = SEVERITIES.map((sev, k) => {
      const id = `${base.id}-c${k + 1}`
      candidates.push({ id, reference_id: base.id, html: wf(perturb(base.boxes, sev, bi * 97 + k * 13 + 1)) })
      return id
    })
    // gold-broken candidate
    const goldId = `${base.id}-gold`
    candidates.push({ id: goldId, reference_id: base.id, html: BROKEN })

    // exhaustive C(K,2) real pairs (candidate_a = lower index = stable identity)
    for (let i = 0; i < reals.length; i++) {
      for (let j = i + 1; j < reals.length; j++) {
        pairs.push({ id: `p${pid++}`, reference_id: base.id, candidate_a: reals[i], candidate_b: reals[j], is_gold: false })
      }
    }
    // gold pair: strongest real (index 0, lowest severity) vs broken sentinel
    pairs.push({ id: `p${pid++}`, reference_id: base.id, candidate_a: reals[0], candidate_b: goldId, is_gold: true })
  })

  return { references, candidates, pairs }
}

const FIXTURE = buildFixture()

export function loadFixtureStudy() {
  return Promise.resolve(FIXTURE)
}

// True when the URL opts into fixture mode (?mock=1).
export function isMockMode() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('mock') === '1'
}
