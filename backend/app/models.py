from datetime import date
from typing import Literal

from pydantic import BaseModel


class Procedure(BaseModel):
    code: str
    code_type: str  # CPT or HCPCS
    name: str
    description: str
    category: str = ""
    # Carried through from the extraction so the UI can caveat weak matches.
    confidence: str = ""
    needs_review: bool = False


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
    """Real published prices. Every field is whole dollars.

    `patient_responsibility` is what we rank on. It is normally the cash price;
    `basis` says so, because ~15% of hospital-code pairs publish no cash price
    and fall back to the negotiated median — the UI must not label a negotiated
    figure as a self-pay price.
    """

    patient_responsibility: int
    basis: Literal["cash", "negotiated"]

    # The three display rows. None means "not published" — render nothing
    # rather than substituting another field under the wrong label.
    without_insurance: int | None
    with_insurance: int | None
    expected_low: int | None
    expected_high: int | None

    # List price, where published, and the implied self-pay discount.
    gross: int | None
    discount: int | None

    n_payers: int
    limited_data: bool
    reference_number: str


class LineItem(BaseModel):
    procedure: Procedure
    patient_responsibility: int
    basis: Literal["cash", "negotiated"]


class HospitalEstimate(BaseModel):
    hospital: Hospital
    distance_miles: float
    breakdown: Breakdown
    line_items: list[LineItem]
    # A hospital may publish prices for only part of the basket. Ranking on a
    # partial total would reward missing data, so the UI shows the shortfall
    # and sorts incomplete hospitals last.
    covered_count: int
    requested_count: int


class EstimateResponse(BaseModel):
    procedures: list[Procedure]
    results: list[HospitalEstimate]
    created_date: date
    valid_days: int


class CodePricing(BaseModel):
    """Market view for one code across the hospitals that publish it."""

    procedure: Procedure
    average: int
    lowest: int
    n_hospitals: int


class PricingRequest(BaseModel):
    encounter_id: str
    codes: list[str]


class PricingResponse(BaseModel):
    codes: list[CodePricing]
    total_average: int
    total_lowest: int


class ExtractRequest(BaseModel):
    encounter_id: str | None = None
    summary_text: str | None = None
