#!/usr/bin/env bash
# A2A/run_human_style_ablation.sh
#
# Runs the "human style" ablation batch: Claude Opus 5, given real human
# participant instructions as a few-shot style guide PLUS (as of the second
# pass at this ablation) a strict rule against exact coordinates, pixel
# values, or percentages (driver.py's HUMAN_STYLE_SUFFIX/NO_NUMBERS_SUFFIX,
# gated by A2A_HUMAN_STYLE=1 — see driver.py for the example sourcing and
# rationale). The few-shot part is a soft nudge the model can ignore; the
# no-numbers part is a strict instruction, but still not a hard-enforced
# ceiling the way word/element caps are — there's no code checking the
# model's output against it.
#
# First pass (few-shot only, run_index 14-15, 10 sessions) barely moved
# Claude's behavior — elements-per-instruction median only dropped 9→7,
# nowhere near human's 2, and score was nearly identical to unrestricted.
# This second pass adds the numeric-precision ban specifically, to test
# whether that (rather than verbosity/granularity in general) is the
# missing piece — and drops to 1 run per reference (run_index 16 only, 5
# sessions total) rather than 2, since the first pass already established
# there's nothing to average out across 10 unless this version shows a
# real effect worth confirming.
#
# run_index 16 keeps this from colliding with every earlier Claude
# condition (uncapped 6-7, word-capped 8-9, reasoning-off 10-11,
# element-cap 12-13, human-style-v1 14-15) — run_a2a_study.py's
# session_done() dedup is keyed on run_index, so reusing 14 here would just
# silently skip every reference as "already done" instead of producing new
# data. paper/scripts/data.py's _claude_condition() buckets
# run_index >= 16 as "claude_human_style_no_numbers" (kept distinct from
# the run_index 14-15 "claude_human_style" condition, since they're
# different manipulations).
#
# Usage (repo root or anywhere — this script cd's to the repo root itself):
#   ./a2a/run_human_style_ablation.sh                # real run, 1 run per ref, all 5 refs (5 sessions)
#   ./a2a/run_human_style_ablation.sh --ref steel     # single reference, for a quick check
#   A2A_RUNS=2 ./a2a/run_human_style_ablation.sh      # 2 runs instead of 1 (run_index 16-17)
#
# NOTE: --dry-run does NOT avoid API cost — it only skips the Supabase write
# at the end (run_a2a_study.py -> Store(dry_run=True)). The real driver and
# generator calls (Opus 5 + Opus 4.8, a full multi-turn trajectory) still
# happen, exactly like trial_run.py documents. There is no free way to sanity
# check this end to end short of a real, billed trajectory — use --ref with
# a single reference to keep that cost as small as possible.
#
# Extra args are passed straight through to run_a2a_study.py (see its
# --help for the full list — --dry-run, --ref, --limit-refs, etc).

set -euo pipefail
cd "$(dirname "$0")/.."   # repo root, so `python -m A2A.run_a2a_study` resolves

VENV_PYTHON="A2A/.venv/bin/python"
if [ ! -x "$VENV_PYTHON" ]; then
  echo "error: $VENV_PYTHON not found — set up A2A's venv first (pip install -r A2A/requirements.txt)" >&2
  exit 1
fi

A2A_HUMAN_STYLE=1 "$VENV_PYTHON" -m A2A.run_a2a_study \
  --driver anthropic/claude-opus-5 \
  --run-start 16 \
  --runs "${A2A_RUNS:-1}" \
  "$@"
