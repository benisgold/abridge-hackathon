"""Loads Robbert's extracted codes and CMS-published prices.

Source: data/processed_csv/avs_line_to_billable_codes.csv — one row per
(after-visit-summary line × billable code), carrying a `prices_by_hospital`
JSON blob of real prices published under CMS price-transparency rules.

Read with the stdlib csv module rather than pandas: the file is ~380KB and
pulling a dataframe library into the API for one flat read isn't worth it.
"""

import csv
import json
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

# Rows embed JSON price blobs that comfortably exceed the default field cap.
csv.field_size_limit(min(sys.maxsize, 10_000_000))

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "processed_csv"
CODES_CSV = DATA_DIR / "avs_line_to_billable_codes.csv"
AVS_CSV = DATA_DIR / "patient_to_after_visit_summary.csv"

# Only these count as work the patient still has to go and do. `performed` is
# work already done at the visit. See INTEGRATION.md §6 — `ordered` is an
# imperfect signal (a same-day draw is also "ordered"), accepted deliberately.
FOLLOW_UP_STATUS = {"ordered", "planned"}

# His price blobs are keyed by MRF filename; the hospital_name inside maps to
# our seed registry, which supplies coordinates his data doesn't carry.
HOSPITAL_NAME_TO_ID = {
    "Cambridge Health Alliance": "cha",
    "Lahey Hospital & Medical Center": "lahey",
    "South Shore Hospital": "southshore",
    "Boston Children's Longwood": "childrens",
}


@dataclass(frozen=True)
class HospitalPrice:
    """One hospital's published prices for one code."""

    hospital_id: str
    hospital_name: str
    discounted_cash: float | None
    negotiated_median: float | None
    negotiated_min: float | None
    negotiated_max: float | None
    p10: float | None
    p90: float | None
    gross: float | None
    n_payers: int


@dataclass(frozen=True)
class RealCode:
    code: str
    code_type: str
    name: str
    description: str
    category: str
    line_text: str
    status: str
    confidence: str
    needs_review: bool
    prices: dict[str, HospitalPrice]


def _f(value: str | None) -> float | None:
    if value in (None, "", "nan"):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _i(value: str | None) -> int:
    return int(_f(value) or 0)


def dataset_present() -> bool:
    return CODES_CSV.exists() and AVS_CSV.exists()


@lru_cache(maxsize=1)
def _encounter_id_by_patient_number() -> dict[str, str]:
    """patient_number -> "<patient_id>::<encounter_id>", our encounter key."""
    if not AVS_CSV.exists():
        return {}
    with AVS_CSV.open(newline="") as handle:
        return {
            row["patient_number"]: f"{row['patient_id']}::{row['encounter_id']}"
            for row in csv.DictReader(handle)
        }


def _parse_prices(raw: str) -> dict[str, HospitalPrice]:
    if not raw:
        return {}
    prices: dict[str, HospitalPrice] = {}
    for key, value in json.loads(raw).items():
        name = value.get("hospital_name") or key
        hospital_id = HOSPITAL_NAME_TO_ID.get(name)
        if hospital_id is None:
            continue  # a hospital we have no registry entry (or coordinates) for
        prices[hospital_id] = HospitalPrice(
            hospital_id=hospital_id,
            hospital_name=name,
            discounted_cash=_f(value.get("discounted_cash")),
            negotiated_median=_f(value.get("negotiated_median")),
            negotiated_min=_f(value.get("negotiated_min")),
            negotiated_max=_f(value.get("negotiated_max")),
            p10=_f(value.get("p10")),
            p90=_f(value.get("p90")),
            gross=_f(value.get("gross")),
            n_payers=_i(value.get("n_payers")),
        )
    return prices


@lru_cache(maxsize=1)
def _codes_by_encounter() -> dict[str, list[RealCode]]:
    """Follow-up codes per encounter, deduped and ordered as they appear."""
    if not CODES_CSV.exists():
        return {}

    crosswalk = _encounter_id_by_patient_number()
    by_encounter: dict[str, list[RealCode]] = {}

    with CODES_CSV.open(newline="") as handle:
        for row in csv.DictReader(handle):
            if not row["code"] or row["section"] != "next_steps":
                continue
            if row["status"] not in FOLLOW_UP_STATUS:
                continue
            encounter_id = crosswalk.get(row["patient_number"])
            if encounter_id is None:
                continue

            by_encounter.setdefault(encounter_id, []).append(
                RealCode(
                    code=row["code"],
                    code_type=row["code_type"],
                    # `mention` is the clinician's words ("lipid panel");
                    # code_description is chargemaster text ("HC Lipid Panel So").
                    name=(row["mention"] or row["code_description"] or row["code"]),
                    description=row["code_description"],
                    category=row["category"],
                    line_text=row["line_text"],
                    status=row["status"],
                    confidence=row["confidence"],
                    needs_review=row["needs_review"].strip().lower() == "true",
                    prices=_parse_prices(row["prices_by_hospital"]),
                )
            )

    return {eid: _dedupe(codes) for eid, codes in by_encounter.items()}


def _dedupe(codes: list[RealCode]) -> list[RealCode]:
    """One entry per code, preferring the CPT row.

    The same service is often published under both a CPT and an HCPCS row with
    different prices (87340 is both, at $83 and $116). They are the same test —
    showing a patient two rows for one blood draw is just confusing — so the
    CPT row wins and the HCPCS row is dropped.
    """
    best: dict[str, RealCode] = {}
    for entry in codes:
        current = best.get(entry.code)
        if current is None or (
            current.code_type != "CPT" and entry.code_type == "CPT"
        ):
            best[entry.code] = entry
    return list(best.values())


def codes_for_encounter(encounter_id: str) -> list[RealCode]:
    return _codes_by_encounter().get(encounter_id, [])


def encounters_with_codes() -> set[str]:
    """Encounter ids that yield at least one follow-up code."""
    return {eid for eid, codes in _codes_by_encounter().items() if codes}


def priced_hospital_ids() -> set[str]:
    """Every hospital id appearing anywhere in the price data."""
    seen: set[str] = set()
    for codes in _codes_by_encounter().values():
        for entry in codes:
            seen.update(entry.prices)
    return seen
