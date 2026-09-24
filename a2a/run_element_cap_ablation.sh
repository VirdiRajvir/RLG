#!/usr/bin/env bash
# A2A/run_element_cap_ablation.sh
#
# Runs the "elements per turn" ablation batch: Claude Opus 5, restricted to
# at most 4 distinct box-N/container-N elements per instruction (driver.py's
# ELEMENT_CAP_SUFFIX, gated by A2A_ELEMENT_CAP=1 — see driver.py for why 4
# and why it's scoped to Opus 5 only). This is the fourth Claude condition
# alongside the existing uncapped (run_index 6-7), word-capped (8-9), and
# reasoning-off (10-11) batches — run_index 12-13 keeps it from colliding
# with any of those (config.RUNS_PER_REFERENCE=2, so 12-13 covers both runs).
#
# The cap value (4) was picked from paper/scripts/
# element_count_analysis.py: humans/Qwen reference ~2-3 elements per
# instruction at the median, Claude/Gemini reference ~9 — 4 sits between the
# two, tight enough to force real per-turn discipline without collapsing to
# a single-element-at-a-time regime nothing in the corpus actually uses.
#
# Usage (repo root or anywhere — this script cd's to the repo root itself):
#   ./a2a/run_element_cap_ablation.sh                # real run, both runs, all 5 refs
#   ./a2a/run_element_cap_ablation.sh --ref steel     # single reference, for a quick check
#   A2A_RUNS=1 ./a2a/run_element_cap_ablation.sh      # only 1 run instead of 2 (run_index 12 only)
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

A2A_ELEMENT_CAP=1 "$VENV_PYTHON" -m A2A.run_a2a_study \
  --driver anthropic/claude-opus-5 \
  --run-start 12 \
  --runs "${A2A_RUNS:-2}" \
  "$@"
