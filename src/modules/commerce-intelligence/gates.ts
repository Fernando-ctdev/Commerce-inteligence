import {
  normalizeForVariety,
  structureHash,
  validateContentBrief,
  type ContentBriefVersion,
  type EvidenceSnapshot,
  type FactStatus,
} from "./contract";
import {
  PLATFORM_SKILLS,
  CREATIVE_CATALOG,
  TIKTOK_COMMERCE_SKILL,
  classifyCtaFunction,
  classifyHookMechanism,
  type HookMechanismBucket,
  CTA_FUNCTION_BUCKET_COUNT,
  UNCLASSIFIED_CTA_FUNCTION,
} from "./platform-skill";
import { ContractError } from "./contract";

// ADR-019: versão da política de gates com bump manual (mesmo precedente de
// CARDINALITY_POLICY_VERSION). Reports persistidos carregam a versão sob a qual
// foram produzidos; revalidação sob versão diferente é GATE-VERSION-MISMATCH,
// nunca REPAIR falso. 1 = pré-versionamento implícito (histórico).
export const GATE_POLICY_VERSION = 3; // ADR-021: revalidação de variedade do subconjunto (ceil(D/K))

// Revalidação forense: recusa reclassificar payload validado sob outra política.
// NULL/ausente = gerado antes do versionamento — também é incompatível.
export function assertGateVersionCompatible(recorded: unknown): number {
  if (typeof recorded !== "number" || recorded !== GATE_POLICY_VERSION)
    throw new ContractError(
      "GEN-GATE-VERSION",
      `Revalidação exige gateVersion ${GATE_POLICY_VERSION} (registrado: ${typeof recorded === "number" ? recorded : "pré-versionamento"})`,
    );
  return recorded;
}
export type GateReport = {
  briefId: string;
  gateVersion: number;
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
// ADR-019/P6: "deixa o ar circular"/"ar circulando" entram no conceito de ventilação;
// vestuário (amassar/marcar/apertar) e promoção (frete grátis) são conceitos observáveis
// próprios — claim sem fato de mesma polaridade é UNSUPPORTED (mecanismo ADR-004).
const OBSERVED_THERMAL_CONCEPTS = [
  { id: "ventilação", phrase: /\b(respiravel|respirabilidade|ventila(r|cao)?|circulacao de ar|ar circulando|deixa o ar circular|deixando o ar circular|ar circular)\b/ },
  { id: "passagem de calor", phrase: /\bpass(a|ar) calor\b/ },
  { id: "aquecimento", phrase: /\b(esquent(a|ar)|aquec(e|er))\b/ },
  { id: "frescor", phrase: /\b(mantem (o corpo )?fresco|fresco)\b/ },
  { id: "abafamento", phrase: /\babaf(a|ar)\b/ },
];
// Vestuário: negações como "não amassa"/"não marca"/"não aperta" são claims de
// propriedade observável do produto, não opinião. "aperta" ignora "aperta play/botão"
// (ação de gravação, não propriedade de vestibilidade); "marca" só em composição
// (deixa marca / marca na pele / não marca / sem marcar) para não colidir com marca=brand.
const OBSERVED_GARMENT_CONCEPTS = [
  { id: "amassar", phrase: /\b(amassa|amassar|amassou|amassada|amassado|amassando)\b/ },
  { id: "marcar", phrase: /\b(nao\s+marca|deixa\s+marca|deixando\s+marca|marca\s+na\s+pele|sem\s+marcar|nao\s+deixa\s+marca)\b/ },
  { id: "apertar", phrase: /\baperta(?!\s+(play|pausa|o\s+botao|botao|o\s+botão))\w*\b/ },
];
const OBSERVED_PROMO_CONCEPTS = [
  { id: "frete grátis", phrase: /\bfrete\s+gratis\b/ },
];
const OBSERVED_CONCEPTS = [
  ...OBSERVED_THERMAL_CONCEPTS,
  ...OBSERVED_GARMENT_CONCEPTS,
  ...OBSERVED_PROMO_CONCEPTS,
];
const POCKET_CAPACITY = /\b(cabe|cabem|acomoda|comporta|guarda|armazena)\s+(?:(qualquer|todo|toda|todos|todas)\s+)?(?:(um|uma|o|a)\s+)?(celular|telefone|smartphone|chaves)\b/g;
// ADR-020 (contrato estruturado do repair): constantes do próprio gate expostas
// para os requirements server-derived — reuso, sem regex nova.
export const DEVELOPMENT_ACTION_STEMS: readonly string[] = ["mostr", "coment", "compar", "prov", "demonstr", "destaqu", "destac", "fal", "expli", "abrac", "apresent", "test", "vest", "peg", "segur", "abri", "reforc"];
export const DEVELOPMENT_CONNECTORS: readonly string[] = ["para", "porque", "pois", "assim"];
const DEVELOPMENT_COMMUNICATION_ACTION = /(?:mostr|coment|compar|prov|demonstr|destaqu|destac|fal|expli|abrac|apresent|test|vest|peg|segur|abri|reforc)\w*/;
export const DEVELOPMENT_RATIONALE = /\b(para|porque|pois|assim)\b/;
const DEVELOPMENT_EXPERIENCE_RATIONALE = /\bque voce (sente|percebe|nota) com\b/;
const DEVELOPMENT_SHOT_LIST = /\b(close|plano|enquadramento|camera|filme|grave|trip[eé]|iluminacao|take|tomada)\b/;
const UNSUPPORTED_ABSOLUTE_CLAIMS = /\b(sempre|nunca|jamais|qualquer|perfeit[oa]s?|sem falha|sem defeito)\b/i;
// ADR-025 §5 — fronteira editorial script×cenas: script é fala/ação performável
// pelo creator; metainstrução de montagem, enquadramento ou orientação visual
// pertence a cenas. Detector ESTREITO e reparável: somente padrões inequívocos
// de metacomentário (direção de câmera/edição, direção entre colchetes, overlay
// de tela, numeração de cena/take) geram issue — a decisão segue o fluxo normal
// do gate (REPAIR), NUNCA REJECT automático. Fala creator-first legítima (ex.:
// "dá um close", "mostra de perto") não casa — regex ampla foi rejeitada no ADR.
const SCRIPT_SCENE_METACOMMENT = new RegExp(
  // "corte para/pra/de volta" só como DIREÇÃO (início do script ou após
  // pontuação): "o corte para cabelos ondulados" e "corte seco" são fala de
  // produto (nicho beleza) e não podem casar.
  "((?:^|[.!?;…]\\s+)cortes? (?:para|pra|de volta)"
  + "|c[aâ]mera (?:mostra|aproxima|se aproxima|afasta|sobe|desce)"
  + "|plano (?:detalhe|aberto|fechado|geral|americano|sequ[êe]ncia)"
  + "|enquadra(?:mento)? (?:em|no|na|do|da)"
  + "|em enquadramento"
  + "|texto na tela|legenda na tela|escrito na tela|aparece na tela|na tela aparece"
  + "|cena \\d+|take \\d+"
  + "|\\[[^\\]\\n]{1,120}\\])",
  "i",
);
export function scriptSceneMetacomment(script: string): string | null {
  return SCRIPT_SCENE_METACOMMENT.exec(script)?.[0] ?? null;
}
// ADR-026 — locators internos de evidência (`fact:*`, `product:*`) são metadados
// de contexto/relatório e NUNCA texto creator-facing. Locator = token entre
// colchetes `namespace:token` sem espaço (ex.: [fact:features], [product:name],
// [fact:features:2]); colchete legítimo de fala ("[mostra a etiqueta]") tem
// espaço e não casa. Sem strip silencioso: a detecção vira issue/drop
// determinístico que segue o fluxo do gate (REPAIR por parte / drop da cena).
const INTERNAL_LOCATOR = /\[[a-z]+:[a-z0-9:_-]+\]/i;
export function internalLocator(value: string): string | null {
  return INTERNAL_LOCATOR.exec(value)?.[0] ?? null;
}
// ADR-026 — metainstrução de INSERÇÃO editorial: condicional de 1ª pessoa de
// inserção + dêitico editorial "aqui" + objeto/elemento visual em até 2 tokens
// ("Eu colocaria aqui um objeto pequeno..."). Estreito por construção; fala
// legítima não casa: "Eu pegaria esse modelo porque..." (sem dêitico+objeto
// visual), "aqui cabe no bolso" (sem verbo de inserção), "dá um close".
const SCRIPT_INSERT_METACOMMENT =
  /\b(?:eu\s+)?(?:colocaria|poria|porei|meteria|incluiria|acrescentaria|encaixaria)\s+aqui\s+(?:\w+\s+){0,2}(?:objeto|pe[cç]a|item|cena|imagem|v[íi]deo|texto|tela|anima[cç][ãa]o|efeito|produto)\b/i;
export function scriptInsertMetacomment(script: string): string | null {
  return SCRIPT_INSERT_METACOMMENT.exec(script)?.[0] ?? null;
}
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

// Avaliação de conceitos observáveis (térmicos, vestuário, promoção) sobre campos
// de claim já dobrados (attrStems): claim exige fato autorizado de MESMA polaridade;
// fato de polaridade oposta é contradição; sem fato é claim sem evidência.
// Extraído de classifyFactual para reuso no gate de cenas (ADR-019).
function assessObservedConcepts(
  claimFields: string[],
  foldedFacts: Array<{ fact: string; index: number }>,
  evidence: EvidenceSnapshot,
): { groundingRefs: string[]; issues: string[]; contradiction: boolean } {
  const groundingRefs: string[] = [];
  const issues: string[] = [];
  let contradiction = false;
  const refFor = (factIndex: number): string =>
    evidence.refs[factIndex] ?? `fact:${factIndex + 1}`;
  for (const concept of OBSERVED_CONCEPTS) {
    const claims = claimFields.flatMap((field) => observedMatches(field, concept.phrase));
    if (!claims.length) continue;
    const facts = foldedFacts.flatMap(({ fact, index }) =>
      observedMatches(fact, concept.phrase).map((match) => ({ ...match, index })),
    );
    for (const claim of claims) {
      const samePolarity = facts.filter((fact) => fact.polarity === claim.polarity);
      if (samePolarity.length) groundingRefs.push(...samePolarity.map(({ index }) => refFor(index)));
      else if (facts.length) {
        contradiction = true;
        issues.push(`claim de ${concept.id} contradiz a evidência`);
      } else issues.push(`claim de ${concept.id} sem evidência autorizada`);
    }
  }
  return { groundingRefs: [...new Set(groundingRefs)], issues, contradiction };
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
  const observed = assessObservedConcepts(claimFields, foldedFacts, evidence);
  const observedGroundingRefs = observed.groundingRefs;
  const observedIssues = observed.issues;
  let observedContradiction = observed.contradiction;
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

// ADR-020: termos de ancoragem do development — MESMA computação interna do
// gate (fold + stopwords), exposta para factRefs server-derived.
export function developmentGroundingTerms(value: string): string[] {
  const normalized = attrStems(normalizeForVariety(value));
  const stopWords = new Set(["a", "o", "as", "os", "de", "do", "da", "dos", "das", "e", "com", "para", "por", "em", "no", "na", "nos", "nas", "que", "um", "uma", "como", "seu", "sua", "contextualizar", "explicar", "explica", "detalhe", "escolha", "reforcar", "mostrar", "associar", "relacionar"]);
  return [...new Set(normalized.split(/\W+/).filter((term) => term.length > 1 && !stopWords.has(term)))];
}

// ADR-021: diagnóstico determinístico por ponto — MESMOS predicados do gate,
// expostos para a assinatura residual por item (sem payload bruto).
export function diagnoseDevelopmentPoint(point: string, evidence: EvidenceSnapshot): {
  valid: boolean; shotList: boolean; actionPresent: boolean; connectorPresent: boolean;
  minGroundingExpected: number; minGroundingMatched: number; unverified: boolean;
} {
  const normalized = attrStems(normalizeForVariety(point));
  const action = DEVELOPMENT_COMMUNICATION_ACTION.exec(normalized);
  const shotList = DEVELOPMENT_SHOT_LIST.test(normalized);
  const rationaleAt = normalized.search(DEVELOPMENT_RATIONALE);
  const experienceRationale = DEVELOPMENT_EXPERIENCE_RATIONALE.exec(normalized);
  // Guardas idênticos aos retornos precoces do gate original.
  const rationaleTerms = new Set(
    rationaleAt < 0 && !experienceRationale
      ? []
      : rationaleAt >= 0
        ? developmentGroundingTerms(normalized.slice(rationaleAt).replace(DEVELOPMENT_RATIONALE, ""))
        : developmentGroundingTerms(normalized.slice(experienceRationale!.index)),
  );
  const experienceContext = action && experienceRationale
    ? developmentGroundingTerms(normalized.slice(action[0].length, experienceRationale.index)).length > 0
    : false;
  const unverified = unverifiedObjectiveClaims(point, evidence);
  const actionPresent = Boolean(action) && !shotList;
  const connectorPresent = rationaleAt >= 0 || Boolean(experienceRationale);
  const minGroundingExpected = 2;
  const minGroundingMatched = Math.min(minGroundingExpected, rationaleTerms.size);
  const valid =
    actionPresent &&
    connectorPresent &&
    (rationaleAt >= 0 ? rationaleTerms.size >= 2 : experienceContext) &&
    !unverified;
  return { valid, shotList, actionPresent, connectorPresent, minGroundingExpected, minGroundingMatched, unverified };
}

export function validDevelopmentPoint(point: string, evidence: EvidenceSnapshot): boolean {
  return diagnoseDevelopmentPoint(point, evidence).valid;
}

export type GatePattern = { id?: string; guidance?: string; type?: string; text?: string };
type SelectedBriefPatterns = Array<{ hook: GatePattern; cta: GatePattern }>;
type CreatorRecordingContext = {
  recordsAlone?: unknown;
  recordingEquipment?: unknown;
  recordingSupport?: unknown;
};


// ADR-020 (mecanismo deliverable): buckets do catálogo com pelo menos um hook
// deliverable para a evidência atual — mesma pré-checagem dos CTA patterns.
// Lista em ordem canônica estável; vazia = nenhum mecanismo planiável, caso que
// deve falhar GEN-PATTERN antes do plano (fail-closed, sem fallback entre
// mecanismos).
export function deliverableHookBuckets(
  evidence: EvidenceSnapshot,
  hooks: readonly GatePattern[],
): HookMechanismBucket[] {
  const bucketsWithDeliverableHook = new Set<HookMechanismBucket>();
  for (const hook of hooks) {
    if (ctaTextFactualIssues(String(hook.text ?? ""), evidence).decision === "deliverable")
      bucketsWithDeliverableHook.add(classifyHookMechanism(String(hook.text ?? "")));
  }
  const order: HookMechanismBucket[] = [
    "problem",
    "discovery",
    "demonstration",
    "objection",
    "price-value",
    "other",
  ];
  return order.filter((bucket) => bucketsWithDeliverableHook.has(bucket));
}

// ADR-020: pré-checagem determinística de patterns do catálogo (CTA ou hook)
// contra a evidência, ANTES de qualquer geração — seleção e gate não divergem,
// pois ambos usam o MESMO classificador (classifyFactual sobre texto isolado,
// com os demais campos vazios). Contrato acordado: recebe somente o texto +
// EvidenceSnapshot e devolve decisão/causas determinísticas.
export function ctaTextFactualIssues(
  text: string,
  evidence: EvidenceSnapshot,
): { decision: "deliverable" | "unsupported" | "contradicted"; causes: string[] } {
  const assessment = classifyFactual(
    {
      contentId: "pattern",
      briefVersionId: "pattern",
      version: 1,
      angle: "",
      hook: "",
      development: [],
      script: "",
      cta: text,
    },
    evidence,
  );
  const decision =
    assessment.status === "SUPPORTED" || assessment.status === "INFERRED_BUT_SAFE"
      ? "deliverable"
      : assessment.status === "CONTRADICTED"
        ? "contradicted"
        : "unsupported";
  return { decision, causes: assessment.causes };
}
// Claim objetivo sem evidência: valor+unidade ou atributo do léxico exige fato
// autorizado (exclui product:name). Compartilhado entre development e cenas (ADR-019).
// Claims promocionais de valor/marca não cobertos pelo léxico de atributos:
// assertion de valor comercial exige fato autorizado com o mesmo teor.
const UNSUPPORTED_VALUE_CLAIMS = /\b(valoriza|agrega valor|da valor|vale a pena|marca reconhecida|qualidade premium|referencia de qualidade)\b/;
function unverifiedObjectiveClaims(text: string, evidence: EvidenceSnapshot): boolean {
  const normalizedClaimText = normalizeForVariety(text);
  const unsupportedValueClaim = UNSUPPORTED_VALUE_CLAIMS.test(normalizedClaimText) &&
    !evidence.facts.some((fact, factIndex) =>
      evidence.refs[factIndex] !== "product:name" && UNSUPPORTED_VALUE_CLAIMS.test(normalizeForVariety(fact)),
    );
  const unsupportedToken = techTokens(text).some(({ unit, value }) => !evidence.facts.some((fact, factIndex) =>
    evidence.refs[factIndex] !== "product:name" && techTokens(fact).some((authorized) => authorized.unit === unit && authorized.value === value),
  ));
  const unsupportedAttribute = detectAttributes(text).some((group) => !evidence.facts.some((fact, factIndex) =>
    evidence.refs[factIndex] !== "product:name" && ATTRIBUTE_LEXICON[group].some((stem) => attrStems(fact.toLowerCase()).includes(stem)),
  ));
  return unsupportedToken || unsupportedAttribute || unsupportedValueClaim;
}

// Produção incompatível com creator solo: antipadrões exigem equipamento declarado.
function requiresUndeclaredProduction(productionText: string, creatorContext: CreatorRecordingContext): boolean {
  const equipment = [creatorContext.recordingEquipment, creatorContext.recordingSupport]
    .flatMap((value) => Array.isArray(value) ? value : [])
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return SOLO_PRODUCTION_ANTIPATTERNS.test(productionText) && (
    CREW_OR_POST_PRODUCTION_ANTIPATTERNS.test(productionText) ||
    (CAMERA_MOVEMENT_ANTIPATTERNS.test(productionText) && !MOTION_EQUIPMENT.test(equipment)) ||
    (DRONE_PRODUCTION.test(productionText) && !DRONE_PRODUCTION.test(equipment))
  );
}

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
  // Variedade funcional de CTA (ADR-019): nenhuma função (bucket determinístico
  // classificado do texto) além de ceil(N/K), K = buckets presentes no catálogo.
  const ctaFunctionCounts = new Map<string, number>();
  const ctaFunctionCap = briefs.length > 1 && CTA_FUNCTION_BUCKET_COUNT > 1
    ? Math.ceil(briefs.length / CTA_FUNCTION_BUCKET_COUNT)
    : 0;
  const reports = briefs.map((value, index): GateReport => {
    const issues: string[] = [];
    let brief: ContentBriefVersion;
    try {
      brief = validateContentBrief(value);
    } catch {
      return {
        briefId: `brief-${index + 1}`,
        gateVersion: GATE_POLICY_VERSION,
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
    // Teto de função só vale para função realmente identificada no texto;
    // fallback sem regra não é evidência de concentração funcional.
    const ctaFunction = classifyCtaFunction(brief.cta);
    if (ctaFunction !== UNCLASSIFIED_CTA_FUNCTION) {
      const ctaFunctionCount = (ctaFunctionCounts.get(ctaFunction) ?? 0) + 1;
      ctaFunctionCounts.set(ctaFunction, ctaFunctionCount);
      if (ctaFunctionCap > 0 && ctaFunctionCount > ctaFunctionCap)
        issues.push("função de CTA repetida no conjunto");
    }
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
    const developmentUnverified = brief.development.some((point) => unverifiedObjectiveClaims(point, evidence));
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
    // ADR-025 §5/ADR-026: metainstrução de cena no script (direção de montagem
    // ou inserção editorial) é issue reparável (issues → REPAIR); nunca REJECT
    // automático.
    if (scriptSceneMetacomment(brief.script) || scriptInsertMetacomment(brief.script))
      issues.push("script contém metainstrução de cena");
    // ADR-026: locator interno de evidência em campo creator-facing é issue
    // reparável da PARTE nomeada — refs existem só em contexto/relatório.
    for (const [field, value] of [["hook", brief.hook], ["script", brief.script], ["cta", brief.cta], ["development", brief.development.join(" ")]] as const)
      if (internalLocator(value)) issues.push(`locator interno de evidência em ${field}`);
    if (creatorContext.recordsAlone === true && requiresUndeclaredProduction(`${brief.script} ${brief.development.join(" ")}`, creatorContext))
      issues.push("produção incompatível com creator solo");
    // platformSkillVersion é snapshot de geração: versão registrada continua válida
    // no registry após bumps; apenas versão desconhecida falha (ADR-019).
    const platformOk =
      platformId === "tiktok-commerce" &&
      PLATFORM_SKILLS[skillVersion as keyof typeof PLATFORM_SKILLS] !== undefined;
    if (!platformOk)
      issues.push("brief incompatível com a Skill da plataforma");
    const structuralStatus = "PASS";
    const varietyStatus = issues.some((issue) => /duplicata|repetid/.test(issue))
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
      gateVersion: GATE_POLICY_VERSION,
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

// ─── Gate de cenas (ADR-019) ─────────────────────────────────────────────────
// Cenas são sugestões visuais read-only derivadas do briefing: o gate é um FILTRO
// (drop + telemetria), nunca job-fail. Piso estrutural por cena:
//   1. ação observável (verbo de ação — garante movimento cedo na primeira cena
//      mantida, TikTok-first);
//   2. referência a produto/parte/objeto do briefing (âncora lexical);
//   3. nenhum claim factual novo (valor+unidade, atributo, conceito observável
//      com polaridade — mesmos classificadores do gate de briefs);
//   4. produção compatível com creator solo quando recordsAlone (nota
//      da-uma-olhada: produção inadequada aparecia exatamente aqui).
// Sem overlap de tokens com o hook (keyword-stuffing fácil — corte do consenso).
// Set abaixo do mínimo de 2 cenas mantidas → set vazio (status FILTERED na UI).

export type SceneIdea = { description: string };

const SCENE_ACTION_RE = /\b(mostr|peg|coloc|vest|tir|retir|abr|abrac|sent|levant|caminh|and|apont|gir|vir|pass|test|prov|compar|clic|desliz|estic|amass|dobr|guard|bot|calc|segu|desembrul|acen|sorr|reag|entreg|empur|pux|ajeit|posicion)\w*/i;

const SCENE_STOPWORDS = new Set(["que", "para", "com", "uma", "pelo", "pela", "isso", "aqui", "como", "voc", "voce", "seu", "sua", "mais", "menos", "nao", "sim", "tudo", "todo", "toda", "onde", "quando", "porque", "muito", "pouco", "agora", "depois", "antes", "gente", "coisa", "camera", "cena", "video", "tela", "dose"]);

function sceneTerms(folded: string): Set<string> {
  return new Set(folded.split(/\W+/).filter((term) => term.length >= 3 && !SCENE_STOPWORDS.has(term)));
}

function sceneClaimsUnauthorized(description: string, evidence: EvidenceSnapshot): boolean {
  const folded = attrStems(normalizeForVariety(description));
  const foldedFacts = evidence.facts
    .map((fact, index) => ({ fact: attrStems(normalizeForVariety(fact)), index }))
    .filter(({ index }) => evidence.refs[index] !== "product:name");
  const observed = assessObservedConcepts([folded], foldedFacts, evidence);
  if (observed.issues.length || observed.contradiction) return true;
  return unverifiedObjectiveClaims(description, evidence) ||
    capacityMatches(folded).some((claim) => {
      const facts = foldedFacts.flatMap(({ fact }) =>
        capacityMatches(fact).filter((candidate) => candidate.item === claim.item && (!claim.universal || candidate.universal) && candidate.polarity === claim.polarity),
      );
      return facts.length === 0;
    });
}

// Contrato nomeado do gateSceneSet (consumido por engine/worker; evita
// ReturnType como contrato).
export type SceneGateResult = { kept: SceneIdea[]; dropped: number; causes: string[] };
export function gateSceneSet(
  scenes: SceneIdea[],
  brief: { angle: string; hook: string; development: string[]; script: string; cta: string },
  evidence: EvidenceSnapshot,
  creatorContext: CreatorRecordingContext = {},
): SceneGateResult {
  const anchors = sceneTerms(attrStems(normalizeForVariety(
    [brief.angle, brief.hook, ...brief.development, brief.script, brief.cta, ...evidence.facts].join(" "),
  )));
  const causes = new Map<string, number>();
  const kept = scenes.filter(({ description }) => {
    const folded = attrStems(normalizeForVariety(description));
    if (!SCENE_ACTION_RE.test(folded)) { causes.set("acao_ausente", (causes.get("acao_ausente") ?? 0) + 1); return false; }
    if (![...sceneTerms(folded)].some((term) => anchors.has(term))) { causes.set("ancora_ausente", (causes.get("ancora_ausente") ?? 0) + 1); return false; }
    if (sceneClaimsUnauthorized(description, evidence)) { causes.set("claim_nao_autorizado", (causes.get("claim_nao_autorizado") ?? 0) + 1); return false; }
    // ADR-026: locator interno invalida SOMENTE a cena que o contém; as demais
    // cenas do set seguem válidas.
    if (internalLocator(description)) { causes.set("locator_interno", (causes.get("locator_interno") ?? 0) + 1); return false; }
    if (creatorContext.recordsAlone === true && requiresUndeclaredProduction(folded, creatorContext)) { causes.set("producao_nao_declarada", (causes.get("producao_nao_declarada") ?? 0) + 1); return false; }
    return true;
  });
  if (kept.length < 2) return { kept: [], dropped: scenes.length, causes: [...causes.entries()].map(([cause, count]) => `${cause}:${count}`) };
  return { kept, dropped: scenes.length - kept.length, causes: [...causes.entries()].map(([cause, count]) => `${cause}:${count}`) };
}
