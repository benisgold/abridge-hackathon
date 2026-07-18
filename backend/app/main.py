from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .data import HOSPITALS, PROCEDURES, ZIP_CENTROIDS
from .encounters import Encounter, EncounterSummary, dataset_present, find_encounter
from .encounters import load_encounters
from .extraction import stream_extraction
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
from .pricing import build_breakdown, combine_breakdowns, market_pricing, resolve_procedure

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
def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "message": "hello from fastapi",
        "dataset_present": dataset_present(),
    }


@app.get("/api/procedures")
def list_procedures() -> list[Procedure]:
    return [procedure.to_model() for procedure in PROCEDURES]


@app.get("/api/encounters")
def list_encounters() -> list[EncounterSummary]:
    return [EncounterSummary(**e.model_dump()) for e in load_encounters()]


@app.get("/api/encounters/{encounter_id}")
def get_encounter(encounter_id: str) -> Encounter:
    encounter = find_encounter(encounter_id)
    if encounter is None:
        raise HTTPException(status_code=404, detail=f"No encounter '{encounter_id}'")
    return encounter


@app.post("/api/extract")
async def extract_codes(request: ExtractRequest) -> StreamingResponse:
    """Streams CPT codes extracted from a visit summary by Claude, as SSE."""
    summary_text = request.summary_text
    if not summary_text and request.encounter_id:
        encounter = find_encounter(request.encounter_id)
        if encounter is None:
            raise HTTPException(
                status_code=404, detail=f"No encounter '{request.encounter_id}'"
            )
        summary_text = encounter.after_visit_summary

    if not summary_text or not summary_text.strip():
        raise HTTPException(
            status_code=400, detail="Provide either encounter_id or summary_text."
        )

    return StreamingResponse(
        stream_extraction(summary_text),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/pricing")
def get_pricing(request: PricingRequest) -> PricingResponse:
    """Market-level average and lowest cost per code, across all seeded hospitals."""
    if not request.codes:
        raise HTTPException(status_code=400, detail="Provide at least one code.")

    priced = [market_pricing(code) for code in request.codes]
    return PricingResponse(
        codes=priced,
        total_average=sum(p.average for p in priced),
        total_lowest=sum(p.lowest for p in priced),
    )


@app.get("/api/estimates")
def get_estimates(
    # Bound to `zip_code` so the parameter doesn't shadow the zip() builtin below.
    zip_code: str = Query(
        alias="zip", description="5-digit ZIP code", min_length=5, max_length=5
    ),
    codes: list[str] = Query(default=[], description="CPT codes; repeatable"),
    code: str | None = Query(default=None, description="Single CPT code (legacy)"),
    radius_miles: float = Query(default=25, gt=0, le=200),
) -> EstimateResponse:
    requested = list(codes) or ([code] if code else [])
    if not requested:
        raise HTTPException(
            status_code=400, detail="Provide at least one code via ?codes= or ?code=."
        )

    origin = ZIP_CENTROIDS.get(zip_code.strip())
    if origin is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"ZIP code '{zip_code}' isn't in the demo dataset, which only "
                "covers the Boston metro area. Try 02114, 02139, 02458, or 01803."
            ),
        )

    procedures = [resolve_procedure(c)[0] for c in requested]

    origin_lat, origin_lng = origin
    results: list[HospitalEstimate] = []
    for hospital in HOSPITALS:
        distance = haversine_miles(origin_lat, origin_lng, hospital.lat, hospital.lng)
        if distance > radius_miles:
            continue

        breakdowns = [build_breakdown(p, hospital) for p in procedures]
        results.append(
            HospitalEstimate(
                hospital=hospital.to_model(),
                distance_miles=round(distance, 1),
                breakdown=combine_breakdowns(
                    breakdowns, f"{hospital.id}:{','.join(requested)}"
                ),
                line_items=[
                    LineItem(
                        procedure=procedure.to_model(),
                        patient_responsibility=breakdown.patient_responsibility,
                        total_fees=breakdown.total_fees,
                    )
                    for procedure, breakdown in zip(procedures, breakdowns, strict=True)
                ],
            )
        )

    results.sort(key=lambda r: r.breakdown.patient_responsibility)

    return EstimateResponse(
        procedures=[p.to_model() for p in procedures],
        results=results,
        created_date=date.today(),
        valid_days=ESTIMATE_VALID_DAYS,
    )
