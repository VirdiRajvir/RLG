# Prefelic 5-fold CV (full vs trimmed features)

```
PREFELIC 5-FOLD CV — 718 decisive real-vs-real judgments, folds of ~143 each (seed=0)

fold 1: train=574 test=144  full= 86.1%  trimmed(5f)= 87.5%  kept=['f14_section_uniformity', 'f1_recall', 'f7_rel_height', 'f8_aspect', 'f9_order_consistency']
fold 2: train=574 test=144  full= 86.8%  trimmed(5f)= 87.5%  kept=['f14_section_uniformity', 'f1_recall', 'f7_rel_height', 'f8_aspect', 'f9_order_consistency']
fold 3: train=574 test=144  full= 86.1%  trimmed(5f)= 87.5%  kept=['f14_section_uniformity', 'f1_recall', 'f7_rel_height', 'f8_aspect', 'f9_order_consistency']
fold 4: train=575 test=143  full= 90.2%  trimmed(5f)= 89.5%  kept=['f14_section_uniformity', 'f1_recall', 'f7_rel_height', 'f8_aspect', 'f9_order_consistency']
fold 5: train=575 test=143  full= 87.4%  trimmed(5f)= 87.4%  kept=['f14_section_uniformity', 'f1_recall', 'f7_rel_height', 'f8_aspect', 'f9_order_consistency']

Full model    : 87.3% ± 1.5%  (per-fold: ['86.1', '86.8', '86.1', '90.2', '87.4'])
Trimmed model : 87.9% ± 0.8%  (per-fold: ['87.5', '87.5', '87.5', '89.5', '87.4'])

Feature-selection stability across the 5 folds:
  kept in EVERY fold: ['f14_section_uniformity', 'f1_recall', 'f7_rel_height', 'f8_aspect', 'f9_order_consistency']
  kept in SOME but not all folds: []
```
