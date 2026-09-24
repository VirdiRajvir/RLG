"""Pure functions for the /explore data export — no Supabase, no file IO.
Kept separate from export.py so they're testable without a live DB
connection or credentials.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd


def build_anonymization_map(raw_ids: list[str], prefix: str) -> dict[str, str]:
    distinct = sorted(set(raw_ids))
    return {rid: f"{prefix}{i + 1}" for i, rid in enumerate(distinct)}


def load_weight_vector(repo_root: Path) -> tuple[list[str], np.ndarray, float]:
    cfg = json.load(open(repo_root / "analysis/features-final.json"))
    wdf = pd.read_csv(repo_root / "analysis/prefelic_refit/weights_final.csv")
    wr = {r.feature: r.coef_raw for r in wdf.itertuples()}
    geo = [f for f in cfg["kept"] if f in wr]
    wvec = np.array([wr[f] for f in geo])
    return geo, wvec, float(sum(wvec))


def score_rows(df: pd.DataFrame, geo: list[str], wvec: np.ndarray, max_score: float) -> pd.DataFrame:
    out = df.copy()
    out["score"] = (out[geo].to_numpy() @ wvec) / max_score
    return out


def assert_no_raw_ids(obj, forbidden: set[str]) -> None:
    if isinstance(obj, dict):
        for v in obj.values():
            assert_no_raw_ids(v, forbidden)
    elif isinstance(obj, list):
        for v in obj:
            assert_no_raw_ids(v, forbidden)
    elif isinstance(obj, str):
        for fid in forbidden:
            if fid in obj:
                raise ValueError(f"raw id {fid!r} found in exported data: {obj!r}")
