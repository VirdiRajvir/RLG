# A2A/driver.py
import base64, json, os, re, requests
from .config import openrouter_key


# Content mirrors, section for section, what a human participant is actually
# told on the /prefelic Instructions page and TutorialGuide walkthrough
# (application/frontend/src/components/prolific/Instructions.jsx and
# TutorialGuide.jsx) — the driver is standing in for the participant, so it
# should operate under the identical rules, not a paraphrase that can drift.
# Keep this in sync whenever those files change.
SYSTEM = (
    "ROLE: You are steering a separate code-generation model that builds an HTML "
    "wireframe from your natural-language instructions. You do not write HTML "
    "yourself — you only decide what to tell the code model next, turn by turn. "

    "INPUTS: each turn you are shown one or two images — the TARGET wireframe you "
    "are trying to recreate, and, from turn 2 onward, the CURRENT attempt the code "
    "model has produced so far. You are also given a numbered list of the "
    "instructions you yourself gave in previous turns (never the code model's "
    "HTML, and never past attempt images — only the current one). Use that list "
    "so you don't repeat yourself and can track what's still left to build.\n\n"

    "GOAL: compare the CURRENT attempt to the TARGET and issue the single most "
    "useful next instruction to the code model, progressively making the attempt "
    "match the target as closely as possible. "
    "Work at whatever pace and in whatever order "
    "you judge best — there is no required order.\n\n"

    "WIREFRAME LABELS: every part of the TARGET has a small label printed on it, "
    "in the generic form box-N (e.g. box-1, box-6, box-12) — there is no other "
    "label type, so never expect or invent a typed prefix like text-N or "
    "link-N. Some elements are containers wrapping other boxes, labeled "
    "container-N in the same generic form. Look at the image and read these "
    "labels directly. Whenever you instruct the code model to add or change an "
    "element, always tell it the exact label to print inside that element, "
    "taken exactly from what you see in the TARGET — never paraphrase, "
    "renumber, or invent a label. Recreating an element without its exact "
    "label counts as not recreating it at all. Once a label has been placed, "
    "never instruct the code model to remove or hide it — labels must stay "
    "visible the entire time, exactly like the real study requires.\n\n"

    "SCORING: the study grades only structure — position, size, and which "
    "labels are present and where. Colour, font, and visual styling are not "
    "scored. Do not spend instructions on colour, fonts, or styling; focus "
    "entirely on structural layout.\n\n"

    "STOPPING: choose \"stop\" once the current attempt is close enough to the "
    "target that further instructions would not meaningfully improve it. Judge "
    "this only by comparing the two images yourself — do not reference any "
    "external grading, benchmark, or evaluation process.\n\n"

    "OUTPUT FORMAT: reply ONLY with JSON: "
    '{"action":"continue"|"stop","instruction":"<the next instruction to the '
    'code model, or empty if stopping>"}.'
)

def _img_part(png: bytes) -> dict:
    b64 = base64.b64encode(png).decode()
    return {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}}

def parse_action(text: str) -> dict:
    m = re.search(r"\{.*?\}", text or "", re.DOTALL)
    if m:
        try:
            obj = json.loads(m.group(0))
            action = "stop" if str(obj.get("action")).lower() == "stop" else "continue"
            return {"action": action, "instruction": str(obj.get("instruction", "")).strip()}
        except json.JSONDecodeError:
            pass
    return {"action": "continue", "instruction": ""}

# Ablation toggles, all env-gated so a batch run picks which condition(s)
# apply without editing code each time (and so they compose independently
# instead of a hardcoded model check always firing both together):
#   A2A_WORD_CAP=1        — append the 200-word instruction-length ceiling
#   A2A_REASONING_OFF=1   — disable Opus 5's extended thinking for this run
#   A2A_ELEMENT_CAP=1     — append the 4-element-per-turn ceiling
#   A2A_HUMAN_STYLE=1     — append real human-participant instructions as a
#                           few-shot style guide (voice/granularity, not a
#                           hard constraint — the model can ignore it) PLUS
#                           a strict no-exact-numbers rule (NO_NUMBERS_SUFFIX,
#                           see below — this one IS enforced by instruction,
#                           even though the few-shot part above it isn't)
# The first three are scoped to Claude Opus 5 only: it's the only driver that
# showed exhaustive, human-unmatched per-turn verbosity (pixel-exact specs
# for 13-15 boxes in one instruction) AND the only one of the 3 driver
# models that reasons by default (confirmed via analysis/A2A_analysis/
# openrouter_activity_2026-08-29.csv: Opus 5 used reasoning on 35/39 calls,
# median 293 tokens; Gemini 3 Flash and Qwen2.5-VL showed 0 reasoning tokens
# across all calls) — Qwen/Gemini need neither constraint to begin with. The
# element cap specifically targets the same batching behaviour: median
# elements-referenced-per-instruction was ~9 for Claude/Gemini vs ~2-3 for
# humans/Qwen (paper/scripts/element_count_analysis.py), so 4 sits
# roughly between the human median and Claude's unrestricted median —
# tight enough to force real per-turn discipline without collapsing to a
# single-element-at-a-time regime nothing in the corpus actually uses.
#
# A2A_HUMAN_STYLE is a different kind of manipulation than the three above:
# those are hard, enforced ceilings; this is a soft nudge via few-shot
# examples the model is free to disregard. It exists to separate two
# possible explanations for "Claude converges faster than humans": maybe
# it's Claude's phrasing/pacing habits (dense, exhaustive, one-shot-the-
# whole-layout instructions), or maybe it's the underlying visual-reasoning
# quality regardless of phrasing. Scoped to Opus 5 only, same reasoning as
# above — it's the model whose style most visibly diverges from the human
# corpus, so it's the one worth testing this on first.
WORD_BUDGET_MODELS = {"anthropic/claude-opus-5"} if os.environ.get("A2A_WORD_CAP") == "1" else set()
REASONING_OFF_MODELS = {"anthropic/claude-opus-5"} if os.environ.get("A2A_REASONING_OFF") == "1" else set()
ELEMENT_CAP_MODELS = {"anthropic/claude-opus-5"} if os.environ.get("A2A_ELEMENT_CAP") == "1" else set()
HUMAN_STYLE_MODELS = {"anthropic/claude-opus-5"} if os.environ.get("A2A_HUMAN_STYLE") == "1" else set()
WORD_BUDGET_SUFFIX = (
    "\n\nSTRICTLY use at max 200 words in the final instruction. Plan "
    "accordingly while thinking."
)
ELEMENT_CAP = 4
ELEMENT_CAP_SUFFIX = (
    f"\n\nSTRICTLY reference at most {ELEMENT_CAP} distinct box-N/container-N elements "
    "in your next instruction, counting every element you create, remove, or adjust "
    f"together (e.g. \"add box-5 through box-8\" already counts as 4). If more than "
    f"{ELEMENT_CAP} still need work, address only {ELEMENT_CAP} of them now and leave "
    "the rest for a later turn — do not try to fit them in by writing a vaguer "
    "instruction that covers more elements at once."
)

# Real instructions pulled verbatim from analysis/A2A_analysis/prolific
# (Supabase `messages`, role='user') for 5 human participants who together
# covered all 5 kept references — chosen for a spread of register (terse and
# casual vs. exhaustive/narrative) and per-turn granularity (single-tweak vs.
# whole-layout-in-one-shot), rather than any topical relevance to
# darkminimal (the reference this ablation is run against). Typos and
# non-native phrasing are left as-is — that texture is part of what "human
# style" means here. Two originally-sourced examples (both from the one
# participant who phrased everything in exact percentages) were swapped out
# for percentage-free ones from other participants so this list doesn't
# contradict NO_NUMBERS_SUFFIX below.
HUMAN_STYLE_EXAMPLES = [
    "I would like to design a webpage",
    "Add some nice pictures if you can. The style must be modern and luxurious",
    "box-1 should be a text that says \"Galvanizations Bentonville\"\n"
    "box-8 should say \"The best factory in Arkansas lies in Bentonville.\"\n"
    "box-9 should be an image of a steel factory, rectangular shaped.\n"
    "Both box-8 and box-9 should be at the middle of the page, but not too "
    "separated from the box-1 (which is at the top left corner of the page).",
    "Remove the address from there and place it below the copyright.\n\n"
    "Make box-2 through box-4 a tad bit bigger and a bit away from the "
    "middle. Make the box-11 layout longer vertically",
    "Create a retro-style webpage layout starting with box-1 and box-2 "
    "stacked vertically at the top. Below them, place box-3 on the left and "
    "box-4 on the right side by side. Underneath that row, place three "
    "boxes side by side: box-5, box-6, and box-7. Below this, place box-8 "
    "as a single full-width block. Finally, include a dashed container "
    "labeled container-1 that contains a vertical stack of box-9, box-10, "
    "box-11, box-12, and box-13",
    "align the text horizontally and vertically in all boxes",
    "Remove the box layout from box-8 and box-10\n\n"
    "Make the box-1 a tad bigger, less awkward than how it is right now.",
    "Put different images of high end images of modern houses in the gallery",
    "Start with a long rectangle that is the width of the page and goes "
    "down a few spaces. It's outline is a broken line, as if it is a "
    "period followed by a space followed by a period etc etc. Inside the "
    "rectangle, on the left hand side is a smaller rectangle labelled "
    "\"box-1\"... (continues describing every remaining box's shape, "
    "position, and relative scale to this same level of narrative detail)",
    "Lets make some changes and try again. Flip boxes 1, 2, 3, 4, 5, 6, 7, "
    "8, 9 so that they are wider than they are tall. Use the same scales "
    "that I provided. Box 10 and box 13 should be about half the height as "
    "what is shown here, and should not be quite as wide",
]

# Added on the second pass at this ablation: the first version (few-shot
# examples only) barely moved Claude's behavior — its median elements-per-
# instruction only dropped from 9 to 7, nowhere near the human median of 2,
# and its score trajectory was nearly identical to the fully unrestricted
# condition. One candidate explanation is that real participants essentially
# never specify exact coordinates, pixel values, or percentages (skim
# HUMAN_STYLE_EXAMPLES above — none of them do, after the swap noted in that
# comment), while Claude's default habit leans heavily on exactly that kind
# of numeric precision. This section makes that specific difference a STRICT
# rule instead of just an implicit pattern in the examples, to test whether
# numeric precision itself — not verbosity or granularity in general — is
# doing the work.
NO_NUMBERS_SUFFIX = (
    "\n\nSTRICT RULE: never state a coordinate, an X or Y position, a pixel value, "
    "a percentage, or any other exact number for a size or position, anywhere in "
    "your instruction. Real study participants never did this — they described "
    "size and position only in relative, qualitative terms (\"below the header\", "
    "\"a bit wider\", \"lined up with box-3\", \"about half as tall\"), never with "
    "coordinates, px values, or percentages. Follow the same rule with no "
    "exceptions: describe every size and position relatively, by comparison to "
    "another element or the page, never with a number."
)

def _human_style_suffix() -> str:
    numbered = "\n".join(f'{i+1}. "{t}"' for i, t in enumerate(HUMAN_STYLE_EXAMPLES))
    return (
        "\n\nSTYLE: below are real instructions real study participants wrote while "
        "doing this exact task (different target layouts than yours, but the same "
        "job — steer a page-building model turn by turn). Write your own "
        "instructions in a similar voice: plain, sometimes casual or imprecise, and "
        "uneven in how many elements you touch per turn — often just one or a few, "
        "not a whole layout fully specified at once. These are STYLE examples only, "
        "never content to copy — what you actually say must still come from "
        f"comparing the real TARGET and CURRENT images this turn.\n\n{numbered}"
        f"{NO_NUMBERS_SUFFIX}"
    )

HUMAN_STYLE_SUFFIX = _human_style_suffix()

def decide(target_png, render_png, history, model, post=requests.post) -> dict:
    parts = [{"type": "text", "text": "TARGET layout:"}, _img_part(target_png)]
    if render_png is not None:
        parts += [{"type": "text", "text": "CURRENT attempt:"}, _img_part(render_png)]
    else:
        parts.append({"type": "text", "text": "No attempt yet. Write the first build instruction, including the labels you see."})
    # textual memory of the driver's OWN past instructions only — never past render images,
    # never the generator's HTML. `history`'s "user" entries are exactly those instructions
    # (graph.py appends one per completed turn); "assistant" entries (generator HTML) are skipped.
    past_instructions = [m["content"] for m in history if m["role"] == "user"]
    if past_instructions:
        numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(past_instructions))
        parts.append({"type": "text", "text": f"Your previous instructions to the code model, in order:\n{numbered}"})
    system = SYSTEM
    if model in WORD_BUDGET_MODELS:
        system += WORD_BUDGET_SUFFIX
    if model in ELEMENT_CAP_MODELS:
        system += ELEMENT_CAP_SUFFIX
    if model in HUMAN_STYLE_MODELS:
        system += HUMAN_STYLE_SUFFIX
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": parts},
        ],
        "usage": {"include": True},
    }
    if model in REASONING_OFF_MODELS:
        payload["reasoning"] = {"enabled": False}
    resp = post("https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {openrouter_key()}", "Content-Type": "application/json"},
                json=payload, timeout=120)
    if resp.status_code != 200:
        raise RuntimeError(f"VLM error {resp.status_code}: {resp.text}")
    data = resp.json()
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    u = data.get("usage", {}) or {}
    action = parse_action(content)
    return {**action, "usage": {"in": u.get("prompt_tokens", 0), "out": u.get("completion_tokens", 0),
                                 "cost": u.get("cost", 0.0)}}
