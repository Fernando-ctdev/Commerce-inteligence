# Prompt — Criar ou Atualizar PRD

Com base na definição, pesquisa, validação e fontes já existentes, determine primeiro qual decisão funcional precisa ser registrada.

Leia `AGENTS.md`, quando existir, e descubra todos os PRDs já existentes em `docs/product/`.

## Decida o tipo de alteração

### PRD principal

Use o PRD principal quando estiver definindo ou alterando contexto global do produto, como visão, problema, público, proposta de valor, core loop, escopo geral ou regras funcionais transversais.

O caminho padrão é:

`docs/product/PRD.md`

### PRD especializado

Crie ou atualize um PRD especializado quando uma área relevante do produto precisar de detalhamento próprio sem inflar o PRD principal.

Exemplos:

- domínio específico;
- capability relevante;
- fluxo complexo;
- integração de produto;
- operação especializada;
- comportamento funcional que mereça fronteira documental própria.

Use nome descritivo e siga a convenção existente em `docs/product/`.

Não crie PRD especializado para qualquer detalhe pequeno.

## Regras

O documento deve ser autossuficiente dentro de sua responsabilidade e não depender do histórico da conversa para ser compreendido.

Inclua somente o que for útil para construir ou evoluir o produto:

- problema/contexto;
- objetivo;
- comportamento esperado;
- escopo deste PRD;
- requisitos e regras;
- não objetivos;
- critérios de sucesso/aceite quando aplicáveis;
- riscos e hipóteses ainda abertas.

Quando for especializado, deixe clara sua relação com o PRD principal e não repita desnecessariamente definições globais.

Não escolha stack tecnológica nem faça System Design neste documento.

Não altere silenciosamente outro PRD para resolver conflito. Se encontrar contradição material entre fontes funcionais, registre o conflito para revisão.

Ao final, revise se o documento representa corretamente sua fronteira funcional e se contém contexto suficiente para agentes diferentes utilizá-lo nas próximas etapas.
