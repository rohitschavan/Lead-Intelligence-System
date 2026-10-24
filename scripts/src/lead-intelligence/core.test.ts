import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv } from "./csv.js";
import { scoreLead } from "./rubric.js";
import type { Lead } from "./types.js";

const asOf = new Date("2024-01-20T00:00:00.000Z");

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    lead_id: "lead_0001",
    name: "Alice Chen",
    company: "CloudScale AI",
    company_size: "50",
    industry: "SaaS",
    source: "Inbound demo request",
    last_interaction_date: "2024-01-15",
    ...overrides,
  };
}

test("CSV parser handles commas, escaped quotes, and embedded newlines", () => {
  assert.deepEqual(parseCsv('name,company,note\r\nAlice,"Cloud, Inc.","said ""hello"""\r\nBob,Co,"two\nlines"'), [
    ["name", "company", "note"],
    ["Alice", "Cloud, Inc.", 'said "hello"'],
    ["Bob", "Co", "two\nlines"],
  ]);
});

test("qualified score is deterministic and factor scores add to total", () => {
  const result = scoreLead(lead(), asOf);
  assert.equal(result.score, 10);
  assert.equal(result.decision, "qualified");
  assert.equal(result.priority, "high");
  assert.equal(result.priority_rank, null);
  assert.equal(
    Object.values(result.factor_scores).reduce((sum, value) => sum + value, 0),
    result.score,
  );
});

test("incomplete and unmapped data is sent to review, not silently rejected", () => {
  const result = scoreLead(
    lead({
      name: "",
      company_size: "NA",
      industry: "Unknown Sector",
      source: "",
      last_interaction_date: "not-a-date",
    }),
    asOf,
  );
  assert.equal(result.decision, "review");
  assert.equal(result.review_required, true);
  assert.ok(result.validation_warnings.length >= 5);
  assert.equal(result.outreach_message, null);
});

test("stale engagement receives no recency points", () => {
  const result = scoreLead(lead({ last_interaction_date: "2023-08-30" }), asOf);
  assert.equal(result.factor_scores.engagement_recency, 0);
});

test("unmapped but present categories lose fit points without forcing a review override", () => {
  const result = scoreLead(
    lead({ industry: "Aerospace", source: "Partner event" }),
    asOf,
  );
  assert.equal(result.factor_scores.industry_fit, 0);
  assert.equal(result.factor_scores.source_intent, 0);
  assert.equal(result.validation_warnings.length, 2);
  assert.equal(result.review_required, result.decision === "review");
});
