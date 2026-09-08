# ADR-016: Projeção server-authoritative da ação de geração

## Status

Aceito — resolve o estado de ação do Slice 003.

## Contexto

O `POST /api/generations` é a autoridade para criar Job e reservar capacidade. Ele devolve `GEN-ACTIVE` ou `GEN-CAPACITY` somente depois da tentativa. Porém, a SPEC B-003 e o PLAN exigem que `Analisar produto` permaneça visível, porém desabilitado, com explicação e próxima ação quando existir Job ativo ou falta de capacidade.

O cliente não pode inferir esse estado a partir de plano, contador, `localStorage` ou resposta anterior: esses dados são sensíveis à corrida e a autorização/entitlement pertencem ao servidor. Manter apenas o erro do POST não satisfaz o contrato visual; tratar a ação como disponível até o erro cria uma interface contraditória.

## Decisão

A leitura autenticada de Product passa a carregar uma projeção server-authoritative, avaliada no instante da leitura e escopada a `tenantId` e `userId` resolvidos da sessão:

```ts
type GenerationAction =
  | { state: "AVAILABLE"; reason: null; nextAction: null }
  | {
      state: "BLOCKED";
      reason: "GEN-ACTIVE" | "GEN-CAPACITY";
      nextAction: "VIEW_ACTIVE_ANALYSIS" | "WAIT_FOR_CAPACITY";
    };
```

`generationAction` pertence somente ao ramo `ActiveProductView` das leituras autenticadas de Product. Todo Product `ACTIVE` retornado por `GET /api/products` ou `GET /api/products/:id` inclui o objeto completo; ele nunca é `null` nem omite `reason`/`nextAction`. `AVAILABLE` exige ambos nulos. `BLOCKED` exige pares coerentes: `GEN-ACTIVE`/`VIEW_ACTIVE_ANALYSIS` ou `GEN-CAPACITY`/`WAIT_FOR_CAPACITY`.

Product `ARCHIVED` é retornado como `ArchivedProductView`, sem o campo `generationAction`; não existe ação de análise para projetar e não é criado código `GEN-*`, estado ou combinação adicional. `GEN-PRODUCT-CAPACITY` continua pertencendo à ativação/criação de Product e não é causa de bloqueio da análise de Product ativo.

As respostas bem-sucedidas de archive/reactivate mantêm o contrato mínimo de mutação `{ id, version }` e não carregam `generationAction`. Após o commit, a UI refaz o `GET` autenticado: archive recebe `ArchivedProductView` sem ação; reactivate recebe `ActiveProductView` com a projeção recalculada. A UI não infere o estado a partir da resposta de mutação nem conserva projeção anterior.

A UI usa somente a projeção de `ActiveProductView` para habilitar a ação e mapeia `reason`/`nextAction` para explicação em `pt-BR` e próxima ação. A projeção é advisory e não autoriza a mutação: `POST /api/generations` conserva sessão, CSRF, escopo, validação, transação, reserva e todos os conflitos como fonte definitiva. Após `GEN-ACTIVE` ou `GEN-CAPACITY`, a UI recarrega a projeção; isso cobre corridas entre leitura e clique sem criar estado local como fonte de verdade.

## Rationale

1. Satisfaz o contrato de UX sem duplicar regra de quota no cliente.
2. Reutiliza a projeção de Product já recarregada em navegação e reentrada; um endpoint de preflight acrescentaria round-trip e um segundo contrato para a mesma decisão.
3. Conserva a transação do POST como única autorização efetiva contra concorrência.
4. Expõe o mínimo necessário para o creator agir, sem vazar dados comerciais ou cross-tenant.

## Alternativas consideradas

| Opção | Decisão | Trade-off |
| --- | --- | --- |
| Projeção no Product (escolhida) | Uma leitura autenticada informa o estado visual requerido | Snapshot pode ficar obsoleto antes do clique; POST reconfirma |
| Endpoint de preflight separado | Também informa estado antes do clique | Segundo contrato/round-trip e ainda sujeito à mesma corrida |
| Desvio formal: bloquear apenas após POST | Menor alteração de backend | Viola DESIGN/PLAN e produz feedback tardio |
| Cálculo no cliente | Sem leitura adicional | Inseguro, duplicado e vulnerável a corrida/manipulação |

## Consequências
- Testes HTTP devem cobrir o schema completo em todo `ActiveProductView`, `ArchivedProductView` sem o campo, escopo por tenant/usuário e ausência de valores de quota no payload.
- Testes de UI e smoke autenticado devem confirmar o botão desabilitado, explicação e próxima ação; archive remove a ação após refetch e reactivate recebe a projeção recalculada após refetch. O POST continua sendo testado para a corrida após uma projeção `AVAILABLE`.
- Não há alteração de modelo de dados, persistência, reserva ou política de plano.

## Segurança / Operação

- A projeção usa `Cache-Control: no-store` e não é armazenada em `localStorage`.
- Nenhuma decisão mutável aceita `tenantId`, `userId`, plano, limite, período ou capacidade do cliente.
- Códigos e mensagens continuam sanitizados; não incluem dados de outro Tenant, IDs de Job, saldo, limite, prompt, token ou segredo.

## Gatilhos de revisão

- Ação precisar variar por Product, campanha ou membro além dos dois bloqueios atuais.
- A projeção se tornar custo mensurável em listagens grandes; nesse caso, otimizar a consulta sem mudar o contrato.
- Introdução de cobrança, upgrades ou membros alterar a semântica de capacidade.

## Relações

- [ADR-006](./adr-006-limites-de-plano-e-uso.md) — entitlement e reserva continuam autoritativos no POST.
- [ADR-009](./adr-009-identidade-autorizacao-e-tenant-inicial.md) — sessão e escopo server-side.
- [ADR-012](./adr-012-contratos-canonicos-da-commerce-intelligence.md) — contratos e resultados de geração.
- [SPEC Slice 003](../specs/slice-003/SPEC.md) — estado `blocked`.
