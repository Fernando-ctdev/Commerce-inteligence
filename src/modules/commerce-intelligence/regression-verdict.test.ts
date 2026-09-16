import test from "node:test";
import assert from "node:assert/strict";
import {
  assertGateVersionCompatible,
  gateSceneSet,
  GATE_POLICY_VERSION,
  validateBriefSet,
} from "./gates";
import { ContractError } from "./contract";

// Regressão do veredito (job dbaa5552) e da nota da-uma-olhada (Space S1):
// outputs ruins REAIS pinados como fixtures — se o gate voltar a aceitá-los,
// estes testes falham. ADR-019.

const brief = (id: string, overrides: Record<string, unknown> = {}) => ({
  contentId: id,
  briefVersionId: `${id}-v1`,
  version: 1 as const,
  angle: `Ângulo ${id}`,
  hook: `Hook ${id}`,
  development: ["Mostre o tecido respirável para explicar como o tecido respirável ajuda no uso"],
  script: `Fale sobre ${id} com o tecido respirável.`,
  cta: `CTA ${id}`,
  ...overrides,
});

// Os 4 development bullets reais persistidos no dbaa5552 (ficha técnica declarativa).
const DBAA5552_DEVELOPMENTS = [
  "Modelagem wide leg com caimento fluido para o dia a dia",
  "Tecido Duna leve e macio para conforto",
  "Cós elástico com cordão para ajuste",
  "Versátil para combinar com diferentes looks",
];

test("regressão dbaa5552: developments declarativos reais são REPAIR (gate creator-first)", () => {
  const evidence = {
    facts: ["Calça Feminina Pantalona Duna Wide Leg Cintura Alta", "Tecido Duna leve e macio", "dois bolsos frontais funcionais", "cós elástico com cordão"],
    refs: ["product:name", "fact:features", "fact:features:2", "fact:features:3"],
  };
  for (const point of DBAA5552_DEVELOPMENTS) {
    const report = validateBriefSet([brief(`d-${point.length}`, { development: [point] })], evidence)[0];
    assert.equal(report.decision, "REPAIR", point);
    assert.ok(
      report.issues.some((issue) => issue.includes("development deve orientar comunicação")),
      point,
    );
    assert.equal(report.gateVersion, GATE_POLICY_VERSION);
  }
});

test("regressão dbaa5552: monocultura funcional de CTA (carrinho/preço ×3) é variedade FAIL", () => {
  const evidence = {
    facts: ["Calça Pantalona Duna", "Tecido respirável", "Frete grátis disponível"],
    refs: ["product:name", "fact:features", "fact:shipping"],
  };
  // Funções: checkout (carrinho), promo (frete), checkout (carrinho) — K=5, cap=ceil(3/5)=1.
  const reports = validateBriefSet([
    brief("cta-1", { cta: "Clica no carrinho laranja e vê qual valor tá aparecendo pra você." }),
    brief("cta-2", { cta: "Aproveita o frete grátis que apareceu na sua conta." }),
    brief("cta-3", { cta: "Entra no carrinho e confere as condições atuais." }),
  ], evidence);
  assert.equal(reports[0].decision, "PASS", reports[0].issues.join("; "));
  assert.equal(reports[2].varietyStatus, "FAIL");
  assert.ok(reports[2].issues.includes("função de CTA repetida no conjunto"));
});
test("frete grátis exige evidência: sem fato é UNSUPPORTED, com fato é SUPPORTED", () => {
  const cta = "Vai no carrinho laranja e confere se o frete grátis apareceu aí.";
  const base = {
    development: ["Mostre a calça Duna para explicar como a calça Duna ajuda no uso"],
    script: "Fale da calça Duna com naturalidade.",
  };
  const without = validateBriefSet([brief("f1", { cta, ...base })], { facts: ["Calça Duna"], refs: ["product:name"] })[0];
  assert.equal(without.factualStatus, "UNSUPPORTED");
  assert.equal(without.decision, "REPAIR");
  const withFact = validateBriefSet([brief("f2", { cta, ...base })], { facts: ["Calça Duna", "Frete grátis acima de R$ 99"], refs: ["product:name", "fact:shipping"] })[0];
  assert.equal(withFact.factualStatus, "SUPPORTED", withFact.issues.join("; "));
});

test("claims de vestuário (não amassa / não marca / não aperta) exigem fato de mesma polaridade", () => {
  const script = "O wide leg dá esse caimento que não amassa e não marca.";
  const without = validateBriefSet([brief("g1", {
    script,
    development: ["Mostre a calça para explicar como a calça se comporta no uso"],
  })], { facts: ["Calça Pantalona Duna"], refs: ["product:name"] })[0];
  assert.equal(without.factualStatus, "UNSUPPORTED");
  const withFact = validateBriefSet([brief("g2", {
    script,
    development: ["Mostre o tecido que não amassa para explicar como o tecido que não amassa se comporta no uso"],
  })], { facts: ["Calça Duna", "Tecido que não amassa e não marca"], refs: ["product:name", "fact:features"] })[0];
  assert.equal(withFact.factualStatus, "SUPPORTED", withFact.issues.join("; "));
});

test("'deixa o ar circular' é claim térmica de ventilação: exige fato", () => {
  const script = "O tecido deixa o ar circular no calor.";
  const without = validateBriefSet([brief("h1", {
    script,
    development: ["Mostre o tecido para explicar como o tecido ajuda no calor"],
  })], { facts: ["Calça Duna"], refs: ["product:name"] })[0];
  assert.equal(without.factualStatus, "UNSUPPORTED");
  const withFact = validateBriefSet([brief("h2", {
    script,
    development: ["Mostre o tecido respirável para explicar como o tecido respirável deixa o ar circular"],
  })], { facts: ["Calça Duna", "Tecido respirável"], refs: ["product:name", "fact:features"] })[0];
  assert.equal(withFact.factualStatus, "SUPPORTED", withFact.issues.join("; "));
});

test("regressão Space S1: produção incompatível com creator solo é REPAIR com recordsAlone", () => {
  const evidence = { facts: ["Fone Space S1", "drivers de 40 mm"], refs: ["product:name", "fact:features"] };
  const script = "A câmera gira 360 graus ao redor de mim enquanto o som passa de lado a lado.";
  const solo = { recordsAlone: true, recordingEquipment: ["camera"], recordingSupport: ["tripod"] };
  const blocked = validateBriefSet([brief("s1", {
    hook: "Eu achava que áudio espacial era meio conversa de marketing.",
    script,
    development: ["Mostre os drivers de 40 mm para relacionar 40 mm ao som informado"],
  })], evidence, "tiktok-commerce", "tiktok-commerce@1.2", [], solo)[0];
  assert.equal(blocked.decision, "REPAIR");
  assert.ok(blocked.issues.includes("produção incompatível com creator solo"));
});

test("gate de cenas: mantém ação com âncora, dropa antipadrão de produção e cenário sem âncora", () => {
  const evidence = { facts: ["Fone Space S1", "drivers de 40 mm"], refs: ["product:name", "fact:features"] };
  const briefFields = {
    angle: "Experiência de entretenimento com áudio espacial",
    hook: "Eu achava que áudio espacial era meio conversa de marketing.",
    development: ["Mostre os drivers de 40 mm para relacionar 40 mm ao som informado"],
    script: "Esse fone tem drivers de 40 mm e muda a percepção do som.",
    cta: "Se você curte esse tipo de imersão, vale dar uma olhada nesse aqui.",
  };
  const solo = { recordsAlone: true, recordingEquipment: ["camera"], recordingSupport: ["tripod"] };
  const result = gateSceneSet([
    { description: "Creator sentado fala para a câmera segurando o fone na mão." },
    { description: "Mostra o fone de perto com o próprio celular apontando para os drivers." },
    { description: "A câmera orbita 360 graus ao redor do creator enquanto o som passa." },
    { description: "Paisagem da cidade ao amanhecer sem o produto." },
    { description: "Close com animação de ondas sonoras saindo do fone." },
  ], briefFields, evidence, solo);
  assert.deepEqual(result.kept.map(({ description }) => description), [
    "Creator sentado fala para a câmera segurando o fone na mão.",
    "Mostra o fone de perto com o próprio celular apontando para os drivers.",
  ]);
  assert.equal(result.dropped, 3);
});

test("gate de cenas: set abaixo do mínimo de 2 mantidas vira vazio", () => {
  const evidence = { facts: ["Fone Space S1"], refs: ["product:name"] };
  const briefFields = {
    angle: "a", hook: "h",
    development: ["Mostre o fone para explicar o uso do fone"],
    script: "Fale sobre o fone.", cta: "c",
  };
  const result = gateSceneSet([
    { description: "A câmera orbita 360 graus ao redor do creator." },
    { description: "Animação de ondas sonoras em volta do fone." },
  ], briefFields, evidence, { recordsAlone: true, recordingEquipment: ["camera"] });
  assert.deepEqual(result.kept, []);
  assert.equal(result.dropped, 2);
});

test("gateVersion: versão incompatível (ou pré-versionamento) é GATE-VERSION-MISMATCH, nunca REPAIR", () => {
  assert.equal(assertGateVersionCompatible(GATE_POLICY_VERSION), GATE_POLICY_VERSION);
  for (const recorded of [1, null, undefined, "2"]) {
    assert.throws(
      () => assertGateVersionCompatible(recorded),
      (error: unknown) => error instanceof ContractError && error.code === "GEN-GATE-VERSION",
      String(recorded),
    );
  }
});

test("platformSkillVersion registrada no registry continua válida; desconhecida falha", () => {
  const evidence = { facts: ["Produto"], refs: ["product:name"] };
  const registered = validateBriefSet([brief("p1")], evidence, "tiktok-commerce", "tiktok-commerce@1.2")[0];
  assert.equal(registered.platformStatus, "PASS");
  const unknown = validateBriefSet([brief("p2")], evidence, "tiktok-commerce", "tiktok-commerce@9.9")[0];
  assert.equal(unknown.platformStatus, "FAIL");
});

// Gate 7 — causas determinísticas do gateSceneSet alimentam o retry guiado
// (observabilidade e gateFeedback) sem expor conteúdo.
test("gateSceneSet: causas agregadas por motivo de descarte", () => {
  const evidence = { facts: ["Fone Space S1 com drivers de 40 mm"], refs: ["fact:features"] };
  const briefFields = {
    angle: "a", hook: "h",
    development: ["Mostre o fone para explicar o uso do fone"],
    script: "Fale sobre o fone.", cta: "c",
  };
  const result = gateSceneSet([
    { description: "Paisagem da cidade ao amanhecer sem o produto." },
    { description: "Animação de ondas sonoras em volta do fone." },
    { description: "Mostre o fone de perto com o próprio celular." },
    { description: "Pegue o fone e aproxime para mostrar os drivers." },
  ], briefFields, evidence, {});
  assert.equal(result.kept.length, 2);
  assert.equal(result.dropped, 2);
  assert.ok(result.causes.some((cause) => /^(acao_ausente|ancora_ausente|claim_nao_autorizado|producao_nao_declarada):\d$/.test(cause)), `causes determinísticas presentes: ${result.causes.join(", ")}`);
});
