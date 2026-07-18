"""Synthetic price generation.

Deterministic on purpose: the same (procedure, hospital) pair always yields the
same figures, so a demo doesn't reshuffle its numbers on every refresh.
"""

from hashlib import sha256

from .data import HOSPITALS, HospitalSeed, ProcedureSeed, find_procedure
from .models import Breakdown, CodePricing

# How far the plausible-range bar extends either side of the quoted total.
LOW_FACTOR = 0.93
HIGH_FACTOR = 1.09

# Bounds for prices synthesized for codes we don't have seeded.
FALLBACK_MIN_PRICE = 120
FALLBACK_MAX_PRICE = 3200


def _stable_hash(value: str) -> int:
    return int(sha256(value.encode()).hexdigest()[:8], 16)


def _reference_number(procedure_code: str, hospital_id: str) -> str:
    return str(_stable_hash(f"{procedure_code}:{hospital_id}") % 9_000_000 + 1_000_000)


def synthesize_procedure(code: str) -> ProcedureSeed:
    """A plausible stand-in for a code that isn't in the seeded catalog.

    Price is hash-derived so it stays stable across requests. Coverage is left
    unknown rather than guessed — an invented Medicare answer is the kind of
    fake detail someone might actually act on.
    """
    seed = _stable_hash(f"procedure:{code}")
    span = FALLBACK_MAX_PRICE - FALLBACK_MIN_PRICE
    return ProcedureSeed(
        code=code,
        name=f"Procedure {code}",
        description=(
            "This code isn't in the demo catalog, so its price is a synthetic "
            "placeholder and its Medicare coverage is unknown."
        ),
        base_price=FALLBACK_MIN_PRICE + (seed % span),
        physician_share=0.15,
        medicare_covered=None,
    )


def resolve_procedure(code: str) -> tuple[ProcedureSeed, bool]:
    """Returns (procedure, in_catalog)."""
    seeded = find_procedure(code)
    if seeded is not None:
        return seeded, True
    return synthesize_procedure(code), False


def build_breakdown(procedure: ProcedureSeed, hospital: HospitalSeed) -> Breakdown:
    total_fees = round(procedure.base_price * hospital.price_multiplier)
    physician_fees = round(total_fees * procedure.physician_share)
    hospital_fees = total_fees - physician_fees
    discount = round(total_fees * hospital.self_pay_discount_rate)

    return Breakdown(
        hospital_fees=hospital_fees,
        physician_fees=physician_fees,
        total_fees=total_fees,
        discount=discount,
        patient_responsibility=total_fees - discount,
        low=round(total_fees * LOW_FACTOR),
        high=round(total_fees * HIGH_FACTOR),
        reference_number=_reference_number(procedure.code, hospital.id),
    )


def combine_breakdowns(
    breakdowns: list[Breakdown], reference_seed: str
) -> Breakdown:
    """Sums per-procedure breakdowns into one basket total."""
    return Breakdown(
        hospital_fees=sum(b.hospital_fees for b in breakdowns),
        physician_fees=sum(b.physician_fees for b in breakdowns),
        total_fees=sum(b.total_fees for b in breakdowns),
        discount=sum(b.discount for b in breakdowns),
        patient_responsibility=sum(b.patient_responsibility for b in breakdowns),
        low=sum(b.low for b in breakdowns),
        high=sum(b.high for b in breakdowns),
        reference_number=str(_stable_hash(reference_seed) % 9_000_000 + 1_000_000),
    )


def market_pricing(code: str) -> CodePricing:
    """Average and lowest patient responsibility across every seeded hospital."""
    procedure, in_catalog = resolve_procedure(code)
    responsibilities = [
        build_breakdown(procedure, hospital).patient_responsibility
        for hospital in HOSPITALS
    ]
    return CodePricing(
        procedure=procedure.to_model(),
        average=round(sum(responsibilities) / len(responsibilities)),
        lowest=min(responsibilities),
        in_catalog=in_catalog,
    )
