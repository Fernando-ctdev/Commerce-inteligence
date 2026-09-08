import {
  normalizeForVariety,
  structureHash,
  validateContentBrief,
  type ContentBriefVersion,
  type EvidenceSnapshot,
  type FactStatus,
} from "./contract";
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
];
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
function classifyFactual(
  brief: ContentBriefVersion,
  evidence: EvidenceSnapshot,
): FactAssessment {
  if (!evidence || evidence.facts.length === 0)
    return {
      status: "INFERRED_BUT_SAFE",
      claimType: "subjetivo",
      causes: [],
      evidenceRefs: [],
    };
  const text = normalizeForVariety(
    [
      brief.script,
      brief.benefit ?? "",
      brief.pain ?? "",
      brief.desire ?? "",
    ].join(" "),
  );
  const negated = /(não|nunca|jamais)\s/.test(text);
  const factValues = new Map<string, Set<string>>();
  for (const fact of evidence.facts)
    for (const token of techTokens(fact)) {
      if (!factValues.has(token.unit)) factValues.set(token.unit, new Set());
      factValues.get(token.unit)!.add(token.value);
    }
  const mentions = evidence.facts
    .map((fact) => normalizeForVariety(fact))
    .filter((fact) => fact.length > 0);
  const refFor = (factIndex: number): string =>
    evidence.refs[factIndex] ?? `fact:${factIndex + 1}`;
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
        .filter(({ fact }) => {
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
      if (negated) {
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
    .filter((fact) => text.includes(fact))
    .map((fact) => fact.slice(0, 40));
  if (negated && matched.length > 0)
    return {
      status: "CONTRADICTED",
      claimType: "subjetivo",
      causes: [`nega evidência autorizada (${matched.join("; ")})`],
      evidenceRefs: [],
    };
  if (matched.length > 0)
    return {
      status: "SUPPORTED",
      claimType: "subjetivo",
      causes: [],
      evidenceRefs: [
        ...new Set(
          matched
            .map((fact) => {
              const index = mentions.indexOf(fact);
              return index >= 0 ? refFor(index) : "";
            })
            .filter((ref) => ref.length > 0),
        ),
      ],
    };
  return {
    status: "INFERRED_BUT_SAFE",
    claimType: "subjetivo",
    causes: [],
    evidenceRefs: [],
  };
}

export function validateBriefSet(
  briefs: unknown[],
  evidence: EvidenceSnapshot = { facts: [], refs: [] },
  platformId = "tiktok-commerce",
  skillVersion = "tiktok-commerce@1.0",
): GateReport[] {
  const seen = new Set<string>();
  const hashes = new Set<string>();
  const angleCounts = new Map<string, number>();
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
    const normalized = normalizeForVariety(
      `${brief.angle}|${brief.hook}|${brief.script}`,
    );
    const hash = structureHash(brief);
    if (seen.has(normalized)) issues.push("duplicata normalizada");
    if (hashes.has(hash)) issues.push("duplicata estrutural");
    const angleKey = normalizeForVariety(brief.angle);
    angleCounts.set(angleKey, (angleCounts.get(angleKey) ?? 0) + 1);
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
    const platformOk =
      platformId === "tiktok-commerce" &&
      skillVersion === "tiktok-commerce@1.0" &&
      brief.scenes.length >= 2 &&
      brief.scenes.length <= 6 &&
      !/leia literalmente|leitura obrigatória/i.test(brief.script);
    if (!platformOk)
      issues.push("brief incompatível com a Skill da plataforma");
    seen.add(normalized);
    hashes.add(hash);
    const structuralStatus =
      brief.scenes.length >= 2 && brief.scenes.length <= 8 ? "PASS" : "FAIL";
    if (structuralStatus === "FAIL")
      issues.push("quantidade de cenas inválida");
    const varietyStatus = issues.some((issue) => issue.includes("duplicata"))
      ? "FAIL"
      : "PASS";
    const platformStatus = platformOk ? "PASS" : "FAIL";
    const decision =
      fact.status === "CONTRADICTED" || structuralStatus === "FAIL"
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
  // Concentração de ângulo no conjunto (dimensão estruturada): mais da metade no mesmo ângulo é variedade ruim.
  if (briefs.length > 1) {
    for (const count of angleCounts.values())
      if (count > Math.floor(briefs.length / 2)) {
        const idx = reports.findIndex((report) => report.decision === "PASS");
        if (idx >= 0) {
          reports[idx] = {
            ...reports[idx],
            varietyStatus: "FAIL",
            issues: [...reports[idx].issues, "concentração de ângulo"],
            decision: "REPAIR",
          };
        }
        break;
      }
  }
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
  skillVersion = "tiktok-commerce@1.0",
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
