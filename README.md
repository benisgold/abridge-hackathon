# abridge-hackathon

## Running the app

A React frontend (Vite + TypeScript + Tailwind) and a Python backend (FastAPI).

Prerequisites: Node 20+, Python 3.11+, and [uv](https://docs.astral.sh/uv/).

Backend — in one terminal:

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
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

## Data setup

The dataset is **not** included in this repository (it's git-ignored).

It comes from the [**Abridge x Anthropic x Lightspeed** hackathon — *The Future of Agentic AI in Healthcare*](https://cerebralvalley.ai/e/abridge-hackathon/details), under **"6️⃣ Abridge Provided Resources"**: anonymized patient-encounter and EHR datasets with associated FHIR data. Download the `.zip` (dataset + spec) from the [Google Drive link here](https://drive.google.com/file/d/14TA58TvEotA_oqbnfKdV9ZzpKHUfSZKn/view?usp=sharing).

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
