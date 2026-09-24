"""
A2A trajectory trend, v3: same as ../a2a_v2/fig_a2a_trend.py, but scoped to
a2a/features_a2a.csv — the run_index>=6 batch, re-run under the corrected
A2A prompts (see data_pipeline/features_a2a.js), rather than the
run_index>=4 batch in a2a_v2/ (which predates the driver.py/generator.py
prompt fixes).

One thin, low-opacity line per session, colored by driver model (fixed
categorical order, never cycled — dataviz skill convention: color follows the
entity). One bold, fully-opaque line for the overall average across ALL
sessions at each turn. Later turns naturally average over fewer sessions,
since shorter trajectories drop out — shown honestly via the per-turn n in
the hover text, not smoothed away.

Same frozen weights/normalization as the human-study trend figure:
score = the 11 kept features dotted with analysis/v3/weights_clean.csv's
coef_raw, divided by MAX_SCORE=14.5287 (the ceiling score when a generation
exactly matches the reference).

  python3.10 analysis/A2A_analysis/a2a/fig_a2a_trend.py
Writes analysis/A2A_analysis/a2a/fig_a2a_trend.png
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd
import plotly.graph_objects as go

MAX_SCORE = 14.5287
HERE = Path(__file__).resolve().parent

# ── dataviz skill palette (light mode) ──────────────────────────────────────
SURFACE      = "#fcfcfb"
GRIDLINE     = "#e1e0d9"
AXIS         = "#c3c2b7"
INK_PRIMARY  = "#0b0b0b"
INK_SECOND   = "#52514e"
INK_MUTED    = "#898781"
FONT_FAMILY  = "Arial, sans-serif"
CAT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"]  # blue, orange, aqua

DISPLAY_NAME = {
    "anthropic/claude-opus-5": "Claude Opus 5",
    "google/gemini-3-flash-preview": "Gemini 3 Flash Preview",
    "qwen/qwen2.5-vl-72b-instruct": "Qwen2.5-VL 72B",
}
def display_name(model_id):
    return DISPLAY_NAME.get(model_id, model_id.split("/")[-1].replace("-", " "))

cfg = json.load(open("analysis/features-final.json"))
GEO = cfg["kept"]

W = pd.read_csv("analysis/v3/weights_clean.csv")
wr = {r.feature: r.coef_raw for r in W.itertuples()}
wvec = np.array([wr[f] for f in GEO])

d = pd.read_csv(HERE / "features_a2a.csv")
if d.empty:
    raise SystemExit(f"{HERE / 'features_a2a.csv'} is empty — run data_pipeline/features_a2a.js first.")
d = d[d["k"] >= 2].copy()
d["norm_score"] = (d[GEO].to_numpy() @ wvec) / MAX_SCORE

models = sorted(d["driver_model"].unique())
color_of = {m: CAT_COLORS[i % len(CAT_COLORS)] for i, m in enumerate(models)}

fig = go.Figure()

seen = set()
for (session_id, model), g in d.groupby(["conversation_id", "driver_model"]):
    g = g.sort_values("turn")
    first = model not in seen
    seen.add(model)
    fig.add_trace(go.Scatter(
        x=g["turn"], y=g["norm_score"], mode="lines",
        line=dict(color=color_of[model], width=1.6),
        opacity=0.30,
        legendgroup=model, name=display_name(model), showlegend=first,
        hovertemplate=f"{display_name(model)}<br>turn %{{x}}: %{{y:.2f}}<extra></extra>",
    ))

avg = d.groupby("turn")["norm_score"].agg(["mean", "count"])
fig.add_trace(go.Scatter(
    x=avg.index, y=avg["mean"], mode="lines+markers",
    line=dict(color=INK_PRIMARY, width=4),
    marker=dict(size=6, color=INK_PRIMARY),
    name="Average",
    hovertext=[f"turn {t}: {m:.2f} (n={n})" for t, m, n in zip(avg.index, avg["mean"], avg["count"])],
    hoverinfo="text",
))

n_sessions = d["conversation_id"].nunique()
n_refs = d["reference_name"].nunique()
fig.update_layout(
    title=dict(
        text=(f"A2A driver-tier trajectories v3 — normalized score vs. turn<br>"
              f"<span style='font-size:13px;color:{INK_SECOND}'>"
              f"{n_sessions} sessions across {n_refs} references, {len(models)} driver models "
              f"(1.0 = exact reference match)</span>"),
        font=dict(family=FONT_FAMILY, color=INK_PRIMARY, size=20),
        x=0.02, xanchor="left",
    ),
    plot_bgcolor=SURFACE, paper_bgcolor=SURFACE,
    font=dict(family=FONT_FAMILY, color=INK_SECOND, size=13),
    xaxis=dict(title="Refinement turn", gridcolor=GRIDLINE, linecolor=AXIS,
               zeroline=False, dtick=1, tickfont=dict(color=INK_MUTED)),
    yaxis=dict(title="Normalized learned-metric score  (w · φ / 14.5287)",
               range=[0, 1], gridcolor=GRIDLINE, linecolor=AXIS,
               zeroline=False, tickfont=dict(color=INK_MUTED)),
    legend=dict(bgcolor="rgba(0,0,0,0)", font=dict(color=INK_SECOND),
                entrywidth=200, entrywidthmode="pixels"),
    margin=dict(l=70, r=220, t=90, b=60),
    width=1300, height=680,
)

out_path = HERE / "fig_a2a_trend.png"
fig.write_image(out_path, scale=2)
print(f"saved {out_path}")
print(f"{n_sessions} sessions across {n_refs} references, {len(models)} driver models: {', '.join(models)}")
