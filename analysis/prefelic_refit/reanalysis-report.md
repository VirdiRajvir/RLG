# Prefelic weight refit (real Prolific judgments)

```
PREFELIC WEIGHT REFIT — 19 real Prolific raters

GOLD ACCURACY (correct = 'a' = real over broken)
  56b78f11e77ebe000cbefe79   4/4 = 1.00
  5b213220809d160001a2c36d   3/3 = 1.00
  5d8e154af2858200171fdb95   4/4 = 1.00
  5e7b6486b704ac034e3f01c8   5/5 = 1.00
  5f5bcd84009333376363c9aa   5/5 = 1.00
  65e47142265c50fcd9e87278   5/5 = 1.00
  66339218358315fd96806d33   4/4 = 1.00
  6699580d4529e69a0ee0b361   5/5 = 1.00
  66a641b50cc3558ad9b5448e   4/4 = 1.00
  67f81095730db61c061dd43b   3/3 = 1.00
  6972610c74d08456b2aa6ae2   5/5 = 1.00
  697ceaa6ba4604b428e4e69d   5/5 = 1.00
  6980a7096eb2c15732813632   4/4 = 1.00
  699070e1e1874936e60ec84c   5/5 = 1.00
  69ef19f9aa095d902763dd4c   1/1 = 1.00
  6a02ed5bd6acf52c07ab46fa   2/2 = 1.00
  6a09e5df6dd9e64c5b16cf69   5/5 = 1.00
  6a1d8cd6839c0ac04d7bc4cd   5/5 = 1.00
  6a1e51d2eda9dacfc5dea018   5/5 = 1.00
  retained: 19/19

AGREEMENT  mean pairwise decisive: all=0.891  clean=0.891
Fleiss' kappa (clean, 19 raters, 50 multi-rated pairs) = 0.421

n = 718 decisive (non-tie, non-gold) judgments used for the fit

WEIGHTS — 11 geometric, QC-clean (ranked by |coef|)
  f1_recall               +4.65*  [+4.06,+5.33]
  f8_aspect               +1.46*  [+0.96,+1.97]
  f14_section_uniformity  -0.87*  [-1.24,-0.54]
  f9_order_consistency    +0.64*  [+0.21,+1.19]
  f3_area_recall          +0.51*  [+0.12,+1.01]
  f13_group_count         -0.35   [-0.83,+0.14]
  f6_rel_width            +0.35   [-0.16,+0.91]
  f10_quadrant_agreement  -0.10   [-0.61,+0.51]
  f4_pos_euclid           -0.07   [-0.90,+0.60]
  f7_rel_height           +0.06   [-0.23,+0.38]

LORO accuracy (clean): geometric 0.877 | baseline 0.758  (f15_clip_masked not computed — run clip_feature_prefelic.py first for the +CLIP/CLIP-only rows)

POWER (clean agreement 0.891; band [0.831, 0.891, 0.951]; condition 28.1)
  agreement 0.83: required N ≈ 1600
  agreement 0.89: required N ≈ 6400
  agreement 0.95: required N > 6400
```
