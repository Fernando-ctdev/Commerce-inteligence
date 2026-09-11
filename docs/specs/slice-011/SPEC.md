# SPEC — Slice 011: Meu estilo e CreatorContext

**Status:** APPROVED — contrato pré-código; implementação bloqueada até coordenação do Maestro  
**Dependência:** Slice 001; integração de geração depende do Slice 003  
**ADR:** ADR-018  
**Domain Areas:** Identity/Tenant, Creator Preferences, Commerce Intelligence, App Shell

## User Outcome

O creator abre a página dedicada `/my-style` pelo botão **Meu estilo** da sidebar, salva preferências recorrentes e recebe gerações futuras adaptadas ao seu estilo, sem que preferências sejam confundidas com fatos do Product ou restrições pontuais.

## Exceção visual e rota obrigatória

O usuário decidiu explicitamente que **Meu estilo** deve aparecer como botão na sidebar e o botão já existe. Essa decisão prevalece sobre a navegação fixa do `DESIGN.md`. Não alterar `DESIGN.md`.

**Meu estilo é uma página dedicada própria em `/my-style`; não é seção, aba ou bloco dentro de `/settings`.** O botão da sidebar deve navegar diretamente para `/my-style`, com estado ativo e suporte aos breakpoints existentes. A página usa o shell autenticado existente, mas tem rota e superfície próprias. A API pode permanecer sob `/api/settings/creator-preferences`, pois o namespace de transporte não define a localização da página.

O botão não cria destinos paralelos para Hoje, Produção, Conteúdos ou Vault e não remove os destinos operacionais existentes.

## Contratos persistentes

`AccountContext` pertence à conta/Tenant e contém apenas preferências transversais:

```ts
type AccountContext = {
  language: string; // default efetivo: pt-BR
  market?: string;
};
```

`CreatorPreferences` pertence à página dedicada **Meu estilo** e contém apenas estilo e execução de gravação:

```ts
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

Ambos podem permanecer no registro one-to-one `TenantPreference`, keyed por `tenantId`, mas usam namespaces de contrato, use case, API e projeção separados. `targetContentCount` continua sendo `GenerationConstraint` e não pertence a nenhum dos dois contextos.

## Validação

- `AccountContext.language` é obrigatório no contexto efetivo e assume `pt-BR` quando ausente.
- `market`, `tone` e `executionStyle` são strings trimadas, não vazias, com no máximo 120 caracteres.
- `preferredDurationSeconds`, quando presente, é inteiro entre 15 e 600.
- `recordingEquipment`, quando presente, é array deduplicado de até 3 valores permitidos.
- `recordingSupport`, quando presente, é array deduplicado de até 4 valores permitidos.
- `recordingSupport` aceita `none` somente sozinho; `none` combinado com qualquer suporte falha fechado.
- Migração de escalar existente para array é singleton direta (`"phone"` → `["phone"]`), sem inferência.
- `recordsAlone` permanece booleano; não é derivado dos demais campos.
- Cada item de `restrictions`/`notes` tem no máximo 300 caracteres; cada array tem no máximo 10 itens.
- Campos desconhecidos, tipos inválidos, strings vazias, cardinalidade excedida e limites excedidos falham fechado.
- O servidor normaliza antes de persistir; PATCH é parcial e atômico por contrato.

## API e casos de uso

```text
GET   /api/account/preferences
PATCH /api/account/preferences
GET   /api/creator-preferences
PATCH /api/creator-preferences
```

`/my-style` consome exclusivamente `/api/creator-preferences`. AccountContext é administrado pela superfície de conta/configurações existente. Os bodies contêm somente os campos do respectivo contrato. Sessão server-side resolve `userId` e `tenantId`; nenhum ownership vindo do cliente é aceito. PATCH exige `sameOriginRequest`/CSRF. Respostas expõem somente o contrato normalizado. Erros são sanitizados e estáveis em `pt-BR`.

Casos de uso:

```ts
getAccountContext({ tenantId, userId }): Promise<AccountContext>
updateAccountContext({ tenantId, userId, patch }): Promise<AccountContext>
getCreatorPreferences({ tenantId, userId }): Promise<CreatorPreferences>
updateCreatorPreferences({ tenantId, userId, patch }): Promise<CreatorPreferences>
```

As rotas não acessam tabelas diretamente fora do padrão de aplicação existente.

## CreatorContext e projeções

O contexto interno por execução combina snapshots separados de `AccountContext` e `CreatorPreferences`, inclui `userId` somente internamente e é imutável. O Job captura os snapshots no início; retry técnico reutiliza os mesmos snapshots. A engine não consulta preferências mutáveis durante a execução.

| Capability | Projeção |
|---|---|
| Product Understanding | nenhuma |
| Commercial Opportunity Mapping | language, market, tone, executionStyle, restrictions |
| Strategy Synthesis | language, market, tone, executionStyle, restrictions, notes |
| Content Plan Generation | language, market, preferredDurationSeconds, executionStyle, restrictions |
| Brief Generator | language, market, appearsOnCamera, prefersVoiceOver, preferredDurationSeconds, tone, executionStyle, recordingEquipment, recordingSupport, recordsAlone, restrictions, notes |
| Gates, quota, estados, IDs, persistência | nenhuma |

`userId` não é enviado ao provider. Nenhuma projeção inclui `targetContentCount`, quota, sessão, segredo, Product agregado ou dados de outro Tenant.

## Invariantes

1. Um Tenant só lê e altera seus próprios contextos.
2. `AccountContext` contém somente `language` e `market`; `CreatorPreferences` não os duplica.
3. `CreatorPreferences` contém somente estilo e execução de gravação; `targetContentCount` permanece `GenerationConstraint`.
4. Contextos não alteram Product Facts, quota, autorização, estados, IDs ou Strategy persistente automaticamente.
5. Um Job em execução usa snapshots estáveis e separados.
6. Ausência de `language` efetivo produz `pt-BR`; ausência de preferências de gravação é válida.
7. O provider recebe somente a allowlist da capability.
8. O botão **Meu estilo** permanece disponível em desktop, tablet e mobile, com alvo mínimo de 44×44px e nome acessível.
9. A UI usa controles reconhecíveis: seleção/segmentação para opções enumeradas, radio cards ou select para equipamento/suporte e switch/radio para `recordsAlone`; não exige que o creator conheça nomes internos.

## Fatias por capability

- **011-A Contexto de conta:** `AccountContext` separado, API de conta e defaults; não renderizar esses campos em Meu estilo.
- **011-B Meu estilo e gravação:** página `/my-style`, API de CreatorPreferences, estilo, equipamento, suporte e grava sozinho.
- **011-C Snapshot de geração:** captura autorizada dos dois snapshots no Job e separação de GenerationConstraints.
- **011-D Strategy/Planner:** projeções e contract tests para síntese e plano.
- **011-E Brief Generator:** projeção de execução, adaptação de equipamento/suporte e smoke até Brief em DRAFT.

## Fora de escopo

Voice-over ou vídeo gerado, publicação, analytics, preferências por Product, equipes/RBAC, múltiplos perfis, recomendação automática, edição retroativa de Strategy, nova navegação operacional e alterações no `DESIGN.md`.

## Critérios de aceite

- Usuário autenticado acessa `/my-style` diretamente pela sidebar.
- `language` e `market` não aparecem como campos de Meu estilo; pertencem ao contexto de conta.
- Equipamento, suporte e grava sozinho são apresentados com opções reconhecíveis e acessíveis.
- GET sem registro retorna defaults válidos para cada contexto.
- PATCH válido persiste e GET posterior retorna os valores normalizados no endpoint correto.
- PATCH cross-tenant, sem sessão, sem origem válida, com campo desconhecido ou valor inválido falha sem alteração parcial.
- Geração captura os dois snapshots; mudança posterior não altera o Job já criado.
- Cada capability recebe exatamente sua projeção allowlisted.
- Provider nunca recebe `userId`, `tenantId`, `targetContentCount`, quota ou payload bruto.
- Smoke comprova preferências persistidas → geração → Briefing `DRAFT` adaptado.
- O botão Meu estilo não desloca nem remove os destinos operacionais existentes.
