# backend

FastAPI service for the abridge-hackathon patient cost-estimate flow. It extracts
follow-up procedure codes from an after-visit summary, prices them against real
Boston-area hospital price-transparency data, and ranks hospitals by patient
responsibility.

## Requirements

- Python 3.12 (the `.venv` is pinned to 3.12.8 via pyenv)
- [`uv`](https://docs.astral.sh/uv/) for dependency management

This service is managed by **`uv`**, driven by `pyproject.toml` + `uv.lock` — not
by `requirements.txt`. (`requirements.txt` here is the *notebook / data-processing*
dependency list used at the repo root; don't `pip install` it into this venv.)

## Setup

From this `backend/` directory:

```bash
uv sync
```

That creates a local `.venv/` and installs the locked dependencies
(`fastapi`, `uvicorn[standard]`, `anthropic`, `python-dotenv`).

> **Do not `source .venv/bin/activate`.** With `uv` you don't need to activate the
> venv — `uv run` selects it automatically. Activating can point at a stale path
> (e.g. if the repo was moved) and make `uv` fall back to system Python, which
> surfaces as `ModuleNotFoundError: No module named 'dotenv'`. If that happens,
> recreate the env cleanly:
>
> ```bash
> deactivate 2>/dev/null; rm -rf .venv && uv sync
> ```

## Environment variables

Copy the example and fill in as needed:

```bash
cp .env.example .env
```

| Variable             | Default            | Purpose                                                                       |
| -------------------- | ------------------ | ----------------------------------------------------------------------------- |
| `ANTHROPIC_ENABLED`  | `false`            | Master switch for the Claude agent. `false` never calls the API (CSV replay). |
| `EXTRACTION_MODE`    | `csv`              | `csv` replays pre-extracted codes (no API key). `live` calls Claude.          |
| `ANTHROPIC_API_KEY`  | —                  | Required only when the live agent is enabled.                                  |
| `EXTRACTION_MODEL`   | `claude-haiku-4-5` | Model used in `live` mode.                                                     |
| `INCLUDE_PAEDIATRIC` | off                | Set to `1`/`true` to include Boston Children's in pricing/maps.               |

`ANTHROPIC_ENABLED` gates everything: while it's `false`, `EXTRACTION_MODE=live`
is ignored and the app always replays CSV, so the Anthropic key is never used.
Flip it to `true` (and set `EXTRACTION_MODE=live` + a key) to turn the agent on.

The `.env` is loaded from the repo-root `.env` first, then `backend/.env` (which
overrides it) — see `app/main.py`.

## Data

The price and after-visit-summary CSVs are git-ignored and must be present for
pricing/encounters to work. They live under the repo-root `data/` directory (see
the root `README.md` "Data setup" and "Setup note"). Copy them from the pipeline:

```bash
# from the repo root
cp ../abridge-hackathon-robbert/data_processing/processed_csv/*.csv data/processed_csv/
```

`GET /api/health` reports `price_data_present` so you can confirm the data is wired up.

## Run

```bash
uv run uvicorn app.main:app --reload --reload-dir app --port 8000
```

`--reload-dir app` scopes the hot-reloader to your source code. Without it,
`--reload` watches the whole `backend/` tree — including `.venv/` — so every
`uv sync`/`uv add` (which rewrites files under `.venv/lib/.../site-packages/`)
makes the server restart in a loop.

The frontend's Vite dev server proxies `/api` to port 8000, so run this alongside
`npm run dev` in `frontend/`.

## API

```bash
curl localhost:8000/api/health           # extraction_mode, price_data_present, priced_hospitals
curl localhost:8000/api/encounters        # each flagged with has_codes
curl localhost:8000/api/encounters/<id>

# extract / pricing / estimates are scoped to an encounter_id:
curl -X POST localhost:8000/api/extract -H 'content-type: application/json' \
  -d '{"encounter_id": "<id>"}'           # streams codes as SSE
curl -X POST localhost:8000/api/pricing -H 'content-type: application/json' \
  -d '{"encounter_id": "<id>", "codes": ["80061"]}'
curl 'localhost:8000/api/estimates?encounter_id=<id>&codes=80061&zip=02139&radius_miles=25'
```

The ZIP filter only covers the Boston metro area — try `02114`, `02139`, `02458`,
or `01803`.

## Layout

| File             | Responsibility                                            |
| ---------------- | --------------------------------------------------------- |
| `app/main.py`    | FastAPI app and route definitions                         |
| `app/extraction.py` | Code extraction (CSV replay or live Claude), SSE stream |
| `app/pricing.py` | Market pricing, payable amounts, breakdowns               |
| `app/real_data.py` | Loads the price CSVs                                     |
| `app/encounters.py` | Loads encounters / after-visit summaries               |
| `app/data.py`    | Hospitals and ZIP centroids                               |
| `app/geo.py`     | Haversine distance                                        |
| `app/models.py`  | Pydantic request/response models                          |
