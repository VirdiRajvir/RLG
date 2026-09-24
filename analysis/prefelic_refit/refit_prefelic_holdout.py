"""
Train/test-split validation of the prefelic weight refit — answers "does
dropping redundant features actually generalize, or did we just cherry-pick
a feature set that flatters the data we're evaluating it on."

Same functions as refit_prefelic.py (fit/sg — identical IRLS logistic
regression), same data (analysis/prefelic_refit/{features,judgments}.csv).
Does NOT touch refit_prefelic.py's own outputs (weights_clean.csv,
reanalysis-report.md, power-results.csv) — writes its own report instead.

Methodology, test-blind throughout:
  1. Split decisive real-vs-real judgments 80/20 (fixed seed).
  2. On the FULL 11-feature set (cfg["kept"] — every geometric feature,
     CLIP/f15 excluded as instructed), fit on TRAIN only.
  3. Identify redundant pairs (|r|>=0.7) using ONLY the TRAIN Δφ correlation
     matrix — test data is never looked at while deciding what to drop.
     For each pair, drop whichever has the smaller |train-fitted coefficient|
     (i.e. keep whichever one the train-only fit says matters more).
  4. Refit the trimmed set on TRAIN only.
  5. Report accuracy of BOTH the full and trimmed models, evaluated ONLY on
     the held-out TEST split neither model's fitting or feature-selection
     step ever saw.

  python3.10 analysis/prefelic_refit/refit_prefelic_holdout.py
"""
import json, itertools
import numpy as np, pandas as pd

rng = np.random.default_rng(0)
HERE = "analysis/prefelic_refit"
cfg = json.load(open("analysis/features-final.json"))
GEO_FULL = cfg["kept"]  # all 11 geometric features, embedding (f15) excluded — as instructed

# f2_precision is structurally zero-variance across the WHOLE population (not
# just one split) — confirmed directly: Δf2_precision = 0 for every real-vs-real
# judgment in this corpus (gold pairs, where it would vary, are excluded from
# fitting). Any train/test split still draws from that same zero-variance
# population, so it's not merely "correlated" with something else — it's
# undefined (NaN correlation, breaks the condition-number calc below) and
# non-estimable everywhere, same class of issue as f11/f12's exclusion from
# the original pilot. Excluded here for the same reason, not as a hidden drop.
GEO_FULL = [f for f in GEO_FULL if f != "f2_precision"]

d = pd.read_csv(f"{HERE}/features.csv"); d = d[d["k"] >= 2]
dd = d.set_index(d["generation_id"].astype(str))
def vec(g, cols): return dd.loc[g, cols].to_numpy(dtype=float)
present = set(dd.index)

j = pd.read_csv(f"{HERE}/judgments.csv")
dec = j[(j["is_gold"] == False) & (j["choice"].isin(["a", "b"]))]   # noqa: E712
dec = dec[dec["a_msg"].astype(str).isin(present) & dec["b_msg"].astype(str).isin(present)].reset_index(drop=True)

def sg(z): return 1/(1+np.exp(-np.clip(z, -30, 30)))
def fit(X, y, l2=1.0, it=60):
    w = np.zeros(X.shape[1]); I = l2*np.eye(X.shape[1])
    for _ in range(it):
        p = sg(X@w); W = np.clip(p*(1-p), 1e-6, None)
        try: s = np.linalg.solve((X.T*W)@X+I, X.T@(p-y)+l2*w)
        except np.linalg.LinAlgError: break
        w -= s
        if np.max(np.abs(s)) < 1e-9: break
    return w

L = []
def out(s=""): print(s); L.append(s)

# ── 1. 80/20 split, fixed seed ────────────────────────────────────────────────
n = len(dec)
idx = rng.permutation(n)
n_test = round(0.20 * n)
test_idx, train_idx = idx[:n_test], idx[n_test:]
train, test = dec.iloc[train_idx], dec.iloc[test_idx]
out(f"PREFELIC HOLDOUT VALIDATION — {n} decisive real-vs-real judgments, "
    f"{len(train)} train / {len(test)} test (80/20, seed=0)\n")

def build(rows, cols):
    X, y = [], []
    for _, r in rows.iterrows():
        X.append(vec(str(r["a_msg"]), cols) - vec(str(r["b_msg"]), cols))
        y.append(1.0 if r["choice"] == "a" else 0.0)
    return np.array(X), np.array(y)

def fit_std(X, y):
    sig = X.std(0); sig[sig == 0] = 1
    w = fit(X/sig, y)
    return w, w/sig  # standardized coef (for comparing magnitude across features), raw coef

def accuracy(w_raw, cols, rows):
    Xr, y = build(rows, cols)
    pred = (Xr @ w_raw) > 0
    return float(np.mean(pred == (y > 0.5))), len(y)

# ── 2. fit FULL 11-feature model on TRAIN only ──────────────────────────────
Xtr_full, ytr_full = build(train, GEO_FULL)
w_full_std, w_full_raw = fit_std(Xtr_full, ytr_full)
out("FULL 11-feature model, fit on TRAIN only (ranked by |std coef|):")
o = np.argsort(-np.abs(w_full_std))
for i in o:
    out(f"  {GEO_FULL[i]:22} std={w_full_std[i]:+7.2f}  raw={w_full_raw[i]:+7.2f}")

# ── 3. redundant pairs from TRAIN Δφ correlation ONLY (test never touched) ──
sig_tr = Xtr_full.std(0); sig_tr[sig_tr == 0] = 1
Xtr_s = Xtr_full / sig_tr
corr = np.corrcoef(Xtr_s.T)
pairs = []
for i, k in itertools.combinations(range(len(GEO_FULL)), 2):
    c = corr[i, k]
    if abs(c) >= 0.7:
        pairs.append((abs(c), i, k))
pairs.sort(reverse=True)
out(f"\nRedundant pairs on TRAIN (|r|>=0.7): {len(pairs)}")
to_drop = set()
for c, i, k in pairs:
    if i in to_drop or k in to_drop: continue
    # keep whichever the TRAIN-only full fit says matters more (larger |std coef|)
    drop_i = i if abs(w_full_std[i]) < abs(w_full_std[k]) else k
    keep_i = k if drop_i == i else i
    out(f"  {GEO_FULL[i]:22} <-> {GEO_FULL[k]:22} r={corr[i,k]:+.2f}  "
        f"drop {GEO_FULL[drop_i]} (|coef|={abs(w_full_std[drop_i]):.2f}), keep {GEO_FULL[keep_i]} (|coef|={abs(w_full_std[keep_i]):.2f})")
    to_drop.add(GEO_FULL[drop_i])
GEO_TRIM = [f for f in GEO_FULL if f not in to_drop]
out(f"  trimmed set ({len(GEO_TRIM)} features): {GEO_TRIM}\n")

# ── 4. refit trimmed set on TRAIN only ──────────────────────────────────────
Xtr_trim, ytr_trim = build(train, GEO_TRIM)
w_trim_std, w_trim_raw = fit_std(Xtr_trim, ytr_trim)
out("TRIMMED model, fit on TRAIN only (ranked by |std coef|):")
ot = np.argsort(-np.abs(w_trim_std))
for i in ot:
    out(f"  {GEO_TRIM[i]:22} std={w_trim_std[i]:+7.2f}  raw={w_trim_raw[i]:+7.2f}")

# condition numbers, train-only, for reference
out(f"\nTRAIN condition number — full: {np.linalg.cond(Xtr_s):.1f}  |  "
    f"trimmed: {np.linalg.cond(Xtr_trim/np.where(Xtr_trim.std(0)==0,1,Xtr_trim.std(0))):.1f}")

# ── 5. accuracy on the untouched TEST split ─────────────────────────────────
acc_full, n_full = accuracy(w_full_raw, GEO_FULL, test)
acc_trim, n_trim = accuracy(w_trim_raw, GEO_TRIM, test)
out(f"\nHELD-OUT TEST accuracy (n={n_full}, never seen during fitting OR feature selection):")
out(f"  full 11-feature model : {acc_full*100:.1f}%")
out(f"  trimmed {len(GEO_TRIM)}-feature model: {acc_trim*100:.1f}%")

pd.DataFrame({"feature": GEO_TRIM, "coef_std_train": w_trim_std, "coef_raw_train": w_trim_raw}) \
    .to_csv(f"{HERE}/weights_holdout_trimmed.csv", index=False)
open(f"{HERE}/holdout-report.md", "w").write("# Prefelic holdout validation (train/test split)\n\n```\n"+"\n".join(L)+"\n```\n")
print(f"\nsaved: {HERE}/holdout-report.md, weights_holdout_trimmed.csv")
