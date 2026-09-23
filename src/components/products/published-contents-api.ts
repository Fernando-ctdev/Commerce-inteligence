// Loader cliente do read model de conteúdos publicados (Slice 013): GET
// autenticado por cookie, Product ID codificado no path e paginação numérica
// na query. O envelope 2xx é validado superficialmente; métricas e campos de
// negócio cruzam sem normalização — tipos vêm só do contrato compartilhado,
// sem runtime de servidor no bundle do cliente.
import type { LinkedContentsResponse } from "../../modules/products/published-content-contract";
import { ProductApiError } from "./product-api";

const NETWORK_MESSAGE = "Não foi possível carregar os conteúdos publicados agora.";

const object = (value: unknown) =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

/* Presença e tipo dos campos públicos do read model; conteúdo dos vídeos não
   é inspecionado nem projetado — chaves operacionais nunca existem no corpo
   2xx porque o handler só serializa o contrato. */
function linkedContentsOf(value: unknown): LinkedContentsResponse {
  const record = object(value);
  if (
    !record ||
    !Array.isArray(record.videos) ||
    typeof record.page !== "number" ||
    typeof record.pageSize !== "number" ||
    typeof record.total !== "number" ||
    typeof record.hasMore !== "boolean"
  ) {
    throw new ProductApiError({
      status: 0,
      message: "Resposta de conteúdos publicados inválida.",
    });
  }
  return value as LinkedContentsResponse;
}

export async function loadPublishedContents(
  productId: string,
  page = 1,
  pageSize = 20,
): Promise<LinkedContentsResponse> {
  let response: Response;
  try {
    response = await fetch(
      `/api/products/${encodeURIComponent(productId)}/linked-contents?page=${page}&pageSize=${pageSize}`,
      { credentials: "same-origin", headers: { Accept: "application/json" } },
    );
  } catch {
    throw new ProductApiError({ status: 0, message: NETWORK_MESSAGE });
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = object(body);
    throw new ProductApiError({
      status: response.status,
      message:
        typeof record?.error === "string" && record.error.trim()
          ? record.error
          : NETWORK_MESSAGE,
      code: typeof record?.code === "string" && record.code.trim() ? record.code : undefined,
    });
  }

  return linkedContentsOf(body);
}
