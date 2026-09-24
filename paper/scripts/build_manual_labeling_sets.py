"""
Builds two disjoint manual-labeling spreadsheets (18 prompts each: 3 per
condition x 6 conditions) for a blind accuracy check against the Haiku
classifications. The Haiku labels are withheld from both labeling sheets
and kept in a separate answer key, so labeling isn't anchored by the
model's own answer.

  python3.10 paper/scripts/build_manual_labeling_sets.py
"""
import csv
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
SEED = 42
PER_CONDITION_PER_SET = 3

random.seed(SEED)

rows = list(csv.DictReader(open(DATA / "prompt_classifications.csv")))
for i, r in enumerate(rows):
    r["id"] = f"P{i+1:04d}"

by_condition = {}
for r in rows:
    by_condition.setdefault(r["condition"], []).append(r)

set_user, set_supervisor, answer_key = [], [], []
for condition, crows in sorted(by_condition.items()):
    sample = random.sample(crows, 2 * PER_CONDITION_PER_SET)
    user_rows, sup_rows = sample[:PER_CONDITION_PER_SET], sample[PER_CONDITION_PER_SET:]
    set_user.extend(user_rows)
    set_supervisor.extend(sup_rows)
    answer_key.extend(user_rows + sup_rows)

def write_labeling_sheet(path, rows_subset):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "condition", "text", "is_creation", "is_removal", "is_adjustment"])
        for r in rows_subset:
            w.writerow([r["id"], r["condition"], r["text"], "", "", ""])
    print(f"saved {path} ({len(rows_subset)} rows)")

def write_answer_key(path, rows_subset):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "condition", "text", "haiku_is_creation", "haiku_is_removal",
                     "haiku_is_adjustment", "haiku_categories"])
        for r in rows_subset:
            w.writerow([r["id"], r["condition"], r["text"], r["is_creation"], r["is_removal"],
                         r["is_adjustment"], r["categories"]])
    print(f"saved {path} ({len(rows_subset)} rows) — keep this hidden until labeling is done")

write_labeling_sheet(DATA / "manual_labeling_user.csv", set_user)
write_labeling_sheet(DATA / "manual_labeling_supervisor.csv", set_supervisor)
write_answer_key(DATA / "manual_labeling_answer_key.csv", answer_key)

overlap = {r["id"] for r in set_user} & {r["id"] for r in set_supervisor}
print(f"\ndisjoint check: {len(overlap)} overlapping ids (should be 0)")
