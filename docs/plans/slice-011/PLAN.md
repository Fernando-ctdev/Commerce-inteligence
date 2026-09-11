# PLAN — Slice 011: Meu estilo e CreatorContext

**Status:** APROVADO PARA IMPLEMENTAÇÃO DOCUMENTAL; nenhum código nesta etapa  
**Dependências:** Slice 001; Slice 003 para integração com geração  
**ADR:** `docs/architecture/adr-018-creator-preferences-e-context.md`  
**SPEC:** `docs/specs/slice-011/SPEC.md`

## Objetivo

Entregar a página dedicada **Meu estilo** em `/my-style`, acessível pelo botão já existente na sidebar, persistir `CreatorPreferences` por Tenant e aplicar um snapshot `CreatorContext` allowlisted nas capabilities de geração. A decisão do usuário sobre o botão da sidebar e a rota própria é obrigatória e constitui exceção registrada ao `DESIGN.md`; não alterar o DESIGN.

## Limites

Incluído: extensão de `TenantPreference`, validação runtime, use cases, API GET/PATCH, integração de snapshot no Job, projeções por capability, página dedicada `/my-style`, navegação/estado ativo da sidebar e testes comportamentais/contract/smoke.

Não incluído: seção de preferências dentro de `/settings`, preferências por Product, equipes, RBAC, voice-over gerado, vídeo/áudio, publicação, analytics, recomendação automática, reescrita de Strategy, nova navegação operacional ou alteração de `DESIGN.md`.

## Contratos de dados

Separar os contextos dentro do registro one-to-one `TenantPreference`, keyed por `tenantId`:

```ts
type AccountContext = {
  language: string; // default efetivo: pt-BR
  market?: string;
};

type CreatorPreferences = {
  appearsOnCamera?: boolean;
  prefersVoiceOver?: boolean;
  preferredDurationSeconds?: number;
  tone?: string;
  executionStyle?: string;
  recordingEquipment?: Array<"phone" | "camera" | "other">;
  recordingSupport?: Array<"tripod" | "handheld" | "none" | "other">;
  recordsAlone?: boolean;
  restrictions?: string[];
  notes?: string[];
};
```

`targetContentCount` permanece separado como `GenerationConstraint`. `recordingEquipment` e `recordingSupport` são arrays deduplicados; `recordingSupport = ["none"]` é a única forma válida de usar `none`. Strings simples têm máximo de 120 caracteres; itens de arrays, 300; arrays de texto, 10 itens; duração, inteiro de 15 a 600 segundos. Enums aceitam somente os valores da SPEC. Validar e normalizar server-side, sem mapping heurístico.

## Sequência de implementação

### Tarefa 1 — Contratos e validação

Criar `AccountContext` e `CreatorPreferences` como contratos distintos, com validators runtime separados. Cobrir defaults, trim, limites, cardinalidade, arrays deduplicados, exclusividade de `none`, enums de equipamento/suporte, PATCH parcial e separação de `GenerationConstraints`. Meu estilo não recebe `language` nem `market`.

**Gate:** teste determinístico prova aceitação de múltiplas escolhas válidas, rejeição de `none` combinado, rejeição sem mutação para valores inválidos ou contratos misturados.

### Tarefa 2 — Persistência aditiva e migração

Estender `TenantPreference` e criar migration aditiva. Preservar `targetContentCount`, ownership por `tenantId` e compatibilidade com registros existentes. Converter diretamente cada escalar legado para array singleton (`phone` → `["phone"]`, `tripod` → `["tripod"]`, `none` → `["none"]`, `NULL` → `NULL`), sem inferir combinações. O contrato pós-cutover expõe somente arrays; se houver rollout compatível, aceitar escalar apenas na borda e normalizar imediatamente. Não criar JSON genérico como substituto de campos com validação própria.

**Gate:** `prisma validate` e integração comprovam leitura/escrita one-to-one, backfill singleton, exclusividade de `none`, defaults e isolamento; rollback não deixa registro parcial.

### Tarefa 3 — Use cases e API

Implementar `getAccountContext`/`updateAccountContext` e `getCreatorPreferences`/`updateCreatorPreferences`. Criar `GET/PATCH /api/account/preferences` e `GET/PATCH /api/creator-preferences`, reutilizando sessão server-side, `sameOriginRequest`, erros sanitizados e convenções HTTP existentes. Body não aceita `tenantId`/`userId`; campos desconhecidos falham. `/my-style` consome apenas a API de CreatorPreferences.

**Gate:** testes HTTP cobrem sessão ausente, CSRF/origem, cross-tenant, patch inválido, patch válido, separação dos endpoints e reentrada.

### Tarefa 4 — Snapshot no Job

No caso de uso de geração, carregar preferências do Tenant e capturar snapshot junto ao contexto de entrada do Job. Não usar o cliente como autoridade. Retry técnico/reclaim reutiliza o snapshot; mudanças futuras só afetam novos Jobs. Remover qualquer uso de `Product.generationConstraints` como substituto de `CreatorPreferences`.

**Gate:** teste prova snapshot estável e separação entre preferências e target/constraints.

### Tarefa 5 — Projeções da Engine

Aplicar as allowlists da SPEC em `Commercial Opportunity Mapping`, `Strategy Synthesis`, `Content Plan Generation` e `Brief Generator`. `PRODUCT_UNDERSTANDING` e gates não recebem contexto de creator. Remover `userId` antes do provider e limitar tamanho do envelope.

**Gate:** contract tests verificam chaves exatas por capability e ausência de Tenant, userId, quota, target, sessão, segredo e agregado bruto.

### Tarefa 6 — Página dedicada Meu estilo e navegação

Preservar o botão já criado na sidebar com o rótulo **Meu estilo** e ligá-lo diretamente à página dedicada `/my-style`; não usar `/settings` como rota da página nem renderizar preferências como seção dentro dela. O item deve ter estado ativo, nome acessível e permanecer disponível em desktop, tablet e mobile. A página apresenta opções reconhecíveis para equipamento (`Celular`, `Câmera`, `Outro`), suporte (`Tripé`, `Na mão`, `Nenhum`, `Outro`) e grava sozinho (`Sim`/`Não`), além dos controles de estilo. `language` e `market` não aparecem nesta página. Não remover, renomear ou esconder o botão para cumprir a lista fixa do DESIGN. Usar componentes e tokens existentes, foco-visible, labels, mensagens de erro e alvos mínimos de 44×44px.

**Gate:** smoke autenticado abre `/my-style` pela sidebar, confirma estado ativo, salva as preferências de estilo/gravação, recarrega e mostra valores persistidos em desktop/tablet/mobile.

### Tarefa 7 — Smoke end-to-end

Executar: sessão → `/my-style` → PATCH de CreatorPreferences → PATCH de AccountContext separado → iniciar geração → Job captura os dois snapshots → capabilities recebem projeções → Brief final em DRAFT. Verificar que alterar qualquer contexto depois da criação não modifica o Job existente.

**Gate:** resultado completo ou falha explícita; nunca sucesso parcial, mistura de contratos ou vazamento de contexto.

## Contratos por capability

| Capability | Campos |
|---|---|
| Product Understanding | nenhum |
| Commercial Opportunity Mapping | language, market, tone, executionStyle, restrictions |
| Strategy Synthesis | language, market, tone, executionStyle, restrictions, notes |
| Content Plan Generation | language, market, preferredDurationSeconds, executionStyle, restrictions |
| Brief Generator | language, market, appearsOnCamera, prefersVoiceOver, preferredDurationSeconds, tone, executionStyle, recordingEquipment, recordingSupport, recordsAlone, restrictions, notes |
| Gates/quota/estado/persistência | nenhum |

## Segurança e operação

Toda leitura/mutação é scoped por Tenant resolvido da sessão. O provider recebe somente envelopes allowlisted; não recebe ownership, IDs internos, quota, estados, prompts, cookies, tokens ou payload bruto. Preferências não alteram autorização, quota, quantidade, lifecycle ou Strategy persistente.

## Validação final antes de liberar código

1. `npx prisma validate`.
2. `npm run typecheck`.
3. `npm run lint`.
4. Testes unitários, HTTP, persistência, contract e smoke do slice.
5. `npm run build`.
6. Verificação visual do botão Meu estilo nos breakpoints do DESIGN, sem remover os destinos operacionais existentes.

Nenhum agente deve iniciar implementação enquanto ADR, SPEC, PLAN e SLICES não estiverem revisados pelo Maestro.
