# Integrating Robbert's real-price data

How to replace this app's synthetic pricing with the real CPT/HCPCS codes and CMS
published prices from `abridge-hackathon-robbert`, while keeping the current three-screen
user experience intact.

**No code has been changed yet.** This document is the plan.

---

## 1. Start here: it isn't a backend

`abridge-hackathon-robbert` is **not a runnable service**. There is no server, no API, no
FastAPI app. It is five Jupyter notebooks, two CLI scripts, and five committed CSVs.

Nothing can be "dropped in". The work is importing his **data** and porting his **pricing
semantics** into the FastAPI app that already exists here.

Two consequences:

- **The raw price files are absent.** `data_processing/cms_hpt/mrfs/` is git-ignored and
  not in the repo. His live agents (`text_to_codes_agent.py`, `snomed_price_agent.py`)
  cannot run without re-downloading multi-GB CMS files.
- **The derived CSV is the only usable price source today.** That's fine — it's rich, and
  it's what this plan builds on.

### What's actually valuable

| Artifact | Why |
|---|---|
| `processed_csv/avs_line_to_billable_codes.csv` | **The payload.** 514 rows, 25 patients, 209 coded rows. AVS line → CPT/HCPCS → real prices, with a `prices_by_hospital` JSON blob per row (391 hospital-code entries total). |
| `random/text_to_codes_agent.py` | The two-stage extract→map design, and `price()` / `build_inventory()` showing how CMS fields become a quotable number. Read it before writing the pricing layer. |
| `processed_csv/patient_to_after_visit_summary.csv` | The same 25 notes, pre-split into `what_we_discussed` / `next_steps`. |
| `cms_hpt/*.txt` + `hospital_to_mrfs.csv` | Provenance — which hospital, which published file, which URL. Needed for honest sourcing labels. |

---

## 2. Decisions already taken

| Decision | Choice |
|---|---|
| Hospital coverage | **Real hospitals only** — no synthetic fallback |
| Extraction | **Serve the precomputed CSV** through the existing SSE stream; keep the animation |
| Follow-up filter | **`ordered` counts as follow-up** — exclude only `performed` |
| Multi-code lines | **Collapse to a count badge** on the note line |
| Partial basket coverage | **Show partial, rank below fully-covered hospitals** |
| Price display | **Three rows** (§5) |
| Medicare column | **Drop entirely** |

---

## 3. What survives untouched

The blast radius is smaller than it looks. If the API contract holds, all of this is
preserved with no changes:

- **The entire frontend flow** — three steps, line highlighting, colour pairing, cost
  toggles, independent hospital selection on the compare screen, live re-ranking.
- **The SSE contract** (`step` / `code` / `done` / `error`) and the streaming reveal.
- **`backend/app/data.py` as the geo layer.** His data has **no coordinates and no ZIP**
  anywhere. The existing seed list stays, supplying lat/lng and display names.
- **The colour-pairing logic.** `buildColorMap` keys on *source line*, and these encounters
  have only 2–3 coded lines each, so the palette stays legible even at 18 codes.

---

## 4. The four-hospital reality

Real prices exist for exactly four hospitals:

**Cambridge Health Alliance · Lahey · South Shore · Boston Children's Longwood**

Any single code is priced at only **1–2** of them (182 of 209 coded rows carry two; 27 carry one).

This is the biggest UX consequence and it should not be softened:

- The hospital list drops from 13–18 rows to **at most 4**, often 1–2.
- ZIP + radius still works but barely discriminates — the four sit in Cambridge,
  Burlington, Weymouth and Longwood.
- The map keeps working and actually looks *better* (the downtown overlap problem
  disappears), but it stops being a map of "hospitals near you".
- **Boston Children's is a paediatric hospital.** It will surface for adult patients.
  Exclude it or label it — don't quote a children's-hospital price to a 45-year-old.
- Only Boston Children's needs adding to the geo seed; the other three are already there.

If this reads too thin at demo time, the fix is widening MRF coverage (§9), not changing
any of the plumbing below.

---

## 5. Price display

The spec for the estimate panel:

| Field | Label in app | One-liner | Availability |
|---|---|---|---|
| `discounted_cash` | **Without insurance** | What you pay if you self-pay. | 332/391 (85%) |
| `negotiated_median` | **With your insurance** | What your plan agreed to pay here. | 390/391 (100%) |
| `p10`–`p90` | **Expected range** | What people actually paid, most landing in this band. | **91/391 (23%)** |

Quietly, in small grey text under the price: `n_payers` → "based on N plans". If it's 1,
show "limited data" instead of a range.

### Three things the data won't support cleanly

**a. `p10`–`p90` exists at only one of the four hospitals.**

| Hospital | entries | cash | negotiated | p10–p90 |
|---|---|---|---|---|
| Cambridge Health Alliance | 110 | 100% | 100% | **83%** |
| Boston Children's Longwood | 87 | 100% | 100% | **0%** |
| Lahey | 97 | 74% | 99% | **0%** |
| South Shore | 97 | 65% | 100% | **0%** |

"Expected range" would appear on ~a quarter of results, and specifically on CHA — which is
usually cheapest and therefore top-ranked. That reads as "the cheap one has extra data".

*Recommendation:* render the row only when both `p10` and `p90` are present. Either fall
back to `negotiated_min`–`negotiated_max` (100% available) under a **different** label, or
omit the row. Don't silently substitute one under the other's label.

**b. Where the band exists, it's implausibly wide.**

Real CHA rows: `p10=$0.05, p50=$30.03, p90=$132.90` and `p10=$0.04, p90=$320.00`. Near-zero
floors are almost certainly capitated or percentage-of-charge contracts, not what a person
paid. `$0.05–$132.90` under "what people actually paid" will read as broken.

*Recommendation:* suppress the band when `p10` falls below a sane floor, or when
`p90/p10` exceeds some ratio. Show the median alone in those cases.

**c. "With your insurance" overclaims slightly.**

The negotiated figures are aggregates across *all* payers at that hospital, not the user's
plan — and the app has no plan input. Consider "With insurance (typical)". Flagging because
this is patient-facing money information; the wording is your call.

### Field notes

- Use `negotiated_median`, not `negotiated_mean` — both are 100% available, the median is
  more robust to the near-zero contracts above.
- `discounted_cash` is uneven by hospital (100% / 100% / 74% / **65%**), so "Without
  insurance" needs an omit rule too.
- `n_payers` is fully populated but its **minimum is 0** — treat `0` like `1` for the
  "limited data" case. Only 3% of entries are affected.

---

## 6. Breakages and resolutions

Every item below was verified against the CSV, not assumed.

| # | Breakage | Resolution |
|---|---|---|
| 1 | **`line_number` is a bullet index, not a text line.** Patient 0's lipid row is `line_number=12` but sits at raw text line **17** | Cross-walk on `line_text`. The existing `resolve_line()` in `extraction.py` already does this kind of text match — reuse it |
| 2 | **`status` doesn't encode follow-up.** ~70% of `ordered` rows are already-done work — but from only **3 distinct lines** | Accepted per decision — exclude only `performed`. See §8 for which encounters this compromises |
| 3 | **One line yields up to 15 codes**, rendering a badge wall across the note | Collapse to a single count badge per line ("15 codes"); individual codes stay in the right panel |
| 4 | **`87340` exists as both CPT and HCPCS with different prices** | Key on `(code, code_type)`. Prefer CPT, HCPCS as fallback. The current frontend dedupes on the code string alone and will collide |
| 5 | Hospital/physician fee split doesn't exist in CMS data | Replaced by the three-row spec in §5 |
| 6 | A hospital may price only part of the basket | Show "prices 2 of 3 procedures"; sort fully-covered hospitals first so missing data can't win on price |
| 7 | No Medicare coverage data anywhere | Drop the column |
| 8 | **63 of the 209 coded rows** flagged `needs_review` (67 across all 514); confidence medium on 56, low on 1 | Surface as a caveat on the code card |
| 9 | `discounted_cash` missing on 15% of entries (35% at South Shore) | Omit that row rather than substituting another field under the same label |

### On breakage #2

Worth understanding rather than just patching. His `status` classifies the *clinical
action* — was a lab ordered, was a procedure performed — not *whether the patient still has
to go do it*. Both of these are `ordered`:

- "repeat lipid panel to follow the trend" ← genuine follow-up
- "Full prenatal intake panel **sent today**: blood type, hepatitis B, HIV…" ← already drawn

That's clinically correct on his axis. An ordered-and-drawn lab really is a chargeable
event. This app asks a different question, and his data was never built to answer it.

**The damage is concentrated in three lines.** Of 92 `ordered` rows, 67 (73%) sit on lines
whose text says the work is already done — but those 67 rows come from just three sentences,
because panel lines explode into many codes:

| Rows | Line |
|---|---|
| 44 | "Prenatal laboratory panel **sent**: blood group typing; automated hemogram…" |
| 19 | "Full prenatal intake panel **sent today**: blood type, hemogram…" |
| 4 | "Same-day call instructions **reviewed** for dysuria, urgency…" |

Two caveats on that 73%. First, it's sensitive to how you detect "already done" — matching
on `sent today|sent:|collected|placed|administered|drawn|given today|reviewed` gives 73%,
while a narrower `sent today|collected|administered` gives 21%. The §10 snippet uses the
former. Second, the third line above is arguably a **false positive**: instructions being
*reviewed* isn't a lab being drawn — it's a non-billable line that picked up codes anyway.

So the practical read is: **two genuinely mislabelled panel lines**, affecting the three
encounters named in §8. Everything else under `ordered` — "repeat lipid panel", "recheck BP
in approximately 1 month", "interval electrolytes after medication initiation" — is a real
follow-up and passes correctly.

### One irreducible case

> "Urine culture sent today; surveillance cultures at prenatal visits given risk of
> asymptomatic bacteriuria."

One line, simultaneously done and future. His schema carries one status per line, so no
filter can split it. It needs the line itself broken up (§9).

---

## 7. Remaining UI mapping

| UI element | Source |
|---|---|
| Subtotal | `gross` (85% available) |
| Discount | `gross − discounted_cash` |
| Per-code line items | one row per `(code, code_type)` |
| Screen 2 "average / lowest" | now across the 1–2 hospitals publishing that code — the caption must say so |

---

## 8. Sequencing

Four phases, each independently demoable, so the demo never sits in a broken state.

**Phase 1 — Load his CSVs behind the existing API.**
New loader module reading `avs_line_to_billable_codes.csv` and
`patient_to_after_visit_summary.csv`. `/api/encounters` keeps its shape. Nothing visibly
changes. Touches: new module + `encounters.py`.

**Phase 2 — Swap pricing to real numbers.**
Replace the synthesis in `pricing.py` with `prices_by_hospital` lookups. Keep the
`Breakdown` model; swap the fee rows for the §5 three-row spec; cut the hospital registry
to the four priced ones. **This is where the list gets short.** Touches: `pricing.py`,
`data.py`, `models.py`.

**Phase 3 — Swap extraction to CSV replay.**
Serve his codes over the existing SSE endpoint with pacing so the animation survives. Keep
the live model call behind a flag so the agentic path isn't lost. Touches: `extraction.py`.

**Phase 4 — Fix the labelling.**
The "synthetic prices" banner is now false in the *other* direction. Replace with real
provenance — hospital, published file, date — from `hospital_to_mrfs.csv`. Update `README.md`.

### Demo notes

Under `ordered|planned`, **14 of 25 encounters** yield a basket. Only **11 are clean**:

- **Best clean demo:** *Ariane Jan Runolfsson* — 7 distinct codes across 2 lines, no
  already-done content.
- **Richest but compromised:** *Melodee Satterfield* (18 codes), *Clarence Reinger* (16),
  *Margarita Rau* (16) — all three contain "panel sent today" lines and will show the
  patient bills for labs already drawn.
- The other 11 encounters produce no codes and should be marked in the picker.
- **CHA is the only hospital with `p10`–`p90`**, so demoing "Expected range" means demoing CHA.

---

## 9. Open items for Robbert

Better fixed at the source than patched downstream:

- **A `patient_action_required` boolean at extraction time.** This fixes breakage #2
  properly for every consumer of the CSV, not just this app.
- **Split compound lines** ("X sent today; Y at future visits") into separate rows.
- **Can `p10`/`p90` be derived for the other three hospitals**, or do those MRFs genuinely
  not publish percentiles?
- **Can more Boston-area MRFs be added** to widen coverage past four hospitals? Everything
  in this plan scales without change — only the row count grows.

---

## 10. Reproducing these numbers

Every figure above comes from the CSVs and is checkable:

```python
import pandas as pd, json
df = pd.read_csv('avs_line_to_billable_codes.csv')

# §4 — which hospitals actually publish prices
rows = [{'hospital': v.get('hospital_name', k), **v}
        for raw in df.prices_by_hospital.dropna()
        for k, v in json.loads(raw).items()]
h = pd.DataFrame(rows)
h.groupby('hospital').agg(n=('hospital', 'size'),
                          cash=('discounted_cash', lambda s: s.notna().mean()),
                          band=('p10', lambda s: s.notna().mean()))

# §6 #2 — how often `ordered` means already-done  -> 67/92 = 73%
# NB: sensitive to this pattern; a narrower one gives 21%. See the caveat in §6.
DONE = r'sent today|sent:|collected|placed|administered|drawn|given today|reviewed'
ns = df[(df.section == 'next_steps') & df.code.notna()]
o = ns[ns.status == 'ordered']
o.line_text.str.contains(DONE, case=False).mean()

# ...and that it comes from only 3 distinct lines
o[o.line_text.str.contains(DONE, case=False)].line_text.value_counts()

# §8 — usable encounters
fu = ns[ns.status.isin(['ordered', 'planned'])]
fu.groupby('patient').code.nunique().sort_values(ascending=False)
```
