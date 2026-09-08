# ADR-017: Correlação sanitizada de chamadas ao provider

## Status

Aceito — observabilidade do Slice 003.

## Contexto

O worker passou a registrar origem do endpoint, modelo efetivo, status HTTP e `request-id` de header quando houver. No smoke posterior, OpenRouter retornou `200` para chamadas de `openai/gpt-5.6-luna`, mas não enviou `x-request-id`/`request-id`; o identificador correlacionável do portal estava em `body.id`.

Sem uma chave de correlação, status HTTP isolado não permite atribuir causa a limite de crédito, RPM, roteamento ou provider externo. Persistir corpo de resposta, prompt ou payload para obter essa chave violaria a política de dados mínimos e introduziria conteúdo não confiável no diagnóstico.

## Decisão

Adicionar `providerRequestId` e `providerRequestIdSource` à allowlist de telemetria por capability e à metadata interna de falha:

```ts
type ProviderRequestCorrelation = {
  providerRequestId: string;
  providerRequestIdSource: "header" | "body.id";
};
```

Ordem de coleta:

1. Usar `x-request-id` ou `request-id` quando presente.
2. Na ausência de header, extrair exclusivamente a chave raiz JSON `id` do corpo da resposta, inclusive em erro HTTP, sem persistir o corpo.
3. Aceitar o valor somente se for string ASCII entre 1 e 200 caracteres e corresponder a `[A-Za-z0-9._:-]+`; caso contrário, omitir ambos os campos.

O identificador é evidência operacional opaca, não identidade de usuário, segredo, prompt, modelo de negócio ou dado de entrada. Ele não aparece na UI nem em respostas HTTP ao creator. Registros anteriores permanecem sem correlação; não há backfill inventado.

## Rationale

- Permite comparar exatamente uma chamada do worker com o portal do provider quando o header estiver ausente.
- Mantém a coleta mínima: uma chave validada, sem payload ou mensagem de erro.
- Preserva a regra de que resposta do provider é não confiável; a validação impede texto livre, caracteres de controle e valores excessivos.

## Consequências

- Eventos `capability.failed` e metadata interna passam a carregar somente o identificador validado e sua origem.
- Testes devem cobrir header prioritário, fallback `body.id`, valores ausentes/inválidos, corpo não JSON e ausência de API key/payload no evento serializado.
- A correlação habilita investigação futura; não prova sozinha que um `429` foi causado pelo provider.

## Fora da decisão

- Retry automático de `429`, reenfileiramento e mudança de estados do Job. Qualquer um altera semântica de retry técnico/terminal e requer SPEC, testes e decisão própria.
- Persistência de corpo de resposta, mensagem de erro, prompt, token, cookie, payload ou headers fora da allowlist.

## Relações

- [ADR-003](./adr-003-postgresql-memoria-e-rastreabilidade.md) — metadata mínima e rastreável.
- [ADR-012](./adr-012-contratos-canonicos-da-commerce-intelligence.md) — observabilidade interna e entrada não confiável.
- [ADR-013](./adr-013-model-router-e-intelligence-tier.md) — provider fora da regra de negócio.
