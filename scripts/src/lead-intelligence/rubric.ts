import type {
  Decision,
  FactorScores,
  Lead,
  LeadResult,
  Priority,
} from "./types.js";

const CORE_INDUSTRIES = new Set([
  "analytics",
  "cybersecurity",
  "edtech",
  "fintech",
  "saas",
  "software",
  "technology",
]);

const ADJACENT_INDUSTRIES = new Set([
  "consulting",
  "finance",
  "healthcare",
  "logistics",
  "manufacturing",
  "telecom",
]);

const HIGH_INTENT_SOURCES = ["inbound demo request", "referral", "sales call"];
const MEDIUM_INTENT_SOURCES = ["linkedin outreach", "webinar attendee"];
const KNOWN_NEUTRAL_SOURCES = ["content download"];

function validIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function normalizeIndustry(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function fallbackOutreach(lead: Lead): string {
  const firstName = lead.name.trim().split(/\s+/)[0] || "there";
  const company = lead.company.trim() || "your team";
  const industry = lead.industry.trim();
  const context = industry ? `your work in ${industry}` : "your team’s work";
  return `Hi ${firstName}, I noticed ${company} and ${context}. Would a short conversation about how we support teams like yours be useful?`;
}

export function scoreLead(lead: Lead, asOf: Date): LeadResult {
  const warnings: string[] = [];
  const factors: FactorScores = {
    company_size_fit: 0,
    industry_fit: 0,
    source_intent: 0,
    engagement_recency: 0,
    data_confidence: 0,
  };

  const sizeText = lead.company_size.trim();
  const size = /^\d+$/.test(sizeText) ? Number(sizeText) : null;
  if (sizeText && size === null) warnings.push("Company size is not a whole number.");
  if (size !== null) {
    factors.company_size_fit =
      size >= 11 && size <= 500 ? 3 : size >= 501 && size <= 5000 ? 2 : 1;
  } else {
    warnings.push("Company size is missing or unknown.");
  }

  const industry = normalizeIndustry(lead.industry);
  if (CORE_INDUSTRIES.has(industry)) factors.industry_fit = 2;
  else if (ADJACENT_INDUSTRIES.has(industry)) factors.industry_fit = 1;
  else {
    warnings.push(
      industry ? `Industry "${lead.industry}" is not mapped in the rubric.` : "Industry is missing.",
    );
  }

  const source = lead.source.trim().toLowerCase();
  if (HIGH_INTENT_SOURCES.includes(source)) factors.source_intent = 2;
  else if (MEDIUM_INTENT_SOURCES.includes(source)) factors.source_intent = 1;
  else if (!KNOWN_NEUTRAL_SOURCES.includes(source)) {
    warnings.push(source ? `Source "${lead.source}" is not mapped in the rubric.` : "Source is missing.");
  }

  const interactionDate = validIsoDate(lead.last_interaction_date.trim());
  if (!interactionDate) {
    warnings.push(
      lead.last_interaction_date.trim()
        ? "Interaction date is invalid; use YYYY-MM-DD."
        : "Interaction date is missing.",
    );
  } else {
    const ageDays = Math.floor((asOf.valueOf() - interactionDate.valueOf()) / 86_400_000);
    if (ageDays < 0) warnings.push("Interaction date is in the future.");
    else if (ageDays <= 30) factors.engagement_recency = 2;
    else if (ageDays <= 90) factors.engagement_recency = 1;
  }

  const hasCompleteData =
    Boolean(lead.name.trim()) &&
    Boolean(lead.company.trim()) &&
    size !== null &&
    Boolean(lead.industry.trim()) &&
    Boolean(lead.source.trim()) &&
    interactionDate !== null &&
    interactionDate.valueOf() <= asOf.valueOf();
  if (hasCompleteData) factors.data_confidence = 1;
  if (!lead.name.trim()) warnings.push("Contact name is missing.");
  if (!lead.company.trim()) warnings.push("Company name is missing.");

  const score = Object.values(factors).reduce((sum, value) => sum + value, 0);
  const criticalMissingData =
    !lead.name.trim() ||
    !lead.company.trim() ||
    size === null ||
    !lead.industry.trim() ||
    !lead.source.trim() ||
    interactionDate === null ||
    interactionDate.valueOf() > asOf.valueOf();
  const decision: Decision = criticalMissingData
    ? "review"
    : score >= 7
      ? "qualified"
      : score <= 3
        ? "rejected"
        : "review";
  const reviewRequired = decision === "review";
  const priority: Priority =
    decision === "rejected"
      ? "low"
      : decision === "review"
        ? "medium"
        : score >= 8
          ? "high"
          : "medium";

  const reasoning = [
    `Company size fit: ${factors.company_size_fit}/3.`,
    `Industry fit: ${factors.industry_fit}/2.`,
    `Source intent: ${factors.source_intent}/2.`,
    `Engagement recency: ${factors.engagement_recency}/2.`,
    `Data confidence: ${factors.data_confidence}/1.`,
    ...(warnings.length ? warnings.map((warning) => `Review: ${warning}`) : []),
    `Total ${score}/10; ${decision} under rubric thresholds.`,
  ];

  return {
    ...lead,
    score,
    decision,
    priority,
    priority_rank: null,
    factor_scores: factors,
    reasoning,
    review_required: reviewRequired,
    validation_warnings: warnings,
    ai_reasoning: null,
    ai_status: "not_requested",
    outreach_message: decision === "qualified" ? fallbackOutreach(lead) : null,
  };
}
