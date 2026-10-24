# Cursor Implementation Plan — Lead Intelligence System

## 1. Project Goal

Build a reliable command-line Lead Intelligence System that ingests lead CSV files, evaluates leads against a documented qualification rubric, assigns scores and outreach priorities, generates personalized first messages for qualified leads, and produces actionable reports.

The implementation must satisfy the mini-project brief:

- Process at least 100 leads in one run.
- Use an LLM API.
- Process leads in batches rather than making one API request per lead.
- Produce a decision, score, reasoning, and priority for each processed lead.
- Generate personalized outreach messages for qualified leads.
- Handle missing or invalid data, API failures, and rate limits.
- Produce aggregated statistics and 3–5 sample outreach messages.
- Document setup, rubric, limitations, and execution.

**Important:** The supplied datasets have no ground-truth qualification outcomes. The rubric is a documented business assumption. Evaluate consistency, explainability, and robustness—not conversion accuracy.

## 2. Recommended Stack

| Area | Recommendation |
|---|---|
| Editor and coding agent | Cursor |
| Language | Python 3.12 |
| Initial LLM provider | Gemini API |
| Optional alternative provider | Groq API |
| Data processing | Python standard library or pandas |
| Schema validation | Pydantic |
| Configuration | `.env` plus YAML |
| Tests | pytest |
| Version control | Git |
| User interface | CLI first |

Check the selected provider's current model availability, API limits, and free-tier conditions before implementation. Keep provider-specific logic behind a shared interface.

## 3. Input Datasets

Place the provided CSVs in `data/input/`:

- `leads_training.csv` — 30 clean records for developing the rubric and prompts.
- `leads_testing.csv` — 20 records containing missing fields and edge cases.
- `leads_full_scale_100.csv` — 100 clean records for the final scale run.

Keep the original files unchanged. The system should preserve record traceability, flag data-quality problems, and never silently drop leads.

## 4. Project Structure

```text
lead-intelligence-system/
├── src/
│   └── lead_intelligence/
│       ├── __init__.py
│       ├── cli.py
│       ├── config.py
│       ├── schemas.py
│       ├── ingestion.py
│       ├── validation.py
│       ├── rubric.py
│       ├── scoring.py
│       ├── batching.py
│       ├── qualification.py
│       ├── outreach.py
│       ├── reporting.py
│       ├── logging_config.py
│       └── llm/
│           ├── __init__.py
│           ├── base.py
│           ├── gemini_provider.py
│           └── groq_provider.py
├── config/
│   └── rubric.yaml
├── data/
│   ├── input/
│   └── output/
├── docs/
│   ├── Mini_Project_Brief.docx
│   ├── DATA_README.md
│   ├── DELIVERY_SUMMARY.md
│   └── EXPECTED_OUTCOMES_NOTE.md
├── tests/
│   ├── test_ingestion.py
│   ├── test_validation.py
│   ├── test_scoring.py
│   ├── test_qualification.py
│   ├── test_batching.py
│   ├── test_reporting.py
│   └── test_integration.py
├── .cursor/
│   └── rules/
│       └── project.mdc
├── .env.example
├── .gitignore
├── pyproject.toml
└── README.md
```

## 5. Architecture and Data Flow

1. **Ingest:** Read CSV records and validate required headers.
2. **Normalize:** Normalize blank values, company-size values, industry/source labels, and dates.
3. **Validate:** Preserve warnings and identify records requiring review.
4. **Score:** Apply the deterministic, configured rubric.
5. **Batch AI analysis:** Send bounded batches to the selected LLM for qualitative assessment and evidence-based explanations.
6. **Validate AI output:** Parse structured responses, validate schemas, and match each response to a stable lead ID.
7. **Decide:** Apply the documented decision thresholds and human-review overrides in code.
8. **Generate outreach:** Create messages for qualified leads only; never invent unsupported facts.
9. **Report:** Write JSON, CSV, priority queue, review queue, rejection list, and run summary.
10. **Audit:** Log processing outcomes, retries, and errors without logging secrets.

### Design rule

The LLM must not invent the numeric qualification score or override deterministic decision thresholds. Python scoring logic is the source of truth for numeric scores and final rule-based decisions. Use the LLM for qualitative assessment, concise explanations, and message drafting.

## 6. Qualification Rubric

Start with five factors and explicit maximum point allocations:

| Factor | Maximum points | Purpose |
|---|---:|---|
| Company size fit | 3 | Fit with the configured target company-size segment |
| Industry fit | 2 | Fit with the configured target industries |
| Acquisition source intent | 2 | Relative intent indicated by the supplied source |
| Engagement recency | 2 | Recency of the last interaction |
| Data confidence | 1 | Whether the record contains enough reliable information |
| **Total** | **10** | |

These are initial business assumptions and must be documented as such. Define explicit rules for every point awarded, including:

- Target company-size ranges.
- Industry mapping and unknown industries.
- Source-intent mapping.
- Interaction-date recency bands.
- Missing and invalid values.
- Human-review overrides.

Suggested starting decision thresholds:

```yaml
rubric:
  name: "Lead Qualification Rubric"
  version: "1.0"

  weights:
    company_size_fit: 3
    industry_fit: 2
    source_intent: 2
    engagement_recency: 2
    data_confidence: 1

  decisions:
    qualified_min_score: 7
    rejected_max_score: 3
    review_min_score: 4
    review_max_score: 6

  priority:
    high_min_score: 8
    medium_min_score: 5

  review_rules:
    - missing_company_size
    - missing_industry
    - missing_source
    - invalid_interaction_date
```

Complete the scoring policy before using it. Ensure the factor scores sum to the overall score and never exceed 10. Critical missing data should trigger review even if a provisional numeric score is available. Define how rejected and review ranges interact with overrides, and test every boundary.

## 7. Result Schema

Every completed lead should include fields equivalent to:

```json
{
  "lead_id": "lead_0001",
  "name": "Alice Chen",
  "company": "CloudScale AI",
  "score": 8,
  "decision": "qualified",
  "priority": "high",
  "factor_scores": {
    "company_size_fit": 3,
    "industry_fit": 2,
    "source_intent": 2,
    "engagement_recency": 1,
    "data_confidence": 0
  },
  "reasoning": [
    "Company size fits the configured target segment",
    "Industry matches the configured target profile",
    "Inbound demo request indicates interest"
  ],
  "review_required": false,
  "outreach_message": "..."
}
```

This is an illustrative schema, not a result from the supplied dataset. Enforce the following invariants:

- Stable lead IDs are unique.
- Score is an integer from 0 through 10.
- Factor-score sum equals the overall score.
- Decision and priority follow configured rules.
- Review overrides are explicit and explainable.
- Every input record is accounted for as completed, review-required, or failed-to-process.
- Outreach is generated only for qualified leads.

## 8. Phased Cursor Implementation

Use Cursor Plan mode to review architecture first, then Agent mode to implement one phase at a time. Review diffs and run tests after each phase. Do not ask the agent to build the whole application in one unreviewed change.

### Phase 1 — Scaffold and ingestion

**Cursor prompt:**

> Inspect the project brief, reference documentation, and all three CSV files before coding. Build a Python 3.12 package for the Lead Intelligence System. Implement configuration loading, CLI arguments, CSV ingestion, stable lead IDs, schema validation, structured logging, and clear error messages. Preserve original records and report malformed rows rather than silently dropping them. Add `pyproject.toml` and unit tests. Do not implement LLM scoring yet. Run the tests and summarize files created and failures.

**Acceptance criteria:**

- Reads 30, 20, and 100 records from the respective datasets.
- Validates required headers.
- Handles blank values and malformed records safely.
- Does not mutate the input files.
- Has tests for ingestion and validation.

### Phase 2 — Rubric and deterministic scoring

**Cursor prompt:**

> Implement a configurable five-factor qualification rubric in `config/rubric.yaml`: company size (3), industry fit (2), source intent (2), recency (2), and data confidence (1). Define each factor's scoring rules explicitly. Implement deterministic scoring, decision thresholds, priority assignment, and human-review overrides. Do not use the LLM to calculate numeric scores. Add tests for every threshold, score summation, missing values, invalid dates, unknown categories, and boundary cases. Document that the rubric is an assumption because the datasets have no ground-truth outcomes.

**Acceptance criteria:**

- Scores are reproducible.
- Factor scores add up to the total score.
- Total score is within 0–10.
- Decisions and priorities follow documented rules.
- Missing information is never treated as positive evidence.

### Phase 3 — LLM integration and batching

**Cursor prompt:**

> Implement an LLM provider interface, Gemini provider, and optional Groq provider. Read API keys and model IDs from environment variables. Process leads in configurable batches rather than one API call per lead. Request structured qualitative assessments and evidence-based explanations. Validate responses using Pydantic, match results by lead ID, and reject unknown or duplicate IDs. Implement bounded retries with exponential backoff and jitter for transient failures, plus timeout, rate-limit, malformed-response, and provider-outage handling. Add a mock provider for offline tests. Never log secrets. Do not make live API calls in tests.

**Acceptance criteria:**

- Provider can be switched through configuration.
- Batch size is configurable.
- Model output is schema-validated.
- Failed batches are recorded and can be retried.
- No input records disappear silently.
- Tests run without an API key.

**Batching note:** With a batch size of 10, a successful 100-lead run should require approximately 10 batch requests for one batch-processing stage. Actual request count may be higher because of retries, recovery, output generation, or provider constraints.

### Phase 4 — Personalized outreach

**Cursor prompt:**

> Implement personalized first-message generation for qualified leads only. Use only supplied lead fields and relevant configured business context. Messages should be concise, professional, specific, and include a low-pressure call to action. Never invent prior conversations, company achievements, budgets, business problems, or personal facts. If data is insufficient, generate a conservative message or flag it for human editing. Support two or three configurable tone variants. Include 3–5 representative examples in the final report. Add tests for missing names, empty fields, unsupported claims, and non-qualified leads.

**Acceptance criteria:**

- Qualified leads receive a message when sufficient data is available.
- Rejected leads do not receive outreach.
- Review-required leads remain in the review queue.
- Messages contain no fabricated facts.

### Phase 5 — Reporting and CLI

**Cursor prompt:**

> Implement the complete CLI and reporting pipeline. Accept an input CSV, output directory, provider, and batch-size options. Generate `output_report.json`, `lead_results.csv`, `priority_queue.csv`, `review_queue.csv`, `rejected_leads.csv`, and `run_summary.json`. Include scores, factor scores, decisions, priorities, reasoning, review flags, validation warnings, and outreach messages where applicable. Report total records, qualified/rejected/review percentages, common rejection reasons, processing duration, retries, failed batches, and LLM usage when available. Write output files safely and never claim success if records were lost. Add CLI help and meaningful exit codes.

**Acceptance criteria:**

- Every expected report is produced.
- Summary counts reconcile with per-lead results.
- Processing failures are visible.
- The CLI documents its options and exit codes.

### Phase 6 — Robustness and integration testing

**Cursor prompt:**

> Audit the full application against the project brief and `DATA_README.md`. Run the 20-record edge-case dataset and the 100-record full-scale dataset. Add tests for missing names, missing sizes, unknown categories, stale dates, same-day dates, invalid dates, duplicate records, malformed model responses, timeouts, rate limits, failed batches, partial results, and provider outages. Use a mock LLM for failure tests. Verify stable IDs, score invariants, complete record accounting, and report reconciliation. Fix issues and rerun the complete test suite. Distinguish successful, review-required, and failed-to-process records.

**Acceptance criteria:**

- Messy records do not crash the entire run.
- Failures are logged and surfaced.
- Every input row is accounted for.
- Retries are bounded.
- Tests cover both normal and failure paths.

### Phase 7 — Documentation and submission

**Cursor prompt:**

> Prepare the final assignment submission. Update README.md with installation, environment variables, CLI examples, rubric, architecture, testing commands, outputs, limitations, and assumptions. Run the 100-lead dataset and inspect the actual output statistics. Include 3–5 real generated outreach examples. Add a short technical design document covering deterministic scoring, batching, retries, failure handling, and human review. Check for secrets, unused code, inaccurate claims, and missing tests. Never fabricate test results or ground-truth accuracy. List any remaining limitations.

**Acceptance criteria:**

- README is complete and accurate.
- Final 100-lead output is generated by the application.
- Sample outreach messages come from actual run output.
- No API keys or secrets are included.
- All known limitations are documented.

## 9. Cursor Project Rules

Create `.cursor/rules/project.mdc`:

```markdown
---
description: Lead Intelligence System project rules
alwaysApply: true
---

# Goals
Build a reliable, explainable Python lead qualification CLI.

# Architecture
- Keep ingestion, validation, scoring, LLM integration, outreach,
  and reporting separate.
- Keep weights and thresholds in config/rubric.yaml.
- Keep numeric scoring deterministic and independent of the LLM.
- Use typed Pydantic models for inputs and outputs.

# Reliability
- Never silently drop a lead.
- Flag insufficient or contradictory data for review.
- Use bounded retries for transient provider failures.
- Validate all model output.
- Match batch responses using stable lead IDs.
- Never log API keys or secrets.

# Testing
- Use pytest.
- Test clean, incomplete, malformed, and boundary-case inputs.
- Use mocked LLM responses for offline tests.
- Run tests after meaningful changes.
- Never claim tests passed without executing them.

# Scope
- Build a CLI first.
- Do not add a dashboard, database, or unnecessary infrastructure.
- Document assumptions and limitations.
```

## 10. Environment Setup

Create and activate a virtual environment:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install pandas pydantic python-dotenv pyyaml pytest tenacity
```

Choose one provider SDK:

```bash
pip install google-genai
```

Or:

```bash
pip install groq
```

Example `.env.example`:

```dotenv
LLM_PROVIDER=gemini
GEMINI_API_KEY=
LLM_MODEL=
BATCH_SIZE=10
MAX_RETRIES=3
```

Create a local `.env` with your actual API key. Never commit it.

Example `.gitignore`:

```gitignore
.env
.venv/
__pycache__/
.pytest_cache/
*.py[cod]
.DS_Store
```

## 11. Run Commands

Run tests:

```bash
pytest -q
```

Run training data:

```bash
python -m lead_intelligence.cli \
  --input data/input/leads_training.csv \
  --output-dir data/output/training
```

Run edge-case data:

```bash
python -m lead_intelligence.cli \
  --input data/input/leads_testing.csv \
  --output-dir data/output/testing
```

Run the final 100-lead dataset:

```bash
python -m lead_intelligence.cli \
  --input data/input/leads_full_scale_100.csv \
  --output-dir data/output/final
```

These commands assume the package and CLI are configured to load provider and batch settings from the environment or project configuration. If the implemented CLI requires explicit options, pass them as shown by `--help`.

## 12. Final Verification Checklist

- [ ] All three input datasets can be processed.
- [ ] The 100-lead run accounts for all 100 records.
- [ ] Every completed record has a score between 0 and 10.
- [ ] Factor scores sum to the total score.
- [ ] Decision thresholds and priorities are documented and tested.
- [ ] Uncertain records are flagged for human review.
- [ ] LLM calls are batched.
- [ ] API failures and rate limits are handled.
- [ ] Malformed model output is rejected safely.
- [ ] JSON and CSV reports are generated.
- [ ] Aggregate statistics reconcile with individual records.
- [ ] Three to five outreach examples are included.
- [ ] Tests pass and were actually executed.
- [ ] README explains setup, rubric, limitations, and outputs.
- [ ] No API keys or secrets are in the submission.

## 13. Suggested Schedule

| Day | Goal |
|---|---|
| Day 1 | Cursor setup, structure, ingestion |
| Day 2 | Rubric, scoring, tests |
| Day 3 | LLM integration, structured output, batching |
| Day 4 | Outreach and reports |
| Day 5 | Edge-case testing and recovery |
| Day 6 | Full 100-lead run and documentation |
| Day 7 | Final review and ZIP submission |

## 14. Submission Contents

Include:

- Source code and project configuration.
- README and qualification rubric.
- Sample input CSV.
- Genuine output report from the 100-lead run.
- CSV result and summary reports.
- Three to five generated outreach examples.
- Automated tests.
- Known limitations and assumptions.

Do not include API keys, virtual environments, or large intermediate files.

## 15. Final Engineering Principles

1. Make business rules explicit before tuning prompts.
2. Keep numeric scoring deterministic.
3. Use the LLM for qualitative interpretation and language generation.
4. Batch requests and handle failures safely.
5. Make every decision explainable.
6. Route uncertain records to human review.
7. Validate the full 100-lead workflow before submission.
8. Never claim accuracy against ground truth that the dataset does not provide.
