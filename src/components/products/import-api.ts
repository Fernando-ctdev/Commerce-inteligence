import type {
  ActiveAttempt,
  ConfirmImportBody,
  ConfirmManualBody,
  CreatedProduct,
  ImportStatus,
  ImportView,
} from "./import-contracts";

export type ImportFieldErrors = Record<string, string>;

export class ImportApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors: ImportFieldErrors;

  constructor(status: number, message: string, options?: { code?: string; fieldErrors?: ImportFieldErrors }) {
    super(message);
    this.name = "ImportApiError";
    this.status = status;
    this.code = options?.code;
    this.fieldErrors = options?.fieldErrors ?? {};
  }
}

const OFFLINE_MESSAGE = "Não foi possível conectar agora. Verifique sua conexão e tente de novo.";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function errorFromStatus(status: number) {
  if (status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (status === 404) return "Esta análise não está mais disponível.";
  if (status === 429) return "Você já tem análises em andamento. Aguarde alguns instantes e tente de novo.";
  return OFFLINE_MESSAGE;
}

// Corpos de erro aceitos: { error: { code, message }, errors? } (envelope do GET) ou { code, message, errors? }.
function throwApiError(status: number, data: unknown): never {
  const body = asRecord(data);
  const envelope = asRecord(body?.error) ?? body ?? {};
  const code = stringField(envelope, "code");
  const message =
    stringField(envelope, "message")?.trim() || stringField(body ?? {}, "message")?.trim() || errorFromStatus(status);
  const rawFields = asRecord(body?.errors) ?? asRecord(body?.fieldErrors) ?? {};
  const fieldErrors: ImportFieldErrors = {};
  for (const [field, value] of Object.entries(rawFields)) {
    if (typeof value === "string") fieldErrors[field] = value;
  }
  throw new ImportApiError(status, message, { code, fieldErrors });
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response | null = null;
  try {
    response = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ImportApiError(0, OFFLINE_MESSAGE);
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throwApiError(response.status, data);
  return data as T;
}

export async function startProductImport(url: string): Promise<{ importId: string; status: ImportStatus }> {
  return request<{ importId: string; status: ImportStatus }>("/api/product-imports", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export async function getProductImport(importId: string, signal?: AbortSignal): Promise<ImportView> {
  return request<ImportView>(`/api/product-imports/${encodeURIComponent(importId)}`, { signal });
}

export async function listActiveProductImports(signal?: AbortSignal): Promise<ActiveAttempt[]> {
  const data = await request<{ attempts?: ActiveAttempt[] }>("/api/product-imports?active=true", { signal });
  return Array.isArray(data.attempts) ? data.attempts : [];
}

export async function confirmProduct(body: ConfirmImportBody | ConfirmManualBody): Promise<CreatedProduct> {
  return request<CreatedProduct>("/api/products", { method: "POST", body: JSON.stringify(body) });
}
