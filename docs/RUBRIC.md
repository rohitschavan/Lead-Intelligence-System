# Lead qualification rubric

The supplied data has no known qualification outcomes, so this rubric is a stated business assumption rather than a model trained on conversion results.

| Factor | Points | Rule |
|---|---:|---|
| Company size fit | 0–3 | 11–500 employees: 3; 501–5,000: 2; 1–10 or above 5,000: 1; missing or invalid: 0 |
| Industry fit | 0–2 | Core software/technology industries (SaaS, software, technology, analytics, cybersecurity, EdTech, FinTech): 2; adjacent (consulting, finance, healthcare, logistics, manufacturing, telecom): 1; other or unmapped: 0 |
| Source intent | 0–2 | Inbound demo request, referral, sales call: 2; LinkedIn outreach or webinar attendee: 1; content download: 0; unknown: 0 |
| Engagement recency | 0–2 | Last interaction within 30 days: 2; 31–90 days: 1; over 90 days: 0; missing, invalid, or future date: 0 and review |
| Data confidence | 0–1 | 1 only when name, company, numeric company size, industry, source, and a valid non-future date are present; otherwise 0 |

Decisions: 7–10 qualified, 4–6 review, and 0–3 rejected. Missing or invalid key fields override the score and send the lead to review. Unknown but present categories receive zero fit points; the score thresholds still apply. Priority is high for qualified leads scoring 8–10, medium for score 7 or review, and low for rejected leads. Qualified leads are ranked by score, with lead ID as the deterministic tie-breaker. The summary’s common rejection reasons count zero-point factors among rejected leads; they are contributing factors, not ground-truth explanations.

AI enrichment uses a batch request to an OpenAI-compatible chat endpoint (Ollama by default). The model can add a concise explanation and draft outreach for qualified leads, but cannot assign scores or change decisions. When enrichment fails, deterministic explanations and local fallback messages are retained.
