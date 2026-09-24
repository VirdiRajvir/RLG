# A2A/config.py
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

VIEWPORT = {"width": 1080, "height": 900}   # from application/api/evaluation.js:34

GEN_MODEL = "anthropic/claude-opus-4.8"                  # the "driver" (writes the HTML) for this A2A batch —
                                                           # deliberately decoupled from OPENROUTER_MODEL / the live human study
GEN_TEMPERATURE = None                                   # None => omit from payload; chat.js never sets it
GEN_MAX_TOKENS = None                                    # None => omit from payload

DRIVER_MODELS: list[str] = [
    "anthropic/claude-opus-5",          # frontier
    "google/gemini-3-flash-preview",    # mid-tier
    "qwen/qwen2.5-vl-72b-instruct",     # cheap/open-weight
]

RUNS_PER_REFERENCE = 2

# The 5 references kept after the h2a box/container relabeling + simplification
# pass (see references/*.html and study_references) — study_references still
# holds 11 older references too, so run_a2a_study.py filters to this set by
# default rather than iterating every row.
KEPT_REFERENCES: list[str] = ["midcentury", "steel", "stickynotes", "retro", "darkminimal"]
FORCE_EXIT_CAP = 25   # safety valve only — the driver decides when to stop; this exists
                       # purely to kill a runaway loop, never intended to be hit in practice

def openrouter_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("Set OPENROUTER_API_KEY")
    return key

def supabase_creds() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    return url, key
