"""
5-fold cross-validation of the full-vs-trimmed feature comparison — the
rigorous version of refit_prefelic_holdout.py's single 80/20 split. Feature
selection (which redundant features to drop) is redone INSIDE each fold from
that fold's training data only, same as the holdout script, so there's no
leakage anywhere — this also reveals whether the trimmed feature set is
stable across folds or just an artifact of one particular split.

Same functions as refit_prefelic.py/refit_prefelic_holdout.py (fit/sg —
identical IRLS logistic regression). Does not touch any other script's
outputs — writes its own report only.

  python3.10 analysis/prefelic_refit/refit_prefelic_cv.py
"""
import json, itertools
import numpy as np, pandas as pd

rng = np.random.default_rng(0)
HERE = "analysis/prefelic_refit"
cfg = json.load(open("analysis/features-final.json"))
GEO_FULL = [f for f in cfg["kept"] if f != "f2_precision"]  # see refit_prefelic_holdout.py's note — structurally zero-variance, not a split artifact

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

def build(rows, cols):
    X, y = [], []
    for _, r in rows.iterrows():
        X.append(vec(str(r["a_msg"]), cols) - vec(str(r["b_msg"]), cols))
        y.append(1.0 if r["choice"] == "a" else 0.0)
    return np.array(X), np.array(y)

def fit_std(X, y):
    sig = X.std(0); sig[sig == 0] = 1
    w = fit(X/sig, y)
    return w, w/sig

def accuracy(w_raw, cols, rows):
    Xr, y = build(rows, cols)
    pred = (Xr @ w_raw) > 0
    return float(np.mean(pred == (y > 0.5))), len(y)

def select_trimmed(train, thresh=0.7):
    """Redo feature selection from THIS fold's train data only — mirrors
    refit_prefelic_holdout.py: fit full model, find |r|>=thresh pairs on
    train Δφ, drop whichever of each pair has the smaller |train coef|."""
    Xtr, ytr = build(train, GEO_FULL)
    w_std, w_raw = fit_std(Xtr, ytr)
    sig = Xtr.std(0); sig[sig == 0] = 1
    corr = np.corrcoef((Xtr/sig).T)
    pairs = []
    for i, k in itertools.combinations(range(len(GEO_FULL)), 2):
        if abs(corr[i, k]) >= thresh: pairs.append((abs(corr[i, k]), i, k))
    pairs.sort(reverse=True)
    to_drop = set()
    for c, i, k in pairs:
        if i in to_drop or k in to_drop: continue
        to_drop.add(GEO_FULL[i] if abs(w_std[i]) < abs(w_std[k]) else GEO_FULL[k])
    return [f for f in GEO_FULL if f not in to_drop], w_raw, GEO_FULL

# ── 5-fold split ─────────────────────────────────────────────────────────────
n = len(dec)
idx = rng.permutation(n)
folds = np.array_split(idx, 5)

L = []
def out(s=""): print(s); L.append(s)
out(f"PREFELIC 5-FOLD CV — {n} decisive real-vs-real judgments, folds of ~{n//5} each (seed=0)\n")

full_accs, trim_accs, trimmed_sets = [], [], []
for i in range(5):
    test_idx = folds[i]
    train_idx = np.concatenate([folds[k] for k in range(5) if k != i])
    train, test = dec.iloc[train_idx], dec.iloc[test_idx]

    Xtr_full, ytr_full = build(train, GEO_FULL)
    _, w_full_raw = fit_std(Xtr_full, ytr_full)
    acc_full, n_test = accuracy(w_full_raw, GEO_FULL, test)

    GEO_TRIM, _, _ = select_trimmed(train)
    Xtr_trim, ytr_trim = build(train, GEO_TRIM)
    _, w_trim_raw = fit_std(Xtr_trim, ytr_trim)
    acc_trim, _ = accuracy(w_trim_raw, GEO_TRIM, test)

    full_accs.append(acc_full); trim_accs.append(acc_trim); trimmed_sets.append(set(GEO_TRIM))
    out(f"fold {i+1}: train={len(train)} test={n_test}  full={acc_full*100:5.1f}%  trimmed({len(GEO_TRIM)}f)={acc_trim*100:5.1f}%  kept={sorted(GEO_TRIM)}")

full_accs, trim_accs = np.array(full_accs), np.array(trim_accs)
out(f"\nFull model    : {full_accs.mean()*100:.1f}% ± {full_accs.std()*100:.1f}%  (per-fold: {[f'{a*100:.1f}' for a in full_accs]})")
out(f"Trimmed model : {trim_accs.mean()*100:.1f}% ± {trim_accs.std()*100:.1f}%  (per-fold: {[f'{a*100:.1f}' for a in trim_accs]})")

# stability of the trimmed feature set across folds
always_kept = set.intersection(*trimmed_sets)
ever_kept = set.union(*trimmed_sets)
out(f"\nFeature-selection stability across the 5 folds:")
out(f"  kept in EVERY fold: {sorted(always_kept)}")
out(f"  kept in SOME but not all folds: {sorted(ever_kept - always_kept)}")

open(f"{HERE}/cv-report.md", "w").write("# Prefelic 5-fold CV (full vs trimmed features)\n\n```\n"+"\n".join(L)+"\n```\n")
print(f"\nsaved: {HERE}/cv-report.md")
