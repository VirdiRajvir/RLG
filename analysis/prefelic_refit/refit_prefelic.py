"""
Refits the φ-based metric weights on prefelic's real Prolific judgments.
Methodology: gold QC, mean-pairwise/Fleiss agreement, no-intercept
logistic-regression Bradley-Terry weight fit with bootstrap CIs, LORO vs
CLIP/baseline, data-driven power simulation.

Reads only from and writes only to this directory (analysis/prefelic_refit/),
built by data_pipeline/prefelic_refit_export.mjs.

No monotonicity section here (unlike the original script) — prefelic's
pairs compare candidates from DIFFERENT independent conversations against a
fixed reference, not turns within the same trajectory, so "does the rater
prefer the later turn" doesn't apply to this design at all.

  python3.10 analysis/prefelic_refit/refit_prefelic.py
"""
import json, itertools, collections
import numpy as np, pandas as pd
from scipy.stats import spearmanr, binomtest

rng = np.random.default_rng(0)
HERE = "analysis/prefelic_refit"
GOLD_THRESH = 0.70
cfg = json.load(open("analysis/features-final.json"))
GEO, ALL12 = cfg["kept"], cfg["kept_with_clip_12"]

# f2_precision is genuinely non-estimable on THIS candidate pool (K=5 real
# candidates/reference): Δf2_precision = 0 across every one of the 718
# decisive real-vs-real judgments used for the fit (gold pairs are correctly
# excluded from fitting, and apparently all real candidates within a given
# reference happen to share identical precision) — not "unimportant", just
# zero variance to estimate from, same class of issue as f11/f12's exclusion
# from the original pilot's feature set. Confirmed via direct inspection
# before dropping it here; a larger K would likely make it estimable again.
GEO = [f for f in GEO if f != "f2_precision"]
ALL12 = [f for f in ALL12 if f != "f2_precision"]

d = pd.read_csv(f"{HERE}/features.csv")
d = d[d["k"] >= 2]
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

# ── 1. gold QC ────────────────────────────────────────────────────────────────
out(f"PREFELIC WEIGHT REFIT — {len(raters)} real Prolific raters\n")
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
ag_full, ag_clean = mean_pairwise(raters), mean_pairwise(clean_raters)
out(f"AGREEMENT  mean pairwise decisive: all={ag_full:.3f}  clean={ag_clean:.3f}")
allc = j[j["is_gold"] == False]   # noqa: E712
bycell = collections.defaultdict(dict)
for _, r in allc.iterrows():
    if r["rater_id"] in clean_raters: bycell[(r["a_msg"], r["b_msg"])][r["rater_id"]] = r["choice"]
items = [v for v in bycell.values() if len(v) >= 2]  # prefelic: every pair rated by MANY raters, not all-N-raters-per-item like the pilot
cats = ["a", "b", "tie"]
if items:
    # Fleiss over variable panel sizes per item — use the generalized form
    # (each item's own rater count n_i), not the fixed-n formula the pilot
    # script used (that assumed every item was rated by all clean raters).
    N = len(items)
    Pbar_terms, pj = [], collections.Counter()
    total_ratings = 0
    for v in items:
        c = collections.Counter(v.values())
        n_i = sum(c.values())
        if n_i < 2: continue
        for cat in cats: pj[cat] += c[cat]
        total_ratings += n_i
        Pbar_terms.append((sum(c[cat]**2 for cat in cats)-n_i)/(n_i*(n_i-1)))
    if Pbar_terms:
        Pbar = np.mean(Pbar_terms)
        Pe = sum((pj[cat]/total_ratings)**2 for cat in cats)
        out(f"Fleiss' kappa (clean, {len(clean_raters)} raters, {len(Pbar_terms)} multi-rated pairs) = {(Pbar-Pe)/(1-Pe):.3f}\n")

# ── 3. weights (clean), 11 geometric ───────────────────────────────────────────
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
out(f"n = {len(yc)} decisive (non-tie, non-gold) judgments used for the fit\n")
w, lo, hi, wr = fit_ci(Xc, yc)
out("WEIGHTS — 11 geometric, QC-clean (ranked by |coef|)")
o = np.argsort(-np.abs(w))
for i in o:
    s = "*" if (lo[i] > 0 or hi[i] < 0) else " "
    out(f"  {GEO[i]:22}{w[i]:+7.2f}{s}  [{lo[i]:+.2f},{hi[i]:+.2f}]")
pd.DataFrame({"feature": [GEO[i] for i in o], "coef_std": w[o], "ci_lo": lo[o], "ci_hi": hi[o],
              "sig": [(lo[i] > 0 or hi[i] < 0) for i in o], "coef_raw": wr[o]}).to_csv(f"{HERE}/weights_clean.csv", index=False)

# ── 4. CLIP comparison (LORO, clean) — only if f15_clip_masked was computed ──
have_clip = "f15_clip_masked" in dd.columns and pd.to_numeric(dd["f15_clip_masked"], errors="coerce").notna().all()
def loro(cols):
    X, y = build(cols, clean_raters)
    rt = np.array([r["rater_id"] for _, r in dec.iterrows() if r["rater_id"] in clean_raters
                    and str(r["a_msg"]) in present and str(r["b_msg"]) in present])
    accs = []
    for h in sorted(set(rt)):
        tr = rt != h; s = X[tr].std(0); s[s == 0] = 1
        wf = fit(X[tr]/s, y[tr]); accs.append(float(np.mean((X[rt == h]/s @ wf > 0) == (y[rt == h] > .5))))
    return np.mean(accs), y
if have_clip:
    a_all, yv = loro(ALL12); a_geo, _ = loro(GEO); a_clip, _ = loro(["f15_clip_masked"])
    base = max(yv.mean(), 1-yv.mean())
    out(f"\nLORO accuracy (clean): geometric {a_geo:.3f} | +CLIP {a_all:.3f} | CLIP-only {a_clip:.3f} | baseline {base:.3f}")
else:
    a_geo, yv = loro(GEO)
    base = max(yv.mean(), 1-yv.mean())
    out(f"\nLORO accuracy (clean): geometric {a_geo:.3f} | baseline {base:.3f}  (f15_clip_masked not computed — run clip_feature_prefelic.py first for the +CLIP/CLIP-only rows)")

# ── 5. power simulation (data-driven, clean agreement) ────────────────────────
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
pd.DataFrame(prows).to_csv(f"{HERE}/power-results.csv", index=False)

open(f"{HERE}/reanalysis-report.md", "w").write("# Prefelic weight refit (real Prolific judgments)\n\n```\n"+"\n".join(L)+"\n```\n")
print(f"\nsaved: {HERE}/reanalysis-report.md, weights_clean.csv, power-results.csv")
