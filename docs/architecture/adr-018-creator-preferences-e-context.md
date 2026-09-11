# ADR-018: CreatorPreferences persistente e CreatorContext por capability

## Status

Aceito — decisão explícita do usuário; implementar somente após SPEC, PLAN e SLICES atualizados.

## Contexto

O produto precisa guardar preferências recorrentes do creator e reaplicá-las na geração sem misturá-las com fatos de Product ou com `GenerationConstraints` de uma execução. O modelo já possui `TenantPreference`, atualmente usado para `targetContentCount`. A engine já aceita contexto, mas o fluxo de geração precisa capturar uma versão autorizada e projetá-la por capability.

A decisão visual explícita do usuário também exige que **Meu estilo** apareça como botão na sidebar. Isso é uma exceção deliberada à lista fixa de destinos do `DESIGN.md`; o `DESIGN.md` não será alterado.

## Decisão

1. Separar os contratos de contexto:
   - `AccountContext`: `language` e `market`, pertencentes a conta/Tenant e aplicáveis transversalmente;
   - `CreatorPreferences`: estilo e execução de gravação, expostos na página dedicada **Meu estilo**.
2. Persistir ambos no ownership existente de `TenantPreference`, sem tabela, serviço ou módulo paralelo nesta etapa. A separação é de contrato, use case, API e projeção; a implementação deve manter namespaces de campos distintos.
3. Mapear `CreatorPreferences` para:
   - `appearsOnCamera` opcional;
   - `prefersVoiceOver` opcional;
   - `preferredDurationSeconds` opcional;
   - `tone` opcional;
   - `executionStyle` opcional;
   - `recordingEquipment` opcional, array de (`phone`, `camera`, `other`);
   - `recordingSupport` opcional, array de (`tripod`, `handheld`, `none`, `other`);
   - `recordsAlone` opcional;
   - `restrictions` opcional, array de strings;
   - `notes` opcional, array de strings.
4. `recordingEquipment` e `recordingSupport` aceitam múltiplas escolhas independentes. `none` é exclusivo de qualquer outro valor em `recordingSupport`. Não existe inferência entre equipamento, suporte ou `recordsAlone`.
5. `AccountContext.language` é obrigatório no contexto efetivo, com default `pt-BR`; `market` é opcional. Esses campos não pertencem ao formulário Meu estilo.
6. Manter `targetContentCount` separado como restrição de geração. Ele não entra no `CreatorContext`.
7. O caso de uso de geração captura snapshots autorizados no início do Job. Retry técnico reutiliza os snapshots; alterações posteriores não mudam uma execução em andamento.
8. A engine cria projeções allowlisted, limitadas e imutáveis por capability. O agregado persistente nunca é enviado ao provider.
9. `userId` pode existir no contexto interno para rastreabilidade, mas não é enviado ao provider.
10. Expor APIs separadas:
   - `GET/PATCH /api/account/preferences` para `AccountContext`;
   - `GET/PATCH /api/creator-preferences` para `CreatorPreferences`.
   Sessão server-side resolve usuário e Tenant; o cliente não fornece ownership.
11. A área visual canônica será a página dedicada `/my-style`, acessível pelo botão existente na sidebar. A decisão prevalece sobre o `DESIGN.md`; SPEC e PLAN registram a exceção sem alterar o DESIGN.

## Projeções

- `PRODUCT_UNDERSTANDING`: nenhum contexto de conta ou creator.
- `COMMERCIAL_OPPORTUNITY_MAPPING`: `language`, `market`, `tone`, `executionStyle`, `restrictions`.
- `STRATEGY_SYNTHESIS`: `language`, `market`, `tone`, `executionStyle`, `restrictions`, `notes`.
- `CONTENT_PLAN_GENERATION`: `language`, `market`, `preferredDurationSeconds`, `executionStyle`, `restrictions`.
- `CONTENT_BRIEF_GENERATION`: `language`, `market`, todos os campos de CreatorPreferences.
- Gates, quota, estados, IDs e persistência: nenhum campo de contexto.

## Validação e segurança

A validação server-side rejeita campos desconhecidos, tipos inválidos, strings vazias, limites excedidos, cardinalidade inválida e valores de enum fora da allowlist. `recordingEquipment` e `recordingSupport` são arrays deduplicados; `recordingSupport = ["none"]` é a única forma válida de usar `none`, que é exclusivo de qualquer outro valor. Migração de valores escalares existentes é singleton direta, sem inferência. Recomenda-se `15–600` segundos, até 120 caracteres nos campos simples, até 300 por item e até 10 itens por array; a SPEC fixa os limites finais. PATCH é parcial e atômico. Mutação exige proteção de origem/CSRF. Contextos não podem alterar fatos, quota, quantidade, autorização, estado, Strategy persistente ou workflow.

## Alternativas

| Opção | Decisão | Trade-off |
|---|---|---|
| Estender `TenantPreference` | Escolhida | Menor mudança e preserva o ownership existente |
| Criar `CreatorPreferences` separado | Rejeitada | Duplica relação one-to-one e aumenta migração |
| JSON único | Rejeitada como contrato primário | Flexível, mas enfraquece validação; payload evolutivo pode existir apenas onde não houver dimensão consultável |
| Colocar botão em Configurações sem item próprio | Rejeitada | Contraria decisão explícita do usuário |

## Consequências

- BackEnd precisa separar contexto persistente de restrições de uma geração.
- FrontEnd ganha uma ação de sidebar além dos cinco destinos descritos no DESIGN.
- O botão não cria novo domínio, quota, navegação operacional ou capacidade de mídia.
- Mudanças futuras de campos exigem validação/versionamento do contrato.

## Relações

- `PRD.md` §§ 11–12 — CreatorPreferences e GenerationConstraints.
- `PRD-commerce-intelligence-engine.md` § 23 e § 32 — CreatorContext e Brief Generator.
- `SYSTEM-DESIGN.md` §§ 3, 5, 7 — limites de módulos e projeções.
- `DESIGN.md` §§ 2–3 — exceção visual explícita registrada fora do DESIGN.
- `ADR-009` — identidade, Tenant e autorização.
- `ADR-012` — contratos canônicos e projeções allowlisted.
