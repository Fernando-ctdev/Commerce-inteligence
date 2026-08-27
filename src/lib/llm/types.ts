export const LLM_MODEL_TIERS = ["fast", "balanced", "quality"] as const;
export type LLMModelTier = (typeof LLM_MODEL_TIERS)[number];

export const CANDIDATE_FACT_FIELDS = [
  "name",
  "description",
  "category",
  "brand",
  "seller",
  "price",
  "features",
  "variants",
  "images",
] as const;
export type CandidateFactField = (typeof CANDIDATE_FACT_FIELDS)[number];

export type CandidateFactEvidence = {
  id: string;
  kind: "browser-observation";
  excerpt: string;
};

export type CandidateAssistInputV1 = {
  contract_version: "1";
  source_url: string;
  candidate_version: number;
  facts: unknown;
  gaps: CandidateFactField[];
  evidence: CandidateFactEvidence[];
};

export type CandidateFactSuggestion = {
  field: CandidateFactField;
  value: unknown;
  operation: "normalize" | "complete";
  evidence_ids: string[];
};

export type CandidateAssistOutputV1 = {
  contract_version: "1";
  suggestions: CandidateFactSuggestion[];
  unresolved: CandidateFactField[];
};

export type CandidateAssistRequestV1 = {
  input: CandidateAssistInputV1;
  tier?: LLMModelTier;
  attempt_id: string;
  now?: Date;
};

export type CandidateAssistMetadata = {
  provider: "openai-compatible";
  model: string;
  requested_at: string;
  attempt_id: string;
  input_hash: string;
  status: "succeeded" | "failed";
};

export type CandidateAssistResult = {
  output: CandidateAssistOutputV1;
  metadata: CandidateAssistMetadata;
};

export type LLMCompletionRequest = {
  model: string;
  system_prompt: string;
  user_prompt: string;
};

/** The only provider port exposed to domain/application callers. */
export type LLMProvider = {
  complete(request: LLMCompletionRequest): Promise<string>;
};

export type CandidateAssistProvider = {
  assist(request: CandidateAssistRequestV1): Promise<CandidateAssistResult>;
};
