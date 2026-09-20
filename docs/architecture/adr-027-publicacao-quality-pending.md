# ADR-027: Publicação com `QUALITY_PENDING` após repair semântico esgotado

## Status
Superseded por [ADR-029](./adr-029-pipeline-hibrida-deterministica-e-criativa.md).

## Registro histórico

Este ADR registrava a publicação de `QUALITY_PENDING` após rounds globais de
repair semântico. O estado não integra o contrato de produção da pipeline
híbrida. A norma vigente é `PASS|REVIEW`, repair seletivo único, preservação
da parte original quando o repair falha e publicação em `DRAFT` quando os
hard gates objetivos passam.

## Migração

Consumidores não devem criar, persistir, serializar ou tratar
`QUALITY_PENDING` como estado de `Content`. Falha objetiva continua no
contrato de parcial declarado do ADR-021. O contrato vigente está no ADR-029
e no ADR-025.