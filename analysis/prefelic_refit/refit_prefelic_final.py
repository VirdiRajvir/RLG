"""
FINAL prefelic weight refit — the validated 5-feature set
(f1_recall, f8_aspect, f9_order_consistency, f14_section_uniformity,
f7_rel_height), refit on the FULL dataset (all 718 decisive judgments, no
holdout) for the best-precision coefficient estimates.

This is refit_prefelic.py's full analysis (gold QC, agreement/Fleiss, weight
fit + bootstrap CI, LORO, power) restricted to the feature set validated by
refit_prefelic_cv.py's 5-fold CV: those 5 features were selected identically
in every fold from train-only data, and the trimmed model matched/exceeded
the full 10-feature model's held-out accuracy (87.9%±0.8% vs 87.3%±1.5%).
Refitting on all the data now is standard practice once the procedure itself
is validated (see the CV script) — this step is about coefficient precision,
not a fresh generalization claim; the generalization claim is cv-report.md's,
and stays there.

Does not overwrite refit_prefelic.py's own 10-feature weights_clean.csv/
reanalysis-report.md — that fit remains the documented exploratory step this
one was derived from. Writes weights_final.csv / final-report.md instead.

  python3.10 analysis/prefelic_refit/refit_prefelic_final.py
"""
import json, itertools, collections
import numpy as np, pandas as pd
from scipy.stats import spearmanr

rng = np.random.default_rng(0)
HERE = "analysis/prefelic_refit"
GOLD_THRESH = 0.70
cfg = json.load(open("analysis/features-final.json"))

# The validated 5-feature set — see refit_prefelic_cv.py's per-fold output,
# identical across all 5 folds.
GEO = ["f1_recall", "f8_aspect", "f9_order_consistency", "f14_section_uniformity", "f7_rel_height"]
ALL12 = GEO + ["f15_clip_masked"]

d = pd.read_csv(f"{HERE}/features.csv"); d = d[d["k"] >= 2]
dd = d.set_index(d["generation_id"].astype(str))
def vec(g, cols): return dd.loc[g, cols].to_numpy(dtype=float)
present = set(dd.index)

j = pd.read_csv(f"{HERE}/judgments.csv")
dec = j[(j["is_gold"] == False) & (j["choice"].isin(["a", "b"]))]   # noqa: E712
raters = sorted(j["rater_id"].unique())

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

# ── 1. gold QC (identical to refit_prefelic.py) ────────────────────────────────
out(f"PREFELIC FINAL WEIGHT REFIT — {len(raters)} real Prolific raters, 5 validated features\n")
out("GOLD ACCURACY (correct = 'a' = real over broken)")
gold = j[(j["is_gold"] == True) & (j["choice"].isin(["a", "b"]))]   # noqa: E712
careless = set()
for rt in raters:
    g = gold[gold["rater_id"] == rt]
    acc = (g["choice"] == "a").mean() if len(g) else float("nan")
    flag = "  <-- CARELESS (excluded)" if acc < GOLD_THRESH else ""
    if acc < GOLD_THRESH: careless.add(rt)
    out(f"  {rt:26} {int((g['choice']=='a').sum())}/{len(g)} = {acc:.2f}{flag}")
clean_raters = [r for r in raters if r not in careless]
out(f"  retained: {len(clean_raters)}/{len(raters)}\n")

# ── 2. agreement + Fleiss ─────────────────────────────────────────────────────
by = collections.defaultdict(dict)
for _, r in dec.iterrows(): by[(r["a_msg"], r["b_msg"])][r["rater_id"]] = r["choice"]
def mean_pairwise(rs):
    ags = []
    for x, yv in itertools.combinations(rs, 2):
        dd_ = [(v[x], v[yv]) for v in by.values() if x in v and yv in v]
        if dd_: ags.append(sum(a == b for a, b in dd_)/len(dd_))
    return np.mean(ags) if ags else float("nan")
ag_clean = mean_pairwise(clean_raters)
out(f"AGREEMENT  mean pairwise decisive (clean): {ag_clean:.3f}\n")

# ── 3. weights on the FULL dataset, validated 5-feature set ────────────────────
def build(cols, keep):
    X, y = [], []
    for _, r in dec.iterrows():
        if r["rater_id"] not in keep: continue
        a, b = str(r["a_msg"]), str(r["b_msg"])
        if a in present and b in present:
            X.append(vec(a, cols)-vec(b, cols)); y.append(1.0 if r["choice"] == "a" else 0.0)
    return np.array(X), np.array(y)
def fit_ci(X, y):
    sig = X.std(0); sig[sig == 0] = 1; Xs = X/sig; w = fit(Xs, y)
    B = 2000; bt = np.zeros((B, X.shape[1]))
    for b in range(B):
        idx = rng.integers(0, len(y), len(y)); bt[b] = fit(Xs[idx], y[idx])
    lo, hi = np.percentile(bt, [2.5, 97.5], 0)
    return w, lo, hi, w/sig
Xc, yc = build(GEO, clean_raters)
out(f"n = {len(yc)} decisive (non-tie, non-gold) judgments used for the fit — full dataset, no holdout\n")
w, lo, hi, wr = fit_ci(Xc, yc)
out("WEIGHTS — 5 validated features, fit on ALL data (ranked by |coef|)")
o = np.argsort(-np.abs(w))
for i in o:
    s = "*" if (lo[i] > 0 or hi[i] < 0) else " "
    out(f"  {GEO[i]:22}{w[i]:+7.2f}{s}  [{lo[i]:+.2f},{hi[i]:+.2f}]")
pd.DataFrame({"feature": [GEO[i] for i in o], "coef_std": w[o], "ci_lo": lo[o], "ci_hi": hi[o],
              "sig": [(lo[i] > 0 or hi[i] < 0) for i in o], "coef_raw": wr[o]}).to_csv(f"{HERE}/weights_final.csv", index=False)

# condition number on the full dataset, validated feature set
sig_full = Xc.std(0); sig_full[sig_full == 0] = 1
out(f"\nFull-data condition number (5-feature): {np.linalg.cond(Xc/sig_full):.1f}")

# ── 4. LORO ──────────────────────────────────────────────────────────────────
def loro(cols):
    X, y = build(cols, clean_raters)
    rt = np.array([r["rater_id"] for _, r in dec.iterrows() if r["rater_id"] in clean_raters
                    and str(r["a_msg"]) in present and str(r["b_msg"]) in present])
    accs = []
    for h in sorted(set(rt)):
        tr = rt != h; s = X[tr].std(0); s[s == 0] = 1
        wf = fit(X[tr]/s, y[tr]); accs.append(float(np.mean((X[rt == h]/s @ wf > 0) == (y[rt == h] > .5))))
    return np.mean(accs), y
a_geo, yv = loro(GEO)
base = max(yv.mean(), 1-yv.mean())
out(f"LORO accuracy (clean): 5-feature {a_geo:.3f} | baseline {base:.3f}")

# ── 5. power (for completeness — same criterion as before, this feature set) ──
pairs = {(str(a), str(b)) for a, b in zip(dec["a_msg"], dec["b_msg"]) if str(a) in present and str(b) in present}
DPHI = np.array([vec(a, GEO)-vec(b, GEO) for a, b in pairs]); sig = DPHI.std(0); sig[sig == 0] = 1
DPHI_s = DPHI/sig; PHI_s = dd[GEO].to_numpy()/sig
A_BAND = sorted({round(max(.51, min(.97, ag_clean+x)), 3) for x in (-.06, 0, .06)})
N_GRID = [25, 50, 100, 200, 400, 800, 1600, 3200, 6400]
def calib(ws, A):
    raw = DPHI_s@ws; lo_, hi_ = 1e-3, 1e3
    for _ in range(40):
        m = np.sqrt(lo_*hi_); p = sg(raw/m); a = np.mean(p*p+(1-p)*(1-p))
        lo_, hi_ = (m, hi_) if a > A else (lo_, m)
    return np.sqrt(lo_*hi_)
out(f"\nPOWER (clean agreement {ag_clean:.3f}; band {A_BAND}; condition {np.linalg.cond(DPHI_s):.1f})")
prows = []
for A in A_BAND:
    req = None
    for Nn in N_GRID:
        hits = 0
        for _ in range(300):
            ws = rng.uniform(-1, 1, len(GEO)); tau = calib(ws, A)
            idx = rng.integers(0, len(DPHI_s), Nn); X = DPHI_s[idx]
            y = (rng.random(Nn) < sg(X@ws/tau)).astype(float)
            if y.min() == y.max(): continue
            wh = fit(X, y)
            if spearmanr(PHI_s@wh, PHI_s@ws).statistic >= 0.90: hits += 1
        pw = hits/300; prows.append({"agreement": A, "N": Nn, "power": pw})
        if pw >= 0.95 and req is None: req = Nn
    out(f"  agreement {A:.2f}: required N {'≈ '+str(req) if req else '> '+str(N_GRID[-1])}")
pd.DataFrame(prows).to_csv(f"{HERE}/power-results-final.csv", index=False)

open(f"{HERE}/final-report.md", "w").write("# Prefelic FINAL weight refit (validated 5-feature set, full data)\n\n```\n"+"\n".join(L)+"\n```\n")
print(f"\nsaved: {HERE}/final-report.md, weights_final.csv, power-results-final.csv")
