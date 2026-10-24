# Lead Intelligence System

A CLI that qualifies lead CSVs with a deterministic rubric, optional batched Ollama-compatible AI enrichment, and JSON/CSV reports.

## Run & Operate

- `pnpm --filter @workspace/scripts lead-intelligence -- --input data/input/leads_full_scale_100.csv` — process the 100-lead sample offline
- Add `--ai` to use a local Ollama or other OpenAI-compatible endpoint
- `pnpm --filter @workspace/scripts test` — run CLI unit tests
- `pnpm --filter @workspace/scripts typecheck` — typecheck scripts package
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `scripts/src/lead-intelligence/` — CLI, CSV ingestion, rubric, batched AI enrichment, reporting, and tests
- `data/input/` — the original training, test, and full-scale lead CSVs
- `docs/RUBRIC.md` — scoring assumptions and decision thresholds
- `docs/reference/` — user-provided brief, planning notes, and dataset documentation

## Architecture decisions

- Numeric scores and final decisions are deterministic; AI enrichment only drafts explanations and outreach.
- AI calls are opt-in and default to the local Ollama OpenAI-compatible endpoint, so offline runs need no key and do not transmit lead data externally.
- Every parsed row receives an ID based on its input row, and batch failures preserve the scored records with visible fallback status.
- Rubric outcomes are assumptions because the sample CSVs have no ground-truth labels.

## Product

The CLI reads clean or incomplete lead CSVs, scores each record, routes uncertain records to human review, and generates priority/review/rejection queues with summary statistics and qualified-lead outreach examples.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
