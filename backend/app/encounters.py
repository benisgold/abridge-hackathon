"""Loads after-visit summaries from the Abridge synthetic-ambient-fhir-25 dataset.

The dataset is git-ignored and must be placed at data/synthetic-ambient-fhir-25/
(see the README). When it's absent the app still runs on the bundled samples
below — a demo shouldn't die on a missing untracked folder.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel

DATASET_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "synthetic-ambient-fhir-25"
    / "synthetic-ambient-fhir-25.jsonl"
)


class EncounterSummary(BaseModel):
    """List-view shape: enough to pick an encounter, without the note body."""

    id: str
    patient_name: str
    visit_title: str
    date: str


class Encounter(EncounterSummary):
    after_visit_summary: str


FALLBACK_ENCOUNTERS: list[Encounter] = [
    Encounter(
        id="sample-1",
        patient_name="Sample Patient",
        visit_title="Annual physical — preventive screening",
        date="2026-07-01",
        after_visit_summary="""Visit summary

What we discussed
• Elevated blood pressure
• Prediabetes
• Preventive health and screening

Next steps
• Repeat lipid panel and hemoglobin A1c in three months to follow the trend.
• Schedule a screening colonoscopy; you are due based on age.
• Blood pressure recheck at a follow-up office visit in 6 weeks.
• Lifestyle counseling on diet and regular aerobic activity reviewed.
""",
    ),
    Encounter(
        id="sample-2",
        patient_name="Sample Patient",
        visit_title="Follow-up — knee pain",
        date="2026-07-05",
        after_visit_summary="""Visit summary

What we discussed
• Persistent right knee pain after injury
• Limited range of motion

Next steps
• MRI of the right knee without contrast to evaluate for meniscal tear.
• Referral to physical therapy; begin with twice-weekly therapeutic exercise.
• Follow-up office visit after imaging results return.
""",
    ),
]


def _display_name(patient: dict) -> str:
    """Synthea names often carry numeric suffixes (e.g. "Kuhic123") — strip them."""
    names = patient.get("name") or []
    if not names:
        return "Unknown Patient"
    entry = names[0]
    given = " ".join(entry.get("given") or [])
    family = entry.get("family", "")
    return re.sub(r"\d+", "", f"{given} {family}").strip() or "Unknown Patient"


@lru_cache(maxsize=1)
def load_encounters() -> list[Encounter]:
    if not DATASET_PATH.exists():
        return FALLBACK_ENCOUNTERS

    encounters: list[Encounter] = []
    with DATASET_PATH.open() as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            metadata = record.get("metadata", {})
            patient = record.get("patient_context", {}).get("patient", {})
            encounters.append(
                Encounter(
                    id=record["id"],
                    patient_name=_display_name(patient),
                    visit_title=metadata.get("visit_title", "Clinical encounter"),
                    date=str(metadata.get("date", ""))[:10],
                    after_visit_summary=record.get("after_visit_summary", ""),
                )
            )
    return encounters or FALLBACK_ENCOUNTERS


def find_encounter(encounter_id: str) -> Encounter | None:
    return next((e for e in load_encounters() if e.id == encounter_id), None)


def dataset_present() -> bool:
    return DATASET_PATH.exists()
