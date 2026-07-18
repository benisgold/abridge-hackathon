from datetime import date

from pydantic import BaseModel


class Procedure(BaseModel):
    code: str  # CPT, occasionally composite e.g. "36415,80048"
    name: str
    description: str
    # None means "not in our catalog, so we don't know" — never guessed.
    medicare_covered: bool | None = None


class Hospital(BaseModel):
    id: str
    name: str
    address: str
    city: str
    state: str
    zip_code: str
    lat: float
    lng: float
    phone: str


class Breakdown(BaseModel):
    """Whole-dollar figures. total_fees - discount == patient_responsibility."""

    hospital_fees: int
    physician_fees: int
    total_fees: int
    discount: int
    patient_responsibility: int
    low: int
    high: int
    reference_number: str


class LineItem(BaseModel):
    """One procedure's contribution to a multi-code estimate."""

    procedure: Procedure
    patient_responsibility: int
    total_fees: int


class HospitalEstimate(BaseModel):
    hospital: Hospital
    distance_miles: float
    breakdown: Breakdown  # summed across all requested procedures
    line_items: list[LineItem]


class EstimateResponse(BaseModel):
    procedures: list[Procedure]
    results: list[HospitalEstimate]
    created_date: date
    valid_days: int


class CodePricing(BaseModel):
    """Market view for one code across all seeded hospitals."""

    procedure: Procedure
    average: int
    lowest: int
    in_catalog: bool


class PricingRequest(BaseModel):
    codes: list[str]


class PricingResponse(BaseModel):
    codes: list[CodePricing]
    total_average: int
    total_lowest: int


class ExtractRequest(BaseModel):
    encounter_id: str | None = None
    summary_text: str | None = None
