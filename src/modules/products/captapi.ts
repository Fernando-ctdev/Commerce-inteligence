const CAPTAPI_URL = "https://api.captapi.com/v1/tiktok-shop/product-details";
const ALLOWED_HOSTS = new Set(["shop.tiktok.com", "www.tiktok.com"]);

export type CaptApiProduct = {
  name?: string;
  description?: string;
  category?: string;
  features: string[];
  price?: string;
  priceCurrency?: "R$" | "USD" | "EUR";
  imageRefs: string[];
  url: string;
  discountType?: "PERCENTAGE";
  discountValue?: string;
};

export type CaptApiCandidate = CaptApiProduct & {
  gaps: string[];
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
  const validProductPath = host === "shop.tiktok.com" || /^\/shop\/pdp\//i.test(url.pathname);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(host) || !validProductPath) {
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

function currency(value: unknown): CaptApiProduct["priceCurrency"] | null {
  if (value === "BRL") return "R$";
  return value === "R$" || value === "USD" || value === "EUR" ? value : null;
}

function mapProduct(payload: unknown, submittedUrl: string): CaptApiCandidate {
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
  const firstImage = Array.isArray(data?.images) ? nonEmpty(data.images[0]) : null;
  const images = firstImage ? [firstImage] : [];
  const gaps = [
    !name ? "name" : null,
    !description ? "description" : null,
    !category ? "category" : null,
    !price ? "price" : null,
    !priceCurrency ? "priceCurrency" : null,
    features.length === 0 ? "features" : null,
  ].filter((item): item is string => Boolean(item));
  return {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(category ? { category } : {}),
    features,
    ...(price ? { price } : {}),
    ...(priceCurrency ? { priceCurrency } : {}),
    imageRefs: images,
    url: submittedUrl,
    gaps,
    ...(discount ? { discountType: "PERCENTAGE", discountValue: discount[1] } : {}),
  };
}

export async function fetchCaptApiProduct(
  submittedUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CaptApiCandidate> {
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
    let raw: string;
    try {
      raw = await response.text();
    } catch {
      throw new CaptApiImportError("IMPORT-JSON-INVALID", "A resposta do provedor não pôde ser lida; preencha os dados manualmente.");
    }
    if (raw.length > 1_000_000) {
      throw new CaptApiImportError("IMPORT-RESPONSE-TOO-LARGE", "A resposta do provedor é grande demais; preencha os dados manualmente.");
    }
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
