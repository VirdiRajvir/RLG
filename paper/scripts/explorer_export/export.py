"""
Static-export script for the /explore data explorer. Run manually,
re-run whenever the underlying study data changes — this produces a frozen
snapshot, not a live sync (see spec: docs/superpowers/specs/2026-09-13-explore-data-explorer-design.md).

  A2A/.venv/bin/python3 -m paper.scripts.explorer_export.export
  (run from the repo root, so the relative CSV/JSON paths below resolve)
"""
import json
import os
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

from .transform import assert_no_raw_ids, build_anonymization_map, load_weight_vector, score_rows

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = REPO_ROOT / "application/frontend/src/explore-data"


def _client():
    load_dotenv(REPO_ROOT / "a2a" / ".env")
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def export_references(client) -> dict[str, dict]:
    """Returns {reference_id: {"id", "name", "html"}} for every reference
    that appears in the kept-references corpus — study_references already
    holds exactly the 5 kept references plus 1 practice reference; the
    practice one never appears in any qualifying H2A/A2A row, so it's
    naturally excluded by only keeping references actually referenced
    below (see main())."""
    rows = client.table("study_references").select("id,name,html").execute().data
    return {r["id"]: {"id": r["id"], "name": r["name"], "html": r["html"]} for r in rows}


def export_h2a(client, geo, wvec, max_score) -> tuple[list[dict], set[str]]:
    """Returns (sessions, reference_ids_used).

    Each session: {"id": conversation_id, "participant": "P#",
    "reference_id", "turns": [{"turn", "instruction", "html", "score",
    "features": {feature_name: value}}]}.

    generation_id in features_prolific.csv == messages.id where
    role='assistant' (confirmed in data_pipeline/features_prolific.js:
    `m.id` is pushed as generation_id, `m` comes from
    `.eq('role', 'assistant')`). The paired instruction is the role='user'
    message at the same conversation_id + turn. `messages` can have
    multiple assistant rows per conversation, so the HTML join must key on
    `generation_id` (== `messages.id`), not just conversation_id + turn.
    """
    feats = pd.read_csv(REPO_ROOT / "analysis/A2A_analysis/prolific/features_prolific.csv")
    feats = score_rows(feats, geo, wvec, max_score)
    qualifying = feats.loc[feats["k"] >= 2, "conversation_id"].unique()
    feats = feats[feats["conversation_id"].isin(qualifying)]

    pid_map = build_anonymization_map(feats["prolific_pid"].astype(str).tolist(), "P")

    conv_ids = feats["conversation_id"].unique().tolist()
    msg_rows = []
    for i in range(0, len(conv_ids), 50):
        batch = conv_ids[i:i + 50]
        data = (client.table("messages")
                .select("id,conversation_id,role,turn,content")
                .in_("conversation_id", batch)
                .execute().data)
        msg_rows.extend(data)
    msgs = pd.DataFrame(msg_rows)
    html_by_id = msgs.set_index("id")["content"]
    instruction_by_conv_turn = (msgs[msgs["role"] == "user"]
                                .set_index(["conversation_id", "turn"])["content"])

    sessions = {}
    for row in feats.itertuples():
        key = row.conversation_id
        if key not in sessions:
            sessions[key] = {
                "id": key,
                "participant": pid_map[str(row.prolific_pid)],
                "reference_id": row.reference_id,
                "turns": [],
            }
        sessions[key]["turns"].append({
            "turn": int(row.turn),
            "instruction": instruction_by_conv_turn.get((row.conversation_id, row.turn), ""),
            "html": html_by_id.get(row.generation_id, ""),
            "score": float(row.score),
            "features": {f: float(getattr(row, f)) for f in geo},
        })

    for sess in sessions.values():
        sess["turns"].sort(key=lambda t: t["turn"])

    return list(sessions.values()), set(feats["reference_id"].unique())


def export_a2a(client, geo, wvec, max_score) -> tuple[list[dict], set[str]]:
    """a2a_messages already carries instruction+html on the same row, so
    unlike H2A there's no separate user/assistant join needed — one lookup
    by generation_id (== a2a_messages.id, confirmed in
    data_pipeline/features_a2a.js) is enough."""
    feats = pd.read_csv(REPO_ROOT / "analysis/A2A_analysis/a2a/features_a2a.csv")
    feats = score_rows(feats, geo, wvec, max_score)
    qualifying = feats.loc[feats["k"] >= 2, "conversation_id"].unique()
    feats = feats[feats["conversation_id"].isin(qualifying)]

    gen_ids = feats["generation_id"].unique().tolist()
    msg_rows = []
    for i in range(0, len(gen_ids), 50):
        batch = gen_ids[i:i + 50]
        data = (client.table("a2a_messages").select("id,instruction,html").in_("id", batch).execute().data)
        msg_rows.extend(data)
    msgs = pd.DataFrame(msg_rows).set_index("id")

    def condition_of(row) -> str:
        if row.driver_model == "anthropic/claude-opus-5":
            if row.run_index >= 16: return "claude_human_style_no_numbers"
            if row.run_index >= 14: return "claude_human_style"
            if row.run_index >= 12: return "claude_element_cap"
            if row.run_index >= 10: return "claude_no_thinking"
            if row.run_index >= 8: return "claude_capped"
            return "claude_uncapped"
        if row.driver_model == "google/gemini-3-flash-preview":
            return "gemini"
        return "qwen"

    sessions = {}
    for row in feats.itertuples():
        key = row.conversation_id  # this CSV's "conversation_id" column is actually a2a_sessions.id
        if key not in sessions:
            sessions[key] = {
                "id": key,
                "condition": condition_of(row),
                "reference_id": row.reference_id,
                "turns": [],
            }
        msg = msgs.loc[row.generation_id] if row.generation_id in msgs.index else {"instruction": "", "html": ""}
        sessions[key]["turns"].append({
            "turn": int(row.turn),
            "instruction": msg["instruction"],
            "html": msg["html"],
            "score": float(row.score),
            "features": {f: float(getattr(row, f)) for f in geo},
        })

    for sess in sessions.values():
        sess["turns"].sort(key=lambda t: t["turn"])

    return list(sessions.values()), set(feats["reference_id"].unique())


def export_prefelic(client, geo, wvec, max_score) -> list[dict]:
    """One row per unique (a_msg, b_msg) pair, aggregating every clean
    rater's choice on that pair. Restricted to the same 19 QC-clean raters
    refit_prefelic_final.py uses (gold accuracy >= 0.70) — matches the
    paper's own 718-decisive-judgment population exactly."""
    GOLD_THRESH = 0.70
    j = pd.read_csv(REPO_ROOT / "analysis/prefelic_refit/judgments.csv")
    gold = j[j["is_gold"]]
    acc = gold.groupby("rater_id")["choice"].apply(lambda c: (c == "a").mean())
    clean_raters = set(acc[acc >= GOLD_THRESH].index)
    j = j[j["rater_id"].isin(clean_raters)]

    rater_map = build_anonymization_map(j["rater_id"].astype(str).tolist(), "R")

    # The PE candidate pool is its own small (30-row) feature set, written by
    # the prefelic weight-refit pipeline — distinct from
    # prolific/features_prolific.csv's full H2A trend corpus. Every
    # a_msg/b_msg in judgments.csv resolves against THIS file, not that one
    # (confirmed: all 30 distinct candidate ids in judgments.csv are covered
    # here, including the 5 gold_broken QC sentinels; several are missing
    # from features_prolific.csv, which is a different, non-overlapping
    # snapshot of the corpus).
    feats = pd.read_csv(REPO_ROOT / "analysis/prefelic_refit/features.csv")
    feats = score_rows(feats, geo, wvec, max_score).set_index("generation_id")

    # judgments.csv's a_msg/b_msg are study_candidates.id, not messages.id —
    # PE candidates were copied into their own study_candidates row by
    # data_pipeline/ingest-candidates.js, with the original H2A
    # provenance kept in a `meta` jsonb column (confirmed live:
    # {"turn", "user_id", "prolific_pid", "conversation_id"} for a real
    # candidate; a gold_broken sentinel's meta has neither field, since it
    # was never sourced from a real H2A turn). `meta.prolific_pid` is a raw
    # Prolific id — only conversation_id/turn are ever pulled out of it
    # below; the dict itself is never re-exported.
    all_cand_ids = pd.unique(j[["a_msg", "b_msg"]].values.ravel())
    cand_rows = []
    for i in range(0, len(all_cand_ids), 50):
        batch = list(all_cand_ids[i:i + 50])
        data = (client.table("study_candidates")
                .select("id,html,meta")
                .in_("id", batch)
                .execute().data)
        cand_rows.extend(data)
    cands = pd.DataFrame(cand_rows).set_index("id")

    def candidate(cand_id: str) -> dict:
        row = feats.loc[cand_id]
        cand = cands.loc[cand_id]
        meta = cand["meta"] or {}
        return {
            "generation_id": cand_id,
            "html": cand["html"],
            "score": float(row["score"]),
            "features": {f: float(row[f]) for f in geo},
            "h2a_session_id": meta.get("conversation_id"),
            "h2a_turn": meta.get("turn"),
        }

    pairs = {}
    for row in j.itertuples():
        key = (row.a_msg, row.b_msg)
        if key not in pairs:
            pairs[key] = {
                "id": f"{row.a_msg}_{row.b_msg}",
                "reference_id": row.reference_id,
                "is_gold": bool(row.is_gold),
                "candidate_a": candidate(row.a_msg),
                "candidate_b": candidate(row.b_msg),
                "raters": [],
            }
        if row.choice in ("a", "b"):
            pairs[key]["raters"].append({"rater": rater_map[str(row.rater_id)], "choice": row.choice})

    out = []
    for pair in pairs.values():
        a_votes = sum(1 for r in pair["raters"] if r["choice"] == "a")
        b_votes = sum(1 for r in pair["raters"] if r["choice"] == "b")
        pair["split"] = {"a": a_votes, "b": b_votes}
        pair["winner"] = "a" if a_votes > b_votes else ("b" if b_votes > a_votes else None)
        out.append(pair)
    return out


def main():
    client = _client()
    geo, wvec, max_score = load_weight_vector(REPO_ROOT)

    h2a_sessions, h2a_ref_ids = export_h2a(client, geo, wvec, max_score)
    a2a_sessions, a2a_ref_ids = export_a2a(client, geo, wvec, max_score)
    prefelic_pairs = export_prefelic(client, geo, wvec, max_score)

    all_refs = export_references(client)
    used_ref_ids = h2a_ref_ids | a2a_ref_ids | {p["reference_id"] for p in prefelic_pairs}
    references = [all_refs[r] for r in used_ref_ids if r in all_refs]

    # Safety net: the raw prolific_pid/rater_id values must never have made
    # it into any output structure, even by accident (e.g. a stray column
    # kept during a future edit to the functions above).
    raw_pids = set(pd.read_csv(REPO_ROOT / "analysis/A2A_analysis/prolific/features_prolific.csv")["prolific_pid"].astype(str))
    raw_raters = set(pd.read_csv(REPO_ROOT / "analysis/prefelic_refit/judgments.csv")["rater_id"].astype(str))
    for payload in (h2a_sessions, a2a_sessions, prefelic_pairs, references):
        assert_no_raw_ids(payload, raw_pids | raw_raters)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "h2a.json").write_text(json.dumps({"sessions": h2a_sessions}, indent=2))
    (OUT_DIR / "a2a.json").write_text(json.dumps({"sessions": a2a_sessions}, indent=2))
    (OUT_DIR / "prefelic.json").write_text(json.dumps({"pairs": prefelic_pairs}, indent=2))
    (OUT_DIR / "references.json").write_text(json.dumps({"references": references}, indent=2))
    print(f"wrote {len(h2a_sessions)} h2a sessions, {len(a2a_sessions)} a2a sessions, "
          f"{len(prefelic_pairs)} prefelic pairs, {len(references)} references to {OUT_DIR}")


if __name__ == "__main__":
    main()
