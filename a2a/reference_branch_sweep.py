# A2A/reference_branch_sweep.py
#
# Exhaustive counterfactual branch test for ONE reference: every turn of
# every qualifying human session using that reference becomes a branch
# point. At each one, all three driver models (Claude, Gemini, Qwen — all
# unrestricted, no ablation toggles) are handed the exact same state a human
# participant faced there (full instruction history + target + current
# attempt, via the unmodified A2A driver — nothing in that prompt
# distinguishes a human's past instructions from an AI's) and asked for one
# next instruction, which is then sent through the same fixed generator
# model (a2a.config.GEN_MODEL) used throughout this paper's A2A batches.
#
# Unlike A2A/branch_test.py (5 sampled branch points, Claude only, and a
# regenerated "human replay" for a generator-controlled score comparison),
# this script:
#   - covers EVERY turn of BOTH qualifying human sessions for one reference
#   - runs all 3 driver models per branch point, not just Claude
#   - shows the human's ACTUAL historical next turn (real screenshot, real
#     recorded score from features_prolific.csv) rather than a regenerated
#     replay — this script is a qualitative "what would each model have
#     done here" collage, not a generator-controlled statistical comparison,
#     so there is no need to regenerate the human's own instruction.
#
# Run (from repo root, A2A's venv):
#   source A2A/.venv/bin/activate && python -m A2A.reference_branch_sweep
#   python -m A2A.reference_branch_sweep --ref steel   # a different reference
#
# Requires: a2a/.env (OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
# Output:   paper/data/branch_sweep_<ref>.csv
#           paper/data/branch_sweep_<ref>/<label>_{target,before,human_next,claude,gemini,qwen}.png

import argparse
import csv
import json
import subprocess
from pathlib import Path

from supabase import create_client

from . import config, driver, generator, references
from .renderer import render_html

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "paper" / "data"
H2A_FEATURES = REPO_ROOT / "analysis" / "A2A_analysis" / "prolific" / "features_prolific.csv"
SCORER = REPO_ROOT / "data_pipeline" / "score_html_batch.mjs"

MODEL_KEYS = {
    "anthropic/claude-opus-5": "claude",
    "google/gemini-3-flash-preview": "gemini",
    "qwen/qwen2.5-vl-72b-instruct": "qwen",
}


def _weight_vector():
    """Same formula as paper/scripts/data.py's _weight_vector() and
    A2A/branch_test.py's copy — reimplemented here too since A2A's venv has
    no pandas. Keep all three in sync by hand."""
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


def load_qualifying_sessions(ref_name):
    """(conversation_id -> max_turn) for every k>=2 qualifying human session
    on this reference, plus a lookup of score-by-(conversation_id, turn)."""
    with open(H2A_FEATURES) as f:
        rows = list(csv.DictReader(f))
    qualifying = {r["conversation_id"] for r in rows if int(r["k"]) >= 2}
    rows = [r for r in rows if r["conversation_id"] in qualifying and r["reference_name"] == ref_name]
    if not rows:
        raise SystemExit(f"No qualifying sessions found for reference {ref_name!r}.")
    score_by_key = {(r["conversation_id"], int(r["turn"])): score_from_features(r) for r in rows}
    max_turn = {}
    for r in rows:
        cid, t = r["conversation_id"], int(r["turn"])
        max_turn[cid] = max(max_turn.get(cid, 0), t)
    return max_turn, score_by_key


def supabase_client():
    url, key = config.supabase_creds()
    return create_client(url, key)


def fetch_history(db, conversation_id, upto_turn):
    res = (db.table("messages").select("role,content,turn")
           .eq("conversation_id", conversation_id).lte("turn", upto_turn)
           .neq("role", "system").execute())
    rows = res.data or []
    rows.sort(key=lambda r: (r["turn"] or 0, 0 if r["role"] == "user" else 1))
    return [{"role": r["role"], "content": r["content"]} for r in rows]


def fetch_assistant_html(db, conversation_id, turn):
    res = (db.table("messages").select("content")
           .eq("conversation_id", conversation_id).eq("turn", turn).eq("role", "assistant").execute())
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
    ap = argparse.ArgumentParser(description="Exhaustive multi-model branch sweep over one reference's human turns")
    ap.add_argument("--ref", type=str, default="darkminimal")
    args = ap.parse_args()
    ref_name = args.ref

    if not config.GEN_MODEL:
        raise SystemExit("a2a.config.GEN_MODEL is empty — check a2a/.env.")

    max_turn, score_by_key = load_qualifying_sessions(ref_name)
    print(f"{ref_name}: {len(max_turn)} qualifying sessions, "
          f"{sum(max_turn.values())} total human turns → that many branch points")

    db = supabase_client()
    ref_html = next((r["html"] for r in references.list_references() if r["name"] == ref_name), None)
    if ref_html is None:
        raise SystemExit(f"Reference {ref_name!r} not found in study_references.")
    target_png = references.target_image(ref_html)

    shots_dir = DATA_DIR / f"branch_sweep_{ref_name}"
    shots_dir.mkdir(parents=True, exist_ok=True)
    (shots_dir / "target.png").write_bytes(target_png)

    to_score = []
    results = []

    for conv_id in sorted(max_turn.keys()):
        session_max = max_turn[conv_id]
        for T in range(1, session_max + 1):
            label = f"{conv_id[:8]}_t{T}"
            is_last_turn = T == session_max
            print(f"\n=== session {conv_id[:8]}  turn {T}/{session_max}"
                  f"{'  (LAST TURN)' if is_last_turn else ''} ===")

            history = fetch_history(db, conv_id, T)
            html_at_T = fetch_assistant_html(db, conv_id, T)
            render_png = render_html(html_at_T) if html_at_T else None
            (shots_dir / f"{label}_before.png").write_bytes(render_png if render_png is not None else b"")

            human_next_html = None if is_last_turn else fetch_assistant_html(db, conv_id, T + 1)
            if human_next_html:
                (shots_dir / f"{label}_human_next.png").write_bytes(render_html(human_next_html))

            row = {
                "conversation_id": conv_id, "turn": T, "is_last_turn": is_last_turn,
                "score_before": score_by_key.get((conv_id, T)),
                "score_human_next": None if is_last_turn else score_by_key.get((conv_id, T + 1)),
            }

            for model, key in MODEL_KEYS.items():
                decision = driver.decide(target_png, render_png, history, model)
                print(f"  {key:7s} ({model}): {decision['action']} — {decision['instruction'][:90]!r}")
                row[f"{key}_action"] = decision["action"]
                row[f"{key}_instruction"] = decision["instruction"]
                if decision["action"] == "continue" and decision["instruction"]:
                    gen = generator.generate(history, decision["instruction"], None, config.GEN_MODEL)
                    html = gen["html"]
                    (shots_dir / f"{label}_{key}.png").write_bytes(render_html(html))
                    score_id = f"{label}_{key}"
                    to_score.append({"id": score_id, "ref_html": ref_html, "gen_html": html})
                    row[f"{key}_score_id"] = score_id
                else:
                    row[f"{key}_score_id"] = None

            results.append(row)

    print(f"\nScoring {len(to_score)} new generations...")
    scores = run_batch_scorer(to_score, shots_dir)

    out_rows = []
    for r in results:
        out_row = {k: v for k, v in r.items() if not k.endswith("_score_id")}
        for key in MODEL_KEYS.values():
            score_id = r.get(f"{key}_score_id")
            out_row[f"score_{key}"] = scores.get(score_id, {}).get("score") if score_id else None
        out_rows.append(out_row)

    out_path = DATA_DIR / f"branch_sweep_{ref_name}.csv"
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
        w.writeheader()
        w.writerows(out_rows)

    print(f"\nWrote {len(out_rows)} branch points → {out_path}")
    print(f"Screenshots → {shots_dir}/")


if __name__ == "__main__":
    main()
