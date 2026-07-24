"""CPT code extraction from an after-visit summary, streamed from Claude.

Claude emits one JSON object per line rather than a single array. That lets us
parse and forward each code the moment its line completes, so the UI reveals
codes as they're actually produced instead of all at once at the end.
"""

import asyncio
import json
import os
from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic
from pydantic import BaseModel, ValidationError

from . import real_data

def _env_flag(name: str, default: bool = False) -> bool:
    """Reads a boolean-ish env var (1/true/yes/on → True)."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def anthropic_enabled() -> bool:
    """Master switch for the Claude (Anthropic API key) extraction agent.

    Off by default so the app never touches the API. Flip ANTHROPIC_ENABLED=true
    in the .env to turn the live agent back on. Read lazily so toggling it in the
    .env (loaded at startup) takes effect without editing code.
    """
    return _env_flag("ANTHROPIC_ENABLED", False)


def extraction_mode() -> str:
    """The effective extraction mode: "csv" replay or "live" Claude.

    "csv" replays Robbert's precomputed codes (real prices, no API key needed).
    "live" calls Claude, which still works but produces codes that may not exist
    in the published price data and therefore can't be priced. Live only takes
    effect when the Anthropic agent is enabled; otherwise we always replay CSV.
    """
    mode = os.environ.get("EXTRACTION_MODE", "csv").lower()
    return mode if anthropic_enabled() else "csv"

# The only two models the UI lets the user pick between. Haiku is the cheap,
# fast tier; Sonnet trades cost for accuracy. Anything outside this set is
# rejected and falls back to the default so a stray request can't run an
# unexpected (or retired) model.
# Note: Haiku 4.5 predates adaptive thinking and the effort parameter — passing
# either returns a 400, so neither is set below.
ALLOWED_MODELS = ("claude-haiku-4-5", "claude-sonnet-5")
DEFAULT_MODEL = os.environ.get("EXTRACTION_MODEL", "claude-haiku-4-5")
MAX_TOKENS = 4096


def resolve_model(model: str | None) -> str:
    """Coerces a requested model to one we allow, defaulting to Haiku."""
    if model in ALLOWED_MODELS:
        return model
    return DEFAULT_MODEL if DEFAULT_MODEL in ALLOWED_MODELS else ALLOWED_MODELS[0]

SYSTEM_PROMPT = """\
You are a medical billing assistant. You read a patient's after-visit summary and \
identify the procedures, tests, and services the clinician RECOMMENDED AS FOLLOW-UP \
— things the patient still needs to schedule or have done.

Rules:
- Only include items that are billable procedures, tests, imaging, therapy, \
vaccines, or office visits.
- Only include FOLLOW-UP items — things the patient still has to schedule or \
come back for.
- EXCLUDE anything already done at this visit. Past-tense and same-day wording \
is the signal: "sent today", "collected", "placed", "completed", "performed", \
"drawn", "administered", "updated", "reviewed", "given", "counseling given". \
A lab that was already sent is NOT a follow-up, even though it is billable.
  · "Urine culture sent today" → EXCLUDE
  · "Surveillance cultures at future visits" → INCLUDE
  · "Pap smear collected" → EXCLUDE
  · "Repeat lipid panel in 3 months" → INCLUDE
- Ignore non-billable advice (diet counseling, "keep a headache log", "call if \
symptoms worsen") unless it maps to a billable service.
- Use the most specific standard CPT code you are confident in.
- If the summary contains no billable follow-up items, output nothing at all.

The summary is given to you with every line numbered as "12| text". Use those \
numbers to say exactly which line each code came from.

Output format: one JSON object per line, no other text, no markdown fences, no \
surrounding array. Each line must be exactly:
{"code": "80061", "name": "Lipid panel", "description": "Blood test measuring \
cholesterol and triglycerides", "line": 14, "rationale": "repeat lipid panel to \
follow the trend"}

- "line" is the number of the single summary line that prompted this code. If \
two codes come from the same line, repeat the number.
- "rationale" must be a VERBATIM substring of that line — copy the words exactly, \
do not paraphrase or re-word."""


class ExtractedCode(BaseModel):
    code: str
    name: str
    description: str = ""
    rationale: str = ""
    # 0-based index into the summary's lines. None when it can't be resolved.
    line: int | None = None


def number_lines(summary_text: str) -> str:
    """Renders the note as "1| text" so the model can cite a line number."""
    return "\n".join(
        f"{i + 1}| {line}" for i, line in enumerate(summary_text.split("\n"))
    )


def _tokens(text: str) -> set[str]:
    return {t for t in "".join(c.lower() if c.isalnum() else " " for c in text).split() if len(t) > 3}


def resolve_line(code: ExtractedCode, lines: list[str]) -> int | None:
    """Validates the model's line number, falling back to a text match.

    The model occasionally cites a line that doesn't contain what it quoted —
    an off-by-one, or a citation of the section header instead of the bullet.
    Rather than trust it or drop it, check the quote against the cited line and
    re-locate by word overlap when it doesn't hold up.
    """
    quote_tokens = _tokens(code.rationale)

    # 1. Trust the model's number when the line actually contains the quote.
    if code.line is not None and 1 <= code.line <= len(lines):
        candidate = lines[code.line - 1]
        if not quote_tokens or quote_tokens & _tokens(candidate):
            return code.line - 1

    # 2. Otherwise find the line sharing the most words with the quote.
    if quote_tokens:
        best_index, best_overlap = None, 0
        for index, line in enumerate(lines):
            overlap = len(quote_tokens & _tokens(line))
            if overlap > best_overlap:
                best_index, best_overlap = index, overlap
        if best_index is not None:
            return best_index

    return None


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# --------------------------------------------------------------- CSV replay

# Pacing for the replay. The codes are already known, but revealing them at
# once would make a three-step "agent" look like a page load. These delays
# roughly match what the live Haiku call used to take.
STEP_DELAY = 0.45
CODE_DELAY = 0.35


async def replay_extraction(encounter_id: str, summary_text: str) -> AsyncIterator[str]:
    """Streams Robbert's precomputed codes over the live SSE contract.

    The frontend cannot tell this apart from a model call, which is the point:
    the reveal stays, the numbers become real, and no API key is needed.
    """
    source_lines = summary_text.split("\n")

    for label in (
        "Reading after-visit summary",
        "Identifying recommended follow-ups",
        "Matching procedures to published prices",
    ):
        yield _sse("step", {"label": label})
        await asyncio.sleep(STEP_DELAY)

    codes = real_data.codes_for_encounter(encounter_id)
    count = 0
    for entry in codes:
        # His line_number counts bullets in his own parse, not text lines —
        # patient 0's lipid row is line_number 12 but raw line 17. Locate by
        # text instead, reusing the resolver already built for the model path.
        located = resolve_line(
            ExtractedCode(
                code=entry.code, name=entry.name, rationale=entry.line_text
            ),
            source_lines,
        )
        yield _sse(
            "code",
            {
                "code": entry.code,
                "code_type": entry.code_type,
                "name": entry.name,
                "description": entry.description,
                "rationale": entry.line_text,
                "line": located,
                "needs_review": entry.needs_review,
                "confidence": entry.confidence,
            },
        )
        count += 1
        await asyncio.sleep(CODE_DELAY)

    yield _sse("done", {"count": count})


async def stream_extraction(
    summary_text: str, model: str | None = None
) -> AsyncIterator[str]:
    """Yields SSE frames: step / code / done / error."""
    resolved_model = resolve_model(model)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        yield _sse(
            "error",
            {
                "message": (
                    "ANTHROPIC_API_KEY is not set. Add it to backend/.env "
                    "(see backend/.env.example) and restart the backend."
                )
            },
        )
        return

    client = AsyncAnthropic()

    yield _sse("step", {"label": "Reading after-visit summary"})
    yield _sse("step", {"label": "Identifying recommended follow-ups"})

    source_lines = summary_text.split("\n")
    buffer = ""
    count = 0
    try:
        async with client.messages.stream(
            model=resolved_model,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": number_lines(summary_text)}],
        ) as stream:
            yield _sse("step", {"label": "Mapping procedures to CPT codes"})
            async for text in stream.text_stream:
                buffer += text
                # Emit each code as soon as its line terminates.
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    frame = _parse_line(line, source_lines)
                    if frame is not None:
                        count += 1
                        yield frame

        # The final line usually arrives without a trailing newline.
        frame = _parse_line(buffer, source_lines)
        if frame is not None:
            count += 1
            yield frame

    except Exception as exc:  # surface API failures as a stream event, not a 500
        yield _sse("error", {"message": f"Extraction failed: {exc}"})
        return

    yield _sse("done", {"count": count})


def _parse_line(line: str, source_lines: list[str]) -> str | None:
    """Returns an SSE `code` frame, or None for blank/malformed lines.

    Malformed lines are skipped rather than aborting the stream — one bad line
    shouldn't lose the codes that parsed cleanly.
    """
    line = line.strip().strip("`")
    if not line or not line.startswith("{"):
        return None
    try:
        parsed = ExtractedCode.model_validate_json(line)
    except (ValidationError, ValueError):
        return None

    # Emit a verified 0-based index so the UI can highlight the exact line.
    parsed.line = resolve_line(parsed, source_lines)
    return _sse("code", parsed.model_dump())
