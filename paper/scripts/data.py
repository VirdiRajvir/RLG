"""
Shared data loading for the workshop paper figures. Merges score (from the
already-computed feature CSVs, rescored with the refit weights) with
character counts (prompt length, generated page length) per turn, and
assigns a plain condition label to every row.

REPO_ROOT is resolved relative to this file so scripts can be run from
anywhere.
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
WEIGHTS = REPO_ROOT / "analysis/prefelic_refit/weights_final.csv"

def _weight_vector():
    cfg = json.load(open(REPO_ROOT / "analysis/features-final.json"))
    wdf = pd.read_csv(WEIGHTS)
    wr = {r.feature: r.coef_raw for r in wdf.itertuples()}
    geo = [f for f in cfg["kept"] if f in wr]
    wvec = np.array([wr[f] for f in geo])
    return geo, wvec, float(sum(wvec))

def _claude_condition(run_index):
    if run_index >= 16:
        return "claude_human_style_no_numbers"
    if run_index >= 14:
        return "claude_human_style"
    if run_index >= 12:
        return "claude_element_cap"
    if run_index >= 10:
        return "claude_no_thinking"
    if run_index >= 8:
        return "claude_capped"
    return "claude_uncapped"

def load_all():
    """Returns one long dataframe with columns:
    condition, conversation_id, turn, chars_prompt, chars_html, score
    condition is one of: human, claude_uncapped, claude_capped,
    claude_no_thinking, gemini, qwen
    """
    geo, wvec, max_score = _weight_vector()

    # A session only "qualifies" if it ever reached k>=2 (at least 2 boxes
    # matched at some point) — same filter analysis/tmp_new_weights/trend_h2a.py
    # and trend_a2a.py use. Without it, sessions that never produced a usable
    # page (k=0 the whole way through — a technical failure, not a real
    # attempt) get counted as real data points.
    h2a_scores = pd.read_csv(REPO_ROOT / "analysis/A2A_analysis/prolific/features_prolific.csv")
    h2a_scores["score"] = (h2a_scores[geo].to_numpy() @ wvec) / max_score
    qualifying_h2a = h2a_scores.loc[h2a_scores["k"] >= 2, "conversation_id"].unique()
    h2a_scores = h2a_scores[h2a_scores["conversation_id"].isin(qualifying_h2a)]
    h2a_chars = pd.read_csv(DATA_DIR / "h2a_chars_per_turn.csv")
    h2a = h2a_scores.merge(h2a_chars, on=["conversation_id", "turn"], how="inner")
    h2a["condition"] = "human"

    a2a_scores = pd.read_csv(REPO_ROOT / "analysis/A2A_analysis/a2a/features_a2a.csv")
    a2a_scores["score"] = (a2a_scores[geo].to_numpy() @ wvec) / max_score
    qualifying_a2a = a2a_scores.loc[a2a_scores["k"] >= 2, "conversation_id"].unique()
    a2a_scores = a2a_scores[a2a_scores["conversation_id"].isin(qualifying_a2a)]
    a2a_chars = pd.read_csv(DATA_DIR / "a2a_chars_per_turn.csv")[
        ["conversation_id", "turn", "chars_prompt", "chars_html"]]
    a2a = a2a_scores.merge(a2a_chars, on=["conversation_id", "turn"], how="inner")

    def cond_of(row):
        if row["driver_model"] == "anthropic/claude-opus-5":
            return _claude_condition(row["run_index"])
        if row["driver_model"] == "google/gemini-3-flash-preview":
            return "gemini"
        if row["driver_model"] == "qwen/qwen2.5-vl-72b-instruct":
            return "qwen"
        return None
    a2a["condition"] = a2a.apply(cond_of, axis=1)

    cols = ["condition", "conversation_id", "turn", "chars_prompt", "chars_html", "score"]
    return pd.concat([h2a[cols], a2a[cols]], ignore_index=True)

# The 4 features that actually carry the composite score (weights_final.csv
# has a 5th, f7_rel_height, but its coefficient is not statistically
# significant and ~0 — excluded here since it explains none of the
# human-vs-AI score gap either way).
BREAKDOWN_FEATURES = ["f1_recall", "f8_aspect", "f9_order_consistency", "f14_section_uniformity"]

def load_all_with_features():
    """Same rows/filtering as load_all(), but keeps the raw per-feature
    values (BREAKDOWN_FEATURES) alongside the composite score, so a figure
    can show which specific feature(s) drive the score gap between
    conditions rather than only the aggregate."""
    geo, wvec, max_score = _weight_vector()

    h2a_scores = pd.read_csv(REPO_ROOT / "analysis/A2A_analysis/prolific/features_prolific.csv")
    h2a_scores["score"] = (h2a_scores[geo].to_numpy() @ wvec) / max_score
    qualifying_h2a = h2a_scores.loc[h2a_scores["k"] >= 2, "conversation_id"].unique()
    h2a_scores = h2a_scores[h2a_scores["conversation_id"].isin(qualifying_h2a)]
    h2a_scores["condition"] = "human"

    a2a_scores = pd.read_csv(REPO_ROOT / "analysis/A2A_analysis/a2a/features_a2a.csv")
    a2a_scores["score"] = (a2a_scores[geo].to_numpy() @ wvec) / max_score
    qualifying_a2a = a2a_scores.loc[a2a_scores["k"] >= 2, "conversation_id"].unique()
    a2a_scores = a2a_scores[a2a_scores["conversation_id"].isin(qualifying_a2a)]

    def cond_of(row):
        if row["driver_model"] == "anthropic/claude-opus-5":
            return _claude_condition(row["run_index"])
        if row["driver_model"] == "google/gemini-3-flash-preview":
            return "gemini"
        if row["driver_model"] == "qwen/qwen2.5-vl-72b-instruct":
            return "qwen"
        return None
    a2a_scores["condition"] = a2a_scores.apply(cond_of, axis=1)

    cols = ["condition", "conversation_id", "turn", "score"] + BREAKDOWN_FEATURES
    return pd.concat([h2a_scores[cols], a2a_scores[cols]], ignore_index=True)
