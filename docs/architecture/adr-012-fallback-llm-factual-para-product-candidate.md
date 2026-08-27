# ADR-012: Fallback LLM factual controlado para ProductCandidate

**Status:** Proposed — requer aceite antes da implementação
**Date:** 2026-08-26

## Context

O Slice 002 já extrai e normaliza fatos de ProductCandidate por meio do Browser
Service, mantendo lacunas explícitas, confirmação humana e proveniência. O
ADR-008/SPEC 002 proíbe que a aplicação invente fatos ou misture Product Import
com Strategy.

O novo requisito pede um fallback LLM para completar/normalizar fatos, com
provider configurável por ambiente, base URL, API key e três níveis de modelo.
Isso introduz uma fronteira externa e uma nova classe de proveniência. Também
cria risco de o modelo transformar ausência de evidência em fato confirmado,
ou de receber dados sensíveis do browser profile.

O Slice 002 ainda possui gates operacionais pendentes (POC real de interação e
extração, backup/restore, retenção/revogação e validações de egress). O LLM não
pode ser usado para contornar esses gates nem para substituir o fallback manual.

## Decision

1. O recurso pertence ao **Slice 002**, como assistência factual posterior à
   extração determinística. Não altera a sequência dos slices e não inicia
   Strategy, Plan, Content, Generation de estratégia ou Video.
2. A normalização determinística existente continua sendo o primeiro caminho.
   O LLM é opcional e só recebe fatos extraídos e evidências textuais limitadas
   da página atual, após sanitização. Falha, timeout, configuração ausente ou
   resposta inválida preserva o Candidate e oferece retry/fallback manual.
3. “Completar” significa propor um valor sustentado pela evidência fornecida;
   o modelo não pode usar conhecimento externo, adivinhar lacunas ou criar
   preço, moeda, seller, marca, variante, categoria ou alegação sem evidência.
   Sem evidência suficiente, o campo continua em `gaps`.
4. A integração usa um adapter mínimo de um provider por vez. O domínio não
   conhece SDK, HTTP, API key, base URL ou modelo. Não criar registry, plugin,
   multi-provider framework ou serviço separado.
5. Os três modelos são níveis operacionais (`fast`, `balanced`, `quality`),
   escolhidos pelo caso de uso/configuração server-side. Eles não representam
   qualidade diferente por plano comercial; o ADR-006 continua vigente.
6. A saída do LLM nunca confirma Product automaticamente. Sugestões aparecem
   como valores editáveis; somente a confirmação explícita do creator promove
   cada campo para fato confirmado. Uma correção já confirmada pelo creator
   nunca é sobrescrita silenciosamente.
7. A proveniência factual passa a distinguir, no mínimo:
   `browser-extraction`, `llm-normalized`, `llm-suggested` e
   `creator-confirmed`. `llm-normalized` só é permitido quando o valor deriva
   de evidência existente; `llm-suggested` exige confirmação humana antes de
   entrar no Product.
8. `VIDEO_PROVIDER` e `VIDEO_MODEL` podem existir como placeholders inertes de
   configuração. Nenhum código, schema, worker, rota ou UI deve lê-los neste
   ADR; a fronteira de mídia continua postergada pelo ADR-007.

### Configuração proposta

```dotenv
LLM_PROVIDER="openai-compatible"
LLM_BASE_URL="https://api.example.com/v1"
LLM_API_KEY=""
LLM_MODEL_FAST=""
LLM_MODEL_BALANCED=""
LLM_MODEL_QUALITY=""

# Reservadas para mídia futura; não utilizadas no MVP.
VIDEO_PROVIDER=""
VIDEO_MODEL=""
```

`LLM_API_KEY` é somente server-side. `LLM_BASE_URL` não é controlada pelo
cliente nem pelo Tenant; em produção, deve usar HTTPS e uma allowlist de
egress/provider aprovada pela operação. Configuração ausente ou inválida falha
fechado para a chamada LLM e não bloqueia o fallback manual.

### Contrato mínimo

O contrato abaixo é factual e versionado; ele não substitui
`GenerationInput/Output v1` do ADR-002.

```ts
type CandidateFactField =
  | 'name' | 'description' | 'category' | 'brand' | 'seller'
  | 'price' | 'features' | 'variants' | 'images';

type CandidateFactEvidence = {
  id: string;
  kind: 'browser-observation';
  excerpt: string; // limitado e sanitizado; nunca cookie/profile bruto
};

type CandidateAssistInputV1 = {
  contract_version: '1';
  source_url: string;
  candidate_version: number;
  facts: unknown; // schema factual já validado pelo servidor
  gaps: CandidateFactField[];
  evidence: CandidateFactEvidence[];
};

type CandidateFactSuggestion = {
  field: CandidateFactField;
  value: unknown;
  operation: 'normalize' | 'complete';
  evidence_ids: string[];
};

type CandidateAssistOutputV1 = {
  contract_version: '1';
  suggestions: CandidateFactSuggestion[];
  unresolved: CandidateFactField[];
};
```

O servidor valida tipo, tamanho, cardinalidade, URL de origem, evidências e
valores antes de persistir. Provider, modelo, instante, `attemptId`, hash do
input e status da chamada são derivados/configurados pelo servidor e anexados
à proveniência; não são aceitos como autoridade no output externo. O output
não pode conter Tenant, Product ID, ownership, prompt, segredo ou IDs de
estratégia.

## Security and provenance limits

- Resolver sessão/Tenant antes de carregar Candidate; nunca aceitar Candidate,
  `tenantId`, profile ID, estado ou proveniência enviados pelo cliente como
  autoridade.
- Enviar ao provider somente o menor conjunto necessário de fatos e trechos
  sanitizados da página atual. Nunca enviar senha, cookie, token, session ID,
  profile, CDP, URL com credencial, screenshot de login ou payload bruto.
- Tratar página, evidências e resposta LLM como dados não confiáveis; instruções
  encontradas na página não são instruções do sistema (prompt injection).
- Limitar requisições por tentativa, tamanho de entrada/saída, timeout e retry;
  tornar a operação idempotente por `attemptId + candidateVersion + inputHash`.
- Validar base URL server-side, HTTPS em produção, allowlist de provider/egress,
  redirects e resolução de rede; API key fica fora de logs, respostas, browser e
  banco de domínio.
- Não cobrar `generated_contents_month` por sugestão factual. Ainda assim,
  aplicar limite operacional por tentativa/Tenant para evitar abuso e custo;
  billing ou créditos por provider exigem ADR próprio.
- Persistir apenas metadados de auditoria e hashes/IDs de evidência necessários
  à reprodução. Não armazenar resposta bruta ou prompt completo por padrão.
- O Candidate continua rascunho até confirmação humana. Product só recebe
  fatos validados, com `factsVersion`, `confirmedAt` e proveniência por campo.
- LLM não participa da deduplicação canônica, autorização, quota, Strategy,
  variedade, aprovação de Content ou produção de mídia.

## Alternatives considered

- **Manter somente normalização determinística:** menor risco e custo, mas não
  atende ao fallback LLM solicitado para evidência textual irregular.
- **Usar LLM para preencher lacunas automaticamente:** rejeitado; converte
  hipótese em fato, viola ADR-008 e reduz a confiabilidade da confirmação.
- **Colocar o LLM dentro da Commerce Intelligence/Slice 003:** rejeitado para
  este caso; mistura fato de entrada com decisão estratégica e desloca a
  responsabilidade do Product Import.
- **Criar plataforma multi-provider/registry agora:** rejeitado; um adapter de
  provider por vez atende a configuração pedida sem abstração especulativa.
- **Usar provider de vídeo ou preparar executor de mídia:** rejeitado pelo
  ADR-007; as duas variáveis permanecem inertes.

## Consequences

### Positive

- Reduz lacunas de representação sem transformar sugestão probabilística em
  autoridade factual.
- Mantém Product Import, Strategy e Video separados.
- Permite trocar provider/modelo por ambiente sem vazar SDK para o domínio.
- Torna cada sugestão auditável e revisável pelo creator.

### Negative

- Exige uma extensão versionada de Candidate/proveniência e testes de segurança
  do adapter.
- Introduz custo, latência e possível indisponibilidade externa no Slice 002.
- Evidências textuais limitadas podem não bastar; o manual fallback continua
  necessário.
- A aceitação do Slice 002 continua dependente dos gates do Browser Service; o
  LLM não é evidência de extração real.

## Related

- `docs/product/PRD-Importation-product.md`
- `docs/product/PRD-product-intelligence-analysis.md`
- `docs/architecture/SYSTEM-DESIGN.md`
- `docs/delivery/SLICES.md`
- `docs/specs/002-product-manual-first/SPEC.md`
- [ADR-002](./adr-002-engine-estrategica-como-core.md)
- [ADR-003](./adr-003-postgresql-memoria-e-rastreabilidade.md)
- [ADR-006](./adr-006-limites-de-plano-e-uso.md)
- [ADR-007](./adr-007-fronteira-de-producao-de-midia-futura.md)
- [ADR-008](./adr-008-entrada-de-produto-manual-first.md)
- [ADR-011](./adr-011-importacao-browser-profile-e-harness.md)
