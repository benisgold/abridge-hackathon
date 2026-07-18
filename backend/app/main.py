from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import real_data
from .data import HOSPITALS, ZIP_CENTROIDS, visible_hospitals
from .encounters import Encounter, EncounterSummary, find_encounter, load_encounters
from .extraction import EXTRACTION_MODE, replay_extraction, stream_extraction
from .geo import haversine_miles
from .models import (
    EstimateResponse,
    ExtractRequest,
    HospitalEstimate,
    LineItem,
    PricingRequest,
    PricingResponse,
    Procedure,
)
from .pricing import build_breakdown, market_pricing, payable, to_procedure

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

ESTIMATE_VALID_DAYS = 30

app = FastAPI(title="abridge-hackathon")

# The Vite dev server proxies /api to this app, so requests are same-origin in
# practice. This is here for when the frontend is pointed at the backend directly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str | bool | int]:
    return {
        "status": "ok",
        "price_data_present": real_data.dataset_present(),
        "extraction_mode": EXTRACTION_MODE,
        "priced_hospitals": len(HOSPITALS),
    }


@app.get("/api/encounters")
def list_encounters() -> list[EncounterSummary]:
    """Encounters, flagged with whether they yield any priced follow-up codes."""
    with_codes = real_data.encounters_with_codes()
    return [
        EncounterSummary(
            **{k: v for k, v in e.model_dump().items() if k != "has_codes"},
            has_codes=e.id in with_codes,
        )
        for e in load_encounters()
    ]


@app.get("/api/encounters/{encounter_id}")
def get_encounter(encounter_id: str) -> Encounter:
    encounter = find_encounter(encounter_id)
    if encounter is None:
        raise HTTPException(status_code=404, detail=f"No encounter '{encounter_id}'")
    return encounter


@app.post("/api/extract")
async def extract_codes(request: ExtractRequest) -> StreamingResponse:
    """Streams the follow-up codes for an encounter as SSE."""
    encounter = find_encounter(request.encounter_id) if request.encounter_id else None
    if request.encounter_id and encounter is None:
        raise HTTPException(
            status_code=404, detail=f"No encounter '{request.encounter_id}'"
        )

    summary_text = request.summary_text or (
        encounter.after_visit_summary if encounter else ""
    )
    if not summary_text.strip():
        raise HTTPException(
            status_code=400, detail="Provide either encounter_id or summary_text."
        )

    if EXTRACTION_MODE == "live":
        stream = stream_extraction(summary_text, request.model)
    else:
        if encounter is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "CSV extraction needs an encounter_id. Set EXTRACTION_MODE=live "
                    "to extract from arbitrary text."
                ),
            )
        stream = replay_extraction(encounter.id, summary_text)

    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/pricing")
def get_pricing(request: PricingRequest) -> PricingResponse:
    """Average and lowest published price per code, across hospitals."""
    wanted = set(request.codes)
    priced = [
        p
        for p in (
            market_pricing(c, include_paediatric=request.include_paediatric)
            for c in real_data.codes_for_encounter(request.encounter_id)
            if c.code in wanted
        )
        if p is not None
    ]
    if not priced:
        raise HTTPException(
            status_code=404,
            detail="No published prices found for those codes.",
        )

    return PricingResponse(
        codes=priced,
        total_average=sum(p.average for p in priced),
        total_lowest=sum(p.lowest for p in priced),
    )


@app.get("/api/estimates")
def get_estimates(
    encounter_id: str = Query(description="Encounter the codes belong to"),
    # Bound to `zip_code` so the parameter doesn't shadow the zip() builtin.
    zip_code: str = Query(
        alias="zip", description="5-digit ZIP code", min_length=5, max_length=5
    ),
    codes: list[str] = Query(default=[], description="CPT/HCPCS codes; repeatable"),
    radius_miles: float = Query(default=25, gt=0, le=1000),
    include_paediatric: bool = Query(
        default=False, description="Include paediatric hospitals on the map"
    ),
) -> EstimateResponse:
    if not codes:
        raise HTTPException(status_code=400, detail="Provide at least one code.")

    origin = ZIP_CENTROIDS.get(zip_code.strip())
    if origin is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"ZIP code '{zip_code}' isn't in the demo dataset, which only "
                "covers the Boston metro area. Try 02114, 02139, 02458, or 01803."
            ),
        )

    wanted = set(codes)
    selected = [
        c for c in real_data.codes_for_encounter(encounter_id) if c.code in wanted
    ]
    if not selected:
        raise HTTPException(
            status_code=404, detail="None of those codes belong to this encounter."
        )

    origin_lat, origin_lng = origin
    results: list[HospitalEstimate] = []
    # Count hospitals the paediatric filter hides, but only those that would
    # otherwise qualify (publish a selected code and sit within range), so the
    # "N hidden" note matches the discrepancy the user sees against the pricing.
    hidden_paediatric = 0

    for hospital in visible_hospitals(include_paediatric=True):
        distance = haversine_miles(origin_lat, origin_lng, hospital.lat, hospital.lng)
        if distance > radius_miles:
            continue

        # A hospital only contributes the codes it actually publishes.
        covered = [(c, c.prices[hospital.id]) for c in selected if hospital.id in c.prices]
        if not covered:
            continue

        # Qualifies, but the filter keeps it off the map for this request.
        if hospital.paediatric and not include_paediatric:
            hidden_paediatric += 1
            continue

        breakdown = build_breakdown(
            [price for _, price in covered],
            f"{hospital.id}:{','.join(sorted(wanted))}",
        )
        if breakdown is None:
            continue

        line_items = []
        for code, price in covered:
            value = payable(price)
            if value is None:
                continue
            amount, basis = value
            line_items.append(
                LineItem(
                    procedure=to_procedure(code),
                    patient_responsibility=amount,
                    basis=basis,
                )
            )

        results.append(
            HospitalEstimate(
                hospital=hospital.to_model(),
                distance_miles=round(distance, 1),
                breakdown=breakdown,
                line_items=line_items,
                covered_count=len(line_items),
                requested_count=len(selected),
            )
        )

    # Hospitals covering the whole basket rank first — otherwise a hospital
    # that publishes fewer prices would look cheapest on missing data alone.
    results.sort(
        key=lambda r: (
            r.covered_count < r.requested_count,
            r.breakdown.patient_responsibility,
        )
    )

    return EstimateResponse(
        procedures=[to_procedure(c) for c in selected],
        results=results,
        created_date=date.today(),
        valid_days=ESTIMATE_VALID_DAYS,
        hidden_paediatric_count=hidden_paediatric,
    )
