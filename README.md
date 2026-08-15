# BODHI MULE HUNTER AI

**Real-time mule-account and suspicious-transaction detection, with explainable
graph AI.**

CyberShield Hackathon 2026 · Bank of India · Problem Statement 2 — *"Developing
a solution having AI/ML capabilities for detecting suspicious transactions and
mule accounts by ingesting financial transactions and/or fraud monitoring
solution alerts and/or transaction monitoring system alerts and govt cyber fraud
alerts/tickets and preventing circulation of fraudulent proceeds through mule
accounts. This solution should consume real-time regulatory inputs/feeds and
cross-channel bank data."*

**Submission bundle:** [`SUBMISSION.md`](SUBMISSION.md) ·
[report (PDF)](docs/report/BODHI_Mule_Hunter_Prototype_Report.pdf) ·
[deck (PPTX)](docs/BODHI_Mule_Hunter_Deck.pptx) ·
[deck (PDF)](docs/BODHI_Mule_Hunter_Deck.pdf)

---

## What this is

A working nine-layer fraud-intelligence engine, not a slide deck. Everything in
this repository runs: the models train from scratch in about two minutes on a
laptop CPU, the API serves inline decisions in **under 0.1 ms**, and the
investigator dashboard is a real front end backed by real endpoints.

The two things that make mule detection hard are handled explicitly:

1. **Mules do not look unusual on their own.** A collection mule looks exactly
   like a tuition-batch organiser. What separates them is *structure* (who pays
   whom, from which device) and *sequence* (forty credits in ninety minutes,
   emptied at 03:12). So the ensemble is not three flavours of the same tabular
   model — it is a tabular model, a graph neural network and a temporal model,
   each seeing something the others cannot.

2. **Rule engines drown analysts.** The incumbent baseline in this repo raises
   **9,647 alerts at 1.33% precision**. At the *same recall*, BODHI raises
   **129 alerts at 99.22% precision** — 99.99% of the false positives removed.
   That number is only meaningful because the simulated bank is deliberately
   stocked with legitimate accounts that look like mules (see below).

---

## Results

From a single reproducible run (`make all`), 12,000 accounts, 834,738
transactions, 151 mules (1.26%), 21 rings. Full output in
`artifacts/metrics/evaluation.json`.

| Layer | ROC-AUC | PR-AUC | Precision @1% | Recall @1% |
|---|---|---|---|---|
| Layer 4 — XGBoost (tabular) | 0.9946 | 0.9540 | 0.983 | 0.781 |
| Layer 5 — GraphSAGE (structure) | 0.9962 | 0.9481 | 0.983 | 0.781 |
| Layer 6 — TGN (sequence) | 0.9628 | 0.8036 | 0.892 | 0.709 |
| Intelligence channel (NCRP / APK / RBI) | 0.6883 | 0.3774 | 0.475 | 0.378 |
| **Layer 7 — Fused** | **0.9966** | **0.9707** | **0.992** | **0.788** |

**Versus the rule engine it replaces**

| | Rule engine | BODHI (equal recall) |
|---|---|---|
| Alerts raised | 9,647 | **129** |
| True positives | 128 | 128 |
| False positives | 9,519 | **1** |
| Precision | 1.33% | **99.22%** |

→ **99.989% of false positives eliminated, 75× precision uplift, at identical recall (84.8%).**

At the standing operating point of 55 (the *investigate* threshold), the engine
raises **144 alerts** covering **93.4% of all mules** at
**97.9% precision** — 3 false positives across the whole bank.

**Other measured properties**

- **Calibration** — Brier 0.00125, ECE 0.0047. The score means what it
  says, which is what lets it drive an automated kill-switch.
- **Out-of-time** — 100% recall on 26 mules belonging to
  3 rings that only activate in the final quarter of the window, never
  seen during training.
- **Independence from the government feed** — 64% of detections
  (94 of 147 accounts) were never named in any NCRP ticket, and recall on
  never-reported mules is 95.9%. The supervised layers never see ticket
  data, so this is measurable rather than asserted.
- **Detection lead time** — of the mules that became active inside the
  measurement grid *and* were eventually reported, 55% were detected
  before the government ticket arrived (median lead 11.5 h, resolved to a
  92 h grid). A further 16 were detected and never ticketed at all.
- **Latency** — inline decision p50 **0.054 ms**, p99 **0.113 ms**
  (~16,677 decisions/sec/core).
- **Honest weak spots** — structuring/smurfing recall 88.9%, cash-out-role
  recall 92.1%. Both are reported in the evaluation output rather
  than hidden.

**False positives on deliberately planted look-alikes** (alert threshold 40):

| Legitimate population | Count | FP rate |
|---|---|---|
| Small businesses with heavy fan-in | 168 | **0.00%** |
| Business-Correspondent device clusters | 302 | **0.33%** |
| Ordinary retail | 10,504 | 0.77% |
| Community collectors (chit funds, tuition) | 107 | 2.80% |
| Genuine dormancy reactivation | 168 | 3.57% |

Measured at the permissive review threshold of 40. At the investigate threshold
of 55 the whole bank yields 3 false positives.

---

## Quick start

```bash
make setup        # virtualenv + dependencies (~1 min)
make all          # simulate → train → build APK fixtures → evaluate (~12 min)
make serve        # dashboard + API on http://localhost:8000
```

Or, if you only want to see it work:

```bash
make setup && make serve     # boots a demo world and trains on first run
```

Other targets:

```bash
make demo         # narrated terminal walkthrough of a real detected ring
make test         # 85 tests, ~25 s
make evaluate     # regenerate every number quoted above
make submission   # rebuild the report (PDF/DOCX) and the deck (PPTX/PDF)
```

---

## The organisers' alert dataset

The Phase-2 evaluation is scored on a **held-back validation file** in the
bank's own schema: 3,923 predictors, one row per transaction-monitoring alert.
`bodhi/boi/` is built directly on their published data dictionary and runs on
their file the moment it is released.

Two findings from it are worth stating up front:

**Four columns leak the label.** `FRAUD_SUSPECTED`, `FALSE_POSITIVE`,
`OTHER_RESOLUTION` and `UNATTENDED` are *resolution-status* flags — how an
analyst closed the alert. Including them lifts CV PR-AUC from **0.177 to
0.972**, with `FRAUD_SUSPECTED` alone at 33% of total gain. An open alert has
none of them, so they are quarantined by default.

**The bank's own 18 finalised features beat all 3,923.** The dictionary marks
them; the pipeline treats that as a hypothesis and tests it against automatic
selection and the full column set under repeated cross-validation. The 18 win
(PR-AUC 0.172 vs 0.105 for everything), which is what p ≫ n predicts.

```bash
python scripts/boi_train.py   --train  <their training file>
python scripts/boi_predict.py --input  <their validation file> --out submission.csv
```

See [`docs/BOI_TRACK.md`](docs/BOI_TRACK.md). Those numbers were measured on a
stand-in table with their exact schema, because the data had not been released
when this was written — they demonstrate the pipeline, not model performance.

---

## Architecture

Nine layers, each owned by a named agent (`GET /api/agents`).

```
   cross-channel bank data ─┐
   UPI / IMPS / NEFT / RTGS │
   AePS / ATM / card        │
                            ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │ L1  Transaction ingestion      normalise events, tickets, feeds    │
 │ L2  Feature engineering        velocity · fan-in/out · dormancy    │
 │                                burst · structuring · device reuse  │
 │ L3  Graph construction         accounts × devices × IPs × VPAs     │
 ├────────────────────────────────────────────────────────────────────┤
 │ L4  XGBoost screening          tabular behaviour   → exact TreeSHAP│
 │ L5  GraphSAGE                  network structure   → rings         │
 │ L6  Temporal graph network     event ordering      → smurfing      │
 ├────────────────────────────────────────────────────────────────────┤
 │ L7  Risk fusion                monotone, calibrated 0–100          │
 │ L8  Explainability             TreeSHAP + GNNExplainer + narrative │
 │ L9  Alerting & kill-switch     proportionate, reversible, audited  │
 └────────────────────────────────────────────────────────────────────┘
             ▲                                        │
             │ IoCs (UPI VPAs, accounts, C2)          ▼
      BODHI SHIELD AI                    investigator dashboard · STR
      (APK static triage)                core-banking inline decision
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the design decisions and
the reasoning behind each one.

### The three model layers see different things

| | Sees | Catches | Blind to |
|---|---|---|---|
| **XGBoost** | aggregates per account | volume, ratios, cash-out share | who the counterparties are |
| **GraphSAGE** | 2-hop neighbourhood | rings, device farms, multi-hop layering | *when* things happened |
| **TGN** | last 64 events in order | smurfing, dormant bursts, rapid routing | anything outside the account |

Both neural layers are implemented in **NumPy with hand-derived gradients**
(`bodhi/models/graphsage.py`, `bodhi/models/temporal.py`) — no PyTorch, no CUDA,
no 2 GB of wheels. `tests/test_gradients.py` verifies every analytic gradient
against central finite differences, so "hand-rolled" does not mean "unverified".

---

## BODHI SHIELD — the ecosystem link

`bodhi/shield/` performs **real** static triage of an Android package:

- parses the binary `AndroidManifest.xml` string pool to the spec;
- scores *permission combinations* rather than single permissions (READ_SMS
  alone is a messaging app; READ_SMS + accessibility + overlay is a trojan);
- mines `classes*.dex` for UPI handles, IFSC codes, bank accounts, C2 IPs;
- detects commercial packers and measures ProGuard-style obfuscation.

Whatever it extracts is streamed into the Mule Hunter graph as weighted nodes,
so beneficiary accounts hardcoded in a trojan are already flagged **before the
first victim installs it**. Drag an APK onto the SHIELD tab in the dashboard to
watch the hand-off happen.

---

## Why the evaluation is trustworthy

Any model scores ~1.0 AUC on naive synthetic fraud data. Several deliberate
choices make these numbers mean something:

- **Four disjoint folds.** `train` fits the base models, `val` early-stops them,
  `fuse` fits the Layer-7 blend, `test` is touched exactly once.
- **Cross-fitted neighbour risk.** The `neighbour_risk_mean` feature is seeded
  by a 5-fold cross-fitted model, so a training node's memorised label cannot
  leak into a test node's neighbourhood average.
- **Intelligence is quarantined.** NCRP tickets name the mule directly. They are
  never given to the supervised layers — only fused at Layer 7 — which is what
  makes "60% of detections were never reported" a measurement.
- **Hard negatives are planted on purpose.** BC agents sharing one handheld,
  chit-fund organisers with burst fan-in, near-threshold property payments,
  dormant NRI accounts waking up. Without them the precision figures would be
  fiction.
- **Comparison at equal recall.** A model that alerts on everything can always
  claim to catch more.
- **Point-in-time correctness.** Every feature builder takes `as_of` and is
  tested against a manually truncated ledger.

---

## Safety and compliance

- **The kill-switch refuses.** Below 85 it cannot freeze at all. A full freeze
  additionally requires ≥2 independent corroborating layers, is rate-limited,
  carries a TTL, is fully reversible, and never applies to salary/pension
  accounts. Every refusal is audited (`bodhi/actions/killswitch.py`).
- **Monotone fusion.** Blend weights are constrained non-negative, so more
  evidence can never lower a score.
- **Tamper-evident audit chain.** Hash-linked append-only log with
  `verify()`; the head hash is exposed for external anchoring.
- **PII minimisation.** Keyed HMAC pseudonymisation and one-way redaction for
  anything leaving the trust boundary.
- **STR drafting.** The evidence shown to the investigator is the same evidence
  that populates the report's grounds-of-suspicion section — they cannot drift.
  Drafts are marked `DRAFT_PENDING_HUMAN_REVIEW`; nothing is auto-filed.

---

## Repository layout

```
bodhi/
  config.py            thresholds, risk bands, hyper-parameters
  schemas.py           pydantic contracts for every boundary
  data/                bank simulator + the 7 mule typologies
  features/            Layer 2 — vectorised, point-in-time correct
  graph/               Layer 3 — graph build, rings, temporal flow tracing
  models/              Layers 4–7 — XGBoost, GraphSAGE, TGN, fusion
  explain/             Layer 8 — TreeSHAP, GNNExplainer, narrative
  shield/              APK triage + IoC hand-off
  feeds/               NCRP tickets, RBI/NPCI/CERT-In directives
  actions/             Layer 9 — kill-switch, casebook
  compliance/          audit chain, PII, STR/CTR
  engine/              the nine-layer orchestration
  api/                 FastAPI service
  baselines.py         the rule engine we are measured against
dashboard/             zero-dependency investigator console
scripts/               generate_data · train · evaluate · demo · make_sample_apk
tests/                 83 tests including analytic-gradient checks
docs/                  architecture, demo script, model card, report
```

## Documentation & submission artefacts

- [`SUBMISSION.md`](SUBMISSION.md) — submission index, problem-statement coverage
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — design and the reasoning
- [`docs/DEMO.md`](docs/DEMO.md) — the 5-minute judging walkthrough
- [`docs/BOI_TRACK.md`](docs/BOI_TRACK.md) — the organisers' alert dataset: schema, leakage, results
- [`docs/MODEL_CARD.md`](docs/MODEL_CARD.md) — intended use, limits, failure modes
- [`docs/report/`](docs/report/) — prototype report as **PDF**, **DOCX** and LaTeX
- [`docs/BODHI_Mule_Hunter_Deck.pptx`](docs/BODHI_Mule_Hunter_Deck.pptx) — 19-slide deck (also as PDF)

Both documents are generated from `artifacts/metrics/evaluation.json` by
`make submission`, so no number in them is typed by hand and they cannot drift
from the code. The dashboard screenshots are captured from the running app.

## Team

**Team BODHI**

| Name | Enrolment number |
|---|---|
| Akshay Tiwari | `0246CS241037` |
| Palak Vishwakarma | `0246AL241124` |
| Archi Singh Rajput | `0246CS240174` |
| Kartik Jain | `0246AL241094` |

CyberShield Hackathon 2026 · Problem Statement 2 · in association with Bank of
India(BOI) and IIT Hyderabad.

## Limitations

Stated plainly in [`docs/MODEL_CARD.md`](docs/MODEL_CARD.md). The important
ones: results are on simulated data (no bank will export real mule labels);
SHIELD does static analysis only, not the dynamic sandbox described in the
proposal; and the batch re-score of a 12,000-account graph takes ~38 s, so the
graph layers run on a schedule while the inline path uses their cached output.

## Licence

MIT — see `LICENSE`.
