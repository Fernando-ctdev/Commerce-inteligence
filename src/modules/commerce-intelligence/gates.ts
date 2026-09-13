import {
  normalizeForVariety,
  structureHash,
  validateContentBrief,
  type ContentBriefVersion,
  type EvidenceSnapshot,
  type FactStatus,
} from "./contract";
import { CREATIVE_CATALOG, TIKTOK_COMMERCE_SKILL } from "./platform-skill";
import { ContractError } from "./contract";

export type GateReport = {
  briefId: string;
  factualStatus: FactStatus;
  claimType: "objetivo" | "subjetivo";
  evidenceRefs: string[];
  structuralStatus: "PASS" | "FAIL";
  platformStatus: "PASS" | "FAIL";
  varietyStatus: "PASS" | "FAIL";
  issues: string[];
  decision: "PASS" | "REPAIR" | "REJECT";
};

// Critério determinístico aprovado pelo Arquiteto: claims são tipados (objetivo/mensurável
// versus estratégico/subjetivo). Claim objetivo exige valor+unidade compatível com o catálogo
// estruturado de fatos; sem similaridade semântica, embeddings ou LLM-as-judge (ADR-004).
const UNIT_CANON: Record<string, string> = {
  horas: "h",
  hora: "h",
  h: "h",
  minutos: "min",
  minuto: "min",
  min: "min",
  segundos: "s",
  segundo: "s",
  s: "s",
  dias: "dia",
  dia: "dia",
  meses: "mes",
  mes: "mes",
  mês: "mes",
  anos: "ano",
  ano: "ano",
  litros: "l",
  litro: "l",
  l: "l",
  ml: "ml",
  cl: "cl",
  kg: "kg",
  g: "g",
  mg: "mg",
  t: "t",
  cm: "cm",
  mm: "mm",
  km: "km",
  m: "m",
  pol: "pol",
  polegada: "pol",
  polegadas: "pol",
  gb: "gb",
  tb: "tb",
  mb: "mb",
  hz: "hz",
  ghz: "ghz",
  w: "w",
  kw: "kw",
  kwh: "kwh",
  va: "va",
  wh: "wh",
  mah: "mah",
  ah: "ah",
  db: "db",
  lm: "lm",
  "°c": "c",
  c: "c",
  "%": "pct",
  "por cento": "pct",
  reais: "R$",
  real: "R$",
  R$: "R$",
  usd: "usd",
  peças: "pc",
  pecas: "pc",
  unidades: "un",
  unidade: "un",
  un: "un",
  pessoas: "pessoa",
  pessoa: "pessoa",
  x: "x",
};
const TOKEN_RE =
  /(?:r\$\s*)?(\d[\d.,]*)\s*(mah|ah|wh|kwh|kw|va|w|ml|cl|l|kg|mg|g|t|cm|mm|km|m|polegadas|polegada|pol|gb|tb|mb|ghz|hz|db|lm|°c|c|horas|hora|minutos|minuto|segundos|segundo|dias|dia|meses|mês|anos|ano|litros|litro|peças|unidades|unidade|pessoas|pessoa|por cento|%|reais|real|R$|usd|x)(?![a-zà-ú])/gi;
function normValue(raw: string): string {
  let s = raw;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  return s.replace(/\.0+$/, "").replace(/^0+(?=\d)/, "");
}
function techTokens(
  text: string,
): Array<{ value: string; unit: string; raw: string }> {
  const out: Array<{ value: string; unit: string; raw: string }> = [];
  for (const match of text.matchAll(TOKEN_RE)) {
    const unit = UNIT_CANON[match[2].toLowerCase()] ?? match[2].toLowerCase();
    out.push({
      value: normValue(match[1]),
      unit,
      raw: `${normValue(match[1])} ${unit}`,
    });
  }
  return out;
}
type FactAssessment = {
  status: FactStatus;
  claimType: "objetivo" | "subjetivo";
  causes: string[];
  evidenceRefs: string[];
};
// P0-3: catálogo determinístico ampliado — além de valor+unidade, atributos objetivos
// não numéricos de um léxico fechado. Claim objetivo com atributo só é SUPPORTED se um
// fato autorizado contiver o radical do atributo (evidenceRef indexado do próprio fato);
// negação contra fato presente é CONTRADICTED; atributo ausente do catálogo é
// UNSUPPORTED. Sem embeddings, sem similaridade semântica ampla, sem LLM-as-judge (ADR-004).
const ATTRIBUTE_LEXICON: string[][] = [
  ["magnetic"],
  ["compact"],
  ["dobrave", "dobravo"],
  ["a prova d agua", "impermeave"],
  ["recarregave"],
  ["ajustave", "regulave"],
  ["antiderrapante", "antideslizante"],
  ["silencioso", "silenciosa"],
  ["portatil"],
  ["usb"],
  ["sem fio"],
  ["alumini"],
  ["fibra de carbono"],
  ["aco inox"],
  ["couro legítimo", "couro legitimo"],
  ["policarbonato"],
  ["temperado"],
  ["respiravel", "respirabilidade", "ar circular", "circulacao de ar"],
  ["garantia vitalicia", "garantia para toda vida", "garantia por toda vida"],
  ["protecao", "proteg"],
];
// Conceitos distintos e polaridade local evitam que "respirável" prove "não esquenta"
// e que um fato afirmativo sobre capacidade prove sua negação.
const OBSERVED_THERMAL_CONCEPTS = [
  { id: "ventilação", phrase: /\b(respiravel|ventila(r|cao)?|circulacao de ar)\b/ },
  { id: "passagem de calor", phrase: /\bpass(a|ar) calor\b/ },
  { id: "aquecimento", phrase: /\b(esquent(a|ar)|aquec(e|er))\b/ },
  { id: "frescor", phrase: /\b(mantem (o corpo )?fresco|fresco)\b/ },
  { id: "abafamento", phrase: /\babaf(a|ar)\b/ },
];
const POCKET_CAPACITY = /\b(cabe|cabem|acomoda|comporta|guarda|armazena)\s+(?:(qualquer|todo|toda|todos|todas)\s+)?(?:(um|uma|o|a)\s+)?(celular|telefone|smartphone|chaves)\b/g;
const DEVELOPMENT_COMMUNICATION_ACTION = /^\s*(?:mostr|coment|compar|prov|demonstr|destaqu|destac|fal|expli|abrac|apresent|test|vest|peg|segur|abri|reforc)\w*/;
const DEVELOPMENT_RATIONALE = /\b(para|porque|pois|assim)\b/;
const DEVELOPMENT_EXPERIENCE_RATIONALE = /\bque voce (sente|percebe|nota) com\b/;
const DEVELOPMENT_SHOT_LIST = /\b(close|plano|enquadramento|camera|filme|grave|trip[eé]|iluminacao|take|tomada)\b/;
const UNSUPPORTED_ABSOLUTE_CLAIMS = /\b(sempre|nunca|jamais|qualquer|perfeit[oa]s?|sem falha|sem defeito)\b/i;
const SOLO_PRODUCTION_ANTIPATTERNS = /\b(360\s*graus|órbita|orbita|orbit|travelling|motion\s*graphics|animação|animacao|vfx|efeitos especiais|chroma\s*key|croma|green\s*screen|drone|operador de câmera|operador de camera|segunda câmera|segunda camera|montagem (rápida|complexa)|montagem (rapida|complexa)|múltiplas locações|multiplas locacoes|múltiplos setups|multiplos setups|estúdio montado|câmera gira|camera gira|câmera começa a orbitar|camera comeca a orbitar)\b/i;
const DRONE_PRODUCTION = /\bdrone\b/i;
const CREW_OR_POST_PRODUCTION_ANTIPATTERNS = /\b(motion\s*graphics|animação|animacao|vfx|efeitos especiais|chroma\s*key|croma|green\s*screen|operador de câmera|operador de camera|segunda câmera|segunda camera|montagem (rápida|complexa)|montagem (rapida|complexa)|múltiplas locações|multiplas locacoes|múltiplos setups|multiplos setups|estúdio montado)\b/i;
const CAMERA_MOVEMENT_ANTIPATTERNS = /\b(360\s*graus|órbita|orbita|orbit|travelling|câmera gira|camera gira|câmera começa a orbitar|camera comeca a orbitar)\b/i;
const MOTION_EQUIPMENT = /\b(drone|gimbal|estabilizador)\b/i;
function attrStems(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function detectAttributes(text: string): number[] {
  const folded = attrStems(text.toLowerCase());
  const hits: number[] = [];
  ATTRIBUTE_LEXICON.forEach((group, index) => {
    if (group.some((stem) => folded.includes(stem))) hits.push(index);
  });
  return hits;
}
function polarityAt(text: string, index: number): boolean {
  return !/\b(nao|nunca|jamais|sem)\b(?:\s+\w+){0,2}\s*$/.test(text.slice(Math.max(0, index - 32), index));
}
function observedMatches(text: string, pattern: RegExp): Array<{ polarity: boolean; index: number }> {
  return [...text.matchAll(new RegExp(pattern.source, "g"))].map((match) => ({
    polarity: polarityAt(text, match.index ?? 0),
    index: match.index ?? 0,
  }));
}
function capacityMatches(text: string): Array<{ item: string; polarity: boolean; universal: boolean }> {
  return [...text.matchAll(new RegExp(POCKET_CAPACITY.source, "g"))].map((match) => ({
    item: ["celular", "telefone", "smartphone"].includes(match[4]) ? "telefone" : match[4],
    polarity: polarityAt(text, match.index ?? 0),
    universal: Boolean(match[2]),
  }));
}
function classifyFactual(
  brief: ContentBriefVersion,
  evidence: EvidenceSnapshot,
): FactAssessment {
  const scriptHasAbsolute = UNSUPPORTED_ABSOLUTE_CLAIMS.test(brief.script);
  const absoluteHasEvidenceAndBullet = evidence.facts.some((fact, index) => {
    if (evidence.refs[index] === "product:name") return false;
    const normalizedFact = normalizeForVariety(fact);
    return UNSUPPORTED_ABSOLUTE_CLAIMS.test(normalizedFact) && normalizeForVariety(brief.script).includes(normalizedFact) &&
      brief.development.some((point) => normalizeForVariety(point).includes(normalizedFact));
  });
  if (scriptHasAbsolute && !absoluteHasEvidenceAndBullet)
    return { status: "UNSUPPORTED", claimType: "objetivo", causes: ["claim absoluto sem evidência autorizada"], evidenceRefs: [] };
  const text = normalizeForVariety(
    [
      brief.hook,
      brief.script,
      // Enforcement factual do development canônico: bullets passam pelo mesmo
      // controle de fatos autorizados que o script (decisão do Arquiteto).
      ...(brief.development ?? []),
      brief.benefit ?? "",
      brief.pain ?? "",
      brief.desire ?? "",
      brief.cta,
    ].join(" "),
  );
  // Regressão b0d4b7a6: negação só contradiz quando imediatamente antes OU depois de uma
  // OCORRÊNCIA do fato ("não r$ 28,90" / "produto nunca funciona"); um "não" em outra
  // frase não nega evidência distante. Busca por ocorrência sobre texto com acentos dobrados.
  const foldedClaim = attrStems(text);
  const negationAdjacent = (needle: string): boolean => {
    const target = attrStems(needle.toLowerCase());
    if (!target) return false;
    let index = foldedClaim.indexOf(target);
    while (index >= 0) {
      const before = foldedClaim.slice(Math.max(0, index - 12), index);
      const after = foldedClaim.slice(index + target.length, index + target.length + 12);
      if (/(não|nao|nunca|jamais)\s$/.test(before) || /^\s(não|nao|nunca|jamais)(\s|$)/.test(after))
        return true;
      index = foldedClaim.indexOf(target, index + 1);
    }
    return false;
  };
  const factValues = new Map<string, Set<string>>();
  for (const [index, fact] of evidence.facts.entries()) {
    if (evidence.refs[index] === "product:name") continue;
    for (const token of techTokens(fact)) {
      if (!factValues.has(token.unit)) factValues.set(token.unit, new Set());
      factValues.get(token.unit)!.add(token.value);
    }
  }
  const mentions = evidence.facts
    .map((fact, index) => ({ fact: normalizeForVariety(fact), index }))
    .filter(({ fact, index }) => fact.length > 0 && evidence.refs[index] !== "product:name");
  const refFor = (factIndex: number): string =>
    evidence.refs[factIndex] ?? `fact:${factIndex + 1}`;
  const foldedText = attrStems(text);
  const foldedFacts = evidence.facts
    .map((fact, index) => ({ fact: attrStems(normalizeForVariety(fact)), index }))
    .filter(({ index }) => evidence.refs[index] !== "product:name");
  const claimFields = [
    brief.hook,
    brief.script,
    ...(brief.development ?? []),
    brief.benefit ?? "",
    brief.pain ?? "",
    brief.desire ?? "",
    brief.cta,
  ].map((field) => attrStems(normalizeForVariety(field)));
  const observedGroundingRefs: string[] = [];
  const observedIssues: string[] = [];
  let observedContradiction = false;
  for (const concept of OBSERVED_THERMAL_CONCEPTS) {
    const claims = claimFields.flatMap((field) => observedMatches(field, concept.phrase));
    if (!claims.length) continue;
    const facts = foldedFacts.flatMap(({ fact, index }) =>
      observedMatches(fact, concept.phrase).map((match) => ({ ...match, index })),
    );
    for (const claim of claims) {
      const samePolarity = facts.filter((fact) => fact.polarity === claim.polarity);
      if (samePolarity.length) observedGroundingRefs.push(...samePolarity.map(({ index }) => refFor(index)));
      else if (facts.length) {
        observedContradiction = true;
        observedIssues.push(`claim térmica de ${concept.id} contradiz a evidência`);
      } else observedIssues.push(`claim térmica de ${concept.id} sem evidência autorizada`);
    }
  }
  const capacityClaims = claimFields.flatMap((field) => capacityMatches(field));
  for (const claim of capacityClaims) {
    const facts = foldedFacts.flatMap(({ fact, index }) =>
      capacityMatches(fact)
        .filter((candidate) => candidate.item === claim.item && (!claim.universal || candidate.universal))
        .map((candidate) => ({ ...candidate, index })),
    );
    const samePolarity = facts.filter((fact) => fact.polarity === claim.polarity);
    if (samePolarity.length) observedGroundingRefs.push(...samePolarity.map(({ index }) => refFor(index)));
    else if (facts.length) {
      observedContradiction = true;
      observedIssues.push(`claim de capacidade do bolso contradiz a evidência`);
    } else observedIssues.push("claim de capacidade do bolso sem evidência autorizada");
  }
  if (observedContradiction)
    return { status: "CONTRADICTED", claimType: "objetivo", causes: observedIssues, evidenceRefs: [] };
  if (observedIssues.length)
    return { status: "UNSUPPORTED", claimType: "objetivo", causes: observedIssues, evidenceRefs: [] };
  const claimTokens = techTokens(text);
  if (claimTokens.length > 0) {
    const causes: string[] = [];
    let contradicted = false;
    let unsupported = false;
    const refs: string[] = [];
    for (const token of claimTokens) {
      const values = factValues.get(token.unit);
      if (values?.has(token.value)) {
        evidence.facts.forEach((fact, index) => {
          if (
            techTokens(fact).some(
              (candidate) =>
                candidate.unit === token.unit &&
                candidate.value === token.value,
            )
          )
            refs.push(refFor(index));
        });
        continue;
      }
      if (values) {
        contradicted = true;
        causes.push(
          `claim objetivo "${token.raw}" conflita com valor autorizado (${[...values].join("|")} ${token.unit})`,
        );
      } else {
        unsupported = true;
        causes.push(`claim objetivo "${token.raw}" sem evidência autorizada`);
      }
    }
    const unique = [...new Set(refs)];
    if (contradicted)
      return {
        status: "CONTRADICTED",
        claimType: "objetivo",
        causes,
        evidenceRefs: [],
      };
    if (unsupported)
      return {
        status: "UNSUPPORTED",
        claimType: "objetivo",
        causes,
        evidenceRefs: [],
      };
    return {
      status: "SUPPORTED",
      claimType: "objetivo",
      causes: [],
      evidenceRefs: unique,
    };
  }
  const claimAttrs = detectAttributes(text);
  if (claimAttrs.length > 0) {
    const causes: string[] = [];
    let contradicted = false;
    let unsupported = false;
    const refs: string[] = [];
    for (const group of claimAttrs) {
      const supporting = evidence.facts
        .map((fact, index) => ({ fact, index }))
        .filter(({ fact, index }) => {
          if (evidence.refs[index] === "product:name") return false;
          const folded = attrStems(fact.toLowerCase());
          return ATTRIBUTE_LEXICON[group].some((stem) => folded.includes(stem));
        });
      if (supporting.length === 0) {
        unsupported = true;
        causes.push(
          `atributo objetivo "${ATTRIBUTE_LEXICON[group][0]}" sem evidência autorizada`,
        );
        continue;
      }
      const attributeNegated = ATTRIBUTE_LEXICON[group].some(
        (stem) => negationAdjacent(stem),
      );
      if (attributeNegated) {
        contradicted = true;
        causes.push(
          `nega atributo autorizado (${supporting.map(({ index }) => refFor(index)).join("; ")})`,
        );
        continue;
      }
      supporting.forEach(({ index }) => refs.push(refFor(index)));
    }
    if (contradicted)
      return {
        status: "CONTRADICTED",
        claimType: "objetivo",
        causes,
        evidenceRefs: [],
      };
    if (unsupported)
      return {
        status: "UNSUPPORTED",
        claimType: "objetivo",
        causes,
        evidenceRefs: [],
      };
    return {
      status: "SUPPORTED",
      claimType: "objetivo",
      causes: [],
      evidenceRefs: [...new Set(refs)],
    };
  }
  const matched = mentions
    .filter(({ fact }) => text.includes(fact))
    .map(({ fact }) => fact.slice(0, 40));
  const negatedMatches = matched.filter((fact) => negationAdjacent(fact));
  if (negatedMatches.length > 0)
    return {
      status: "CONTRADICTED",
      claimType: "subjetivo",
      causes: [`nega evidência autorizada (${negatedMatches.join("; ")})`],
      evidenceRefs: [],
    };
  if (matched.length > 0)
    return {
      status: "SUPPORTED",
      claimType: "subjetivo",
      causes: [],
      evidenceRefs: [
        ...new Set(
          matched.map((fact) => {
              const index = mentions.find(({ fact: mention }) => mention.slice(0, 40) === fact)?.index ?? -1;
              return index >= 0 ? refFor(index) : "";
            }).filter((ref) => ref.length > 0),
        ),
      ],
    };
  return {
    status: observedGroundingRefs.length ? "SUPPORTED" : "INFERRED_BUT_SAFE",
    claimType: observedGroundingRefs.length ? "objetivo" : "subjetivo",
    causes: [],
    evidenceRefs: [...new Set(observedGroundingRefs)],
  };
}

function validDevelopmentPoint(point: string, evidence: EvidenceSnapshot): boolean {
  const normalized = attrStems(normalizeForVariety(point));
  const action = DEVELOPMENT_COMMUNICATION_ACTION.exec(normalized);
  if (DEVELOPMENT_SHOT_LIST.test(normalized) || !action) return false;
  const rationaleAt = normalized.search(DEVELOPMENT_RATIONALE);
  const experienceRationale = DEVELOPMENT_EXPERIENCE_RATIONALE.exec(normalized);
  if (rationaleAt < 0 && !experienceRationale) return false;
  const stopWords = new Set(["a", "o", "as", "os", "de", "do", "da", "dos", "das", "e", "com", "para", "por", "em", "no", "na", "nos", "nas", "que", "um", "uma", "como", "seu", "sua", "contextualizar", "explicar", "explica", "detalhe", "escolha", "reforcar", "mostrar", "associar", "relacionar"]);
  const terms = (value: string) => new Set(value.split(/\W+/).filter((term) => term.length > 1 && !stopWords.has(term)));
  const pointTerms = terms(normalized);
  const rationaleTerms = rationaleAt >= 0
    ? terms(normalized.slice(rationaleAt).replace(DEVELOPMENT_RATIONALE, ""))
    : terms(normalized.slice(experienceRationale!.index));
  const experienceContext = experienceRationale
    ? terms(normalized.slice(action[0].length, experienceRationale.index)).size > 0
    : false;
  if (rationaleAt >= 0 && rationaleTerms.size < 2) return false;
  if (rationaleAt < 0 && !experienceContext) return false;
  return evidence.facts.some((fact, index) => {
    if (evidence.refs[index] === "product:name") return false;
    const factTerms = terms(attrStems(normalizeForVariety(fact)));
    let groundedTerms = 0;
    for (const term of factTerms) if (pointTerms.has(term)) groundedTerms++;
    const rationaleFactTerms = [...rationaleTerms].filter((term) => factTerms.has(term)).length;
    const rationaleContextTerms = [...rationaleTerms].filter((term) => !factTerms.has(term)).length;
    return groundedTerms >= 2 && rationaleFactTerms >= 2 &&
      (rationaleAt < 0 || rationaleContextTerms >= 1);
  });
}

type GatePattern = { id?: string; guidance?: string; type?: string; text?: string };
type SelectedBriefPatterns = Array<{ hook: GatePattern; cta: GatePattern }>;
type CreatorRecordingContext = {
  recordsAlone?: unknown;
  recordingEquipment?: unknown;
  recordingSupport?: unknown;
};

export function validateBriefSet(
  briefs: unknown[],
  evidence: EvidenceSnapshot = { facts: [], refs: [] },
  platformId = "tiktok-commerce",
  skillVersion: string = TIKTOK_COMMERCE_SKILL.version,
  selectedPatterns: SelectedBriefPatterns = [],
  creatorContext: CreatorRecordingContext = {},
): GateReport[] {
  const seenBriefs = new Set<string>();
  const seenHooks = new Set<string>();
  const seenCtas = new Set<string>();
  const structuralHashes = new Set<string>();
  const reports = briefs.map((value, index): GateReport => {
    const issues: string[] = [];
    let brief: ContentBriefVersion;
    try {
      brief = validateContentBrief(value);
    } catch {
      return {
        briefId: `brief-${index + 1}`,
        factualStatus: "UNSUPPORTED",
        claimType: "objetivo",
        evidenceRefs: [],
        structuralStatus: "FAIL",
        platformStatus: "FAIL",
        varietyStatus: "PASS",
        issues: ["estrutura inválida"],
        decision: "REJECT",
      };
    }
    const selected = selectedPatterns[index];
    const crossedHook = selected?.cta.text && normalizeForVariety(brief.hook) === normalizeForVariety(selected.cta.text);
    const crossedCta = selected?.hook.text && normalizeForVariety(brief.cta) === normalizeForVariety(selected.hook.text);
    if (crossedHook) issues.push("CTA usado como hook");
    if (crossedCta) issues.push("hook usado como CTA");
    const normalizedBrief = normalizeForVariety(`${brief.angle}|${brief.hook}|${brief.script}`);
    const normalizedHook = normalizeForVariety(brief.hook);
    const normalizedCta = normalizeForVariety(brief.cta);
    const catalogHookVerbatim = CREATIVE_CATALOG.hooks.some(
      ({ text }) => normalizeForVariety(text) === normalizedHook,
    );
    const catalogCtaVerbatim = CREATIVE_CATALOG.ctas.some(
      ({ text }) => normalizeForVariety(text) === normalizedCta,
    );
    const structuralHash = structureHash(brief);
    if (seenBriefs.has(normalizedBrief)) issues.push("duplicata normalizada");
    if (!catalogHookVerbatim && seenHooks.has(normalizedHook)) issues.push("hook repetido");
    if (!catalogCtaVerbatim && seenCtas.has(normalizedCta)) issues.push("CTA repetido");
    if (structuralHashes.has(structuralHash)) issues.push("duplicata estrutural");
    seenBriefs.add(normalizedBrief);
    if (!catalogHookVerbatim) seenHooks.add(normalizedHook);
    if (!catalogCtaVerbatim) seenCtas.add(normalizedCta);
    structuralHashes.add(structuralHash);
    const fact = classifyFactual(brief, evidence);
    if (fact.status === "UNSUPPORTED" || fact.status === "CONTRADICTED")
      issues.push(
        ...(fact.causes.length
          ? fact.causes
          : [
              fact.status === "UNSUPPORTED"
                ? "claim sem suporte em evidência"
                : "claim contradito",
            ]),
      );
    const developmentUnverified = brief.development.some((point) => {
      const tokens = techTokens(point);
      const unsupportedToken = tokens.some(({ unit, value }) => !evidence.facts.some((fact, factIndex) =>
        evidence.refs[factIndex] !== "product:name" && techTokens(fact).some((authorized) => authorized.unit === unit && authorized.value === value),
      ));
      const unsupportedAttribute = detectAttributes(point).some((group) => !evidence.facts.some((fact, factIndex) =>
        evidence.refs[factIndex] !== "product:name" && ATTRIBUTE_LEXICON[group].some((stem) => attrStems(fact.toLowerCase()).includes(stem)),
      ));
      return unsupportedToken || unsupportedAttribute;
    });
    if (developmentUnverified) issues.push("development contém claim sem evidência verificável");
    if (brief.development.some((point) => !validDevelopmentPoint(point, evidence)))
      issues.push("development deve orientar comunicação com ação e razão/fato, sem lista de features ou planos de gravação");
    const developmentText = normalizeForVariety(brief.development.join(" "));
    const developmentTokens = techTokens(developmentText);
    const developmentAttributes = detectAttributes(developmentText);
    const normalizedScript = normalizeForVariety(brief.script);
    const scriptTechClaims = techTokens(brief.script);
    const scriptAttributes = detectAttributes(brief.script);
    const missingScriptClaim =
      scriptTechClaims.some(({ unit, value }) => !developmentTokens.some((token) => token.unit === unit && token.value === value)) ||
      scriptAttributes.some((group) => !developmentAttributes.includes(group)) ||
      evidence.facts.some((fact, index) => {
        const normalizedFact = normalizeForVariety(fact);
        return normalizedFact.length >= 4 && evidence.refs[index] !== "product:name" && normalizedScript.includes(normalizedFact) && !developmentText.includes(normalizedFact);
      });
    if (missingScriptClaim) issues.push("script contém claim factual ausente de development");
    const equipment = [creatorContext.recordingEquipment, creatorContext.recordingSupport]
      .flatMap((value) => Array.isArray(value) ? value : [])
      .filter((value): value is string => typeof value === "string")
      .join(" ");
    const productionText = `${brief.script} ${brief.development.join(" ")}`;
    const productionRequiresUndeclaredEquipment = SOLO_PRODUCTION_ANTIPATTERNS.test(productionText) && (
      CREW_OR_POST_PRODUCTION_ANTIPATTERNS.test(productionText) ||
      (CAMERA_MOVEMENT_ANTIPATTERNS.test(productionText) && !MOTION_EQUIPMENT.test(equipment)) ||
      (DRONE_PRODUCTION.test(productionText) && !DRONE_PRODUCTION.test(equipment))
    );
    if (creatorContext.recordsAlone === true && productionRequiresUndeclaredEquipment)
      issues.push("produção incompatível com creator solo");
    const platformOk =
      platformId === "tiktok-commerce" &&
      skillVersion === TIKTOK_COMMERCE_SKILL.version;
    if (!platformOk)
      issues.push("brief incompatível com a Skill da plataforma");
    const structuralStatus = "PASS";
    const varietyStatus = issues.some((issue) => /duplicata|repetido/.test(issue))
      ? "FAIL"
      : "PASS";
    const platformStatus = platformOk ? "PASS" : "FAIL";
    const decision =
      fact.status === "CONTRADICTED"
        ? "REJECT"
        : issues.length
          ? "REPAIR"
          : "PASS";
    return {
      briefId: `${brief.contentId}:${brief.briefVersionId}`,
      factualStatus: fact.status,
      claimType: fact.claimType,
      evidenceRefs: fact.evidenceRefs,
      structuralStatus,
      platformStatus,
      varietyStatus,
      issues,
      decision,
    };
  });
  return reports;
}

// Repair somente itens rejeitados, preservando PASS. Este MVP é determinístico e não pode fabricar
// conteúdo novo; se algum short-stack continuar invariante, falha fechado com erro tipado.
export function repairBriefs(
  briefs: ContentBriefVersion[],
  reports: GateReport[],
  maxRepairs: number,
  evidence: EvidenceSnapshot = { facts: [], refs: [] },
  platformId = "tiktok-commerce",
  skillVersion = TIKTOK_COMMERCE_SKILL.version,
): ContentBriefVersion[] {
  const rejected = briefs
    .map((brief, index) => ({ brief, report: reports[index] }))
    .filter(({ report }) => report?.decision !== "PASS");
  if (rejected.length === 0) return briefs;
  if (rejected.length > maxRepairs)
    throw new ContractError(
      "GEN-REPAIR-EXHAUSTED",
      "Repair não produziu conjunto válido",
    );
  // Sem fabricação de claims: o repair determinístico não pode gerar conteúdo; conjunto não fecha → gancho tipado.
  throw new ContractError(
    "GEN-REPAIR-EXHAUSTED",
    "Repair não produziu briefing válido",
  );
}
