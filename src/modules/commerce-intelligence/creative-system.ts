// Creative System — fundação declarativa/versionada da PlatformSkill (ADR-033,
// decisões 3–9). Dados sem frases: primitives são unidades semânticas por
// dimensão fechada; recipes são constraint sets, nunca scripts. Fluxo
// load → validate → freeze → expose, fail-closed com códigos estáveis GEN-CS-*.
// Fundação apenas: nada aqui é lido pelo runtime ADR-029 e nenhuma escrita de
// creativeDirection é autorizada antes do cutover (ADR-033 decisão 8).
import rawCreativeSystem from "../../../resources/system-knowledge/tiktok-commerce/creative-system.json";
import { GenerationError } from "./errors";

export type CreativeSystemErrorCode =
  | "GEN-CS-VERSION"
  | "GEN-CS-SCHEMA"
  | "GEN-CS-REF"
  | "GEN-CS-COMPAT"
  | "GEN-CS-ELIGIBILITY";

export type CreativeDimension =
  | "attention"
  | "psychologicalEffect"
  | "format"
  | "narrativeMove"
  | "productRole";

// Constraint set criativo: combinação conhecidamente coerente de primitives
// (ADR-033 decisão 5). IDs referem-se às dimensões correspondentes.
export type CreativeRecipe = {
  id: string;
  attentionMechanisms: string[];
  psychologicalEffects: string[];
  formats: string[];
  narrativeMoves: string[];
  productRoles: string[];
};

// Decisão criativa concreta por conteúdo (ADR-033 decisão 7). Composição livre
// é a forma sem recipeId; recipe-backed exige coerência integral com a recipe.
export type CreativeBlueprint = {
  recipeId?: string;
  attentionMechanisms: string[];
  psychologicalEffects: string[];
  format: string;
  narrativeMoves: string[];
  productRole: string;
};

export type CreativeSystemData = {
  attentionMechanisms: string[];
  psychologicalEffects: string[];
  formats: string[];
  narrativeMoves: string[];
  productRoles: string[];
  recipes: CreativeRecipe[];
  // Compatibilidade explícita declarada como dado versionado (ADR-033 decisão 9):
  // para cada papel do produto, os formatos capazes de realizá-lo. Papel ausente
  // do mapa = nenhum formato compatível declarado (fail-closed na resolução).
  compatibility: { formatsByProductRole: Record<string, string[]> };
};

export type CreativeSystem = CreativeSystemData & { skillVersion: string };

type DimensionField = Exclude<keyof CreativeSystemData, "recipes" | "compatibility">;

// Lookup estático dimensão → campo de dados (enums fechados do ADR-033 decisão 4).
const FIELD_BY_DIMENSION: Record<CreativeDimension, DimensionField> = {
  attention: "attentionMechanisms",
  psychologicalEffect: "psychologicalEffects",
  format: "formats",
  narrativeMove: "narrativeMoves",
  productRole: "productRoles",
};

const DATA_FIELDS = Object.values(FIELD_BY_DIMENSION) as DimensionField[];

const csError = (code: CreativeSystemErrorCode, message: string): GenerationError<CreativeSystemErrorCode> =>
  new GenerationError<CreativeSystemErrorCode>(code, message);

// IDs únicos por dimensão; arrays não vazios; recipes com todas as dimensões
// preenchidas e referências resolvíveis. Sem coerção, sem valor padrão
// (ADR-033 decisão 9).
export function validateCreativeSystem(value: unknown): CreativeSystemData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw csError("GEN-CS-SCHEMA", "Creative System invalido");
  const record = value as Record<string, unknown>;
  const dimensionIds = new Map<DimensionField, string[]>();
  for (const field of DATA_FIELDS) {
    const ids = record[field];
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && id.trim()))
      throw csError("GEN-CS-SCHEMA", `Dimensao ${field} invalida`);
    if (new Set(ids).size !== ids.length) throw csError("GEN-CS-SCHEMA", `Dimensao ${field} duplicada`);
    dimensionIds.set(field, [...ids]);
  }
  if (!Array.isArray(record.recipes)) throw csError("GEN-CS-SCHEMA", "Recipes invalidas");
  const compatibility = record.compatibility;
  if (!compatibility || typeof compatibility !== "object" || Array.isArray(compatibility))
    throw csError("GEN-CS-SCHEMA", "Compatibilidade invalida");
  const formatsByProductRole = (compatibility as Record<string, unknown>).formatsByProductRole;
  if (!formatsByProductRole || typeof formatsByProductRole !== "object" || Array.isArray(formatsByProductRole))
    throw csError("GEN-CS-SCHEMA", "formatsByProductRole invalido");
  const roles = dimensionIds.get("productRoles")!;
  const formats = dimensionIds.get("formats")!;
  const validatedCompatibility: Record<string, string[]> = {};
  for (const [role, allowed] of Object.entries(formatsByProductRole)) {
    if (!roles.includes(role)) throw csError("GEN-CS-REF", `Papel ${role} inexistente na compatibilidade`);
    if (!Array.isArray(allowed) || allowed.length === 0 || !allowed.every((format) => typeof format === "string" && format.trim()))
      throw csError("GEN-CS-SCHEMA", `Formatos de ${role} invalidos`);
    for (const format of allowed)
      if (!formats.includes(format)) throw csError("GEN-CS-REF", `Formato ${format} inexistente na compatibilidade de ${role}`);
    validatedCompatibility[role] = [...allowed];
  }
  const recipeIds = new Set<string>();
  const recipes = record.recipes.map((entry): CreativeRecipe => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw csError("GEN-CS-SCHEMA", "Recipe invalida");
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== "string" || !raw.id.trim()) throw csError("GEN-CS-SCHEMA", "Recipe sem id");
    if (recipeIds.has(raw.id)) throw csError("GEN-CS-SCHEMA", `Recipe duplicada: ${raw.id}`);
    recipeIds.add(raw.id);
    const pick = (field: DimensionField): string[] => {
      const ids = raw[field];
      if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && id.trim()))
        throw csError("GEN-CS-SCHEMA", `Recipe ${raw.id}: dimensao ${field} invalida`);
      if (new Set(ids).size !== ids.length) throw csError("GEN-CS-SCHEMA", `Recipe ${raw.id}: ${field} duplicada`);
      for (const id of ids)
        if (!dimensionIds.get(field)!.includes(id))
          throw csError("GEN-CS-REF", `Recipe ${raw.id}: primitive ${id} inexistente em ${field}`);
      return [...ids];
    };
    return {
      id: raw.id,
      attentionMechanisms: pick("attentionMechanisms"),
      psychologicalEffects: pick("psychologicalEffects"),
      formats: pick("formats"),
      narrativeMoves: pick("narrativeMoves"),
      productRoles: pick("productRoles"),
    };
  });
  // Coerência recipe↔mapa: todo cruzamento formats×productRoles de cada recipe
  // deve estar declarado na compatibilidade — recipe-backed e free composition
  // nunca divergem sobre o mesmo par (ADR-033 decisões 5, 6 e 9).
  for (const recipe of recipes)
    for (const format of recipe.formats)
      for (const role of recipe.productRoles)
        if (!validatedCompatibility[role]?.includes(format))
          throw csError("GEN-CS-COMPAT", `Recipe ${recipe.id}: formato ${format} incompativel com o papel ${role}`);
  return {
    attentionMechanisms: dimensionIds.get("attentionMechanisms")!,
    psychologicalEffects: dimensionIds.get("psychologicalEffects")!,
    formats: dimensionIds.get("formats")!,
    narrativeMoves: dimensionIds.get("narrativeMoves")!,
    productRoles: roles,
    recipes,
    compatibility: { formatsByProductRole: validatedCompatibility },
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value))
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

// Registro por versão da Skill: o schema de compatibilidade herda a versão
// (ADR-033 decisão 9). Versões sem Creative System falham GEN-CS-VERSION —
// inclusive @1.2, preservado intacto como histórico e runtime ADR-029.
export const CREATIVE_SYSTEM_SKILL_VERSION = "tiktok-commerce@1.3";

const CREATIVE_SYSTEMS: Record<string, CreativeSystem> = {
  [CREATIVE_SYSTEM_SKILL_VERSION]: deepFreeze({
    skillVersion: CREATIVE_SYSTEM_SKILL_VERSION,
    ...validateCreativeSystem(rawCreativeSystem),
  }),
};

export function loadCreativeSystem(skillVersion: string): CreativeSystem {
  const system = CREATIVE_SYSTEMS[skillVersion];
  if (!system) throw csError("GEN-CS-VERSION", `Creative System indisponivel para ${skillVersion}`);
  return system;
}

export function recipeById(system: CreativeSystem, id: string): CreativeRecipe | undefined {
  return system.recipes.find((recipe) => recipe.id === id);
}

export function primitiveExists(system: CreativeSystem, dimension: CreativeDimension, id: string): boolean {
  return system[FIELD_BY_DIMENSION[dimension]].includes(id);
}

// Dedup estável preservando a primeira ocorrência (ADR-033 decisão 7);
// única normalização permitida — o resto é rejeição, nunca substituição.
const dedupStable = (ids: readonly string[]): string[] => [...new Set(ids)];

export function resolveBlueprint(system: CreativeSystem, value: unknown): CreativeBlueprint {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw csError("GEN-CS-SCHEMA", "Blueprint invalido");
  const record = value as Record<string, unknown>;
  const recipeId = record.recipeId === undefined ? undefined : record.recipeId;
  if (recipeId !== undefined && (typeof recipeId !== "string" || !recipeId.trim()))
    throw csError("GEN-CS-SCHEMA", "recipeId invalido");
  const idArray = (field: string): string[] => {
    const ids = record[field];
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && id.trim()))
      throw csError("GEN-CS-SCHEMA", `${field} invalido`);
    return ids;
  };
  const singleId = (field: string): string => {
    const id = record[field];
    if (typeof id !== "string" || !id.trim()) throw csError("GEN-CS-SCHEMA", `${field} invalido`);
    return id;
  };
  const attention = dedupStable(idArray("attentionMechanisms"));
  const effects = dedupStable(idArray("psychologicalEffects"));
  const moves = dedupStable(idArray("narrativeMoves"));
  const format = singleId("format");
  const productRole = singleId("productRole");
  const idsByDimension: Record<"attention" | "psychologicalEffect" | "narrativeMove", readonly string[]> = {
    attention,
    psychologicalEffect: effects,
    narrativeMove: moves,
  };
  for (const dimension of ["attention", "psychologicalEffect", "narrativeMove"] as const)
    for (const id of idsByDimension[dimension])
      if (!primitiveExists(system, dimension, id))
        throw csError("GEN-CS-REF", `Primitive ${id} inexistente em ${dimension}`);
  if (!primitiveExists(system, "format", format)) throw csError("GEN-CS-REF", `Format ${format} inexistente`);
  if (!primitiveExists(system, "productRole", productRole))
    throw csError("GEN-CS-REF", `Product role ${productRole} inexistente`);
  if (recipeId !== undefined) {
    const recipe = recipeById(system, recipeId);
    if (!recipe) throw csError("GEN-CS-REF", `Recipe ${recipeId} inexistente`);
    const within = (ids: readonly string[], allowed: readonly string[]): boolean => ids.every((id) => allowed.includes(id));
    if (!within(attention, recipe.attentionMechanisms) || !within(effects, recipe.psychologicalEffects))
      throw csError("GEN-CS-COMPAT", `Blueprint incompativel com a recipe ${recipeId}`);
    if (!recipe.formats.includes(format) || !recipe.productRoles.includes(productRole))
      throw csError("GEN-CS-COMPAT", `Blueprint incompativel com a recipe ${recipeId}`);
    // A espinha narrativa é a sequência exata da recipe; o código jamais reordena.
    if (moves.length !== recipe.narrativeMoves.length || moves.some((move, index) => move !== recipe.narrativeMoves[index]))
      throw csError("GEN-CS-COMPAT", `narrativeMoves divergem da recipe ${recipeId}`);
  } else if (!system.compatibility.formatsByProductRole[productRole]?.includes(format)) {
    // Composição livre: válida somente com o par formato×papel declarado na
    // compatibilidade versionada (ADR-033 decisões 6 e 9) — enum válido não é
    // compatibilidade. Ausência de entrada = nada compatível declarado. A
    // coerenência recipe-backed permanece sendo o constraint set da própria
    // recipe. Sem coerção e sem fallback.
    throw csError("GEN-CS-COMPAT", `Formato ${format} incompativel com o papel ${productRole}`);
  }
  return {
    ...(recipeId === undefined ? {} : { recipeId }),
    attentionMechanisms: attention,
    psychologicalEffects: effects,
    format,
    narrativeMoves: moves,
    productRole,
  };
}

// Elegibilidade mínima declarável na fundação: o formato precisa pertencer ao
// allowlist derivado de evidência/creator (ADR-033 decisões 7 e 9). Sem fallback.
export function assertEligibleFormat(
  system: CreativeSystem,
  blueprint: CreativeBlueprint,
  allowedFormats: ReadonlySet<string>,
): void {
  if (!allowedFormats.has(blueprint.format))
    throw csError("GEN-CS-ELIGIBILITY", `Format ${blueprint.format} nao elegivel`);
}
