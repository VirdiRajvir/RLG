# data_pipeline

Generates the binary-preference study corpus and ingests it straight into
Supabase. For each reference it produces a 5-turn iterative conversation (one
model, growing context), captures each turn as a candidate with
production-identical box geometry, adds a gold-broken sentinel, and precomputes
the within-group pairs.

```
references.js → [reference] + 5 candidates (turn_1…turn_5) + 1 gold_broken
              → C(5,2)=10 pairs + 1 gold pair
              → study_references / study_candidates / study_pairs
```

## Prerequisites

1. **Migration run** — `application/study_schema.sql` applied in Supabase (the
   four tables + RLS exist).
2. **Node 18+** (uses global `fetch`).
3. **Deps:** `npm install` in this folder.
4. **Env:** `cp .env.example .env` and fill in `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY_FREE`, `OPENROUTER_MODEL`.
5. **References populated** — `references.js` `REFERENCES` filled with your
   targets + their 5-turn prompt ladders (we do this together).

## Run

```bash
npm run generate     # or: node generate.js
```

With `REFERENCES` still empty it prints a notice and exits — safe to run early to
check env/deps.

## How it works

- **Memory:** OpenRouter is stateless, so each turn resends the full `messages`
  array. A **fresh array per reference** means context persists across a
  reference's 5 turns and never bleeds between references.
- **Geometry:** boxes come from the app's own `extractBoxes` / `extractRefBoxes`
  (re-exported from `application/api/evaluation.js`), rendered at the same
  `VIEWPORT` — so φ computed later matches the live metric exactly.
- **Tiers:** `tier = turn_1 … turn_5`. Early turns are the low-quality end of the
  ladder, later turns approach the reference.
- **Gold:** one near-empty sentinel candidate per reference, paired against the
  strongest real candidate (`is_gold = true`) to catch inattentive raters.
- **Idempotent:** a reference already in `study_references` (by `name`) is
  skipped, so a failed/partial run can be re-run without regenerating.

## Notes

- Uses the **service-role** key (writes bypass RLS). Keep `.env` local; it's
  gitignored.
- `boxes` are filled now via the reused extractor. `features` (φ) stay null and
  are backfilled at calibration time.
- Reference HTML must label scored blocks as `text-1`, `link-2`, … (matching
  `/^[a-z]+-\d+$/i`) or the extractor won't see them.
