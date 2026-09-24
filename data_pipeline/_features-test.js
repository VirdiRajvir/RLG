// Verify computeFeatures against hand-computed expected values on tiny layouts.
//   node _features-test.js
import { computeFeatures } from './features-compute.js'

// Two reference boxes: A top-left quadrant, B bottom-right quadrant.
const A = { nx: 0, ny: 0, nw: 0.5, nh: 0.5, label: 'text-1', section: 'header' }
const B = { nx: 0.5, ny: 0.5, nw: 0.5, nh: 0.5, label: 'text-2', section: 'main' }
const A_shift = { ...A, nx: 0.1 }   // A moved right 0.1 (center 0.25→0.35)

const cases = [
  {
    name: 'identical (gen == ref)',
    ref: [A, B], gen: [A, B],
    exp: { f1_recall: 1, f2_precision: 1, f3_area_recall: 1, f4_pos_euclid: 1, f5_pos_chebyshev: 1,
      f6_rel_width: 1, f7_rel_height: 1, f8_aspect: 1, f9_order_consistency: 1, f10_quadrant_agreement: 1,
      f11_alignment_delta: 0, f12_overlap_delta: 0, f13_group_count: 1, f14_section_uniformity: 1 },
  },
  {
    name: 'missing B (gen has only A)',
    ref: [A, B], gen: [A],
    exp: { f1_recall: 0.5, f2_precision: 1, f3_area_recall: 0.5, f4_pos_euclid: 1, f5_pos_chebyshev: 1,
      f6_rel_width: 1, f7_rel_height: 1, f8_aspect: 1, f9_order_consistency: 1, f10_quadrant_agreement: 1,
      f11_alignment_delta: 0.5, f12_overlap_delta: 0, f13_group_count: 0.5, f14_section_uniformity: 1 },
  },
  {
    name: 'A shifted right 0.1',
    ref: [A, B], gen: [A_shift, B],
    exp: { f1_recall: 1, f2_precision: 1, f3_area_recall: 1, f4_pos_euclid: 0.95, f5_pos_chebyshev: 0.95,
      f6_rel_width: 1, f7_rel_height: 1, f8_aspect: 1, f9_order_consistency: 1, f10_quadrant_agreement: 0.5,
      f11_alignment_delta: 0.1, f12_overlap_delta: 0, f13_group_count: 1, f14_section_uniformity: 1 },
  },
  {
    name: 'container: single-level, fully reproduced',
    ref: [
      { nx: 0, ny: 0, nw: 1, nh: 1, label: 'container-1', childLabels: ['box-3', 'box-4'] },
      { nx: 0.1, ny: 0.1, nw: 0.2, nh: 0.2, label: 'box-3', childLabels: [] },
      { nx: 0.4, ny: 0.4, nw: 0.2, nh: 0.2, label: 'box-4', childLabels: [] },
    ],
    gen: [
      { nx: 0, ny: 0, nw: 1, nh: 1, label: 'container-1', childLabels: ['box-3', 'box-4'] },
      { nx: 0.1, ny: 0.1, nw: 0.2, nh: 0.2, label: 'box-3', childLabels: [] },
      { nx: 0.4, ny: 0.4, nw: 0.2, nh: 0.2, label: 'box-4', childLabels: [] },
    ],
    // groups: ungrouped={container-1}(1/1=1), container-1={box-3,box-4}(2/2=1) → std=0
    exp: { f14_section_uniformity: 1 },
  },
  {
    name: 'container: entirely missing in gen, while an unrelated ungrouped box survives',
    ref: [
      { nx: 0, ny: 0, nw: 1, nh: 1, label: 'container-1', childLabels: ['box-3', 'box-4'] },
      { nx: 0.1, ny: 0.1, nw: 0.2, nh: 0.2, label: 'box-3', childLabels: [] },
      { nx: 0.4, ny: 0.4, nw: 0.2, nh: 0.2, label: 'box-4', childLabels: [] },
      { nx: 0.8, ny: 0.8, nw: 0.1, nh: 0.1, label: 'box-5', childLabels: [] },
    ],
    gen: [
      // box-3/box-4 individually present and correctly labeled — but no
      // container-1 at all, so they were never actually wrapped.
      { nx: 0.1, ny: 0.1, nw: 0.2, nh: 0.2, label: 'box-3', childLabels: [] },
      { nx: 0.4, ny: 0.4, nw: 0.2, nh: 0.2, label: 'box-4', childLabels: [] },
      { nx: 0.8, ny: 0.8, nw: 0.1, nh: 0.1, label: 'box-5', childLabels: [] },
    ],
    // groups: ungrouped={container-1(unmatched→0), box-5(matched→1)} → 1/2=0.5
    //         container-1={box-3,box-4}, container itself unmatched → both 0/2=0
    // mean=0.25, std=0.25, f14=1-0.25=0.75
    exp: { f14_section_uniformity: 0.75 },
  },
  {
    name: 'container: fully and correctly wrapped, while an unrelated ungrouped box goes missing',
    ref: [
      { nx: 0, ny: 0, nw: 1, nh: 1, label: 'container-1', childLabels: ['box-3', 'box-4'] },
      { nx: 0.1, ny: 0.1, nw: 0.2, nh: 0.2, label: 'box-3', childLabels: [] },
      { nx: 0.4, ny: 0.4, nw: 0.2, nh: 0.2, label: 'box-4', childLabels: [] },
      { nx: 0.8, ny: 0.8, nw: 0.1, nh: 0.1, label: 'box-5', childLabels: [] },
    ],
    gen: [
      { nx: 0, ny: 0, nw: 1, nh: 1, label: 'container-1', childLabels: ['box-3', 'box-4'] },
      { nx: 0.1, ny: 0.1, nw: 0.2, nh: 0.2, label: 'box-3', childLabels: [] },
      { nx: 0.4, ny: 0.4, nw: 0.2, nh: 0.2, label: 'box-4', childLabels: [] },
      // box-5 missing entirely
    ],
    // groups: ungrouped={container-1(matched→1), box-5(unmatched→0)} → 1/2=0.5
    //         container-1={box-3,box-4}, both matched AND both in gen container-1's childLabels → 2/2=1
    // mean=0.75, std=0.25, f14=1-0.25=0.75
    exp: { f14_section_uniformity: 0.75 },
  },
  {
    name: 'container: nested two levels, fully reproduced — transitivity resolves grouping without extra code',
    ref: [
      { nx: 0, ny: 0, nw: 1, nh: 1, label: 'container-1', childLabels: ['container-2', 'box-5', 'box-6', 'box-7'] },
      { nx: 0.1, ny: 0.1, nw: 0.6, nh: 0.6, label: 'container-2', childLabels: ['box-5', 'box-6'] },
      { nx: 0.15, ny: 0.15, nw: 0.1, nh: 0.1, label: 'box-5', childLabels: [] },
      { nx: 0.3, ny: 0.3, nw: 0.1, nh: 0.1, label: 'box-6', childLabels: [] },
      { nx: 0.7, ny: 0.1, nw: 0.2, nh: 0.1, label: 'box-7', childLabels: [] },
      { nx: 0.9, ny: 0.9, nw: 0.05, nh: 0.05, label: 'box-8', childLabels: [] },
    ],
    gen: [
      { nx: 0, ny: 0, nw: 1, nh: 1, label: 'container-1', childLabels: ['container-2', 'box-5', 'box-6', 'box-7'] },
      { nx: 0.1, ny: 0.1, nw: 0.6, nh: 0.6, label: 'container-2', childLabels: ['box-5', 'box-6'] },
      { nx: 0.15, ny: 0.15, nw: 0.1, nh: 0.1, label: 'box-5', childLabels: [] },
      { nx: 0.3, ny: 0.3, nw: 0.1, nh: 0.1, label: 'box-6', childLabels: [] },
      { nx: 0.7, ny: 0.1, nw: 0.2, nh: 0.1, label: 'box-7', childLabels: [] },
      { nx: 0.9, ny: 0.9, nw: 0.05, nh: 0.05, label: 'box-8', childLabels: [] },
    ],
    // 3 dynamically-discovered groups: ungrouped={container-1,box-8}(2/2),
    // container-1={container-2,box-7}(2/2 — box-5/box-6 correctly excluded,
    // they belong to the smaller/innermost container-2 set instead),
    // container-2={box-5,box-6}(2/2). All 1 → std=0 → f14=1.
    exp: { f14_section_uniformity: 1 },
  },
]

let pass = 0, fail = 0
for (const c of cases) {
  const f = computeFeatures(c.ref, c.gen)
  console.log(`\n[${c.name}]`)
  for (const [k, v] of Object.entries(c.exp)) {
    const ok = Math.abs(f[k] - v) < 1e-3
    if (ok) pass++; else fail++
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${k}: got ${f[k]}  expected ${v}`)
  }
}
console.log(`\n${pass} passed, ${fail} failed`)
