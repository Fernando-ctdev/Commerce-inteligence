const CAPTAPI_URL = "https://api.captapi.com/v1/tiktok-shop/product-details";
const ALLOWED_HOSTS = new Set(["shop.tiktok.com", "www.tiktok.com"]);
const MAX_RESPONSE_BYTES = 1_000_000;

export type CandidateGap =
  | "name"
  | "description"
  | "category"
  | "price"
  | "priceCurrency"
  | "features";

export type ProductSignals = {
  salesCount?: number;
  ratingValue?: number;
  reviewCount?: number;
};

export type ProductCandidate = {
  name?: string;
  description?: string;
  category?: string;
  features: string[];
  price?: string;
  priceCurrency?: "R$" | "USD" | "EUR";
  imageRefs: string[];
  sourceUrl: string;
  discountType?: "PERCENTAGE";
  discountValue?: string;
  gaps: CandidateGap[];
  signals?: ProductSignals;
};

export class CaptApiImportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CaptApiImportError";
  }
}

export function validateTikTokShopUrl(value: unknown): URL {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CaptApiImportError("IMPORT-URL-INVALID", "Cole uma URL pública do TikTok Shop válida.");
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new CaptApiImportError("IMPORT-URL-INVALID", "Cole uma URL pública do TikTok Shop válida.");
  }
  const host = url.hostname.toLowerCase();
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const numericId = /^\d+$/.test(pathSegments[pathSegments.length - 1] ?? "");
  const validViewPath = host === "shop.tiktok.com" &&
    pathSegments.length === 3 &&
    pathSegments[0] === "view" &&
    pathSegments[1] === "product" &&
    numericId;
  const validLocalePdpPath = pathSegments.length === 4 &&
    /^[a-z]{2}$/i.test(pathSegments[0] ?? "") &&
    pathSegments[1]?.toLowerCase() === "pdp" &&
    Boolean(pathSegments[2]) &&
    numericId;
  const validProductPath = validViewPath || validLocalePdpPath;
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(host) || url.username || url.password || !validProductPath) {
    throw new CaptApiImportError("IMPORT-URL-INVALID", "Use uma URL https pública do TikTok Shop.");
  }
  return url;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function currency(value: unknown): ProductCandidate["priceCurrency"] | null {
  if (value === "BRL") return "R$";
  return value === "R$" || value === "USD" || value === "EUR" ? value : null;
}

function validSignal(value: unknown, minimum: number, maximum: number, integer = false): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) return null;
  return integer && !Number.isInteger(value) ? null : value;
}

function firstHttpImage(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const image = nonEmpty(value[0]);
  if (!image) return null;
  try {
    const parsed = new URL(image);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? image : null;
  } catch {
    return null;
  }
}

async function readResponseBody(response: Response, controller: AbortController): Promise<string> {
  if (!response.body) {
    throw new CaptApiImportError("IMPORT-JSON-INVALID", "A resposta do provedor não pôde ser lida; preencha os dados manualmente.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        controller.abort();
        await reader.cancel();
        throw new CaptApiImportError("IMPORT-RESPONSE-TOO-LARGE", "A resposta do provedor é grande demais; preencha os dados manualmente.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof CaptApiImportError) throw error;
    throw new CaptApiImportError("IMPORT-JSON-INVALID", "A resposta do provedor não pôde ser lida; preencha os dados manualmente.");
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function mapProduct(payload: unknown, submittedUrl: string): ProductCandidate {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  if (asRecord(root)?.success !== true || !data) {
    throw new CaptApiImportError("IMPORT-SHAPE-INCOMPLETE", "A resposta da CaptAPI não contém dados utilizáveis do produto.");
  }
  const name = nonEmpty(data?.title);
  const description = nonEmpty(data?.description);
  const price = typeof data?.price === "number" && Number.isFinite(data.price) && data.price >= 0
    ? String(data.price)
    : null;
  const priceCurrency = currency(data?.currency);
  const categories = Array.isArray(data?.categories)
    ? data.categories.map((item) => nonEmpty(asRecord(item)?.name)).filter((item): item is string => Boolean(item))
    : [];
  const saleProperties = Array.isArray(data?.saleProperties)
    ? data.saleProperties.flatMap((item) => {
        const record = asRecord(item);
        return Array.isArray(record?.values)
          ? record.values.map((value) => nonEmpty(asRecord(value)?.name)).filter((value): value is string => Boolean(value))
          : [];
      })
    : [];
  const category = categories[0] ?? null;
  const features = [...new Set([...saleProperties, ...categories])].slice(0, 30);
  const discount = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(nonEmpty(data?.discount) ?? "");
  if (discount && Number(discount[1]) > 100) {
    throw new CaptApiImportError("IMPORT-SHAPE-INCOMPLETE", "A resposta da CaptAPI contém um desconto inválido.");
  }
  const firstImage = firstHttpImage(data?.images);
  const images = firstImage ? [firstImage] : [];
  const salesCount = validSignal(data?.salesCount, 0, Number.MAX_SAFE_INTEGER, true);
  const ratingValue = validSignal(data?.ratingValue, 0, 5);
  const reviewCount = validSignal(data?.reviewCount, 0, Number.MAX_SAFE_INTEGER, true);
  const signals = {
    ...(salesCount === null ? {} : { salesCount }),
    ...(ratingValue === null ? {} : { ratingValue }),
    ...(reviewCount === null ? {} : { reviewCount }),
  } satisfies ProductSignals;
  const gaps = [
    !name ? "name" : null,
    !description ? "description" : null,
    !category ? "category" : null,
    price === null ? "price" : null,
    !priceCurrency ? "priceCurrency" : null,
    features.length === 0 ? "features" : null,
  ].filter((item): item is CandidateGap => Boolean(item));
  return {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(category ? { category } : {}),
    features,
    ...(price === null ? {} : { price }),
    ...(priceCurrency ? { priceCurrency } : {}),
    imageRefs: images,
    sourceUrl: submittedUrl,
    gaps,
    ...(discount ? { discountType: "PERCENTAGE", discountValue: discount[1] } : {}),
    ...(Object.keys(signals).length > 0 ? { signals } : {}),
  };
}

export async function fetchCaptApiProduct(
  submittedUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProductCandidate> {
  const url = validateTikTokShopUrl(submittedUrl);
  const apiKey = process.env.CAPTAPI_API_KEY?.trim();
  if (!apiKey) throw new CaptApiImportError("IMPORT-CONFIG-MISSING", "A importação automática está indisponível; preencha os dados manualmente.");
  const endpoint = new URL(CAPTAPI_URL);
  endpoint.searchParams.set("url", url.toString());
  endpoint.searchParams.set("region", "BR");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new CaptApiImportError("IMPORT-PROVIDER-ERROR", "Não foi possível consultar o produto agora; você pode preencher os dados manualmente.");
    }
    let body: unknown;
    const raw = await readResponseBody(response, controller);
    try {
      body = JSON.parse(raw);
    } catch {
      throw new CaptApiImportError("IMPORT-JSON-INVALID", "A resposta do provedor não pôde ser lida; preencha os dados manualmente.");
    }
    if (asRecord(body)?.success !== true) {
      throw new CaptApiImportError("IMPORT-PROVIDER-ERROR", "A CaptAPI não confirmou esse produto; preencha os dados manualmente.");
    }
    return mapProduct(body, url.toString());
  } catch (error) {
    if (error instanceof CaptApiImportError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new CaptApiImportError("IMPORT-TIMEOUT", "A consulta demorou demais; preencha os dados manualmente.");
    }
    throw new CaptApiImportError("IMPORT-NETWORK", "Não foi possível conectar ao provedor; preencha os dados manualmente.");
  } finally {
    clearTimeout(timeout);
  }
}
