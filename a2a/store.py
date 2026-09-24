# A2A/store.py
import itertools
from datetime import datetime, timezone
from .config import supabase_creds

_counter = itertools.count(1)

class Store:
    def __init__(self, client=None, dry_run: bool = False):
        self.dry_run = dry_run
        if client is not None:
            self.client = client
        elif not dry_run:
            from supabase import create_client
            url, key = supabase_creds()
            self.client = create_client(url, key)
        else:
            self.client = None

    def create_session(self, reference_id, gen_model, driver_model, run_index) -> str:
        if self.dry_run:
            return f"dry-{next(_counter)}"
        row = {"reference_id": reference_id, "gen_model": gen_model,
               "driver_model": driver_model, "run_index": run_index}
        res = self.client.table("a2a_sessions").insert(row).execute()
        return res.data[0]["id"]

    def save_turn(self, session_id, turn, instruction, html, usage) -> None:
        if self.dry_run:
            return
        row = {"session_id": session_id, "turn": turn, "instruction": instruction,
               "html": html, "usage": usage}
        self.client.table("a2a_messages").insert(row).execute()

    def finish_session(self, session_id, stop_reason, turns, duration_seconds, totals) -> None:
        if self.dry_run:
            return
        self.client.table("a2a_sessions").update({
            "stop_reason": stop_reason,
            "turns": turns,
            "ended_at": datetime.now(timezone.utc).isoformat(),
            "duration_seconds": duration_seconds,
            "tokens_generator_in": totals["generator_in"],
            "tokens_generator_out": totals["generator_out"],
            "tokens_driver_in": totals["driver_in"],
            "tokens_driver_out": totals["driver_out"],
            "cost_usd": totals["cost_usd"],
        }).eq("id", session_id).execute()

    def session_done(self, reference_id, run_index, driver_model, gen_model) -> bool:
        # gen_model MUST be part of this check — otherwise, once the generator
        # varies (the matrix study), a completed (ref, run, driver) slot with
        # one generator would incorrectly be reported "done" for every other
        # generator too, silently skipping cells that were never actually run.
        if self.dry_run:
            return False
        res = (self.client.table("a2a_sessions").select("id,stop_reason")
               .eq("reference_id", reference_id).eq("run_index", run_index)
               .eq("driver_model", driver_model).eq("gen_model", gen_model).execute())
        return any(r.get("stop_reason") in ("done", "capped") for r in (res.data or []))
