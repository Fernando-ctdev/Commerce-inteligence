// Contratos públicos do Slice 002 — espelham docs/specs/slice-002/SPEC.md (§Contratos).
// Nenhuma causa interna (internalCauseCode, redirectChain, telemetria) cruza esta fronteira.

export type ImportStatus = "QUEUED" | "EXTRACTING" | "CANDIDATE_READY" | "CONFIRMED" | "FAILED";

export type GapCode =
  | "description"
  | "category"
  | "brand"
  | "price"
  | "features"
  | "variants"
  | "images"
  | "seller";

export type ImportPrice = { amount: number; currency: string };

export type ImportVariant = { name: string; value: string; price?: ImportPrice };

export type ImportCandidate = {
  name: string;
  description?: string;
  category?: string;
  brand?: string;
  price?: ImportPrice;
  features: string[];
  variants?: ImportVariant[];
  images: string[];
  seller?: string;
  submittedUrl: string;
  sourceUrl: string;
  gaps: GapCode[];
};

export type ImportView = {
  importId: string;
  status: ImportStatus;
  submittedUrl?: string;
  sourceUrl?: string;
  candidate?: ImportCandidate;
  gaps?: GapCode[];
  error?: { code?: string; message: string };
};

export type ActiveAttempt = {
  importId: string;
  status: "QUEUED" | "EXTRACTING" | "CANDIDATE_READY";
  createdAt: string;
  submittedUrlHostPath: string;
  candidateName?: string;
};

export type ImportFacts = {
  name?: string;
  description?: string;
  category?: string;
  brand?: string;
  price?: ImportPrice;
  features?: string[];
  variants?: ImportVariant[];
  images?: string[];
  seller?: string;
};

export type ConfirmImportBody = {
  source: "import";
  importId: string;
  facts?: ImportFacts;
  targetContentCount: number;
};

export type ConfirmManualBody = {
  source: "manual";
  name: string;
  description: string;
  facts?: ImportFacts;
  targetContentCount: number;
};

export type CreatedProduct = { productId: string };
