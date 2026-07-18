#!/usr/bin/env python3
"""
SNOMED -> CPT/HCPCS -> cross-hospital price comparison.

Design note: the mapping step is retrieval-grounded. We first index every
billing code the hospitals actually publish, then ask Claude to choose from
that real menu. A code it can't choose is a code nobody can price, so
hallucinated CPT codes cannot survive the pipeline.

Usage:
    export ANTHROPIC_API_KEY=...
    pip install anthropic

    python snomed_price_agent.py --mrf-dir ./mrfs --codes codes.json
    python snomed_price_agent.py --mrf-dir ./mrfs --codes codes.json --dry-run

codes.json:
    [{"snomed": "76752008", "display": "Repair of inguinal hernia"}, ...]

mrfs/ may contain .csv (CMS tall), .json (CMS v3.0), or .csv.zip files.
Filenames are used as hospital labels, so name them sensibly.
"""

import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

csv.field_size_limit(10_000_000)  # attestation blobs are enormous

MODEL = "claude-sonnet-5"
BILLABLE = {"CPT", "HCPCS"}
CACHE_PATH = Path("mapping_cache.json")


# ---------------------------------------------------------------- MRF loading

def _rec(hospital, desc, codes, setting, payer, plan,
         dollar, pct, algorithm, median, gross, methodology):
    """Canonical record. `codes` is a list of (code, type) tuples."""
    return {
        "hospital": hospital, "description": desc, "codes": codes,
        "setting": setting, "payer": payer, "plan": plan,
        "dollar": dollar, "pct": pct, "algorithm": algorithm,
        "median": median, "gross": gross, "methodology": methodology,
    }


def _num(v):
    if v in (None, "", "-1"):
        return None
    try:
        return float(str(v).replace(",", "").replace("$", ""))
    except ValueError:
        return None


def load_csv_tall(fh, hospital):
    """CMS v3.0 CSV 'tall'. Rows 1-2 are hospital metadata; header is row 3."""
    rows = csv.reader(fh)
    for _ in range(2):
        next(rows, None)
    header = next(rows, None)
    if header is None:
        return []
    idx = {h.strip(): i for i, h in enumerate(header)}

    def g(row, key):
        i = idx.get(key)
        return row[i].strip() if i is not None and i < len(row) else ""

    out = []
    for row in rows:
        if not any(row):
            continue
        codes = []
        for n in (1, 2):
            # header spacing around pipes varies between publishers
            c = g(row, f"code | {n}") or g(row, f"code|{n}")
            t = g(row, f"code | {n} | type") or g(row, f"code|{n}|type")
            if c and t:
                codes.append((c, t.upper()))
        out.append(_rec(
            hospital, g(row, "description"), codes, g(row, "setting"),
            g(row, "payer_name"), g(row, "plan_name"),
            _num(g(row, "standard_charge | negotiated_dollar")
                 or g(row, "standard_charge|negotiated_dollar")),
            _num(g(row, "standard_charge | negotiated_percentage")
                 or g(row, "standard_charge|negotiated_percentage")),
            g(row, "standard_charge | negotiated_algorithm")
            or g(row, "standard_charge|negotiated_algorithm"),
            _num(g(row, "median_amount")),
            _num(g(row, "standard_charge | gross") or g(row, "standard_charge|gross")),
            g(row, "standard_charge | methodology") or g(row, "standard_charge|methodology"),
        ))
    return out


def load_json_v3(fh, hospital):
    """CMS v3.0 JSON. Three levels: item -> standard_charges -> payers_information."""
    doc = json.load(fh)
    out = []
    for item in doc.get("standard_charge_information", []):
        codes = [(c.get("code", ""), (c.get("type") or "").upper())
                 for c in item.get("code_information", []) if c.get("code")]
        desc = item.get("description", "")
        for sc in item.get("standard_charges", []):
            gross = _num(sc.get("gross_charge"))
            setting = sc.get("setting", "")
            payers = sc.get("payers_information") or [{}]
            for p in payers:
                out.append(_rec(
                    hospital, desc, codes, setting,
                    p.get("payer_name", ""), p.get("plan_name", ""),
                    _num(p.get("standard_charge_dollar")),
                    _num(p.get("standard_charge_percentage")),
                    p.get("standard_charge_algorithm", ""),
                    _num(p.get("estimated_amount") or p.get("median_amount")),
                    gross, p.get("methodology", ""),
                ))
    return out


def load_mrf_dir(path):
    """Returns {hospital_label: [records]}. Skips files that fail to parse."""
    by_hospital = {}
    for f in sorted(Path(path).iterdir()):
        label = re.sub(r"\.(csv|json|zip)$", "", f.name, flags=re.I)
        label = re.sub(r"_?standardcharges.*$", "", label, flags=re.I).strip("_-") or f.name
        try:
            if f.suffix.lower() == ".zip":
                with zipfile.ZipFile(f) as z:
                    inner = next(n for n in z.namelist() if n.lower().endswith((".csv", ".json")))
                    raw = z.read(inner).decode("utf-8-sig", errors="replace")
                recs = (load_json_v3(io.StringIO(raw), label) if inner.lower().endswith(".json")
                        else load_csv_tall(io.StringIO(raw), label))
            elif f.suffix.lower() == ".json":
                with open(f, encoding="utf-8-sig", errors="replace") as fh:
                    recs = load_json_v3(fh, label)
            elif f.suffix.lower() == ".csv":
                with open(f, encoding="utf-8-sig", errors="replace", newline="") as fh:
                    recs = load_csv_tall(fh, label)
            else:
                continue
        except Exception as e:
            print(f"  ! {f.name}: {type(e).__name__}: {e}", file=sys.stderr)
            continue
        by_hospital[label] = recs
        print(f"  {label}: {len(recs):,} rows", file=sys.stderr)
    return by_hospital


# ------------------------------------------------------------------ inventory

def build_inventory(by_hospital):
    """
    {(code, type): {"desc": str, "hospitals": set}} for billable code types only.
    This is the menu Claude is allowed to choose from.
    """
    inv = {}
    for hospital, recs in by_hospital.items():
        for r in recs:
            for code, ctype in r["codes"]:
                if ctype not in BILLABLE:
                    continue
                e = inv.setdefault((code, ctype), {"desc": r["description"], "hospitals": set()})
                e["hospitals"].add(hospital)
                if len(r["description"]) > len(e["desc"]):
                    e["desc"] = r["description"]  # prefer the fuller wording
    return inv


_STOP = {"of", "the", "a", "an", "with", "without", "and", "or", "to", "for",
         "procedure", "structure", "finding", "disorder", "left", "right"}


def _tokens(s):
    return {w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in _STOP and len(w) > 2}


def shortlist(term, inv, k=25):
    """Lexical prefilter. Keeps the prompt small and costs nothing."""
    q = _tokens(term)
    if not q:
        return []
    scored = []
    for (code, ctype), e in inv.items():
        d = _tokens(e["desc"])
        if not d:
            continue
        overlap = len(q & d)
        if overlap:
            scored.append((overlap / len(q | d), code, ctype, e))
    scored.sort(reverse=True, key=lambda x: x[0])
    return [(c, t, e) for _, c, t, e in scored[:k]]


# ------------------------------------------------------------- mapping agent

PROMPT = """You map SNOMED CT clinical concepts to billable CPT/HCPCS codes.

For each SNOMED concept below, choose the best matching code(s) from the \
CANDIDATES list. The candidates are the codes these hospitals actually publish \
prices for, so a code outside the list is useless even if it is clinically correct.

Rules:
- Choose only from CANDIDATES. Never invent a code.
- A SNOMED concept may map to several codes, or to none.
- If nothing in CANDIDATES is a defensible match, return an empty codes list \
and say why in `note`.
- confidence: "high" only when the candidate description is clinically \
equivalent, not merely related.
- Flag needs_review=true for anything involving laterality, bilateral vs \
unilateral, approach (open vs laparoscopic), or a bundled/global period, since \
those change the code and cannot be resolved from the SNOMED term alone.

Return ONLY a JSON array, no prose and no markdown fences:
[{{"snomed": "...", "codes": [{{"code": "...", "type": "CPT"}}], \
"confidence": "high|medium|low", "needs_review": true, "note": "..."}}]

CONCEPTS:
{concepts}

CANDIDATES:
{candidates}"""


def _cache_key(snomed, cands):
    blob = snomed + "|" + "|".join(f"{c}{t}" for c, t, _ in cands)
    return hashlib.sha1(blob.encode()).hexdigest()[:16]


def map_codes(concepts, inv, dry_run=False):
    """concepts: [{"snomed","display"}]. Returns {snomed: mapping_dict}."""
    cache = json.loads(CACHE_PATH.read_text()) if CACHE_PATH.exists() else {}
    todo, results = [], {}

    for c in concepts:
        cands = shortlist(c["display"], inv)
        key = _cache_key(c["snomed"], cands)
        if key in cache:
            results[c["snomed"]] = cache[key]
        else:
            todo.append((c, cands, key))

    if not todo:
        return results

    # One call for the whole batch. Union the candidate sets so the model can
    # see near-misses across concepts and disambiguate between them.
    concept_txt = "\n".join(f'- {c["snomed"]}: {c["display"]}' for c, _, _ in todo)
    seen, cand_lines = set(), []
    for _, cands, _ in todo:
        for code, ctype, e in cands:
            if (code, ctype) in seen:
                continue
            seen.add((code, ctype))
            cand_lines.append(f'- {code} ({ctype}): {e["desc"]} '
                              f'[{len(e["hospitals"])} hospitals]')
    prompt = PROMPT.format(concepts=concept_txt, candidates="\n".join(cand_lines))

    if dry_run:
        print(prompt)
        return results

    from anthropic import Anthropic
    msg = Anthropic().messages.create(
        model=MODEL, max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in msg.content if b.type == "text")
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        print("Model did not return valid JSON:\n" + text[:800], file=sys.stderr)
        return results

    by_snomed = {m["snomed"]: m for m in parsed}
    for c, _, key in todo:
        m = by_snomed.get(c["snomed"], {"codes": [], "confidence": "low",
                                        "needs_review": True, "note": "no response"})
        # Belt and braces: drop anything not in the inventory.
        m["codes"] = [x for x in m.get("codes", [])
                      if (x.get("code"), (x.get("type") or "").upper()) in inv]
        results[c["snomed"]] = m
        cache[key] = m

    CACHE_PATH.write_text(json.dumps(cache, indent=1))
    return results


# ------------------------------------------------------------------- pricing

def price(code, ctype, by_hospital):
    """Per hospital: best available dollar figure, with the fallback noted."""
    out = {}
    for hospital, recs in by_hospital.items():
        hits = [r for r in recs if (code, ctype) in r["codes"]]
        if not hits:
            continue
        dollars = [r["dollar"] for r in hits if r["dollar"]]
        if dollars:
            basis, lo, hi = "negotiated", min(dollars), max(dollars)
        else:
            medians = [r["median"] for r in hits if r["median"]]
            if medians:
                basis, lo, hi = "median", min(medians), max(medians)
            else:
                gross = [r["gross"] for r in hits if r["gross"]]
                if not gross:
                    continue
                basis, lo, hi = "gross", min(gross), max(gross)
        out[hospital] = {"basis": basis, "low": lo, "high": hi, "n_payers": len(hits)}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mrf-dir", required=True)
    ap.add_argument("--codes", required=True, help="JSON list of {snomed, display}")
    ap.add_argument("--dry-run", action="store_true", help="print the prompt, no API call")
    args = ap.parse_args()

    print("Loading MRFs...", file=sys.stderr)
    by_hospital = load_mrf_dir(args.mrf_dir)
    if not by_hospital:
        sys.exit("No MRFs parsed.")

    inv = build_inventory(by_hospital)
    print(f"\n{len(inv):,} distinct billable codes across "
          f"{len(by_hospital)} hospitals\n", file=sys.stderr)

    concepts = json.loads(Path(args.codes).read_text())
    mappings = map_codes(concepts, inv, dry_run=args.dry_run)
    if args.dry_run:
        return

    for c in concepts:
        m = mappings.get(c["snomed"], {})
        flag = "  [REVIEW]" if m.get("needs_review") else ""
        print(f'\n{c["display"]}  ({c["snomed"]})  '
              f'conf={m.get("confidence", "?")}{flag}')
        if m.get("note"):
            print(f'    note: {m["note"]}')
        if not m.get("codes"):
            print("    no priceable code found")
            continue
        for x in m["codes"]:
            code, ctype = x["code"], x["type"]
            print(f'    {ctype} {code}: {inv[(code, ctype)]["desc"]}')
            prices = price(code, ctype, by_hospital)
            if not prices:
                print("        no published price")
            for hospital, p in sorted(prices.items(), key=lambda kv: kv[1]["low"]):
                rng = (f'${p["low"]:,.0f}' if p["low"] == p["high"]
                       else f'${p["low"]:,.0f} - ${p["high"]:,.0f}')
                print(f'        {hospital:<34} {rng:>22}  '
                      f'({p["basis"]}, {p["n_payers"]} payer rows)')


if __name__ == "__main__":
    main()
