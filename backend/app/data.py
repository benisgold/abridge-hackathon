"""Hospital registry and ZIP geocoding stand-in.

Prices come from Robbert's CMS data (see real_data.py); this module supplies
what that data has none of — coordinates, addresses and display names.

Only hospitals that publish prices appear here. Four exist in the CMS data;
Boston Children's is excluded by default, see INCLUDE_PAEDIATRIC below.
"""

import os
from dataclasses import dataclass

from .models import Hospital

# Boston Children's Longwood publishes prices, but every patient in the dataset
# is an adult (ages 20-85). Quoting a children's-hospital price to a 45-year-old
# is wrong, so it is off unless explicitly switched on.
INCLUDE_PAEDIATRIC = os.environ.get("INCLUDE_PAEDIATRIC", "").lower() in {"1", "true"}


@dataclass(frozen=True)
class HospitalSeed:
    id: str
    name: str
    address: str
    city: str
    state: str
    zip_code: str
    lat: float
    lng: float
    phone: str
    paediatric: bool = False

    def to_model(self) -> Hospital:
        return Hospital(
            id=self.id,
            name=self.name,
            address=self.address,
            city=self.city,
            state=self.state,
            zip_code=self.zip_code,
            lat=self.lat,
            lng=self.lng,
            phone=self.phone,
        )


ALL_HOSPITALS: list[HospitalSeed] = [
    HospitalSeed(id="cha", name="Cambridge Health Alliance - Cambridge Hospital", address="1493 Cambridge St", city="Cambridge", state="MA", zip_code="02139", lat=42.3736, lng=-71.1006, phone="(617) 665-1000"),
    HospitalSeed(id="lahey", name="Lahey Hospital & Medical Center", address="41 Mall Rd", city="Burlington", state="MA", zip_code="01805", lat=42.4906, lng=-71.213, phone="(781) 744-5100"),
    HospitalSeed(id="southshore", name="South Shore Hospital", address="55 Fogg Rd", city="South Weymouth", state="MA", zip_code="02190", lat=42.177, lng=-70.944, phone="(781) 624-8000"),
    HospitalSeed(id="childrens", name="Boston Children's Hospital - Longwood", address="300 Longwood Ave", city="Boston", state="MA", zip_code="02115", lat=42.3373, lng=-71.1057, phone="(617) 355-6000", paediatric=True),
]

HOSPITALS: list[HospitalSeed] = [
    h for h in ALL_HOSPITALS if INCLUDE_PAEDIATRIC or not h.paediatric
]


def visible_hospitals(include_paediatric: bool = INCLUDE_PAEDIATRIC) -> list[HospitalSeed]:
    """Hospitals shown on the map for a request; paediatric ones are opt-in."""
    return [h for h in ALL_HOSPITALS if include_paediatric or not h.paediatric]


def find_seed(hospital_id: str) -> HospitalSeed | None:
    """Look up a hospital regardless of the paediatric filter."""
    return next((h for h in ALL_HOSPITALS if h.id == hospital_id), None)


def find_hospital(hospital_id: str) -> HospitalSeed | None:
    return next((h for h in HOSPITALS if h.id == hospital_id), None)


# Stand-in for a geocoding service: zip -> approximate centroid.
ZIP_CENTROIDS: dict[str, tuple[float, float]] = {
    "01742": (42.4600, -71.3490),  # Concord
    "01801": (42.4870, -71.1520),  # Woburn
    "01803": (42.4790, -71.2000),  # Burlington
    "01805": (42.5000, -71.2100),  # Burlington (Lahey)
    "01890": (42.4520, -71.1470),  # Winchester
    "01915": (42.5580, -70.8800),  # Beverly
    "01970": (42.5190, -70.8960),  # Salem
    "02108": (42.3576, -71.0655),  # Beacon Hill
    "02109": (42.3660, -71.0540),  # North End
    "02110": (42.3560, -71.0520),  # Financial District
    "02111": (42.3510, -71.0630),  # Chinatown
    "02113": (42.3660, -71.0550),
    "02114": (42.3617, -71.0680),  # West End
    "02115": (42.3430, -71.0950),  # Longwood
    "02116": (42.3500, -71.0760),  # Back Bay
    "02118": (42.3370, -71.0720),  # South End
    "02119": (42.3240, -71.0840),  # Roxbury
    "02120": (42.3320, -71.0950),  # Mission Hill
    "02121": (42.3080, -71.0850),
    "02122": (42.2930, -71.0550),
    "02124": (42.2870, -71.0710),  # Dorchester
    "02125": (42.3160, -71.0570),
    "02126": (42.2750, -71.0930),  # Mattapan
    "02127": (42.3340, -71.0400),  # South Boston
    "02128": (42.3780, -71.0250),  # East Boston
    "02129": (42.3780, -71.0620),  # Charlestown
    "02130": (42.3090, -71.1150),  # Jamaica Plain
    "02131": (42.2870, -71.1230),  # Roslindale
    "02132": (42.2800, -71.1610),  # West Roxbury
    "02134": (42.3550, -71.1310),  # Allston
    "02135": (42.3480, -71.1550),  # Brighton
    "02136": (42.2550, -71.1290),  # Hyde Park
    "02138": (42.3790, -71.1290),  # Cambridge
    "02139": (42.3650, -71.1040),  # Cambridge
    "02140": (42.3920, -71.1290),  # Cambridge
    "02141": (42.3700, -71.0850),  # Cambridge
    "02142": (42.3630, -71.0830),  # Kendall
    "02143": (42.3810, -71.0990),  # Somerville
    "02144": (42.4000, -71.1220),  # Somerville
    "02145": (42.3900, -71.0900),  # Somerville
    "02148": (42.4290, -71.0450),  # Malden
    "02149": (42.4080, -71.0540),  # Everett
    "02150": (42.3950, -71.0350),  # Chelsea
    "02151": (42.4180, -71.0000),  # Revere
    "02155": (42.4230, -71.1050),  # Medford
    "02169": (42.2510, -71.0030),  # Quincy
    "02176": (42.4560, -71.0640),  # Melrose
    "02180": (42.4780, -71.1000),  # Stoneham
    "02184": (42.2100, -70.9970),  # Braintree
    "02190": (42.1740, -70.9430),  # South Weymouth
    "02210": (42.3480, -71.0400),  # Seaport
    "02215": (42.3470, -71.1030),  # Fenway
    "02446": (42.3430, -71.1210),  # Brookline
    "02458": (42.3520, -71.1870),  # Newton
    "02460": (42.3450, -71.2080),  # Newtonville
    "02462": (42.3260, -71.2450),  # Newton Lower Falls
    "02472": (42.3700, -71.1770),  # Watertown
    "02474": (42.4160, -71.1560),  # Arlington
    "02476": (42.4180, -71.1830),  # Arlington
    "02478": (42.3960, -71.1780),  # Belmont
}
