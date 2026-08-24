# ADR-007: Fronteira de produção de mídia para providers futuros

## Status

Aceito — fronteira conceitual; implementação postergada.

## Contexto

O MVP deve provar inteligência estratégica e organização de gravação sem gerar vídeo ou imagem por IA. O PRD, entretanto, define uma evolução em que a mesma estratégia poderá ser executada por um provider de mídia, citando Seedance como exemplo futuro.

Colocar SDK, credenciais ou campos específicos de um provider no objeto Content agora criaria dependência e desviaria o foco do MVP. Não criar essa fronteira deixaria a futura produção acoplada ao core e exigiria reconstrução.

**Relação com o PRD:** §§ 6, 8, 21, 26–29, 40, 45, 56–58 e 60.

## Decisão

Manter `Content` como especificação estratégica e o creator como executor de produção no MVP. Registrar a evolução arquitetural prevista como:

```text
Content estratégico
        ↓
Production Specification neutra de provider
        ↓
Media Provider Adapter
        ↓
Artifact de mídia
```

A `Production Specification` deverá ser derivada do conteúdo e conter apenas instruções necessárias para execução (cenas, fala, ação, produto, demonstração e CTA), sem carregar parâmetros proprietários de um provider. Cada provider futuro terá um adaptador próprio; opções específicas ficam nele.

Essa fronteira será implementada somente quando o primeiro caso de mídia for priorizado. Quando existir, usará o mecanismo assíncrono do ADR-005, armazenará artefatos fora do banco e manterá vínculo com Content, estratégia e geração original.

Não será criado agora um registry genérico, SDK de Seedance, tabela de vídeo ou abstração de créditos.

## Rationale

1. Preserva a promessa do MVP: estratégia e produção manual funcionam sem vídeo/IA.
2. Mantém a inteligência estratégica reutilizável por creator ou máquina.
3. Isola variações de provider e reduz risco de lock-in.
4. Evita pagar o custo de uma plataforma multimídia antes de validar o core.

## Opções / Trade-offs

| Opção | Benefícios | Custos / riscos |
|---|---|---|
| Fronteira conceitual e contrato neutro (escolhida) | Prepara evolução sem dependência agora | O contrato só será refinado com um caso real |
| Integrar Seedance no MVP | Feedback de mídia imediato | Escopo, custo, credenciais e lock-in fora da hipótese principal |
| Criar framework multi-provider agora | Flexibilidade teórica | Abstrações sem segundo provider e alto custo de manutenção |
| Ignorar a fronteira até o futuro | Menos documentação agora | Risco de acoplar Content ao primeiro provider e refazer o core |

## Consequências

- O MVP não terá geração de vídeo, imagem, voice-over, edição ou publicação automática.
- O conteúdo estratégico precisa ser suficientemente estruturado para derivar cenas e instruções depois.
- A primeira integração futura poderá revelar campos ausentes; o contrato deve evoluir com uma versão explícita, não por campos proprietários no core.
- Provider futuro não poderá alterar a estratégia silenciosamente; deverá consumir uma especificação e gerar artefatos rastreáveis.

## Segurança / Operação

- Credenciais e permissões de cada provider ficam isoladas no adaptador e no worker de mídia.
- Artefatos futuros precisam de controle de acesso por tenant, retenção, auditoria e política de copyright/consentimento.
- Falhas e custo de provider devem ser registrados sem expor secrets ou prompts completos.

## Fora do MVP

Seedance e qualquer outro provider, vídeo/imagem/áudio gerados, edição, voice-over, créditos de mídia, object storage de artefatos, publicação e marketplace de providers.

## Gatilhos de revisão

- primeiro provider de mídia aprovado para implementação;
- contrato de `Production Specification` estabilizado por um caso real;
- necessidade de comparar providers, controlar custos ou armazenar artefatos;
- requisitos de consentimento, copyright ou retenção para produção automática.

