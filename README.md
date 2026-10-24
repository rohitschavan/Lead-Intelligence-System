# Lead Intelligence System

A small TypeScript CLI that scores CSV leads with a transparent 10-point rubric, routes uncertain records to review, and writes actionable reports. Numeric scores and decisions are deterministic; an optional AI call only adds explanations and outreach drafts.

## Run

```bash
pnpm --filter @workspace/scripts lead-intelligence -- \
  --input data/input/leads_full_scale_100.csv \
  --output-dir data/output/final-100

pnpm --filter @workspace/scripts test
pnpm --filter @workspace/scripts typecheck
```

To use a local Ollama model, run `ollama serve` and `ollama pull llama3.2`, then add `--ai`. AI requests are sent in batches of 10 to `http://localhost:11434/v1/chat/completions`. Select another model with `--model`, or an OpenAI-compatible endpoint with `--base-url`. For a remote endpoint, provide `AI_API_KEY` through the shell environment if required; never put it in the CSV or source.

## Rubric and limits

Company size (3), industry (2), source intent (2), engagement recency (2), and data confidence (1) produce a score from 0–10. Scores of 7–10 qualify, 0–3 reject, and 4–6 go to review. Missing or invalid key fields always require review. The included rubric mappings and thresholds are business assumptions, not learned from outcomes; these datasets have no ground-truth qualification labels.

## Outputs

Each run writes JSON results and summary plus complete, priority, review, and rejected CSV queues. Every input row gets a stable row-based ID. If AI is off, unreachable, or returns invalid output, deterministic reasoning and safe fallback messages remain available; batch errors and retries are recorded in the summary. Only qualified leads receive outreach.

Provided source data and project documents are preserved under `data/input/` and `docs/reference/`.

The supplied data guide says the training file has 30 leads, but the actual CSV contains 29 data rows. The app keeps the input unchanged and reports the actual row count.
