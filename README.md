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

- **In VS Code / Cursor:** open a notebook and pick the `.venv` interpreter as the kernel (top-right kernel picker → *Python Environments* → `.venv`), or
- **From the CLI:**

```bash
source .venv/bin/activate
jupyter nbconvert --to notebook --execute --inplace \
  data_processing/04_avs_line_to_billable_codes.ipynb
```

If you hit `ModuleNotFoundError: No module named 'dotenv'` (or similar), the notebook is running against the wrong interpreter — make sure the selected kernel is the `.venv` created above.

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
