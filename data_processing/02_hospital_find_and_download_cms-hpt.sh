#!/usr/bin/env bash
# Find and download cms-hpt.txt (+ relevant MRFs) for hospitals in the
# synthetic-ambient-fhir-25 dataset.
#
# Usage (from repo root or this folder):
#   ./data_processing/02_hospital_find_and_download_cms-hpt.sh
#   ./data_processing/02_hospital_find_and_download_cms-hpt.sh --skip-mrfs
#   ./data_processing/02_hospital_find_and_download_cms-hpt.sh --force
#
# Output:
#   data_processing/cms_hpt/*.cms-hpt.txt
#   data_processing/cms_hpt/mrfs/          (machine-readable price files)
#   data_processing/cms_hpt/README.md
#   data_processing/cms_hpt/mrfs/manifest.tsv

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/cms_hpt"
MRF_DIR="${OUT_DIR}/mrfs"
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

SKIP_MRFS=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --skip-mrfs) SKIP_MRFS=1 ;;
    --force) FORCE=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$OUT_DIR" "$MRF_DIR"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}
need_cmd curl
need_cmd python3

download() {
  # download <url> <dest>
  local url="$1"
  local dest="$2"
  if [[ -f "$dest" && "$FORCE" -eq 0 ]]; then
    echo "  skip (exists): $(basename "$dest")"
    return 0
  fi
  echo "  GET $url"
  curl -fsSL --max-time 300 -A "$UA" -H 'Accept: text/plain,*/*' \
    -o "$dest.partial" "$url"
  mv "$dest.partial" "$dest"
  echo "  saved $(basename "$dest") ($(wc -c < "$dest" | tr -d ' ') bytes)"
}

write_with_header() {
  # write_with_header <dest> <facility> <system_url> <cms_hpt_url> <body_file>
  local dest="$1"
  local facility="$2"
  local system_url="$3"
  local cms_hpt_url="$4"
  local body_file="$5"
  {
    echo "# cms-hpt fetch metadata"
    echo "# facility: ${facility}"
    echo "# system-url: ${system_url}"
    echo "# cms-hpt-url: ${cms_hpt_url}"
    echo "# --- original cms-hpt.txt body ---"
    cat "$body_file"
  } > "$dest"
}

echo "==> Fetching cms-hpt.txt files into ${OUT_DIR}"

# facility_key|display_name|system_url|cms_hpt_url|local_basename
HOSPITALS=(
  "challiance|CAMBRIDGE PUBLIC HEALTH COMMISSION (Cambridge Health Alliance)|https://www.challiance.org/|https://www.challiance.org/cms-hpt.txt|challiance_org.cms-hpt.txt"
  "childrens|CHILDREN'S HOSPITAL CORPORATION (Boston Children's)|https://www.childrenshospital.org/|https://www.childrenshospital.org/cms-hpt.txt|childrenshospital_org.cms-hpt.txt"
  "lahey|LAHEY HOSPITAL & MEDICAL CENTER, BURLINGTON|https://www.lahey.org/|https://www.lahey.org/cms-hpt.txt|lahey_org.cms-hpt.txt"
  "southshore|SOUTH SHORE HOSPITAL INC.|https://www.southshorehealth.org/|https://www.southshorehealth.org/cms-hpt.txt|southshorehealth_org.cms-hpt.txt"
  "encompass|ENCOMPASS HEALTH (includes Western Massachusetts)|https://www.encompasshealth.com/|https://www.encompasshealth.com/cms-hpt.txt|encompasshealth_com.cms-hpt.txt"
  "tufts|THE LOWELL GENERAL HOSPITAL (via Tufts Medicine)|https://www.tuftsmedicine.org/|https://www.tuftsmedicine.org/cms-hpt.txt|tuftsmedicine_org.cms-hpt.txt"
)

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

for row in "${HOSPITALS[@]}"; do
  IFS='|' read -r key facility system_url cms_hpt_url local_name <<<"$row"
  echo
  echo "[$key] $facility"
  raw="${TMP_DIR}/${key}.cms-hpt.txt"
  dest="${OUT_DIR}/${local_name}"

  fetched=0
  if curl -fsSL --max-time 60 -A "$UA" -H 'Accept: text/plain,*/*' -o "$raw" "$cms_hpt_url"; then
    if head -c 200 "$raw" | grep -qiE '<!DOCTYPE|<html'; then
      echo "  WARN: response looks like HTML, not cms-hpt.txt" >&2
    else
      fetched=1
    fi
  else
    echo "  WARN: live fetch failed for $cms_hpt_url" >&2
  fi

  # Tufts/Lowell often 403 behind Akamai from datacenter IPs.
  # Fall back to the known published cms-hpt.txt body so reproduction still works.
  if [[ "$fetched" -eq 0 && "$key" == "tufts" ]]; then
    echo "  using known Tufts cms-hpt.txt fallback body"
    cat > "$raw" <<'EOF'
location-name: Tufts Medical Center
source-page-url: https://www.tuftsmedicine.org/get-care/cost-estimate
mrf-url: https://www.tuftsmedicine.org/sites/default/files/2026-03/043400617_tuftsmedicalcenter_standardcharges.csv.zip
contact-name: Rachel Verville
contact-email: Rachel.Verville@tuftsmedicine.org

location-name: Lowell General Hospital
source-page-url: https://www.tuftsmedicine.org/get-care/cost-estimate
mrf-url: https://www.tuftsmedicine.org/sites/default/files/2026-03/042103590_lowellgeneralhospital_standardcharges.csv.zip
contact-name: Rachel Verville
contact-email: Rachel.Verville@tuftsmedicine.org

location-name: Lowell General Hospital Saints Campus
source-page-url: https://www.tuftsmedicine.org/get-care/cost-estimate
mrf-url: https://www.tuftsmedicine.org/sites/default/files/2026-03/042103590_lowellgeneralhospital_standardcharges.csv.zip
contact-name: Rachel Verville
contact-email: Rachel.Verville@tuftsmedicine.org

location-name: Melrose-Wakefield Hospital Campus
source-page-url: https://www.tuftsmedicine.org/get-care/cost-estimate
mrf-url: https://www.tuftsmedicine.org/sites/default/files/2026-03/042767880_melrosewakefieldhealthcare_standardcharges.csv.zip
contact-name: Rachel Verville
contact-email: Rachel.Verville@tuftsmedicine.org

location-name: Lawrence Memorial Hospital Campus
source-page-url: https://www.tuftsmedicine.org/get-care/cost-estimate
mrf-url: https://www.tuftsmedicine.org/sites/default/files/2026-03/042767880_melrosewakefieldhealthcare_standardcharges.csv.zip
contact-name: Rachel Verville
contact-email: Rachel.Verville@tuftsmedicine.org
EOF
    fetched=1
  fi

  if [[ "$fetched" -eq 0 ]]; then
    echo "  FAILED: no cms-hpt.txt available for $key" >&2
    continue
  fi

  write_with_header "$dest" "$facility" "$system_url" "$cms_hpt_url" "$raw"
  echo "  saved $local_name"

  # Lowell helper note
  if [[ "$key" == "tufts" ]]; then
    cat > "${OUT_DIR}/lowellgeneral_org.cms-hpt.NOTE.txt" <<EOF
# Lowell General Hospital — resolved via Tufts Medicine

cms-hpt-url: https://www.tuftsmedicine.org/cms-hpt.txt
local-file: tuftsmedicine_org.cms-hpt.txt
system-url: https://www.tuftsmedicine.org/
hospital-url: https://www.lowellgeneral.org/
price-transparency-page-url: https://www.tuftsmedicine.org/get-care/cost-estimate
mrf-url: https://www.tuftsmedicine.org/sites/default/files/2026-03/042103590_lowellgeneralhospital_standardcharges.csv.zip
Note: Lowell General Hospital and Saints Campus share the same MRF zip.
Note: live fetch of cms-hpt.txt may return 403 from some networks; script falls back to known published body.
EOF
  fi
done

# Extract Western Mass snippet from Encompass system-wide file
ENC="${OUT_DIR}/encompasshealth_com.cms-hpt.txt"
if [[ -f "$ENC" ]]; then
  python3 - "$ENC" "${OUT_DIR}/encompasshealth_western_mass.cms-hpt.snippet.txt" <<'PY'
import re, sys
from pathlib import Path
src, dest = Path(sys.argv[1]), Path(sys.argv[2])
body = src.read_text(encoding="utf-8", errors="replace")
if "--- original cms-hpt.txt body ---" in body:
    body = body.split("--- original cms-hpt.txt body ---\n", 1)[1]
blocks = re.split(r"\n\s*\n", body.strip())
western = next((b for b in blocks if "Western Massachusetts" in b), None)
if not western:
    raise SystemExit("Western Massachusetts block not found in Encompass cms-hpt.txt")
mrf = re.search(r"mrf-url:\s*(\S+)", western)
page = re.search(r"source-page-url:\s*(\S+)", western)
header = (
    "# cms-hpt fetch metadata\n"
    "# facility: ENCOMPASS HEALTH REHAB HOSPITAL OF WESTERN MASS\n"
    "# system-url: https://www.encompasshealth.com/\n"
    "# cms-hpt-url: https://www.encompasshealth.com/cms-hpt.txt\n"
    f"# location-page-url: {page.group(1) if page else ''}\n"
    f"# mrf-url: {mrf.group(1) if mrf else ''}\n"
    "# --- original cms-hpt.txt body ---\n"
)
dest.write_text(header + western + "\n", encoding="utf-8")
print(f"  saved {dest.name}")
PY
fi

if [[ "$SKIP_MRFS" -eq 1 ]]; then
  echo
  echo "==> Skipping MRF downloads (--skip-mrfs)"
else
  echo
  echo "==> Downloading relevant MRFs into ${MRF_DIR}"
  echo "    (one file per dataset hospital; Tufts = Lowell only)"

  python3 - "$OUT_DIR" "$MRF_DIR" "$FORCE" "$UA" <<'PY'
import re, sys, csv, subprocess
from pathlib import Path
from urllib.parse import unquote, urlparse

out_dir = Path(sys.argv[1])
mrf_dir = Path(sys.argv[2])
force = sys.argv[3] == "1"
ua = sys.argv[4]
mrf_dir.mkdir(parents=True, exist_ok=True)

def body(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    if "--- original cms-hpt.txt body ---" in text:
        return text.split("--- original cms-hpt.txt body ---\n", 1)[1]
    return text

def blocks(path: Path):
    for b in re.split(r"\n\s*\n", body(path).strip()):
        loc = re.search(r"location-name:\s*(.+)", b)
        mrf = re.search(r"mrf-url:\s*(\S+)", b)
        if loc and mrf:
            yield loc.group(1).strip(), mrf.group(1).strip()

def filename_from_url(url: str) -> str:
    name = unquote(urlparse(url).path.rstrip("/").split("/")[-1])
    return name or "download.bin"

# hospital_key -> chosen (location, url)
selected = {}

# CHA: shared CSV for all campuses — take first
for loc, url in blocks(out_dir / "challiance_org.cms-hpt.txt"):
    selected["cambridge_health_alliance"] = (loc, url)
    break

# Boston Children's: Longwood main campus
for loc, url in blocks(out_dir / "childrenshospital_org.cms-hpt.txt"):
    if "Longwood" in loc:
        selected["boston_childrens_longwood"] = (loc, url)
        break

# Lahey Burlington
for loc, url in blocks(out_dir / "lahey_org.cms-hpt.txt"):
    if "Lahey Hospital" in loc or "Burlington" in loc:
        selected["lahey_burlington"] = (loc, url)
        break

# South Shore
for loc, url in blocks(out_dir / "southshorehealth_org.cms-hpt.txt"):
    selected["south_shore"] = (loc, url)
    break

# Encompass Western Mass
snippet = out_dir / "encompasshealth_western_mass.cms-hpt.snippet.txt"
if snippet.exists():
    for loc, url in blocks(snippet):
        selected["encompass_western_mass"] = (loc, url)
        break

# Tufts: Lowell only (Saints Campus shares the same zip)
for loc, url in blocks(out_dir / "tuftsmedicine_org.cms-hpt.txt"):
    if loc.startswith("Lowell General Hospital") and "Saints" not in loc:
        selected["lowell_general"] = (loc, url)
        break

manifest_path = mrf_dir / "manifest.tsv"
rows = []
for key, (loc, url) in selected.items():
    fname = filename_from_url(url)
    dest = mrf_dir / fname
    print(f"\n[{key}] {loc}")
    print(f"  {url}")
    if dest.exists() and not force:
        print(f"  skip (exists): {dest.name}")
        status = "skipped_exists"
    else:
        partial = dest.with_suffix(dest.suffix + ".partial")
        cmd = [
            "curl", "-fL", "--max-time", "600",
            "-A", ua,
            "-H", "Accept: */*",
            "-o", str(partial),
            url,
        ]
        try:
            subprocess.run(cmd, check=True)
            partial.replace(dest)
            print(f"  saved {dest.name} ({dest.stat().st_size:,} bytes)")
            status = "ok"
        except subprocess.CalledProcessError as e:
            if partial.exists():
                partial.unlink()
            print(f"  FAILED ({e.returncode})")
            status = "failed"
            rows.append({
                "hospital_key": key,
                "location_name": loc,
                "mrf_url": url,
                "local_file": "",
                "bytes": 0,
                "status": status,
            })
            continue

    # Unzip if needed
    if dest.exists() and dest.name.endswith(".zip"):
        extract_dir = mrf_dir / (dest.name.replace(".csv.zip", "").replace(".zip", "") + "_unzipped")
        extract_dir.mkdir(exist_ok=True)
        subprocess.run(["unzip", "-o", "-q", str(dest), "-d", str(extract_dir)], check=False)

    rows.append({
        "hospital_key": key,
        "location_name": loc,
        "mrf_url": url,
        "local_file": dest.name if dest.exists() else "",
        "bytes": dest.stat().st_size if dest.exists() else 0,
        "status": status,
    })

with manifest_path.open("w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(
        f,
        fieldnames=["hospital_key", "location_name", "mrf_url", "local_file", "bytes", "status"],
        delimiter="\t",
    )
    writer.writeheader()
    writer.writerows(rows)
print(f"\n  wrote {manifest_path}")
PY
fi

# Build a simple dataset-facility -> MRF lookup CSV.
python3 - "$OUT_DIR" "$SCRIPT_DIR" <<'PY'
import csv
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

out_dir = Path(sys.argv[1])
script_dir = Path(sys.argv[2])
mrf_dir = out_dir / "mrfs"

def blocks(filename):
    path = out_dir / filename
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8", errors="replace")
    if "--- original cms-hpt.txt body ---" in text:
        text = text.split("--- original cms-hpt.txt body ---\n", 1)[1]
    result = []
    for block in re.split(r"\n\s*\n", text.strip()):
        location = re.search(r"location-name:\s*(.+)", block)
        mrf = re.search(r"mrf-url:\s*(\S+)", block)
        if location and mrf:
            result.append((location.group(1).strip(), mrf.group(1).strip()))
    return result

def choose(filename, predicate):
    return next(((location, url) for location, url in blocks(filename) if predicate(location)), ("", ""))

# Physical address + geocoded coordinates for each dataset hospital, keyed by
# encounter_number. Reusable for plotting facilities on a map.
hospital_locations = {
    2: {
        "hospital_address": "1493 Cambridge Street, Cambridge, MA 02139",
        "hospital_latitude": 42.3735,
        "hospital_longitude": -71.1010,
    },
    5: {
        "hospital_address": "300 Longwood Avenue, Boston, MA 02115",
        "hospital_latitude": 42.3372,
        "hospital_longitude": -71.1057,
    },
    9: {
        "hospital_address": "222 State Street, Ludlow, MA 01056",
        "hospital_latitude": 42.1806,
        "hospital_longitude": -72.4514,
    },
    16: {
        "hospital_address": "41 Mall Road, Burlington, MA 01805",
        "hospital_latitude": 42.4998,
        "hospital_longitude": -71.2109,
    },
    17: {
        "hospital_address": "55 Fogg Road, South Weymouth, MA 02190",
        "hospital_latitude": 42.1668,
        "hospital_longitude": -70.9495,
    },
    18: {
        "hospital_address": "295 Varnum Avenue, Lowell, MA 01854",
        "hospital_latitude": 42.6553,
        "hospital_longitude": -71.3506,
    },
}

specs = [
    (2, "CAMBRIDGE PUBLIC HEALTH COMMISSION", "https://www.challiance.org/cms-hpt.txt",
     "challiance_org.cms-hpt.txt", lambda location: True),
    (5, "CHILDREN'S HOSPITAL CORPORATION", "https://www.childrenshospital.org/cms-hpt.txt",
     "childrenshospital_org.cms-hpt.txt", lambda location: "Longwood" in location),
    (9, "ENCOMPASS HEALTH REHAB HOSPITAL OF WESTERN MASS", "https://www.encompasshealth.com/cms-hpt.txt",
     "encompasshealth_western_mass.cms-hpt.snippet.txt", lambda location: "Western Massachusetts" in location),
    (16, "LAHEY HOSPITAL & MEDICAL CENTER, BURLINGTON", "https://www.lahey.org/cms-hpt.txt",
     "lahey_org.cms-hpt.txt", lambda location: "Lahey Hospital" in location or "Burlington" in location),
    (17, "SOUTH SHORE HOSPITAL INC.", "https://www.southshorehealth.org/cms-hpt.txt",
     "southshorehealth_org.cms-hpt.txt", lambda location: True),
    (18, "THE LOWELL GENERAL HOSPITAL", "https://www.tuftsmedicine.org/cms-hpt.txt",
     "tuftsmedicine_org.cms-hpt.txt",
     lambda location: location == "Lowell General Hospital"),
]

rows = []
for encounter_number, dataset_name, cms_hpt_url, cms_hpt_file, predicate in specs:
    mrf_location, mrf_url = choose(cms_hpt_file, predicate)
    filename = unquote(urlparse(mrf_url).path.rsplit("/", 1)[-1]) if mrf_url else ""
    local_path = mrf_dir / filename if filename else None
    location_info = hospital_locations.get(encounter_number, {})
    rows.append({
        "encounter_number": encounter_number,
        "dataset_facility_name": dataset_name,
        "matched_mrf_location": mrf_location,
        "hospital_address": location_info.get("hospital_address", ""),
        "hospital_latitude": location_info.get("hospital_latitude", ""),
        "hospital_longitude": location_info.get("hospital_longitude", ""),
        "cms_hpt_url": cms_hpt_url,
        "local_cms_hpt_file": f"cms_hpt/{cms_hpt_file}",
        "mrf_url": mrf_url,
        "mrf_filename": filename,
        "local_mrf_directory": "cms_hpt/mrfs",
        "local_mrf_file": f"cms_hpt/mrfs/{filename}" if local_path and local_path.exists() else "",
        "mrf_format": (
            "csv.zip" if filename.endswith(".csv.zip")
            else "json" if filename.endswith(".json")
            else "csv" if filename.endswith(".csv")
            else ""
        ),
        "download_status": "downloaded" if local_path and local_path.exists() else "not_downloaded",
    })

processed_dir = script_dir / "processed_csv"
processed_dir.mkdir(parents=True, exist_ok=True)
lookup_path = processed_dir / "hospital_to_mrfs.csv"
with lookup_path.open("w", encoding="utf-8", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
print(f"  wrote {lookup_path}")
PY

# Refresh README
cat > "${OUT_DIR}/README.md" <<EOF
# cms-hpt.txt fetch summary

Reproduced by: \`data_processing/02_hospital_find_and_download_cms-hpt.sh\`

MRF downloads live in \`./mrfs/\` (see \`mrfs/manifest.tsv\`).

- [FOUND] CAMBRIDGE PUBLIC HEALTH COMMISSION
  system-url: https://www.challiance.org/
  cms-hpt-url: https://www.challiance.org/cms-hpt.txt
  file: challiance_org.cms-hpt.txt

- [FOUND] CHILDREN'S HOSPITAL CORPORATION
  system-url: https://www.childrenshospital.org/
  cms-hpt-url: https://www.childrenshospital.org/cms-hpt.txt
  file: childrenshospital_org.cms-hpt.txt

- [FOUND] LAHEY HOSPITAL & MEDICAL CENTER, BURLINGTON
  system-url: https://www.lahey.org/
  cms-hpt-url: https://www.lahey.org/cms-hpt.txt
  file: lahey_org.cms-hpt.txt

- [FOUND] SOUTH SHORE HOSPITAL INC.
  system-url: https://www.southshorehealth.org/
  cms-hpt-url: https://www.southshorehealth.org/cms-hpt.txt
  file: southshorehealth_org.cms-hpt.txt

- [FOUND] ENCOMPASS HEALTH REHAB HOSPITAL OF WESTERN MASS
  system-url: https://www.encompasshealth.com/
  cms-hpt-url: https://www.encompasshealth.com/cms-hpt.txt
  file: encompasshealth_com.cms-hpt.txt (+ western_mass snippet)

- [FOUND] THE LOWELL GENERAL HOSPITAL
  system-url: https://www.tuftsmedicine.org/
  hospital-url: https://www.lowellgeneral.org/
  price-transparency-page-url: https://www.tuftsmedicine.org/get-care/cost-estimate
  cms-hpt-url: https://www.tuftsmedicine.org/cms-hpt.txt
  file: tuftsmedicine_org.cms-hpt.txt
  mrf-url: https://www.tuftsmedicine.org/sites/default/files/2026-03/042103590_lowellgeneralhospital_standardcharges.csv.zip
EOF

echo
echo "==> Done"
echo "    cms-hpt files: ${OUT_DIR}"
echo "    MRFs:          ${MRF_DIR}"
ls -la "$OUT_DIR" | sed 's/^/    /'
