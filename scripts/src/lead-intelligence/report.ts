import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BatchStats, Decision, LeadResult } from "./types.js";

function csvCell(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(results: LeadResult[]): string {
  const headers = [
    "lead_id",
    "name",
    "company",
    "company_size",
    "industry",
    "source",
    "last_interaction_date",
    "score",
    "decision",
    "priority",
    "priority_rank",
    "factor_scores",
    "reasoning",
    "review_required",
    "validation_warnings",
    "ai_status",
    "ai_reasoning",
    "outreach_message",
  ];
  return [
    headers.map(csvCell).join(","),
    ...results.map((result) =>
      headers.map((header) => csvCell(result[header as keyof LeadResult])).join(","),
    ),
  ].join("\n") + "\n";
}

async function safeWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
}

export interface RunSummary {
  input_file: string;
  as_of: string;
  total_records: number;
  processed_records: number;
  qualified: number;
  rejected: number;
  common_rejection_reasons: { reason: string; count: number }[];
  review: number;
  qualified_percent: number;
  rejected_percent: number;
  review_percent: number;
  ai_enabled: boolean;
  ai_batches_attempted: number;
  ai_batches_failed: number;
  ai_retries: number;
  ai_errors: string[];
  ingestion_warnings: string[];
  duration_ms: number;
}

export function createSummary(
  inputFile: string,
  asOf: Date,
  results: LeadResult[],
  aiEnabled: boolean,
  stats: BatchStats,
  durationMs: number,
  ingestionWarnings: string[] = [],
): RunSummary {
  const counts: Record<Decision, number> = { qualified: 0, rejected: 0, review: 0 };
  for (const result of results) counts[result.decision] += 1;
  const rejectionFactors = new Map<string, number>();
  for (const result of results.filter((lead) => lead.decision === "rejected")) {
    const reasons = [
      result.factor_scores.company_size_fit <= 1 && "Company size outside core target range",
      result.factor_scores.industry_fit === 0 && "Industry has no mapped target fit",
      result.factor_scores.source_intent === 0 && "Source provides no mapped intent points",
      result.factor_scores.engagement_recency === 0 && "No interaction within the 90-day recency window",
    ].filter((reason): reason is string => Boolean(reason));
    for (const reason of reasons) {
      rejectionFactors.set(reason, (rejectionFactors.get(reason) ?? 0) + 1);
    }
  }
  const total = results.length;
  const percentage = (value: number) =>
    total === 0 ? 0 : Number(((value / total) * 100).toFixed(1));

  return {
    input_file: inputFile,
    as_of: asOf.toISOString().slice(0, 10),
    total_records: total,
    processed_records: total,
    qualified: counts.qualified,
    rejected: counts.rejected,
    common_rejection_reasons: [...rejectionFactors.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
      .slice(0, 5),
    review: counts.review,
    qualified_percent: percentage(counts.qualified),
    rejected_percent: percentage(counts.rejected),
    review_percent: percentage(counts.review),
    ai_enabled: aiEnabled,
    ai_batches_attempted: stats.batches_attempted,
    ai_batches_failed: stats.batches_failed,
    ai_retries: stats.retries,
    ai_errors: stats.errors,
    ingestion_warnings: ingestionWarnings,
    duration_ms: durationMs,
  };
}

export async function writeReports(
  outputDir: string,
  results: LeadResult[],
  summary: RunSummary,
): Promise<void> {
  const qualified = results
    .filter((result) => result.decision === "qualified")
    .sort((left, right) =>
      (left.priority_rank ?? Number.MAX_SAFE_INTEGER) -
        (right.priority_rank ?? Number.MAX_SAFE_INTEGER) ||
      left.lead_id.localeCompare(right.lead_id),
    );
  const review = results.filter((result) => result.decision === "review");
  const rejected = results.filter((result) => result.decision === "rejected");
  const report = {
    summary,
    rubric: {
      weights: {
        company_size_fit: 3,
        industry_fit: 2,
        source_intent: 2,
        engagement_recency: 2,
        data_confidence: 1,
      },
      thresholds: { qualified_min_score: 7, rejected_max_score: 3 },
      assumptions:
        "The rubric is a documented business assumption. The supplied datasets contain no conversion outcomes or qualification ground truth.",
    },
    records: results,
    sample_outreach: qualified
      .filter((result) => result.outreach_message)
      .slice(0, 5)
      .map(({ lead_id, name, company, outreach_message }) => ({
        lead_id,
        name,
        company,
        message: outreach_message,
      })),
  };

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    safeWrite(join(outputDir, "output_report.json"), `${JSON.stringify(report, null, 2)}\n`),
    safeWrite(join(outputDir, "lead_results.csv"), toCsv(results)),
    safeWrite(join(outputDir, "priority_queue.csv"), toCsv(qualified)),
    safeWrite(join(outputDir, "review_queue.csv"), toCsv(review)),
    safeWrite(join(outputDir, "rejected_leads.csv"), toCsv(rejected)),
    safeWrite(join(outputDir, "run_summary.json"), `${JSON.stringify(summary, null, 2)}\n`),
  ]);
}
