import numpy as np
import pandas as pd
import pytest

from transform import build_anonymization_map, score_rows, assert_no_raw_ids


def test_anonymization_map_is_stable_across_runs():
    ids = ["ccc-3", "aaa-1", "bbb-2"]
    m1 = build_anonymization_map(ids, "P")
    m2 = build_anonymization_map(list(reversed(ids)), "P")
    assert m1 == m2
    assert m1 == {"aaa-1": "P1", "bbb-2": "P2", "ccc-3": "P3"}


def test_anonymization_map_deduplicates_repeated_ids():
    ids = ["x", "y", "x", "x", "y"]
    m = build_anonymization_map(ids, "R")
    assert m == {"x": "R1", "y": "R2"}
    assert len(set(m.values())) == 2


def test_score_rows_matches_hand_computed_dot_product():
    df = pd.DataFrame({"f1": [1.0, 0.0], "f2": [0.0, 1.0]})
    geo = ["f1", "f2"]
    wvec = np.array([2.0, 4.0])
    max_score = 6.0  # a perfect self-match on both features
    out = score_rows(df, geo, wvec, max_score)
    assert list(out["score"]) == [2.0 / 6.0, 4.0 / 6.0]


def test_score_rows_does_not_mutate_feature_columns():
    df = pd.DataFrame({"f1": [1.0], "f2": [1.0]})
    out = score_rows(df, ["f1", "f2"], np.array([1.0, 1.0]), 2.0)
    assert list(df.columns) == ["f1", "f2"]  # original untouched
    assert "score" in out.columns


def test_assert_no_raw_ids_passes_when_clean():
    assert_no_raw_ids({"a": ["P1", "R2"], "b": "hello"}, {"deadbeef00000000000000aa"})


def test_assert_no_raw_ids_catches_a_leaked_id_anywhere_in_the_tree():
    forbidden = {"deadbeef00000000000000aa"}
    with pytest.raises(ValueError, match="deadbeef00000000000000aa"):
        assert_no_raw_ids({"a": [{"b": "prolific pid deadbeef00000000000000aa here"}]}, forbidden)
