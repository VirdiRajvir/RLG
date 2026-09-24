"""
Scores the manually-labeled test sets (data/manual_labeling_user.csv and
data/manual_labeling_supervisor.csv) against Haiku's own classifications
(data/manual_labeling_answer_key.csv, produced alongside the labeling
sheets and withheld from the labelers). Handles both plain CSV and files
that were accidentally saved as Apple Numbers documents under a .csv name
(detected by the "PK" zip signature) — the labeling sheets in this project
have arrived in both forms.

  python3.10 paper/scripts/score_manual_labels.py
"""
import csv
import shutil
import tempfile
from pathlib import Path

try:
    import numbers_parser
except ImportError:
    numbers_parser = None

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
CATS = ["is_creation", "is_removal", "is_adjustment"]

def load_rows(path):
    with open(path, "rb") as f:
        head = f.read(2)
    if head == b"PK":
        if numbers_parser is None:
            raise SystemExit(f"{path} is an Apple Numbers document, not a CSV. "
                              f"Install with: python3.10 -m pip install numbers-parser")
        with tempfile.NamedTemporaryFile(suffix=".numbers", delete=False) as tmp:
            shutil.copy(path, tmp.name)
            doc = numbers_parser.Document(tmp.name)
            table_rows = doc.sheets[0].tables[0].rows(values_only=True)
        header = table_rows[0]
        return [dict(zip(header, row)) for row in table_rows[1:]]
    return list(csv.DictReader(open(path)))

def as_bool(v):
    return 1 if v not in (None, "", "0", 0) else 0

def main():
    answer_key = {r["id"]: r for r in load_rows(DATA / "manual_labeling_answer_key.csv")}

    all_results = []
    for rater, filename in [("user", "manual_labeling_user.csv"), ("supervisor", "manual_labeling_supervisor.csv")]:
        rows = load_rows(DATA / filename)
        for r in rows:
            key = answer_key.get(r["id"])
            if key is None:
                print(f"  [WARN] {filename}: id {r['id']} not found in answer key, skipping")
                continue
            result = {"rater": rater, "id": r["id"], "condition": r["condition"]}
            for cat in CATS:
                human_val = as_bool(r.get(cat))
                haiku_val = as_bool(key.get(f"haiku_{cat}"))
                result[cat + "_human"] = human_val
                result[cat + "_haiku"] = haiku_val
                result[cat + "_match"] = int(human_val == haiku_val)
            result["exact_set_match"] = int(all(result[cat + "_match"] for cat in CATS))
            all_results.append(result)

    n = len(all_results)
    print(f"Scored {n} labeled prompts (18 user + 18 supervisor)\n")

    def pct(vals):
        return 100 * sum(vals) / len(vals) if vals else float("nan")

    print("=== Per-category accuracy (human label vs Haiku label) ===")
    for cat in CATS:
        overall = pct([r[cat + "_match"] for r in all_results])
        user_acc = pct([r[cat + "_match"] for r in all_results if r["rater"] == "user"])
        sup_acc = pct([r[cat + "_match"] for r in all_results if r["rater"] == "supervisor"])
        print(f"  {cat:15s}  overall {overall:5.1f}%   you {user_acc:5.1f}%   supervisor {sup_acc:5.1f}%")

    print("\n=== Exact match (all 3 labels agree) ===")
    overall = pct([r["exact_set_match"] for r in all_results])
    user_acc = pct([r["exact_set_match"] for r in all_results if r["rater"] == "user"])
    sup_acc = pct([r["exact_set_match"] for r in all_results if r["rater"] == "supervisor"])
    print(f"  overall {overall:5.1f}%   you {user_acc:5.1f}%   supervisor {sup_acc:5.1f}%")

    print("\n=== Disagreements (for manual review) ===")
    for r in all_results:
        if not r["exact_set_match"]:
            human_cats = "+".join(c.replace("is_", "").capitalize() for c in CATS if r[c + "_human"])
            haiku_cats = "+".join(c.replace("is_", "").capitalize() for c in CATS if r[c + "_haiku"])
            print(f"  [{r['rater']:10s}] {r['id']} ({r['condition']}): human={human_cats or '(none)'}  haiku={haiku_cats or '(none)'}")

    out_path = DATA / "manual_labeling_scored.csv"
    with open(out_path, "w", newline="") as f:
        cols = ["rater", "id", "condition"] + [c + s for c in CATS for s in ("_human", "_haiku", "_match")] + ["exact_set_match"]
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(all_results)
    print(f"\nWrote {out_path}")

if __name__ == "__main__":
    main()
