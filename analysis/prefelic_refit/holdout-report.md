# Prefelic holdout validation (train/test split)

```
PREFELIC HOLDOUT VALIDATION — 718 decisive real-vs-real judgments, 574 train / 144 test (80/20, seed=0)

FULL 11-feature model, fit on TRAIN only (ranked by |std coef|):
  f1_recall              std=  +4.20  raw= +14.46
  f8_aspect              std=  +1.30  raw=  +5.71
  f14_section_uniformity std=  -0.91  raw=  -4.99
  f9_order_consistency   std=  +0.74  raw=  +6.52
  f3_area_recall         std=  +0.61  raw=  +2.19
  f6_rel_width           std=  +0.41  raw=  +2.38
  f4_pos_euclid          std=  -0.34  raw=  -3.44
  f13_group_count        std=  -0.22  raw=  -0.93
  f7_rel_height          std=  +0.12  raw=  +0.95
  f10_quadrant_agreement std=  +0.01  raw=  +0.05

Redundant pairs on TRAIN (|r|>=0.7): 7
  f1_recall              <-> f13_group_count        r=+0.89  drop f13_group_count (|coef|=0.22), keep f1_recall (|coef|=4.20)
  f4_pos_euclid          <-> f10_quadrant_agreement r=+0.87  drop f10_quadrant_agreement (|coef|=0.01), keep f4_pos_euclid (|coef|=0.34)
  f1_recall              <-> f3_area_recall         r=+0.85  drop f3_area_recall (|coef|=0.61), keep f1_recall (|coef|=4.20)
  f6_rel_width           <-> f8_aspect              r=+0.84  drop f6_rel_width (|coef|=0.41), keep f8_aspect (|coef|=1.30)
  f4_pos_euclid          <-> f9_order_consistency   r=+0.78  drop f4_pos_euclid (|coef|=0.34), keep f9_order_consistency (|coef|=0.74)
  f3_area_recall         <-> f10_quadrant_agreement r=-0.77  drop f10_quadrant_agreement (|coef|=0.01), keep f3_area_recall (|coef|=0.61)
  f1_recall              <-> f10_quadrant_agreement r=-0.76  drop f10_quadrant_agreement (|coef|=0.01), keep f1_recall (|coef|=4.20)
  trimmed set (5 features): ['f1_recall', 'f7_rel_height', 'f8_aspect', 'f9_order_consistency', 'f14_section_uniformity']

TRIMMED model, fit on TRAIN only (ranked by |std coef|):
  f1_recall              std=  +4.41  raw= +15.20
  f8_aspect              std=  +1.54  raw=  +6.74
  f9_order_consistency   std=  +0.69  raw=  +6.13
  f14_section_uniformity std=  -0.41  raw=  -2.23
  f7_rel_height          std=  -0.01  raw=  -0.09

TRAIN condition number — full: 28.8  |  trimmed: 2.7

HELD-OUT TEST accuracy (n=144, never seen during fitting OR feature selection):
  full 11-feature model : 86.1%
  trimmed 5-feature model: 87.5%
```
