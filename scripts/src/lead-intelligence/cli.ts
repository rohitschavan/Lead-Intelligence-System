import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLeads } from "./csv.js";
import { enrichInBatches } from "./ollama.js";
import { scoreLead } from "./rubric.js";
import { createSummary, writeReports } from "./report.js";
import type { BatchStats } from "./types.js";

interface Options {
  input: string;
  outputDir: string;
  batchSize: number;
  ai: boolean;
  model: string;
  baseUrl: string;
  asOf: Date;
}

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const HELP = `Lead Intelligence System

Usage:
  pnpm --filter @workspace/scripts lead-intelligence -- --input <csv> [options]

Options:
  --input <path>       Required lead CSV
  --output-dir <path>  Output folder (default: data/output/run)
  --as-of <YYYY-MM-DD> Scoring date (default: today)
  --ai                 Enrich in batches using an OpenAI-compatible model endpoint
  --base-url <url>     Endpoint base (default: http://localhost:11434/v1)
  --model <name>       Model name (default: llama3.2)
  --batch-size <n>     Leads per request, 1-50 (default: 10)
  --help               Show this help

For local AI, start Ollama and pull a model:
  ollama serve
  ollama pull llama3.2
  pnpm --filter @workspace/scripts lead-intelligence -- --input data/input/leads_full_scale_100.csv --ai
`;

function parseOptions(args: string[]): Options | null {
  if (args.includes("--help") || args.length === 0) {
    console.log(HELP);
    return null;
  }
  const values = new Map<string, string>();
  const flags = new Set(["--ai"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--") continue;
    if (flags.has(argument)) {
      values.set(argument, "true");
      continue;
    }
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    values.set(argument, value);
    index += 1;
  }

  const input = values.get("--input");
  if (!input) throw new Error("Provide --input <csv>.");
  const batchSize = Number(values.get("--batch-size") ?? 10);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) {
    throw new Error("--batch-size must be an integer from 1 to 50.");
  }
  const asOfText = values.get("--as-of");
  const asOf = asOfText ? new Date(`${asOfText}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(asOf.valueOf()) || (asOfText && asOf.toISOString().slice(0, 10) !== asOfText)) {
    throw new Error("--as-of must be a real date in YYYY-MM-DD format.");
  }
  const knownOptions = new Set([
    "--input",
    "--output-dir",
    "--as-of",
    "--ai",
    "--base-url",
    "--model",
    "--batch-size",
  ]);
  for (const key of values.keys()) {
    if (!knownOptions.has(key)) throw new Error(`Unknown option: ${key}`);
  }
  return {
    input: resolve(WORKSPACE_ROOT, input),
    outputDir: resolve(WORKSPACE_ROOT, values.get("--output-dir") ?? "data/output/run"),
    batchSize,
    ai: values.has("--ai"),
    model: values.get("--model") ?? "llama3.2",
    baseUrl: values.get("--base-url") ?? "http://localhost:11434/v1",
    asOf: new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())),
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (!options) return;
  const startedAt = Date.now();
  const { leads, warnings: ingestionWarnings } = await loadLeads(options.input);
  let results = leads.map((lead) => scoreLead(lead, options.asOf));
  let aiStats: BatchStats = {
    batches_attempted: 0,
    batches_failed: 0,
    retries: 0,
    errors: [],
  };

  if (options.ai) {
    const enriched = await enrichInBatches(results, {
      baseUrl: options.baseUrl,
      model: options.model,
      batchSize: options.batchSize,
      apiKey: process.env.AI_API_KEY,
    });
    results = enriched.results;
    aiStats = enriched.stats;
  }

  const priorityQueue = results
    .filter((result) => result.decision === "qualified")
    .sort((left, right) => right.score - left.score || left.lead_id.localeCompare(right.lead_id));
  priorityQueue.forEach((result, index) => {
    result.priority_rank = index + 1;
  });

  const summary = createSummary(
    options.input,
    options.asOf,
    results,
    options.ai,
    aiStats,
    Date.now() - startedAt,
    ingestionWarnings,
  );
  await writeReports(options.outputDir, results, summary);

  console.log(
    `Processed ${summary.processed_records}/${summary.total_records} leads: ` +
      `${summary.qualified} qualified, ${summary.review} for review, ${summary.rejected} rejected.`,
  );
  console.log(`Reports written to ${options.outputDir}`);
  if (options.ai) {
    console.log(
      `AI batches: ${aiStats.batches_attempted}; failed: ${aiStats.batches_failed}; retries: ${aiStats.retries}.`,
    );
  } else {
    console.log("AI enrichment was not requested; deterministic fallback messages were used.");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Lead Intelligence System: ${message}`);
  process.exitCode = 1;
});
