import type {
  ActiveAttempt,
  GapCode,
  ImportCandidate,
  ImportStatus,
  ImportView,
} from "./import-contracts";

// Máquina de estados do fluxo de importação (SPEC §Estados de UX relevantes; PLAN T23).
// Estado plano e intencional: toda transição é explícita e testada 1:1 com UX-AC1..3/6/7.

export const MAX_URL_LENGTH = 2048;
export const MAX_POLL_ERRORS = 3;

export const URL_REQUIRED_MESSAGE = "Cole a URL do produto.";
export const URL_TOO_LONG_MESSAGE = "A URL deve ter no máximo 2.048 caracteres.";

// Backoff curto de polling: primeira consulta imediata, depois 1s/2s/3s (teto). Sem ETA, sem percentual.
export function pollDelayMs(polls: number) {
  if (polls <= 0) return 0;
  return Math.min(polls * 1000, 3000);
}

export type ImportActionKind = "retry" | "new-analysis" | "manual" | "update" | "login";

export type ImportNotice = {
  message: string;
  actionKind?: ImportActionKind;
  actionLabel?: string;
};

export type ManualDraft = {
  name: string;
  description: string;
  category: string;
  brand: string;
  seller: string;
  price: string;
  features: string[];
  images: string[];
  quantity: string;
};

export function emptyManualDraft(initialQuantity: number): ManualDraft {
  return {
    name: "",
    description: "",
    category: "",
    brand: "",
    seller: "",
    price: "",
    features: [],
    images: [],
    quantity: String(initialQuantity),
  };
}

export type ImportFlowMode = "entry" | "hydrating" | "starting" | "analyzing" | "review" | "failed";

export type ImportFlowState = {
  screen: "url" | "manual";
  mode: ImportFlowMode;
  url: string;
  urlError?: string;
  notice?: ImportNotice;
  importId?: string;
  resumed: boolean;
  polls: number;
  pollErrors: number;
  candidate?: ImportCandidate;
  gaps: GapCode[];
  others: ActiveAttempt[];
  failed: ImportNotice;
  submittedUrl?: string;
  manual: ManualDraft;
  manualErrors: Record<string, string>;
  manualMessage?: string;
  manualSubmitting: boolean;
  confirming: boolean;
  confirmErrors: Record<string, string>;
  confirmMessage?: string;
};

export type ImportFlowEvent =
  | { type: "urlChanged"; url: string }
  | { type: "urlSubmitRequested" }
  | { type: "importStartFailed"; status: number; code?: string; message?: string }
  | { type: "importStarted"; importId: string; status: ImportStatus }
  | { type: "pollResolved"; view: ImportView }
  | { type: "pollFailed"; status: number; code?: string; message?: string }
  | { type: "hydrateStarted"; importId?: string }
  | { type: "hydrateResolved"; view: ImportView }
  | { type: "hydrateListResolved"; attempts: ActiveAttempt[] }
  | { type: "hydrateListFailed" }
  | { type: "switchAttempt"; importId: string }
  | { type: "manualToggled" }
  | { type: "manualDraftChanged"; draft: ManualDraft }
  | { type: "manualSubmitStarted" }
  | { type: "manualSubmitFailed"; status: number; code?: string; message?: string; fieldErrors?: Record<string, string> }
  | { type: "confirmRequested" }
  | { type: "confirmFailed"; status: number; code?: string; message?: string; fieldErrors?: Record<string, string> }
  | { type: "confirmed"; productId: string };

export function initialImportFlowState(initialImportId: string | undefined, initialQuantity: number): ImportFlowState {
  return {
    screen: "url",
    mode: initialImportId ? "hydrating" : "entry",
    url: "",
    resumed: false,
    polls: 0,
    pollErrors: 0,
    gaps: [],
    others: [],
    failed: { message: "" },
    manual: emptyManualDraft(initialQuantity),
    manualErrors: {},
    manualSubmitting: false,
    confirming: false,
    confirmErrors: {},
  };
}

// UX-AC6: cada status/código mapeado para mensagem pt-BR + ação seguinte.
// A mensagem do servidor (catálogo único) tem precedência; os textos locais são fallback da mesma família.
export function mapImportError(status: number, code?: string, serverMessage?: string): ImportNotice {
  const message = serverMessage?.trim();
  if (status === 400) {
    return { message: message || "Não foi possível analisar esta URL. Confira o endereço e tente de novo." };
  }
  if (status === 401) {
    return { message: message || "Sua sessão expirou. Entre novamente para continuar.", actionKind: "login", actionLabel: "Entrar" };
  }
  if (status === 403 && code === "ENTITLEMENT_MISCONFIGURED") {
    return { message: message || "A confirmação está temporariamente indisponível por configuração da plataforma. Tente novamente mais tarde." };
  }
  if (status === 403) {
    return { message: message || "Você atingiu o limite de produtos ativos do seu plano. Para confirmar, libere espaço em seus produtos." };
  }
  if (status === 404) {
    return {
      message: message || "Esta análise não está mais disponível. Inicie uma nova análise ou adicione o produto manualmente.",
      actionKind: "new-analysis",
      actionLabel: "Nova análise",
    };
  }
  if (status === 409 && code === "IMPORT_ALREADY_CONFIRMED") {
    return { message: message || "Este produto já foi confirmado.", actionKind: "new-analysis", actionLabel: "Nova análise" };
  }
  if (status === 409) {
    return { message: message || "Esta análise ainda não está pronta para confirmação.", actionKind: "update", actionLabel: "Atualizar" };
  }
  if (status === 429) {
    return {
      message: message || "Você já tem análises em andamento. Aguarde alguns instantes e tente de novo.",
      actionKind: "retry",
      actionLabel: "Tentar novamente",
    };
  }
  return { message: message || "Não foi possível conectar agora. Verifique sua conexão e tente de novo.", actionKind: "retry", actionLabel: "Tentar novamente" };
}

const EXTRACTION_FAILED_FALLBACK = "Não conseguimos analisar este produto agora. Tente novamente ou adicione o produto manualmente.";
const ALREADY_CONFIRMED_MESSAGE = "Este produto já foi confirmado.";

function noticeFromView(view: ImportView): ImportNotice {
  return {
    message: view.error?.message?.trim() || EXTRACTION_FAILED_FALLBACK,
    actionKind: "new-analysis",
    actionLabel: "Nova análise",
  };
}

// Destino de um GET (polling ou reidratação) a partir do status do attempt.
// `polls` não é tocado aqui: quem incrementa é o evento de polling; reidratação zera fora.
function applyView(state: ImportFlowState, view: ImportView, resumed: boolean): ImportFlowState {
  if (view.status === "CANDIDATE_READY" && view.candidate) {
    return {
      ...state,
      mode: "review",
      importId: view.importId,
      candidate: view.candidate,
      gaps: view.candidate.gaps ?? view.gaps ?? [],
      pollErrors: 0,
      resumed,
      notice: undefined,
    };
  }
  if (view.status === "QUEUED" || view.status === "EXTRACTING") {
    return {
      ...state,
      mode: "analyzing",
      importId: view.importId,
      submittedUrl: view.submittedUrl ?? state.submittedUrl,
      pollErrors: 0,
      resumed,
      notice: undefined,
    };
  }
  if (view.status === "CONFIRMED") {
    return {
      ...state,
      mode: "failed",
      importId: view.importId,
      failed: { message: ALREADY_CONFIRMED_MESSAGE, actionKind: "new-analysis", actionLabel: "Nova análise" },
      pollErrors: 0,
    };
  }
  // FAILED (ou CANDIDATE_READY sem candidate — indisponível) ⇒ falha recuperável com retry e fallback (UX-AC1/3).
  return {
    ...state,
    mode: "failed",
    importId: view.importId,
    submittedUrl: view.submittedUrl ?? state.submittedUrl,
    failed: noticeFromView(view),
    pollErrors: 0,
  };
}

export function reduceImportFlow(state: ImportFlowState, event: ImportFlowEvent): ImportFlowState {
  switch (event.type) {
    case "urlChanged":
      return { ...state, url: event.url, urlError: undefined, notice: undefined };
    case "urlSubmitRequested": {
      const url = state.url.trim();
      if (!url) return { ...state, urlError: URL_REQUIRED_MESSAGE };
      if (url.length > MAX_URL_LENGTH) return { ...state, urlError: URL_TOO_LONG_MESSAGE };
      return { ...state, url, urlError: undefined, notice: undefined, mode: "starting" };
    }
    case "importStartFailed": {
      const notice = mapImportError(event.status, event.code, event.message);
      if (event.status === 400) return { ...state, mode: "entry", urlError: notice.message };
      if (event.status === 429 || event.status === 401 || event.status === 403) {
        return { ...state, mode: "entry", notice };
      }
      return { ...state, mode: "failed", failed: notice };
    }
    case "importStarted":
      return { ...state, mode: "analyzing", importId: event.importId, polls: 0, pollErrors: 0, resumed: false, notice: undefined };
    case "pollResolved":
      return applyView({ ...state, polls: state.polls + 1 }, event.view, state.resumed);
    case "pollFailed": {
      const pollErrors = state.pollErrors + 1;
      if (pollErrors >= MAX_POLL_ERRORS) {
        return { ...state, mode: "failed", failed: mapImportError(event.status, event.code, event.message), pollErrors };
      }
      return { ...state, pollErrors };
    }
    case "hydrateStarted":
      return { ...state, mode: "hydrating", importId: event.importId, candidate: undefined, gaps: [], others: [], urlError: undefined, notice: undefined, failed: { message: "" }, polls: 0, pollErrors: 0 };
    case "hydrateResolved":
      return applyView({ ...state, polls: 0 }, event.view, true);
    case "hydrateListResolved": {
      const pending = event.attempts
        .filter((attempt) => attempt.status !== "CONFIRMED" && attempt.status !== "FAILED")
        .slice()
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 3);
      if (pending.length === 0) return { ...state, mode: "entry" };
      const [latest, ...others] = pending;
      const seeded: ImportFlowState = { ...state, mode: "entry", importId: latest.importId, others, notice: undefined };
      if (latest.status === "CANDIDATE_READY") {
        // Candidate do mais recente exige GET individual antes da revisão (mesmo caminho do deep-link).
        return { ...seeded, mode: "hydrating" };
      }
      return { ...seeded, mode: "analyzing", resumed: true, polls: 0, pollErrors: 0 };
    }
    case "hydrateListFailed":
      return { ...state, mode: "entry" };
    case "switchAttempt":
      return { ...state, mode: "hydrating", importId: event.importId, others: state.others.filter((attempt) => attempt.importId !== event.importId) };
    case "manualToggled":
      return { ...state, screen: state.screen === "url" ? "manual" : "url", manualMessage: undefined, manualErrors: {} };
    case "manualDraftChanged":
      return { ...state, manual: event.draft, manualMessage: undefined };
    case "manualSubmitStarted":
      return { ...state, manualSubmitting: true, manualMessage: undefined };
    case "manualSubmitFailed": {
      const notice = mapImportError(event.status, event.code, event.message);
      return {
        ...state,
        manualSubmitting: false,
        manualErrors: event.fieldErrors ?? {},
        manualMessage: notice.message,
      };
    }
    case "confirmRequested":
      return { ...state, confirming: true, confirmMessage: undefined };
    case "confirmFailed": {
      const notice = mapImportError(event.status, event.code, event.message);
      return {
        ...state,
        confirming: false,
        confirmErrors: event.fieldErrors ?? {},
        confirmMessage: notice.message,
      };
    }
    case "confirmed":
      return { ...state, confirming: false, confirmMessage: undefined, confirmErrors: {} };
  }
}
