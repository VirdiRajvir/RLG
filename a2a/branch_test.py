# A2A/branch_test.py
#
# Counterfactual branch test: pick a real human h2a session at a real turn T,
# hand Claude the EXACT same state a human participant faced there (full
# instruction history + target image + current-attempt image, via the
# unmodified A2A driver — nothing in that prompt distinguishes a human's past
# instructions from an AI's, so Claude is never told this history is human),
# and ask for exactly one next instruction. To isolate instruction QUALITY
# from code-generation-model quality, both Claude's instruction and the
# human's own actual next instruction (turn T+1, replayed) are sent through
# the SAME fixed generator model (a2a.config.GEN_MODEL) and scored against
# the same target with the project's standard weighted feature score. The
# historical score the human's turn T+1 actually got in the real study (a
# different generator model at the time) is also reported, but only as
# context — not the primary comparison, since that generator model is
# unknown/uncontrolled.
#
# One of the 5 branch points is deliberately the LAST turn of its session
# (no human turn T+1 exists to replay) — that one measures a different thing:
# how much score is still on the table after a human stopped, and how much of
# it Claude can recover in one more turn ("headroom").
#
# Run (from repo root, A2A's venv):
#   source A2A/.venv/bin/activate && python -m A2A.branch_test
#
# Requires: a2a/.env (OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
# Output:   paper/data/branch_test_results.csv
#           paper/data/branch_test/<label>_{target,before,claude,human_replay}.png

import csv
import json
import random
import subprocess
import sys
from pathlib import Path

from supabase import create_client

from . import config, driver, generator, references
from .renderer import render_html

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "paper" / "data"
SHOTS_DIR = DATA_DIR / "branch_test"
H2A_FEATURES = REPO_ROOT / "analysis" / "A2A_analysis" / "prolific" / "features_prolific.csv"
SCORER = REPO_ROOT / "data_pipeline" / "score_html_batch.mjs"

SEED = 42                              # reproducible pick of which 5 (session, turn) pairs are used
DRIVER_MODEL = "anthropic/claude-opus-5"  # unrestricted: no A2A_WORD_CAP / A2A_REASONING_OFF env vars set


def _weight_vector():
    """Same formula as paper/scripts/data.py's _weight_vector(), reimplemented
    without pandas since A2A's venv doesn't have it — keep the two in sync by hand."""
    cfg = json.loads((REPO_ROOT / "analysis/features-final.json").read_text())
    with open(REPO_ROOT / "analysis/prefelic_refit/weights_final.csv") as f:
        wrows = list(csv.DictReader(f))
    coef = {r["feature"]: float(r["coef_raw"]) for r in wrows}
    geo = [f for f in cfg["kept"] if f in coef]
    wvec = [coef[f] for f in geo]
    return geo, wvec, sum(wvec)


GEO, WVEC, MAX_SCORE = _weight_vector()


def score_from_features(row: dict) -> float:
    return sum(float(row[f]) * w for f, w in zip(GEO, WVEC)) / MAX_SCORE


def load_qualifying_h2a():
    """Rows from prolific's feature CSV, restricted to k>=2 qualifying
    conversations — the same filter every other figure/analysis in this
    paper uses (see data.py, classify_prompts.mjs)."""
    with open(H2A_FEATURES) as f:
        rows = list(csv.DictReader(f))
    qualifying = {r["conversation_id"] for r in rows if int(r["k"]) >= 2}
    return [r for r in rows if r["conversation_id"] in qualifying]


def pick_branch_points(rows, rng):
    by_ref = {}
    for r in rows:
        by_ref.setdefault(r["reference_name"], {}).setdefault(r["conversation_id"], []).append(int(r["turn"]))

    refs = sorted(by_ref.keys())
    rng.shuffle(refs)
    if not refs:
        raise SystemExit("No qualifying h2a sessions found — check features_prolific.csv / the k>=2 filter.")
    last_turn_ref = refs[0]

    picks = []
    for ref_name in refs:
        conv_turns = by_ref[ref_name]
        conv_id = rng.choice(sorted(conv_turns.keys()))
        turns = sorted(conv_turns[conv_id])
        max_turn = turns[-1]
        if ref_name == last_turn_ref or max_turn < 2:
            picks.append({"reference_name": ref_name, "conversation_id": conv_id,
                          "branch_turn": max_turn, "is_last_turn": True})
        else:
            branch_turn = rng.choice(range(1, max_turn))  # leaves room for turn+1 to exist
            picks.append({"reference_name": ref_name, "conversation_id": conv_id,
                          "branch_turn": branch_turn, "is_last_turn": False})
    return picks


def supabase_client():
    url, key = config.supabase_creds()
    return create_client(url, key)


def fetch_history(db, conversation_id, upto_turn):
    """Full alternating user/assistant history through upto_turn, in the same
    shape both driver.decide() and generator.generate() expect. driver.decide()
    only reads role=='user' entries (never told these came from a human)."""
    res = (db.table("messages").select("role,content,turn")
           .eq("conversation_id", conversation_id).lte("turn", upto_turn)
           .neq("role", "system").execute())
    rows = res.data or []
    rows.sort(key=lambda r: (r["turn"] or 0, 0 if r["role"] == "user" else 1))
    return [{"role": r["role"], "content": r["content"]} for r in rows]


def fetch_next_human_instruction(db, conversation_id, turn):
    res = (db.table("messages").select("content")
           .eq("conversation_id", conversation_id).eq("turn", turn).eq("role", "user").execute())
    rows = res.data or []
    return rows[0]["content"] if rows else None


def run_batch_scorer(items, tmp_dir: Path):
    if not items:
        return {}
    in_path = tmp_dir / "score_in.json"
    out_path = tmp_dir / "score_out.json"
    in_path.write_text(json.dumps(items))
    subprocess.run(["node", str(SCORER), str(in_path), str(out_path)],
                    check=True, cwd=str(REPO_ROOT / "data_pipeline"))
    return {r["id"]: r for r in json.loads(out_path.read_text())}


def main():
    if not config.GEN_MODEL:
        raise SystemExit("a2a.config.GEN_MODEL is empty — check a2a/.env.")

    rng = random.Random(SEED)
    h2a_rows = load_qualifying_h2a()
    picks = pick_branch_points(h2a_rows, rng)
    hist_score_by_key = {(r["conversation_id"], int(r["turn"])): score_from_features(r) for r in h2a_rows}

    db = supabase_client()
    ref_html_by_name = {r["name"]: r["html"] for r in references.list_references()}

    SHOTS_DIR.mkdir(parents=True, exist_ok=True)
    to_score = []
    results = []

    for p in picks:
        ref_name, conv_id, T, is_last = p["reference_name"], p["conversation_id"], p["branch_turn"], p["is_last_turn"]
        label = f"{ref_name}_{conv_id[:8]}_t{T}"
        print(f"\n=== {ref_name}  session {conv_id[:8]}  branch at turn {T}"
              f"{'  (LAST TURN — headroom test)' if is_last else ''} ===")

        ref_html = ref_html_by_name.get(ref_name)
        if ref_html is None:
            print(f"  [WARN] reference '{ref_name}' not found in study_references, skipping")
            continue

        history = fetch_history(db, conv_id, T)
        assistant_msgs = [m for m in history if m["role"] == "assistant"]
        html_at_T = assistant_msgs[-1]["content"] if assistant_msgs else None

        target_png = references.target_image(ref_html)
        render_png = render_html(html_at_T) if html_at_T else None
        (SHOTS_DIR / f"{label}_target.png").write_bytes(target_png)
        if render_png is not None:
            (SHOTS_DIR / f"{label}_before.png").write_bytes(render_png)

        decision = driver.decide(target_png, render_png, history, DRIVER_MODEL)
        print(f"  Claude ({DRIVER_MODEL}): {decision['action']} — {decision['instruction'][:120]!r}")

        claude_id, claude_html = None, None
        if decision["action"] == "continue" and decision["instruction"]:
            gen = generator.generate(history, decision["instruction"], None, config.GEN_MODEL)
            claude_html = gen["html"]
            claude_id = f"{label}_claude"
            to_score.append({"id": claude_id, "ref_html": ref_html, "gen_html": claude_html})
            (SHOTS_DIR / f"{label}_claude.png").write_bytes(render_html(claude_html))

        human_instruction = None if is_last else fetch_next_human_instruction(db, conv_id, T + 1)
        human_id, human_replay_html = None, None
        if human_instruction:
            gen = generator.generate(history, human_instruction, None, config.GEN_MODEL)
            human_replay_html = gen["html"]
            human_id = f"{label}_human_replay"
            to_score.append({"id": human_id, "ref_html": ref_html, "gen_html": human_replay_html})
            (SHOTS_DIR / f"{label}_human_replay.png").write_bytes(render_html(human_replay_html))

        results.append({
            "reference_name": ref_name, "conversation_id": conv_id, "branch_turn": T,
            "is_last_turn": is_last, "claude_action": decision["action"],
            "claude_instruction": decision["instruction"], "human_instruction": human_instruction or "",
            "claude_id": claude_id, "human_id": human_id,
        })

    scores = run_batch_scorer(to_score, SHOTS_DIR)

    out_rows = []
    for r in results:
        conv_id, T = r["conversation_id"], r["branch_turn"]
        score_at_branch = hist_score_by_key.get((conv_id, T))
        historical_next_score = None if r["is_last_turn"] else hist_score_by_key.get((conv_id, T + 1))
        claude_score = scores.get(r["claude_id"], {}).get("score") if r["claude_id"] else None
        human_replay_score = scores.get(r["human_id"], {}).get("score") if r["human_id"] else None
        out_rows.append({
            **{k: v for k, v in r.items() if k not in ("claude_id", "human_id")},
            "score_at_branch_turn": score_at_branch,
            "claude_score": claude_score,
            "human_replay_score": human_replay_score,
            "claude_minus_human_replay": (
                claude_score - human_replay_score if claude_score is not None and human_replay_score is not None else None),
            "claude_gain_over_branch": (
                claude_score - score_at_branch if claude_score is not None and score_at_branch is not None else None),
            "historical_human_score_next_turn": historical_next_score,
        })

    out_path = DATA_DIR / "branch_test_results.csv"
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
        w.writeheader()
        w.writerows(out_rows)

    print(f"\nWrote {len(out_rows)} branch-test results → {out_path}")
    print(f"Screenshots → {SHOTS_DIR}/")
    for r in out_rows:
        tag = "LAST TURN" if r["is_last_turn"] else "mid-session"
        print(f"  {r['reference_name']:12s} turn {r['branch_turn']:>2} ({tag}): "
              f"branch={r['score_at_branch_turn']}, claude={r['claude_score']}, "
              f"human_replay={r['human_replay_score']}, historical_next={r['historical_human_score_next_turn']}")


if __name__ == "__main__":
    main()
