// Pure geometric feature computation (φ1–φ14) from extracted box arrays.
// refBoxes: from extractRefBoxes (carry .section). genBoxes: from extractBoxes.
// Both boxes use normalized nx,ny,nw,nh in [0,1]. No Puppeteer here → unit-testable.
const EPS = 1e-9
const clamp01 = (x) => Math.max(0, Math.min(1, x))
const cx = (b) => b.nx + b.nw / 2
const cy = (b) => b.ny + b.nh / 2
const r4 = (x) => Math.round(x * 1e4) / 1e4

function alignment(boxes) {
  if (boxes.length < 2) return 0
  const anchors = (b) => [b.nx, b.nx + b.nw / 2, b.nx + b.nw, b.ny, b.ny + b.nh / 2, b.ny + b.nh]
  let sum = 0
  for (let i = 0; i < boxes.length; i++) {
    const ai = anchors(boxes[i])
    let best = Infinity
    for (let a = 0; a < 6; a++) {
      let mind = Infinity
      for (let j = 0; j < boxes.length; j++) {
        if (i === j) continue
        mind = Math.min(mind, Math.abs(ai[a] - anchors(boxes[j])[a]))
      }
      best = Math.min(best, mind)
    }
    sum += best
  }
  return sum / boxes.length // lower = more aligned
}

function overlap(boxes) {
  if (boxes.length < 2) return 0
  let sum = 0, cnt = 0
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      const ix = Math.max(0, Math.min(a.nx + a.nw, b.nx + b.nw) - Math.max(a.nx, b.nx))
      const iy = Math.max(0, Math.min(a.ny + a.nh, b.ny + b.nh) - Math.max(a.ny, b.ny))
      const inter = ix * iy
      const uni = a.nw * a.nh + b.nw * b.nh - inter
      sum += uni > EPS ? inter / uni : 0
      cnt++
    }
  }
  return cnt ? sum / cnt : 0 // mean pairwise IoU
}

function clusters(vals, tol) {
  if (!vals.length) return 0
  const s = [...vals].sort((a, b) => a - b)
  let c = 1
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > tol) c++
  return c
}

export function computeFeatures(refBoxes, genBoxes) {
  const n_ref = refBoxes.length, n_gen = genBoxes.length
  const genByLabel = new Map(genBoxes.map((b) => [b.label, b]))
  const matched = []
  for (const r of refBoxes) { const g = genByLabel.get(r.label); if (g) matched.push({ r, g }) }
  const k = matched.length
  const f = { n_ref, n_gen, k }

  // ── presence ──
  f.f1_recall = n_ref ? k / n_ref : 0
  f.f2_precision = n_gen ? k / n_gen : 0
  const totalRefArea = refBoxes.reduce((s, b) => s + b.nw * b.nh, 0)
  const matchedRefArea = matched.reduce((s, m) => s + m.r.nw * m.r.nh, 0)
  f.f3_area_recall = totalRefArea > EPS ? matchedRefArea / totalRefArea : 0

  // ── position + size (over matched) ──
  if (k > 0) {
    let eu = 0, ch = 0, rw = 0, rh = 0, asp = 0
    for (const { r, g } of matched) {
      const dx = Math.abs(cx(r) - cx(g)), dy = Math.abs(cy(r) - cy(g))
      eu += 1 - Math.min(1, Math.hypot(dx, dy))
      ch += 1 - Math.min(1, Math.max(dx, dy))
      rw += 1 - Math.abs(r.nw - g.nw) / Math.max(r.nw, g.nw, EPS)
      rh += 1 - Math.abs(r.nh - g.nh) / Math.max(r.nh, g.nh, EPS)
      const arr = r.nw > EPS ? r.nh / r.nw : 0
      const arg = g.nw > EPS ? g.nh / g.nw : 0
      asp += 1 - Math.abs(arr - arg) / Math.max(arr, arg, EPS)
    }
    f.f4_pos_euclid = clamp01(eu / k)
    f.f5_pos_chebyshev = clamp01(ch / k)
    f.f6_rel_width = clamp01(rw / k)
    f.f7_rel_height = clamp01(rh / k)
    f.f8_aspect = clamp01(asp / k)
  } else {
    f.f4_pos_euclid = f.f5_pos_chebyshev = f.f6_rel_width = f.f7_rel_height = f.f8_aspect = 0
  }

  // ── f9 order consistency (matched pairs) ──
  if (k >= 2) {
    let tot = 0, sum = 0
    for (let i = 0; i < matched.length; i++) {
      for (let j = i + 1; j < matched.length; j++) {
        const xok = Math.sign(cx(matched[i].r) - cx(matched[j].r)) === Math.sign(cx(matched[i].g) - cx(matched[j].g))
        const yok = Math.sign(cy(matched[i].r) - cy(matched[j].r)) === Math.sign(cy(matched[i].g) - cy(matched[j].g))
        sum += ((xok ? 1 : 0) + (yok ? 1 : 0)) / 2
        tot++
      }
    }
    f.f9_order_consistency = tot ? sum / tot : 1
  } else f.f9_order_consistency = 1 // vacuous (no pairs)

  // ── f10 quadrant agreement (3×3) ──
  const cell = (b) => `${Math.min(2, Math.max(0, Math.floor(3 * cx(b))))},${Math.min(2, Math.max(0, Math.floor(3 * cy(b))))}`
  f.f10_quadrant_agreement = k > 0 ? matched.filter((m) => cell(m.r) === cell(m.g)).length / k : 0

  // ── f11 alignment delta, f12 overlap delta (whole-layout, then |Δ|) ──
  f.f11_alignment_delta = Math.abs(alignment(refBoxes) - alignment(genBoxes))
  f.f12_overlap_delta = Math.abs(overlap(refBoxes) - overlap(genBoxes))

  // ── f13 group-count consistency (rows/cols) ──
  const tol = 0.04
  const rRows = clusters(refBoxes.map(cy), tol), gRows = clusters(genBoxes.map(cy), tol)
  const rCols = clusters(refBoxes.map(cx), tol), gCols = clusters(genBoxes.map(cx), tol)
  const rowC = 1 - Math.abs(rRows - gRows) / Math.max(rRows, gRows, 1)
  const colC = 1 - Math.abs(rCols - gCols) / Math.max(rCols, gCols, 1)
  f.f13_group_count = clamp01((rowC + colC) / 2)

  // ── f14 group uniformity (containment-aware recall, grouped by innermost
  // container membership — replaces the old hardcoded-getSection() version) ──
  //
  // Every ref box's group is the innermost container containing it (found by
  // childLabels — transitive, so a more deeply nested container's set is
  // always a subset of any ancestor's, hence "smallest set wins"), or
  // 'ungrouped' if no container contains it. Ungrouped boxes only need a
  // plain label match to count as recalled; boxes inside a container also
  // need their matched gen box to actually appear in the corresponding gen
  // container's childLabels — i.e. reproduced individually but never wrapped
  // no longer counts as recalled for that group.
  const refContainers = refBoxes.filter((b) => b.label.startsWith('container-'))

  function innermostGroup(label) {
    let best = null
    for (const c of refContainers) {
      if ((c.childLabels || []).includes(label)) {
        if (!best || c.childLabels.length < best.childLabels.length) best = c
      }
    }
    return best ? best.label : 'ungrouped'
  }

  const groupTotal = {}, groupHit = {}
  for (const r of refBoxes) {
    const g = innermostGroup(r.label)
    groupTotal[g] = (groupTotal[g] || 0) + 1

    const gen = genByLabel.get(r.label)
    if (!gen) continue

    let recalled
    if (g === 'ungrouped') {
      recalled = true
    } else {
      const genContainer = genByLabel.get(g)
      recalled = !!genContainer && (genContainer.childLabels || []).includes(r.label)
    }
    if (recalled) groupHit[g] = (groupHit[g] || 0) + 1
  }

  const groupRecalls = Object.keys(groupTotal).map((g) => (groupHit[g] || 0) / groupTotal[g])
  if (groupRecalls.length <= 1) f.f14_section_uniformity = 1
  else {
    const mean = groupRecalls.reduce((a, b) => a + b, 0) / groupRecalls.length
    const std = Math.sqrt(groupRecalls.reduce((a, b) => a + (b - mean) ** 2, 0) / groupRecalls.length)
    f.f14_section_uniformity = clamp01(1 - std)
  }

  // round
  for (const key of Object.keys(f)) if (key.startsWith('f')) f[key] = r4(f[key])
  return f
}
