# PRD — Briefing e Content Operations

## 1. Objetivo

Transformar os conteúdos gerados pela estratégia em unidades claras, editáveis, aprováveis e prontas para produção.

Fluxo principal:

```text
Strategy
↓
Content Plan
↓
Content Briefs
↓
Revisão
↓
Aprovação
↓
Production Queue
↓
Execução
↓
Concluído
↓
Vault
```

A regra é:

> **A inteligência decide o que produzir. O Briefing transforma essa decisão em algo que o creator consegue revisar e executar.**

---

## 2. Content Plan e Briefings

Um plano pode gerar qualquer quantidade de conteúdos.

Exemplo:

```text
Produto: Mini Aspirador

Plano
20 conteúdos
↓
20 Briefings do Conteúdo
```

Cada Briefing é independente.

A engine deve variar estrategicamente entre eles:

* públicos;
* dores;
* desejos;
* objeções;
* benefícios;
* ângulos;
* hooks;
* estruturas;
* roteiros;
* cenas;
* CTAs.

O objetivo não é produzir 20 variações superficiais da mesma ideia.

---

## 3. Briefing do Conteúdo

Cada conteúdo deve possuir um `ContentBrief`.

Estrutura conceitual:

```ts
interface ContentBrief {
  id: string;
  productId: string;
  planId: string;

  objective?: string;

  targetAudience?: string;
  pain?: string;
  desire?: string;
  objection?: string;
  benefit?: string;

  angle: string;
  hook: string;

  script: string;
  scenes: Scene[];

  cta: string;

  notes?: string;

  status: ContentStatus;
}
```

Nem todos os elementos estratégicos precisam aparecer permanentemente na interface.

A interface deve priorizar aquilo que ajuda o creator a decidir:

> **“Quero produzir este conteúdo?”**

---

## 4. Experiência de revisão

A tela deve permitir navegar rapidamente entre vários briefings do mesmo plano.

Exemplo:

```text
Mini Aspirador
20 conteúdos · 8 aprovados

Conteúdos                     Briefing #07

✓ #01 Problema                Público
✓ #02 Objeção                 Motoristas
  #03 Demonstração
  #04 Curiosidade             Ângulo
→ #07 Economia                Economia
  #08 Lifestyle
                              Hook
                              "Você gasta quanto..."

                              Roteiro
                              ...

                              Cenas
                              ...

                              CTA
                              ...

                              [Editar]
                              [Aprovar]
```

Para grandes quantidades, evitar dezenas de abas horizontais.

Preferir:

* lista lateral;
* navegação vertical;
* seletor de conteúdos;
* ou tabs apenas quando a quantidade for pequena.

---

## 5. Ações sobre o Briefing

Cada Briefing pode possuir:

```text
Editar
Aprovar
Descartar
Duplicar
Regenerar
```

Regenerações específicas:

```text
Novo hook
Trocar ângulo
Novo CTA
Nova estrutura
Nova versão completa
```

Regenerar uma parte não deve obrigar o usuário a explicar novamente o produto ou a estratégia.

---

## 6. Aprovação

Um Briefing não entra automaticamente em produção.

Fluxo:

```text
DRAFT
↓
usuário revisa
↓
APPROVED
```

Ao aprovar, deve ser preservada a versão exata que foi aprovada.

Exemplo conceitual:

```text
ContentBrief v1
↓
edição
↓
ContentBrief v2
↓
edição
↓
ContentBrief v3
↓
APROVADO
```

A produção utiliza a versão `v3`.

Se o usuário editar novamente depois da aprovação, uma nova versão deve ser criada e aprovada novamente.

Isso garante rastreabilidade entre:

```text
Briefing aprovado
↓
produção executada
↓
resultado produzido
```

---

## 7. Aprovação em lote

O usuário pode aprovar vários conteúdos individualmente e depois enviar os aprovados para produção.

Pode existir ação em lote:

```text
[ Aprovar selecionados ]

[ Enviar aprovados para produção ]
```

Edição em massa dos campos dos briefings não é necessária.

---

## 8. Production Queue

Depois da aprovação:

```text
APPROVED
↓
Production Queue
```

A fila deve mostrar somente trabalho ativo.

Estados internos:

```text
DRAFT
APPROVED
IN_PRODUCTION
COMPLETED
ARCHIVED
```

Na interface, simplificar para:

```text
Rascunhos
Prontos
Em produção
```

Conteúdos concluídos devem sair da fila principal.

---

## 9. Kanban

A Production Queue pode utilizar uma visão Kanban simples:

```text
┌────────────────┬────────────────┬────────────────┐
│ Rascunhos      │ Prontos        │ Em produção    │
│                │                │                │
│ Aspirador #12  │ Aspirador #08  │ Projetor #03   │
│ Escova #05     │ Escova #02     │                │
│ Projetor #09   │ Aspirador #09  │                │
└────────────────┴────────────────┴────────────────┘
```

Não transformar a produção em uma ferramenta complexa de gestão de projetos.

O Kanban existe apenas para responder:

> **O que ainda precisa ser produzido?**

---

## 10. Execução

Ao enviar um conteúdo aprovado para produção, o usuário escolhe o executor.

```text
Briefing aprovado
        ↓
Como deseja produzir?

[ Gravar eu mesmo ]

[ Gerar com IA ]
```

Conceitualmente:

```ts
type ExecutionMode =
  | 'CREATOR'
  | 'AI';
```

Ambos utilizam o mesmo Briefing aprovado.

---

## 11. Creator Production

No MVP:

```text
Briefing
↓
Pronto
↓
Creator começa gravação
↓
IN_PRODUCTION
↓
Creator conclui
↓
COMPLETED
```

O modo de gravação deve mostrar apenas as informações necessárias:

```text
Hook

Roteiro

Cenas

CTA

[Anterior]

[Concluir gravação]

[Próximo]
```

---

## 12. AI Content Production — Premium

A execução por IA utiliza exatamente a mesma estratégia e o mesmo Briefing.

```text
Approved Content Brief
↓
Production Specification
↓
AI Content Production
↓
Provider
↓
Vídeo
```

Providers poderão incluir, por exemplo:

```text
Seedance
outros providers de vídeo
imagem
voice-over
```

A AI Production Engine não deve redefinir:

* público;
* dor;
* estratégia;
* ângulo;
* hook;
* roteiro;
* CTA.

Ela recebe uma decisão já tomada e executa.

A diferença entre creator e IA é somente o executor:

```text
                 Approved Brief
                       ↓
             ┌─────────┴─────────┐
             ↓                   ↓
          Creator               IA
             ↓                   ↓
           mídia                mídia
```

A geração automática permanece Premium e pode continuar fora do primeiro MVP.

---

## 13. Conclusão e Vault

Quando o conteúdo for concluído:

```text
IN_PRODUCTION
↓
COMPLETED
↓
sai da fila ativa
↓
Vault
```

O Vault mantém a memória intelectual e operacional.

Deve preservar:

* produto;
* plano;
* Briefing aprovado;
* versões;
* público;
* dor;
* benefício;
* objeção;
* ângulo;
* hook;
* roteiro;
* CTA;
* modo de execução;
* data;
* status;
* mídia final, quando existir.

Essa memória também alimenta o controle de variedade das próximas gerações.

---

## 14. Separação de responsabilidades

```text
Commerce Intelligence
= decide como vender
```

```text
Sales Content Engine
= cria o conjunto estratégico de conteúdos
```

```text
Content Operations
= revisão, briefing, aprovação, produção e histórico
```

```text
AI Content Production
= executa a mídia quando solicitado
```

Nenhum desses domínios deve assumir a responsabilidade do outro.

---

## 15. Fora do escopo

Não incluir nesta frente:

* publicação automática;
* agendamento;
* analytics externo;
* ROAS;
* CTR;
* atribuição;
* gestão complexa de projetos;
* dezenas de estados de workflow;
* aprovação com múltiplos níveis;
* colaboração avançada.

---

## 16. Critérios de aceite

A frente está pronta quando:

1. um Plan pode possuir múltiplos Briefings;
2. cada Briefing pode ser aberto individualmente;
3. usuário pode navegar entre 10, 20 ou mais conteúdos;
4. usuário pode editar cada Briefing;
5. usuário pode regenerar partes específicas;
6. usuário pode descartar conteúdos;
7. usuário pode aprovar individualmente;
8. versão aprovada fica preservada;
9. aprovados podem entrar na Production Queue;
10. fila mostra somente conteúdos vivos;
11. creator pode iniciar e concluir uma gravação;
12. concluídos saem da fila e permanecem no Vault;
13. arquitetura permite futuramente usar IA como executor.

---

## 17. Regra final

O fluxo deve permanecer:

```text
Gerar
↓
Entender
↓
Editar se necessário
↓
Aprovar
↓
Produzir
↓
Arquivar
```

O usuário nunca deve precisar compreender a complexidade interna da engine para decidir o que gravar.

> **O Briefing do Conteúdo é a ponte entre inteligência e execução.**
