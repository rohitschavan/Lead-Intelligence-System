export type Decision = "qualified" | "review" | "rejected";
export type Priority = "high" | "medium" | "low";

export interface Lead {
  lead_id: string;
  name: string;
  company: string;
  company_size: string;
  industry: string;
  source: string;
  last_interaction_date: string;
}

export interface FactorScores {
  company_size_fit: number;
  industry_fit: number;
  source_intent: number;
  engagement_recency: number;
  data_confidence: number;
}

export interface LeadResult extends Lead {
  score: number;
  decision: Decision;
  priority: Priority;
  priority_rank: number | null;
  factor_scores: FactorScores;
  reasoning: string[];
  review_required: boolean;
  validation_warnings: string[];
  ai_reasoning: string | null;
  ai_status: "not_requested" | "generated" | "fallback";
  outreach_message: string | null;
}

export interface BatchStats {
  batches_attempted: number;
  batches_failed: number;
  retries: number;
  errors: string[];
}
