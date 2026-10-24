import type { BatchStats, LeadResult } from "./types.js";

interface Enrichment {
  lead_id: string;
  explanation: string;
  outreach_message?: string;
}

export interface AiOptions {
  baseUrl: string;
  model: string;
  batchSize: number;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  pause?: (milliseconds: number) => Promise<void>;
}

function chatUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;
}

function responseText(content: unknown): string {
  if (typeof content !== "string") throw new Error("The model returned no text content.");
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(cleaned);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("leads" in parsed) ||
    !Array.isArray(parsed.leads)
  ) {
    throw new Error("The model response must be a JSON object with a leads array.");
  }
  return JSON.stringify(parsed);
}

function parseEnrichments(content: unknown, expectedIds: Set<string>): Enrichment[] {
  const parsed = JSON.parse(responseText(content)) as { leads: unknown[] };
  const seen = new Set<string>();
  const results: Enrichment[] = [];
  for (const item of parsed.leads) {
    if (typeof item !== "object" || item === null) {
      throw new Error("The model returned a malformed lead item.");
    }
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.lead_id !== "string" ||
      typeof candidate.explanation !== "string" ||
      !expectedIds.has(candidate.lead_id) ||
      seen.has(candidate.lead_id)
    ) {
      throw new Error("The model returned an unknown, duplicate, or incomplete lead ID.");
    }
    if (
      candidate.outreach_message !== undefined &&
      typeof candidate.outreach_message !== "string"
    ) {
      throw new Error("The model returned an invalid outreach message.");
    }
    seen.add(candidate.lead_id);
    results.push({
      lead_id: candidate.lead_id,
      explanation: candidate.explanation.slice(0, 500),
      outreach_message:
        typeof candidate.outreach_message === "string"
          ? candidate.outreach_message.slice(0, 600)
          : undefined,
    });
  }
  if (seen.size !== expectedIds.size) {
    throw new Error("The model response did not include every lead in the batch.");
  }
  return results;
}

async function requestBatch(
  batch: LeadResult[],
  options: AiOptions,
): Promise<Enrichment[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`;
  const leadPayload = batch.map((lead) => ({
    lead_id: lead.lead_id,
    name: lead.name,
    company: lead.company,
    company_size: lead.company_size,
    industry: lead.industry,
    source: lead.source,
    last_interaction_date: lead.last_interaction_date,
    score: lead.score,
    decision: lead.decision,
  }));
  const prompt = [
    "You assist with lead qualification. The numeric scores and decisions below are final and must not be changed.",
    "Return valid JSON only, shaped as {\"leads\":[{\"lead_id\":\"...\",\"explanation\":\"...\",\"outreach_message\":\"...\"}]}",
    "Include exactly one item for each lead_id. Explain using only the supplied evidence.",
    "For non-qualified leads, omit outreach_message. For qualified leads, write one concise, low-pressure first message.",
    "Never invent prior conversations, budgets, achievements, needs, or other facts.",
    `Leads: ${JSON.stringify(leadPayload)}`,
  ].join("\n");

  const response = await fetchImpl(chatUrl(options.baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: options.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return only valid JSON. Do not change the supplied decisions." },
        { role: "user", content: prompt },
      ],
      stream: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw Object.assign(new Error(`Model endpoint returned HTTP ${response.status}.`), {
      retryable,
    });
  }
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("choices" in body) ||
    !Array.isArray(body.choices)
  ) {
    throw new Error("Model response is missing the OpenAI-compatible choices field.");
  }
  const first = body.choices[0] as
    | { message?: { content?: unknown } }
    | undefined;
  return parseEnrichments(first?.message?.content, new Set(batch.map((lead) => lead.lead_id)));
}

export async function enrichInBatches(
  results: LeadResult[],
  options: AiOptions,
): Promise<{ results: LeadResult[]; stats: BatchStats }> {
  const byId = new Map(results.map((result) => [result.lead_id, result]));
  const stats: BatchStats = { batches_attempted: 0, batches_failed: 0, retries: 0, errors: [] };
  const pause = options.pause ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  for (let start = 0; start < results.length; start += options.batchSize) {
    const batch = results.slice(start, start + options.batchSize);
    stats.batches_attempted += 1;
    let enrichments: Enrichment[] | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        enrichments = await requestBatch(batch, options);
        break;
      } catch (error) {
        const retryable =
          !(typeof error === "object" && error !== null && "retryable" in error) ||
          Boolean((error as { retryable?: boolean }).retryable);
        const detail = error instanceof Error ? error.message : "Unknown model error.";
        if (attempt < 2 && retryable) {
          stats.retries += 1;
          await pause(250 * 2 ** attempt);
        } else {
          stats.batches_failed += 1;
          stats.errors.push(`Batch ${stats.batches_attempted}: ${detail}`);
          break;
        }
      }
    }

    if (!enrichments) {
      for (const lead of batch) {
        const target = byId.get(lead.lead_id)!;
        target.ai_status = "fallback";
        target.ai_reasoning = "AI enrichment unavailable; deterministic rubric reasoning is shown.";
      }
      continue;
    }

    for (const enrichment of enrichments) {
      const target = byId.get(enrichment.lead_id)!;
      target.ai_status = "generated";
      target.ai_reasoning = enrichment.explanation;
      if (target.decision === "qualified" && enrichment.outreach_message?.trim()) {
        target.outreach_message = enrichment.outreach_message.trim();
      }
      if (target.decision !== "qualified") target.outreach_message = null;
    }
  }
  return { results, stats };
}
