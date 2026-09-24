# A2A/graph.py
import time
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from .config import FORCE_EXIT_CAP

class TrajectoryState(TypedDict, total=False):
    target_png: bytes
    render_png: bytes | None
    history: list
    turn: int
    session_id: str
    driver_model: str
    gen_model: str
    action: str
    instruction: str
    last_driver_usage: dict
    pending_html: str
    pending_gen_usage: dict
    stop_reason: str | None
    totals: dict
    deps: dict

def driver_node(state):
    d = state["deps"]["driver"]
    a = d(state["target_png"], state.get("render_png"), state["history"], state["driver_model"])
    totals = dict(state["totals"])
    totals["driver_in"] += a["usage"]["in"]
    totals["driver_out"] += a["usage"]["out"]
    totals["cost_usd"] += a["usage"].get("cost", 0.0)
    updates = {"action": a["action"], "instruction": a["instruction"],
               "last_driver_usage": a["usage"], "totals": totals}
    if a["action"] == "stop":
        updates["stop_reason"] = "done"
    elif state["turn"] >= FORCE_EXIT_CAP:
        updates["stop_reason"] = "capped"      # safety valve — the driver never stopped on its own
    return updates

def route_after_driver(state):
    return "end" if state.get("stop_reason") else "generator"

def generator_node(state):
    intent = "generate" if state["turn"] == 0 else "modify"
    try:
        gen = state["deps"]["generator"](state["history"], state["instruction"], intent, state["gen_model"])
    except Exception:
        return {"stop_reason": "failed"}
    totals = dict(state["totals"])
    totals["generator_in"] += gen["usage"]["in"]
    totals["generator_out"] += gen["usage"]["out"]
    totals["cost_usd"] += gen["usage"].get("cost", 0.0)
    return {"pending_html": gen["html"], "pending_gen_usage": gen["usage"], "totals": totals}

def route_after_generator(state):
    return "end" if state.get("stop_reason") else "render"

def render_node(state):
    try:
        png = state["deps"]["renderer"](state["pending_html"])
    except Exception:
        return {"stop_reason": "failed"}
    turn = state["turn"] + 1
    usage = {"generator": state["pending_gen_usage"], "driver": state["last_driver_usage"]}
    state["deps"]["store"].save_turn(state["session_id"], turn, state["instruction"], state["pending_html"], usage)
    history = state["history"] + [{"role": "user", "content": state["instruction"]},
                                   {"role": "assistant", "content": state["pending_html"]}]
    return {"render_png": png, "turn": turn, "history": history}

def route_after_render(state):
    return "end" if state.get("stop_reason") else "driver"

def build_graph():
    sg = StateGraph(TrajectoryState)
    sg.add_node("driver", driver_node)
    sg.add_node("generator", generator_node)
    sg.add_node("render", render_node)
    sg.add_edge(START, "driver")
    sg.add_conditional_edges("driver", route_after_driver, {"end": END, "generator": "generator"})
    sg.add_conditional_edges("generator", route_after_generator, {"end": END, "render": "render"})
    sg.add_conditional_edges("render", route_after_render, {"end": END, "driver": "driver"})
    return sg.compile()

_GRAPH = build_graph()

def run_trajectory(reference, run_index, driver_model, gen_model, deps) -> dict:
    store = deps["store"]
    session_id = store.create_session(reference["id"], gen_model, driver_model, run_index)
    initial_state = {
        "target_png": deps["target_image"](reference["html"]),
        "render_png": None,
        "history": [],
        "turn": 0,
        "session_id": session_id,
        "driver_model": driver_model,
        "gen_model": gen_model,
        "stop_reason": None,
        "totals": {"generator_in": 0, "generator_out": 0, "driver_in": 0, "driver_out": 0, "cost_usd": 0.0},
        "deps": deps,
    }
    t0 = time.monotonic()
    # recursion_limit: 3 nodes (driver/generator/render) per turn, +2 turns of headroom
    final_state = _GRAPH.invoke(initial_state, {"recursion_limit": (FORCE_EXIT_CAP + 2) * 3})
    duration_seconds = time.monotonic() - t0
    stop_reason = final_state.get("stop_reason") or "capped"
    turn = final_state.get("turn", 0)
    totals = final_state["totals"]
    store.finish_session(session_id, stop_reason, turn, duration_seconds, totals)
    return {"stop_reason": stop_reason, "turns": turn, "conv_id": session_id,
            "duration_seconds": duration_seconds, "cost_usd": totals["cost_usd"]}
