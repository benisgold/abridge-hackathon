#!/usr/bin/env python3
"""
Clinical free text -> CPT/HCPCS -> cross-hospital price comparison.

Two stages, because you cannot retrieve candidate codes until you know what
you are retrieving for:

  1. EXTRACT   text -> discrete billable service mentions, each with laterality,
               approach and status. Status matters most: a transcript is full of
               past surgeries and things that were discussed and dropped, and
               coding those is the classic failure mode.
  2. MAP       each mention -> codes chosen from the inventory the hospitals
               actually publish. A code outside that inventory cannot be priced,
               so hallucinations die at the validation step.

Usage:
    export ANTHROPIC_API_KEY=...
    pip install anthropic

    python text_to_codes_agent.py --mrf-dir ./mrfs --text note.txt
    python text_to_codes_agent.py --mrf-dir ./mrfs --text note.txt --show-prompts
    echo "..." | python text_to_codes_agent.py --mrf-dir ./mrfs --text -
"""

import argparse
import csv
import hashlib
import io
import json
import re
import sys
import zipfile
from pathlib import Path

csv.field_size_limit(10_000_000)

MODEL = "claude-sonnet-5"
BILLABLE = {"CPT", "HCPCS"}
CODEABLE_STATUS = {"performed", "ordered", "planned"}
CACHE_PATH = Path("text_map_cache.json")


# ---------------------------------------------------------------- MRF loading

def _rec(hospital, desc, codes, setting, payer, plan,
         dollar, pct, algorithm, median, gross, methodology,
         discounted_cash=None, minimum=None, maximum=None, p10=None, p90=None):
    return {"hospital": hospital, "description": desc, "codes": codes,
            "setting": setting, "payer": payer, "plan": plan,
            "dollar": dollar, "pct": pct, "algorithm": algorithm,
            "median": median, "gross": gross, "methodology": methodology,
            # extra CMS fields (see 05_explore_cms_mrf.ipynb)
            "discounted_cash": discounted_cash, "minimum": minimum,
            "maximum": maximum, "p10": p10, "p90": p90}


def _num(v):
    if v in (None, "", "-1"):
        return None
    try:
        return float(str(v).replace(",", "").replace("$", ""))
    except (ValueError, TypeError):
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

    def g(row, *keys):
        for k in keys:
            i = idx.get(k)
            if i is not None and i < len(row):
                return row[i].strip()
        return ""

    out = []
    for row in rows:
        if not any(row):
            continue
        codes = []
        for n in (1, 2):
            c = g(row, f"code | {n}", f"code|{n}")
            t = g(row, f"code | {n} | type", f"code|{n}|type")
            if c and t:
                codes.append((c, t.upper()))
        out.append(_rec(
            hospital, g(row, "description"), codes, g(row, "setting"),
            g(row, "payer_name"), g(row, "plan_name"),
            _num(g(row, "standard_charge | negotiated_dollar",
                   "standard_charge|negotiated_dollar")),
            _num(g(row, "standard_charge | negotiated_percentage",
                   "standard_charge|negotiated_percentage")),
            g(row, "standard_charge | negotiated_algorithm",
              "standard_charge|negotiated_algorithm"),
            _num(g(row, "median_amount")),
            _num(g(row, "standard_charge | gross", "standard_charge|gross")),
            g(row, "standard_charge | methodology", "standard_charge|methodology"),
            discounted_cash=_num(g(row, "standard_charge | discounted_cash",
                                   "standard_charge|discounted_cash")),
            minimum=_num(g(row, "standard_charge | min", "standard_charge|min")),
            maximum=_num(g(row, "standard_charge | max", "standard_charge|max")),
            p10=_num(g(row, "10th_percentile")),
            p90=_num(g(row, "90th_percentile")),
        ))
    return out


def load_json_v3(fh, hospital):
    """CMS v3.0 JSON. item -> standard_charges -> payers_information."""
    doc = json.load(fh)
    out = []
    for item in doc.get("standard_charge_information", []):
        codes = [(c.get("code", ""), (c.get("type") or "").upper())
                 for c in item.get("code_information", []) if c.get("code")]
        desc = item.get("description", "")
        for sc in item.get("standard_charges", []):
            gross, setting = _num(sc.get("gross_charge")), sc.get("setting", "")
            cash = _num(sc.get("discounted_cash"))
            mn, mx = _num(sc.get("minimum")), _num(sc.get("maximum"))
            for p in (sc.get("payers_information") or [{}]):
                out.append(_rec(
                    hospital, desc, codes, setting,
                    p.get("payer_name", ""), p.get("plan_name", ""),
                    _num(p.get("standard_charge_dollar")),
                    _num(p.get("standard_charge_percentage")),
                    p.get("standard_charge_algorithm", ""),
                    _num(p.get("estimated_amount") or p.get("median_amount")),
                    gross, p.get("methodology", ""),
                    discounted_cash=cash, minimum=mn, maximum=mx,
                ))
    return out


def load_mrf_dir(path):
    by_hospital = {}
    for f in sorted(Path(path).iterdir()):
        label = re.sub(r"\.(csv|json|zip)$", "", f.name, flags=re.I)
        label = re.sub(r"_?standardcharges.*$", "", label, flags=re.I).strip("_-") or f.name
        try:
            if f.suffix.lower() == ".zip":
                with zipfile.ZipFile(f) as z:
                    inner = next(n for n in z.namelist()
                                 if n.lower().endswith((".csv", ".json")))
                    raw = z.read(inner).decode("utf-8-sig", errors="replace")
                recs = (load_json_v3(io.StringIO(raw), label)
                        if inner.lower().endswith(".json")
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


def build_inventory(by_hospital):
    """{(code, type): {desc, hospitals}} for billable code types only."""
    inv = {}
    for hospital, recs in by_hospital.items():
        for r in recs:
            for code, ctype in r["codes"]:
                if ctype not in BILLABLE:
                    continue
                e = inv.setdefault((code, ctype),
                                   {"desc": r["description"], "hospitals": set()})
                e["hospitals"].add(hospital)
                if len(r["description"]) > len(e["desc"]):
                    e["desc"] = r["description"]
    return inv


# ------------------------------------------------------------------ retrieval

_STOP = {"of", "the", "a", "an", "with", "without", "and", "or", "to", "for",
         "procedure", "structure", "finding", "disorder", "patient", "left",
         "right", "bilateral"}


def _tokens(s):
    return {w for w in re.findall(r"[a-z0-9]+", s.lower())
            if w not in _STOP and len(w) > 2}


def shortlist(term, inv, k=25):
    """
    Lexical prefilter on the extractor's short search_term, never on raw prose.
    Costs nothing and keeps the stage-2 prompt small. If recall looks thin on
    real MRFs, this is the one function to swap for embeddings.
    """
    q = _tokens(term)
    if not q:
        return []
    scored = []
    for (code, ctype), e in inv.items():
        d = _tokens(e["desc"])
        if d and (q & d):
            scored.append((len(q & d) / len(q | d), code, ctype, e))
    scored.sort(reverse=True, key=lambda x: x[0])
    return [(c, t, e) for _, c, t, e in scored[:k]]


# -------------------------------------------------------------- stage 1: extract

EXTRACT_PROMPT = """Extract every billable service mentioned in this clinical text.

For each one return:
- mention: the service, in clinical shorthand
- search_term: 2-6 words for searching a hospital chargemaster. Use the standard \
procedural noun phrase, not the clinician's phrasing. "we'll get that hernia \
sorted laparoscopically" -> "laparoscopic inguinal hernia repair"
- category: procedure | imaging | lab | pathology | dme | evaluation_management
- status: performed (done at this visit) | ordered (test/referral placed) | \
planned (future, agreed) | historical (past care) | discussed (raised, not agreed)
- laterality: left | right | bilateral | none
- approach: open | laparoscopic | endoscopic | percutaneous | none
- evidence: the verbatim span from the text that supports this

Rules:
- Only what THIS encounter generated or scheduled. A past appendectomy is \
historical. A test the patient declined is discussed.
- The visit itself is one evaluation_management entry with search_term \
"office outpatient visit". Do not guess its level; that comes from MDM or time, \
not from text matching.
- Split bundled phrasing into separate entries. "labs and a chest x-ray" is two.
- If nothing billable is mentioned, return [].

Return ONLY a JSON array, no prose and no markdown fences.

TEXT:
{text}"""


# ------------------------------------------------------------------ stage 2: map

MAP_PROMPT = """Map each clinical service to billable CPT/HCPCS codes.

Choose only from that service's CANDIDATES. Those are the codes these hospitals \
actually publish prices for, so a code outside the list cannot be priced even if \
it is clinically correct. Never invent a code.

- Use the laterality and approach given. If the candidates only offer a code that \
contradicts them, do not force it; return empty and explain in note.
- A service may map to several codes, or to none.
- confidence high only when the candidate description is clinically equivalent, \
not merely related.
- needs_review true whenever the code depends on something the text did not \
state: units, time, size, number of views, bundling into a global period, or an \
unresolved laterality.

Return ONLY a JSON array, no prose and no markdown fences:
[{{"id": 0, "codes": [{{"code": "...", "type": "CPT"}}], \
"confidence": "high|medium|low", "needs_review": true, "note": "..."}}]

SERVICES:
{services}"""


def _client():
    from anthropic import Anthropic
    return Anthropic()


def _call(prompt, show=False):
    if show:
        print("=" * 70 + "\n" + prompt + "\n" + "=" * 70, file=sys.stderr)
    msg = _client().messages.create(
        model=MODEL, max_tokens=4000,
        messages=[{"role": "user", "content": prompt}])
    text = "".join(b.text for b in msg.content if b.type == "text").strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        print("Model did not return valid JSON:\n" + text[:800], file=sys.stderr)
        return []


def extract_services(text, show=False):
    return _call(EXTRACT_PROMPT.format(text=text), show)


def map_services(services, inv, show=False):
    """Attaches .codes / .confidence / .needs_review to each codeable service."""
    cache = json.loads(CACHE_PATH.read_text()) if CACHE_PATH.exists() else {}
    blocks, todo = [], []

    for i, s in enumerate(services):
        if s.get("status") not in CODEABLE_STATUS:
            continue
        if s.get("category") == "evaluation_management":
            s["codes"], s["confidence"], s["needs_review"] = [], "n/a", True
            s["note"] = "E/M level comes from MDM or total time, not text matching"
            continue
        cands = shortlist(s.get("search_term", s.get("mention", "")), inv)
        if not cands:
            s["codes"], s["confidence"], s["needs_review"] = [], "low", True
            s["note"] = "no hospital in this set publishes a matching code"
            continue
        key = hashlib.sha1(
            (s.get("search_term", "") + s.get("laterality", "") +
             s.get("approach", "") + "|".join(f"{c}{t}" for c, t, _ in cands)
             ).encode()).hexdigest()[:16]
        if key in cache:
            s.update(cache[key])
            continue
        todo.append((i, s, cands, key))
        blocks.append(
            f'id: {i}\n  service: {s.get("mention")}\n'
            f'  laterality: {s.get("laterality", "none")}   '
            f'approach: {s.get("approach", "none")}\n  CANDIDATES:\n' +
            "\n".join(f'    - {c} ({t}): {e["desc"]} [{len(e["hospitals"])} hospitals]'
                      for c, t, e in cands))

    if not todo:
        return services

    results = {r.get("id"): r for r in
               _call(MAP_PROMPT.format(services="\n\n".join(blocks)), show)}

    for i, s, _, key in todo:
        r = results.get(i, {"codes": [], "confidence": "low",
                            "needs_review": True, "note": "no response"})
        # Belt and braces: prompt instructions are not a guarantee.
        r["codes"] = [x for x in r.get("codes", [])
                      if (x.get("code"), (x.get("type") or "").upper()) in inv]
        r.pop("id", None)
        s.update(r)
        cache[key] = r

    CACHE_PATH.write_text(json.dumps(cache, indent=1))
    return services


# ------------------------------------------------------------------- pricing

def price(code, ctype, by_hospital):
    out = {}
    for hospital, recs in by_hospital.items():
        hits = [r for r in recs if (code, ctype) in r["codes"]]
        if not hits:
            continue
        for basis, key in (("negotiated", "dollar"), ("median", "median"),
                           ("gross", "gross")):
            vals = [r[key] for r in hits if r[key]]
            if vals:
                out[hospital] = {"basis": basis, "low": min(vals),
                                 "high": max(vals), "n_payers": len(hits)}
                break
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mrf-dir", required=True)
    ap.add_argument("--text", required=True, help="file path, or - for stdin")
    ap.add_argument("--show-prompts", action="store_true")
    args = ap.parse_args()

    text = sys.stdin.read() if args.text == "-" else Path(args.text).read_text()

    print("Loading MRFs...", file=sys.stderr)
    by_hospital = load_mrf_dir(args.mrf_dir)
    if not by_hospital:
        sys.exit("No MRFs parsed.")
    inv = build_inventory(by_hospital)
    print(f"\n{len(inv):,} billable codes across {len(by_hospital)} hospitals\n",
          file=sys.stderr)

    services = extract_services(text, args.show_prompts)
    if not services:
        sys.exit("No billable services extracted.")
    services = map_services(services, inv, args.show_prompts)

    skipped = [s for s in services if s.get("status") not in CODEABLE_STATUS]

    for s in services:
        if s.get("status") not in CODEABLE_STATUS:
            continue
        bits = [s.get("status", "?"), s.get("category", "?")]
        if s.get("laterality", "none") != "none":
            bits.append(s["laterality"])
        if s.get("approach", "none") != "none":
            bits.append(s["approach"])
        flag = "  [REVIEW]" if s.get("needs_review") else ""
        print(f'\n{s.get("mention")}   ({", ".join(bits)})  '
              f'conf={s.get("confidence", "?")}{flag}')
        print(f'    evidence: "{s.get("evidence", "")}"')
        if s.get("note"):
            print(f'    note: {s["note"]}')
        for x in s.get("codes", []):
            code, ctype = x["code"], x["type"]
            print(f'    {ctype} {code}: {inv[(code, ctype)]["desc"]}')
            prices = price(code, ctype, by_hospital)
            if not prices:
                print("        no published price")
            for hospital, p in sorted(prices.items(), key=lambda kv: kv[1]["low"]):
                rng = (f'${p["low"]:,.0f}' if p["low"] == p["high"]
                       else f'${p["low"]:,.0f} - ${p["high"]:,.0f}')
                print(f'        {hospital:<32} {rng:>22}  '
                      f'({p["basis"]}, {p["n_payers"]} payer rows)')

    if skipped:
        print("\nNot coded (correctly):")
        for s in skipped:
            print(f'    [{s.get("status")}] {s.get("mention")}')


if __name__ == "__main__":
    main()
