// Catálogo literal criativo — corpus versionado para testes, eval e benchmark
// (ADR-033 §7). NÃO integra a PlatformSkill do runtime ativo e não governa
// gates default; o runtime é a Skill única @1.3 com Creative System, e a
// baseline E6 é a ADR-029 fixada por commit. Fluxo
// load → validate → freeze → expose, fail-closed com GEN-SKILL.
import { GenerationError } from "./errors";
import catalogData from "../../../resources/system-knowledge/catalog/catalog.json";

export type CreativePattern = {
  id: string;
  type: "hook" | "cta";
  category: string;
  categoryScope: string;
  source: string;
  text: string;
};
type CreativeCatalogInput = { version: string; items: CreativePattern[] };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function validateCreativeCatalog(value: unknown): CreativeCatalogInput {
  if (!isRecord(value) || typeof value.version !== "string" || !value.version.trim() || !Array.isArray(value.items) || value.items.length === 0)
    throw new GenerationError<"GEN-SKILL">("GEN-SKILL", "Catalogo criativo invalido");
  const ids = new Set<string>();
  const items = value.items.map((item): CreativePattern => {
    if (!isRecord(item) || !["id", "category", "categoryScope", "source", "text"].every((key) => typeof item[key] === "string" && (item[key] as string).trim()) || (item.type !== "hook" && item.type !== "cta"))
      throw new GenerationError<"GEN-SKILL">("GEN-SKILL", "Catalogo criativo invalido");
    const pattern = item as CreativePattern;
    if (ids.has(pattern.id))
      throw new GenerationError<"GEN-SKILL">("GEN-SKILL", "Catalogo criativo invalido");
    ids.add(pattern.id);
    return { ...pattern };
  });
  return { version: value.version, items };
}

const catalog = validateCreativeCatalog(catalogData);
const catalogItems = catalog.items;
export const CREATIVE_CATALOG = deepFreeze({
  version: catalog.version,
  hooks: catalogItems.filter((item) => item.type === "hook"),
  ctas: catalogItems.filter((item) => item.type === "cta"),
});
