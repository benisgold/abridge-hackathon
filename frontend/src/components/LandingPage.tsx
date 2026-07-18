import { useEffect, useMemo, useRef, useState } from 'react'
import { SiteHeader } from './SiteHeader'
import './LandingPage.css'

type Hospital = { name: string; miles: number; price: number }
type Visit = { note: string; codes: string[]; hospitals: Hospital[] }

const VISITS: Record<string, Visit> = {
  retina: {
    note: 'Retinal OCT imaging completed today. Findings are consistent with active neovascular AMD. Intravitreal anti-VEGF injection is recommended at the next visit.',
    codes: ['92134', '67028', 'J0178'],
    hospitals: [
      { name: 'Mission Bay Eye Center', miles: 2.1, price: 1480 },
      { name: 'Bayview Medical', miles: 4.7, price: 2290 },
      { name: 'Presidio Health', miles: 7.4, price: 3160 },
      { name: 'Peninsula University Hospital', miles: 12.8, price: 4980 },
    ],
  },
  knee: {
    note: 'Persistent mechanical knee pain despite conservative therapy. MRI is recommended, with possible outpatient arthroscopy if a meniscal tear is confirmed.',
    codes: ['73721', '29881', '99214'],
    hospitals: [
      { name: 'Civic Orthopedic Institute', miles: 1.8, price: 3240 },
      { name: 'Mission Bay Surgical Center', miles: 5.5, price: 4180 },
      { name: 'Bayview Medical', miles: 8.2, price: 5690 },
      { name: 'Peninsula University Hospital', miles: 14.9, price: 7870 },
    ],
  },
  colonoscopy: {
    note: 'Routine colorectal cancer screening is due. Outpatient colonoscopy with anesthesia and possible biopsy is recommended.',
    codes: ['45378', '00812', '88305'],
    hospitals: [
      { name: 'Castro Endoscopy Center', miles: 2.9, price: 1180 },
      { name: 'Mission Bay Surgical Center', miles: 5.1, price: 1740 },
      { name: 'Bayview Medical', miles: 8.6, price: 2360 },
      { name: 'Peninsula University Hospital', miles: 13.4, price: 3950 },
    ],
  },
}

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)

type Props = {
  /** Opens the real OpenCost Health tool. */
  onLaunch: () => void
}

export function LandingPage({ onLaunch }: Props) {
  const [visitKey, setVisitKey] = useState<keyof typeof VISITS>('retina')
  const [radius, setRadius] = useState(15)
  const [runLabel, setRunLabel] = useState('Compare nearby prices')
  const rootRef = useRef<HTMLDivElement>(null)

  const visit = VISITS[visitKey]

  const results = useMemo(() => {
    const visible = visit.hospitals.filter((h) => h.miles <= radius)
    const hospitals = visible.length ? visible : [visit.hospitals[0]]
    const prices = hospitals.map((h) => h.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    return { hospitals, min, max, avg }
  }, [visit, radius])

  // Reveal-on-scroll for the `.fade-up` blocks, matching the static draft.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('visible')
        })
      },
      { threshold: 0.12 },
    )
    root.querySelectorAll('.fade-up').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  function handleRun() {
    setRunLabel('Prices compared ✓')
    window.setTimeout(() => setRunLabel('Compare nearby prices'), 1400)
  }

  return (
    <div className="landing-page" ref={rootRef}>
      <SiteHeader
        onBrandClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <a href="#problem" className="site-nav-hide">
          Problem
        </a>
        <a href="#how" className="site-nav-hide">
          How it works
        </a>
        <a href="#data" className="site-nav-hide">
          The data
        </a>
        <button type="button" className="site-btn-dark" onClick={onLaunch}>
          Test it out
        </button>
      </SiteHeader>

      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-dot"></span> Healthcare prices, made
                usable
              </div>
              <h1>Know what care costs before the bill arrives.</h1>
              <p className="lede">
                Turn an after-visit note into billing codes, compare nearby
                hospitals, and see realistic price ranges for both today's visit
                and the treatment recommended next.
              </p>
              <div className="hero-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={onLaunch}
                >
                  Test it out
                  <span aria-hidden="true">→</span>
                </button>
                <a href="#how" className="button button-ghost">
                  See how it works
                </a>
              </div>
              <div className="microcopy">
                <span>✓</span>
                No bill required. No hospital-by-hospital searching.
              </div>
            </div>

            <div className="hero-card-wrap">
              <div className="product-card">
                <div className="product-topbar">
                  <div className="visit-pill">
                    <span className="visit-icon">✦</span>
                    Ophthalmology visit
                  </div>
                  <div className="status-pill">Analysis complete</div>
                </div>
                <div className="product-body">
                  <div className="small-label">After-visit summary</div>
                  <div className="visit-summary">
                    Retinal imaging completed. Intravitreal anti-VEGF injection
                    recommended at the next visit.
                  </div>
                  <div className="flow-arrow">↓</div>
                  <div className="small-label">Detected billing codes</div>
                  <div className="code-row">
                    <div className="code">92134</div>
                    <div className="code">67028</div>
                    <div className="code">J0178</div>
                  </div>
                  <div className="price-highlight">
                    <div>
                      <div
                        className="small-label"
                        style={{ color: 'rgba(255,255,255,.58)', marginBottom: 3 }}
                      >
                        Nearby average
                      </div>
                      <strong>$2,640</strong>
                    </div>
                    <div className="range">$1,480–$4,980</div>
                  </div>
                  <div className="mini-hospitals">
                    <div className="mini-hospital">
                      <div>
                        <b>Mission Bay Eye Center</b>
                        <div className="sub">2.1 miles · estimated cash price</div>
                      </div>
                      <strong>$1,480</strong>
                    </div>
                    <div className="mini-hospital">
                      <div>
                        <b>Bayview Medical</b>
                        <div className="sub">4.7 miles · estimated cash price</div>
                      </div>
                      <strong>$2,290</strong>
                    </div>
                  </div>
                </div>
              </div>
              <div className="floating-tag">
                Save up to <b>$3,500</b> nearby
              </div>
            </div>
          </div>
        </section>

        <section id="problem">
          <div className="container">
            <div className="section-head fade-up">
              <div className="section-kicker">The problem</div>
              <h2>
                Patients make financial decisions with almost no usable
                information.
              </h2>
              <p>
                The cost is often known by hospitals and payers, but not by the
                patient who must decide where to receive care.
              </p>
            </div>

            <div className="problem-grid">
              <article className="problem-card dark fade-up">
                <div className="problem-number">01</div>
                <h3>The price arrives after the decision.</h3>
                <p>
                  Patients leave a visit without knowing what happened
                  financially, or what the recommended treatment will cost. They
                  learn after committing, or when the bill arrives.
                </p>
                <div className="bill">
                  <div className="small-label">Your statement</div>
                  <div className="bill-line"></div>
                  <div className="bill-line" style={{ width: '68%' }}></div>
                  <div className="bill-price">$4,870</div>
                </div>
              </article>

              <article className="problem-card light fade-up">
                <div className="problem-number">02</div>
                <h3>The data is public, but practically inaccessible.</h3>
                <p>
                  Federal rules require hospitals to publish prices. In reality,
                  the data sits in enormous machine-readable files and fragmented
                  hospital-specific estimators.
                </p>
                <div className="files-visual">
                  <div className="file-bar">
                    <b>stanford_mrf.json</b>
                    <span>1.4 GB</span>
                  </div>
                  <div className="file-bar">
                    <b>hospital_prices.csv</b>
                    <span>986 MB</span>
                  </div>
                  <div className="file-bar">
                    <b>payer_rates.json</b>
                    <span>2.1 GB</span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="how" id="how">
          <div className="container">
            <div className="section-head fade-up">
              <div className="section-kicker">Our tool</div>
              <h2>One visit in. Every nearby price out.</h2>
              <p>
                We connect the clinical story to the financial reality, without
                requiring patients to understand medical billing.
              </p>
            </div>

            <div className="steps">
              <div className="step fade-up">
                <div className="step-icon">1</div>
                <h3>Select the visit</h3>
                <p>
                  Choose an after-visit note or visit summary already available
                  in the patient record.
                </p>
              </div>
              <div className="step fade-up">
                <div className="step-icon">2</div>
                <h3>Extract billing codes</h3>
                <p>
                  Abridge summarizes and codes the visit. We identify the current
                  visit and recommended next procedure.
                </p>
              </div>
              <div className="step fade-up">
                <div className="step-icon">3</div>
                <h3>Search local prices</h3>
                <p>
                  We match those codes against public hospital and payer pricing
                  data within the selected radius.
                </p>
              </div>
              <div className="step fade-up">
                <div className="step-icon">4</div>
                <h3>Compare care options</h3>
                <p>
                  See the average, minimum, maximum, and hospital-by-hospital
                  estimates in one simple view.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="data-section" id="data">
          <div className="container">
            <div className="section-head fade-up">
              <div className="section-kicker">Why this works</div>
              <h2>The pricing data already exists.</h2>
              <p>
                Hospitals and insurers are required to publish prices. Billing
                codes let us match your visit to those public rates.
              </p>
            </div>

            <div className="data-explainer fade-up">
              <div className="data-top" style={{ gridTemplateColumns: '1fr' }}>
                <div className="data-flow">
                  <div className="data-node">
                    <b>Your visit</b>
                    <span>After-visit note or summary</span>
                  </div>
                  <div className="data-arrow">→</div>
                  <div className="data-node">
                    <b>Billing codes</b>
                    <span>CPT, HCPCS, DRG, and drug codes</span>
                  </div>
                  <div className="data-arrow">→</div>
                  <div className="data-node">
                    <b>Nearby prices</b>
                    <span>Hospital and insurer rate files</span>
                  </div>
                </div>
              </div>

              <div className="data-note">
                <div>
                  Published rates create the estimate. Your final cost still
                  depends on insurance and the codes ultimately billed.
                </div>
                <div className="source-links">
                  <a
                    className="source-link"
                    href="https://www.cms.gov/priorities/key-initiatives/hospital-price-transparency"
                    target="_blank"
                    rel="noopener"
                  >
                    CMS source ↗
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="demo">
          <div className="container">
            <div className="demo-shell fade-up">
              <div className="demo-header">
                <div>
                  <div className="section-kicker" style={{ color: '#5eead4' }}>
                    Getting started
                  </div>
                  <h2>See what your visit could cost nearby.</h2>
                  <p>
                    Select a sample visit. We will translate the note into codes
                    and compare illustrative hospital prices.
                  </p>
                </div>
              </div>

              <div className="demo-grid">
                <div className="panel">
                  <h3>1. Select your visit</h3>
                  <label htmlFor="visitSelect">After-visit note</label>
                  <select
                    id="visitSelect"
                    value={visitKey}
                    onChange={(e) =>
                      setVisitKey(e.target.value as keyof typeof VISITS)
                    }
                  >
                    <option value="retina">
                      Ophthalmology: retinal imaging + injection
                    </option>
                    <option value="knee">
                      Orthopedics: knee MRI + arthroscopy
                    </option>
                    <option value="colonoscopy">
                      Gastroenterology: screening colonoscopy
                    </option>
                  </select>

                  <div className="note-card">
                    <div className="note-title">
                      <span>Visit summary</span>
                      <span className="note-date">Sample note</span>
                    </div>
                    <div className="note-text">{visit.note}</div>
                  </div>

                  <div className="distance-wrap">
                    <div className="distance-row">
                      <label htmlFor="distance" style={{ margin: 0 }}>
                        Search radius
                      </label>
                      <span className="distance-value">
                        <span>{radius}</span> miles
                      </span>
                    </div>
                    <input
                      id="distance"
                      type="range"
                      min={5}
                      max={50}
                      step={5}
                      value={radius}
                      onChange={(e) => setRadius(Number(e.target.value))}
                    />
                  </div>

                  <button
                    type="button"
                    className="button button-primary run-button"
                    onClick={handleRun}
                  >
                    {runLabel}
                  </button>
                </div>

                <div className="panel">
                  <h3>2. Your cost comparison</h3>
                  <div className="results-top">
                    <div className="result-card soft">
                      <div className="small-label">Billing codes</div>
                      <div className="billing-codes">
                        {visit.codes.map((code) => (
                          <span key={code} className="billing-code">
                            {code}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="result-card">
                      <div className="small-label">Nearby average</div>
                      <div className="avg-price">{money(results.avg)}</div>
                      <div className="price-range-text">
                        {money(results.min)} minimum · {money(results.max)}{' '}
                        maximum
                      </div>
                    </div>
                  </div>

                  <div className="hospital-list">
                    {results.hospitals.map((h) => {
                      const savings = results.max - h.price
                      return (
                        <div key={h.name} className="hospital">
                          <div>
                            <div className="hospital-name">{h.name}</div>
                            <div className="hospital-meta">
                              {h.miles} miles away · estimated price
                            </div>
                          </div>
                          <div>
                            <div className="hospital-price">
                              {money(h.price)}
                            </div>
                            {savings > 0 && (
                              <div className="hospital-save">
                                Save {money(savings)} vs. highest
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="result-footnote">
                    Demo values are illustrative and are not a guarantee of final
                    patient responsibility. Real estimates depend on the codes
                    ultimately billed, insurance benefits, deductible, copay or
                    coinsurance, care setting, and whether professional and
                    facility services are billed separately.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pitch">
          <div className="container">
            <div className="pitch-box fade-up">
              <div className="section-kicker" style={{ color: '#5eead4' }}>
                The pitch
              </div>
              <h2>
                Price transparency should happen at the moment a patient is
                deciding.
              </h2>
              <p>
                OpenCost Health turns existing clinical notes and legally required
                pricing data into a clear answer: what this visit cost, what the
                next treatment may cost, and where nearby care is more affordable.
              </p>
              <button
                type="button"
                className="button button-primary"
                onClick={onLaunch}
              >
                Test the experience
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="container footer-inner">
          <div>© 2026 OpenCost Health</div>
          <div>Prototype concept · Illustrative estimates only</div>
        </div>
      </footer>
    </div>
  )
}
