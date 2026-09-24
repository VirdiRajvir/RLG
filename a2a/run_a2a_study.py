# A2A/run_a2a_study.py
import argparse, itertools
from . import config, driver, generator, references
from .renderer import render_html
from .store import Store
from .graph import run_trajectory as _run_trajectory

def iter_jobs(refs, driver_models, runs, run_start=1):
    return list(itertools.product(refs, range(run_start, run_start + runs), driver_models))

def _default_deps():
    return {"driver": driver.decide, "generator": generator.generate,
            "renderer": render_html, "target_image": references.target_image}

def run_all(refs, driver_models, runs, gen_model, store,
            deps_factory=_default_deps, run_trajectory=_run_trajectory, run_start=1):
    executed = skipped = errored = 0
    results = []
    for ref, run_index, model in iter_jobs(refs, driver_models, runs, run_start):
        if store.session_done(ref["id"], run_index, model, gen_model):
            skipped += 1
            continue
        deps = {**deps_factory(), "store": store}
        try:
            out = run_trajectory(ref, run_index, model, gen_model, deps)
        except Exception as e:
            # A single connection error / driver exception must not take down the
            # other ~89 jobs. graph.py's driver_node has no try/except of its own
            # (unlike generator/render), so this is the only place that catch lives
            # for the batch runner. The partially-created session row (if any) is
            # left with stop_reason still null — Task 9's ingest already excludes
            # those, so no bad data leaks in; just re-run to retry this slot.
            print(f"  [ERROR] {ref['id'][:8]} run{run_index} {model}: {type(e).__name__}: {e}")
            errored += 1
            continue
        results.append({"ref": ref["id"], "run": run_index, "model": model, **out})
        executed += 1
    return {"executed": executed, "skipped": skipped, "errored": errored, "results": results}

def main():
    ap = argparse.ArgumentParser(description="A2A batch collector (VLM driver x LLM generator)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--ref", type=str, default=None, help="run only this reference, by name (e.g. steel)")
    ap.add_argument("--limit-refs", type=int, default=None, help="cap number of references (order not guaranteed unless combined with --ref)")
    ap.add_argument("--runs", type=int, default=config.RUNS_PER_REFERENCE)
    ap.add_argument("--driver", type=str, default=None,
                     help="run only this driver model (must be one of config.DRIVER_MODELS) — "
                          "for a single-model ablation batch instead of the full 3-model matrix")
    ap.add_argument("--run-start", type=int, default=1,
                     help="first run_index to use — bump this to avoid colliding with an earlier "
                          "batch's completed (reference, run_index, driver_model, gen_model) rows "
                          "instead of re-running or overwriting them")
    args = ap.parse_args()

    if len(config.DRIVER_MODELS) != 3:
        raise SystemExit(f"config.DRIVER_MODELS must hold exactly 3 models, has {len(config.DRIVER_MODELS)} — set them before launching.")
    if not config.GEN_MODEL:
        raise SystemExit("config.GEN_MODEL is empty — set OPENROUTER_MODEL to the human-study model.")

    driver_models = config.DRIVER_MODELS
    if args.driver:
        if args.driver not in config.DRIVER_MODELS:
            raise SystemExit(f"--driver {args.driver!r} not in config.DRIVER_MODELS: {config.DRIVER_MODELS}")
        driver_models = [args.driver]

    refs = references.list_references()
    if args.ref:
        refs = [r for r in refs if r["name"] == args.ref]
        if not refs:
            raise SystemExit(f"No reference named {args.ref!r} in study_references.")
    else:
        # study_references still holds 11 older references from before the
        # relabeling pass — default to only the 5 kept ones rather than
        # silently running (and billing) all 16.
        refs = [r for r in refs if r["name"] in config.KEPT_REFERENCES]
    if args.limit_refs:
        refs = refs[: args.limit_refs]
    store = Store(dry_run=args.dry_run)
    summary = run_all(refs, driver_models, args.runs, config.GEN_MODEL, store, run_start=args.run_start)
    print(f"executed={summary['executed']} skipped={summary['skipped']} errored={summary['errored']}")
    for r in summary["results"]:
        print(f"  {r['ref'][:8]} run{r['run']} {r['model']}: {r['stop_reason']} "
              f"({r.get('turns','?')} turns, {r.get('duration_seconds',0):.1f}s, ${r.get('cost_usd',0):.4f})")

if __name__ == "__main__":
    main()
