# abridge-hackathon

## Python environment

Set up a local virtual environment (`.venv`, git-ignored) and install the pinned dependencies:

```bash
# from the repo root (abridge-hackathon/)
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Add your Anthropic key to a `.env` file at the repo root (also git-ignored):

```
ANTHROPIC_API_KEY=sk-ant-...
```

### Running the notebooks

The `data_processing/*.ipynb` notebooks expect this environment. Either:

- **In VS Code / Cursor:** open a notebook and pick the `.venv` interpreter as the kernel (top-right kernel picker → _Python Environments_ → `.venv`), or
- **From the CLI:**

```bash
source .venv/bin/activate
jupyter nbconvert --to notebook --execute --inplace \
  data_processing/04_avs_line_to_billable_codes.ipynb
```

Frontend — in another terminal:

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173. The Vite dev server proxies `/api` to the
backend on port 8000, so frontend code can use relative paths like
`fetch('/api/health')` without hardcoding a host.

## The patient flow

Three screens, in order:

1. **Visit summary** — two panels side by side. On the left, the after-visit
   summary the care team uploaded (pick any of the 25 encounters from the
   dropdown; ones with no priced follow-ups are marked). On the right, the
   procedures _recommended as follow-up_ are extracted, streaming in one at a
   time, with anything already done at the visit excluded.

   **Each code is traced to the line it came from.** The source line is
   highlighted inline with the code's badge, and colour pairs the two panels.
   Clicking a code emphasises its line (and vice versa). Codes drawn from the
   same line share one colour. A line that produces many codes (a lab panel can
   yield 15+) collapses to a count badge rather than a wall of badges.

2. **Estimated costs** — each code with its description, average and lowest
   published price across Boston-area hospitals, and how many hospitals publish
   it. Click any row to include or exclude it; the totals recompute. **This
   selection affects the estimate total only** — it doesn't carry to the next step.
3. **Compare hospitals** — every extracted code is offered again as its own
   toggle, because patients routinely have different procedures done at
   different facilities. Enter a ZIP and radius once, then toggle procedures to
   see hospitals re-rank **live**. A hospital that publishes prices for only
   part of your basket shows "prices N of M" and ranks below fully-covered ones.

### Where the data comes from

**Prices are real.** They come from four Boston-area hospitals' own
price-transparency files, published under the CMS hospital price-transparency
rule, via the pipeline in `abridge-hackathon-robbert` (see `INTEGRATION.md` for
the full analysis). Only hospitals that publish machine-readable prices appear:
Cambridge Health Alliance, Lahey, and South Shore. Boston Children's also
publishes but is excluded — every patient here is an adult, so a children's
hospital price would mislead (`INCLUDE_PAEDIATRIC=1` re-enables it).

**Visit summaries are synthetic** — Abridge's demo encounter dataset (Synthea
patients, LLM-generated notes), no real patients.

### Extraction

`backend/app/extraction.py` runs in one of two modes, set by `EXTRACTION_MODE`:

- **`csv`** (default) — replays the codes Robbert's pipeline already extracted
  for each encounter, paced over the SSE stream so the reveal still animates.
  No API key needed, deterministic, and every code is one the hospitals actually
  publish a price for.
- **`live`** — streams a fresh extraction from `claude-haiku-4-5`. Works on any
  pasted note, but produces codes that may not exist in the price data.

Either way the frontend can't tell the difference: same `step`/`code`/`done`
SSE contract, same streaming reveal.

The line each code came from is resolved by matching its verbatim text against
the note (`resolve_line()`) — Robbert's `line_number` counts bullets in his own
parse, not raw text lines, so a direct index would land on the wrong line.

### The price panel

Each hospital estimate shows three published figures, any of which may be
absent (the row is then omitted rather than faked):

- **Without insurance** — the hospital's discounted cash price.
- **With your insurance** — a typical (median) negotiated rate across the
  hospital's plans. Not specific to your plan, which the app doesn't collect.
- **Expected range** — the p10–p90 band of what was actually paid, shown only
  when published _and_ plausible. Only Cambridge Health Alliance publishes
  percentiles, and near-zero floors (capitated contracts) are filtered out, so
  this row appears mainly when you drill down to a single CHA-priced code.

A "based on N plans" line sits under the headline, or "limited data" when only
one plan backs the figure.

### Code caching

Extracted codes are cached in the browser for the duration of one patient's
flow, so navigating to the cost or hospital steps and back doesn't re-run the
model. The cache is keyed on the exact note text:

- **Navigating between steps** reuses the cached codes (no API call).
- **Regenerate** forces a fresh call, overwriting the cache.
- **Switching patients** clears it — one patient's codes never carry into
  another's flow.

The cache key is the note text rather than the encounter id. **Switching
patients clears it** — one patient's codes never carry into another's flow.

Notes on the data:

- **Prices are real** (see "Where the data comes from" above). Because only
  four hospitals publish machine-readable prices — and any one code at just 1–2
  of them — the hospital list is short (1–3 rows), by design. Fourteen of the
  25 encounters yield priced follow-ups; the rest are marked in the picker.
- The ZIP + radius filter covers the Boston metro area (~60 seeded ZIPs: try
  `02114`, `02139`, `01805`). With so few priced hospitals it barely
  discriminates — kept for the interaction, not because it filters much.
- The map uses **OpenStreetMap tiles**, so it needs internet access.

API endpoints:

```bash
curl localhost:8000/api/health          # reports extraction_mode + priced_hospitals
curl localhost:8000/api/encounters       # each flagged with has_codes
# extract / pricing / estimates are all scoped to an encounter_id:
curl -X POST localhost:8000/api/extract -H 'content-type: application/json' \
  -d '{"encounter_id": "<id>"}'
curl 'localhost:8000/api/estimates?encounter_id=<id>&codes=80061&zip=02139&radius_miles=25'
```

### Setup note

The price CSVs live under `data/processed_csv/` (git-ignored). Copy them from
Robbert's pipeline before running:

```bash
cp ../abridge-hackathon-robbert/data_processing/processed_csv/*.csv data/processed_csv/
```

If you hit `ModuleNotFoundError: No module named 'dotenv'` (or similar), the notebook is running against the wrong interpreter — make sure the selected kernel is the `.venv` created above.

## Data setup

The dataset is **not** included in this repository (it's git-ignored).

It comes from the [**Abridge x Anthropic x Lightspeed** hackathon — _The Future of Agentic AI in Healthcare_](https://cerebralvalley.ai/e/abridge-hackathon/details), under **"6️⃣ Abridge Provided Resources"**: anonymized patient-encounter and EHR datasets with associated FHIR data. Download the `.zip` (dataset + spec) from the [Google Drive link here](https://drive.google.com/file/d/14TA58TvEotA_oqbnfKdV9ZzpKHUfSZKn/view?usp=sharing).

Before running anything, download the dataset from the hackathon and place it in a `./data` folder at the repo root:

```
abridge-hackathon/
└── data/
    └── synthetic-ambient-fhir-25/
        ├── synthetic-ambient-fhir-25.jsonl
        ├── synthetic-ambient-fhir-25.json
        ├── schema.json
        ├── summary.json
        ├── index.html
        └── README.md
```

Steps:

1. Download the dataset `.zip` from the [hackathon Drive link](https://drive.google.com/file/d/14TA58TvEotA_oqbnfKdV9ZzpKHUfSZKn/view?usp=sharing) (e.g. `synthetic-ambient-fhir-25.zip`).
2. Create a `data/` folder in the repo root if it doesn't exist.
3. Unzip / place the dataset inside `./data` so the files live under `./data/synthetic-ambient-fhir-25/`.

The `./data` folder is listed in `.gitignore`, so the data stays local and is never committed.

```
uv run uvicorn app.main:app --reload --port 8000
```