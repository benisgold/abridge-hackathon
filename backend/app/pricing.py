"""Turns CMS-published prices into the figures the UI quotes.

Everything here reads Robbert's `prices_by_hospital` data. Nothing is
synthesised: if a hospital doesn't publish a number, the field is None and the
UI omits that row.
"""

from hashlib import sha256

from .data import find_seed
from .real_data import HospitalPrice, RealCode
from .models import Breakdown, CodePricing, PriceSource, Procedure

# A published percentile band is only meaningful if it looks like something a
# person could have paid. Real rows include p10 = $0.04 alongside p90 = $320 —
# near-zero floors are capitated or percentage-of-charge contracts, not prices.
MIN_PLAUSIBLE_P10 = 1.0
MAX_PLAUSIBLE_SPREAD = 50.0

# "based on N plans" is only worth showing when N means something.
LIMITED_DATA_PAYERS = 1


def _reference_number(*parts: str) -> str:
    digest = sha256(":".join(parts).encode()).hexdigest()
    return str(int(digest[:8], 16) % 9_000_000 + 1_000_000)


def to_procedure(code: RealCode) -> Procedure:
    return Procedure(
        code=code.code,
        code_type=code.code_type,
        name=code.name,
        description=code.description,
        category=code.category,
        confidence=code.confidence,
        needs_review=code.needs_review,
    )


def payable(price: HospitalPrice) -> tuple[int, str] | None:
    """What this hospital would charge, and which published figure that is.

    Cash price first — that's the self-pay question the app asks. Falling back
    to the negotiated median keeps a hospital rankable when it publishes no
    cash price (35% of South Shore's entries), but the basis travels with the
    number so the UI never calls it a self-pay price.
    """
    if price.discounted_cash is not None:
        return round(price.discounted_cash), "cash"
    if price.negotiated_median is not None:
        return round(price.negotiated_median), "negotiated"
    return None


def expected_band(price: HospitalPrice) -> tuple[int, int] | None:
    """The p10-p90 band, or None when it isn't published or isn't plausible."""
    if price.p10 is None or price.p90 is None:
        return None
    if price.p10 < MIN_PLAUSIBLE_P10:
        return None
    if price.p90 / price.p10 > MAX_PLAUSIBLE_SPREAD:
        return None
    return round(price.p10), round(price.p90)


def build_breakdown(
    prices: list[HospitalPrice], reference_seed: str
) -> Breakdown | None:
    """Combines one hospital's prices across every code in the basket."""
    payables = [(p, payable(p)) for p in prices]
    usable = [(p, v) for p, v in payables if v is not None]
    if not usable:
        return None

    total = sum(value for _, (value, _) in usable)
    # If any line falls back to a negotiated figure, the whole total is no
    # longer purely a cash quote and must not be labelled as one.
    basis = "cash" if all(b == "cash" for _, (_, b) in usable) else "negotiated"

    cash_parts = [p.discounted_cash for p, _ in usable if p.discounted_cash is not None]
    without_insurance = (
        round(sum(cash_parts)) if len(cash_parts) == len(usable) else None
    )

    negotiated_parts = [
        p.negotiated_median for p, _ in usable if p.negotiated_median is not None
    ]
    with_insurance = (
        round(sum(negotiated_parts)) if len(negotiated_parts) == len(usable) else None
    )

    bands = [expected_band(p) for p, _ in usable]
    expected_low = expected_high = None
    if all(b is not None for b in bands):
        expected_low = sum(b[0] for b in bands)  # type: ignore[index]
        expected_high = sum(b[1] for b in bands)  # type: ignore[index]

    gross_parts = [p.gross for p, _ in usable if p.gross is not None]
    gross = round(sum(gross_parts)) if len(gross_parts) == len(usable) else None
    discount = (
        gross - without_insurance
        if gross is not None and without_insurance is not None
        else None
    )

    payer_counts = [p.n_payers for p, _ in usable]

    return Breakdown(
        patient_responsibility=total,
        basis=basis,
        without_insurance=without_insurance,
        with_insurance=with_insurance,
        expected_low=expected_low,
        expected_high=expected_high,
        gross=gross,
        discount=discount,
        # The weakest line governs how much the whole quote can be trusted.
        n_payers=min(payer_counts),
        limited_data=min(payer_counts) <= LIMITED_DATA_PAYERS,
        reference_number=_reference_number(reference_seed),
    )


def market_pricing(
    code: RealCode, include_paediatric: bool = False
) -> CodePricing | None:
    """Average and lowest across the hospitals that publish this code."""
    sources: list[PriceSource] = []
    for hospital_id, price in code.prices.items():
        value = payable(price)
        if value is None:
            continue
        amount, basis = value
        # A hospital in the registry gets its curated name; whether it's shown
        # on the map depends on the paediatric toggle, so the "Published by"
        # list stays in step with the pins the user actually sees.
        seed = find_seed(hospital_id)
        shown = seed is not None and (include_paediatric or not seed.paediatric)
        sources.append(
            PriceSource(
                hospital_id=hospital_id,
                hospital_name=seed.name if seed else price.hospital_name,
                amount=amount,
                basis=basis,
                shown=shown,
            )
        )
    if not sources:
        return None

    sources.sort(key=lambda s: s.amount)
    amounts = [s.amount for s in sources]
    return CodePricing(
        procedure=to_procedure(code),
        average=round(sum(amounts) / len(amounts)),
        lowest=min(amounts),
        n_hospitals=len(amounts),
        sources=sources,
    )
