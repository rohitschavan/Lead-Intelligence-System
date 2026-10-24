import assert from "node:assert/strict";
import test from "node:test";
import { enrichInBatches } from "./ollama.js";
import { fallbackOutreach, scoreLead } from "./rubric.js";
import type { Lead } from "./types.js";

const asOf = new Date("2024-01-20T00:00:00.000Z");

function makeLead(id: string, overrides: Partial<Lead> = {}): Lead {
  return {
    lead_id: id,
    name: "Alice Chen",
    company: "CloudScale AI",
    company_size: "50",
    industry: "SaaS",
    source: "Inbound demo request",
    last_interaction_date: "2024-01-15",
    ...overrides,
  };
}

function mockResponse(ids: string[]): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              leads: ids.map((lead_id) => ({
                lead_id,
                explanation: "Recent inbound request from a target-size software company.",
                outreach_message: "Hi Alice, would a short conversation be useful?",
              })),
            }),
          },
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("AI enrichment batches records and does not change deterministic decisions", async () => {
  const source = [
    scoreLead(makeLead("lead_0001"), asOf),
    scoreLead(makeLead("lead_0002"), asOf),
    scoreLead(makeLead("lead_0003", { company_size: "NA" }), asOf),
  ];
  const originalDecisions = source.map((result) => result.decision);
  const calledUrls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    calledUrls.push(String(input));
    const url = calledUrls.at(-1)!;
    const expected = url.includes("batch") ? [] : [];
    void expected;
    const index = calledUrls.length;
    return mockResponse(
      index === 1 ? ["lead_0001", "lead_0002"] : ["lead_0003"],
    );
  };

  const { results, stats } = await enrichInBatches(source, {
    baseUrl: "http://localhost:11434/v1",
    model: "test-model",
    batchSize: 2,
    fetchImpl,
    pause: async () => {},
  });

  assert.equal(calledUrls.length, 2);
  assert.deepEqual(results.map((result) => result.decision), originalDecisions);
  assert.equal(results[0]!.ai_status, "generated");
  assert.equal(results[2]!.outreach_message, null);
  assert.equal(stats.batches_attempted, 2);
  assert.equal(stats.batches_failed, 0);
});

test("failed batch is retried then surfaced while retaining fallback records", async () => {
  const source = [scoreLead(makeLead("lead_0001"), asOf)];
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response("unavailable", { status: 503 });
  };

  const { results, stats } = await enrichInBatches(source, {
    baseUrl: "http://localhost:11434/v1",
    model: "test-model",
    batchSize: 10,
    fetchImpl,
    pause: async () => {},
  });

  assert.equal(calls, 3);
  assert.equal(results[0]!.ai_status, "fallback");
  assert.equal(results[0]!.outreach_message, fallbackOutreach(source[0]!));
  assert.equal(stats.retries, 2);
  assert.equal(stats.batches_failed, 1);
  assert.equal(stats.errors.length, 1);
});
