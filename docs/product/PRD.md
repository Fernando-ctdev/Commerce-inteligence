# PRD — MVP Commerce Intelligence System para TikTok Shop Creators

## 1. Visão do Produto

O produto é uma plataforma de inteligência comercial para creators e afiliados de social commerce, com foco inicial em TikTok Shop.

O MVP não tem como objetivo gerar vídeos ou imagens com IA.

O núcleo do produto é a engine de inteligência comercial e estratégica responsável por transformar um produto em um plano completo de conteúdo orientado a vendas.

A plataforma deve responder, de forma prática e operacional, à principal pergunta do creator:

**“O que eu devo gravar para vender este produto?”**

A partir de um produto, contexto de campanha e preferências do creator, o sistema gera e organiza:

* análise comercial do produto;
* identificação de público;
* dores;
* desejos;
* objeções;
* benefícios;
* argumentos de venda;
* posicionamento;
* ângulos de conteúdo;
* hooks;
* estruturas de vídeo;
* scripts;
* CTAs;
* variações;
* plano de produção;
* distribuição dos conteúdos;
* organização da fila de gravação.

A engine estratégica é a mesma para todos os planos.

Os planos comerciais limitam principalmente quantidade de produtos, campanhas, conteúdos, gerações e uso mensal da plataforma.

No futuro, planos premium poderão adicionar produção automática por IA, utilizando exatamente a mesma inteligência estratégica já criada pelo core da plataforma.

---

# 2. Problema

Creators e afiliados de TikTok Shop trabalham com grande volume de conteúdo.

Um creator pode precisar produzir dezenas de vídeos por semana para diferentes produtos.

O principal gargalo não é necessariamente a gravação.

O problema começa antes.

O creator precisa decidir repetidamente:

* qual produto trabalhar;
* qual argumento utilizar;
* qual público atacar;
* qual dor explorar;
* qual benefício destacar;
* qual hook utilizar;
* como estruturar o vídeo;
* como diferenciar um vídeo do anterior;
* qual CTA utilizar;
* quais ideias ainda não foram exploradas;
* quais conteúdos precisam ser gravados;
* como organizar o volume de produção.

Esse processo costuma acontecer de forma fragmentada através de:

* notas;
* planilhas;
* documentos;
* chats com IA;
* mensagens;
* memória;
* improvisação.

Isso gera:

* repetição de ideias;
* conteúdo sem estratégia;
* excesso de tempo planejando;
* dificuldade em manter volume;
* dificuldade em organizar campanhas;
* fadiga criativa;
* pouca variedade;
* perda de consistência;
* dificuldade para transformar estratégia em execução.

A plataforma existe para eliminar esse caos.

---

# 3. Proposta de Valor

A proposta central do produto é:

> **Transformar qualquer produto em um plano organizado de conteúdo comercial pronto para gravação.**

A plataforma não deve ser posicionada como um simples gerador de scripts.

Também não deve ser posicionada como uma ferramenta genérica de marketing.

O valor está em combinar:

**inteligência comercial + estratégia de conteúdo + organização operacional da produção.**

O usuário entra com um produto.

O sistema devolve uma máquina de produção estruturada.

---

# 4. Público-Alvo Inicial

## 4.1 Público primário

Afiliados e creators que produzem conteúdo para TikTok Shop.

Principalmente usuários que:

* promovem múltiplos produtos;
* publicam conteúdo com alta frequência;
* dependem de conteúdo orgânico para gerar vendas;
* trabalham individualmente ou em pequenas equipes;
* precisam constantemente testar novos conteúdos;
* têm dificuldade em organizar produção em escala.

## 4.2 Perfis prioritários

### Creator iniciante

Ainda não domina copywriting, vendas ou criação estratégica.

Precisa de orientação completa.

A plataforma funciona como seu estrategista de conteúdo.

### Creator intermediário

Já entende a operação, mas sofre com escala e organização.

Precisa produzir muito mais sem depender de planejamento manual.

### Creator de alto volume

Produz dezenas de vídeos por semana ou por dia.

A principal necessidade é transformar estratégia em uma operação repetível e organizada.

---

# 5. Objetivos do MVP

O MVP deve provar que creators estão dispostos a utilizar e pagar por uma plataforma que resolve o planejamento e organização de conteúdo antes da gravação.

Os principais objetivos são:

1. reduzir o tempo necessário para transformar um produto em ideias de conteúdo;
2. impedir que o creator fique sem saber o que gravar;
3. gerar variedade estratégica;
4. transformar ideias em conteúdos realmente executáveis;
5. organizar grandes volumes de conteúdo;
6. ajudar o creator a trabalhar vários produtos simultaneamente;
7. criar recorrência de uso;
8. validar disposição de pagamento pela inteligência estratégica sem depender de geração de vídeo por IA.

---

# 6. Não Objetivos do MVP

O MVP não deve tentar resolver todo o ecossistema de social commerce.

Ficam fora do escopo inicial:

* geração automática de vídeos;
* geração automática de imagens;
* edição de vídeo;
* publicação automática;
* agendamento de posts;
* conexão direta com TikTok;
* conexão com TikTok Shop;
* integração com Instagram;
* integração com marketplaces adicionais;
* analytics avançado;
* ROAS;
* CTR;
* atribuição;
* tracking de vendas;
* automação completa de campanhas;
* gestão financeira;
* CRM;
* gestão de creators;
* gestão de influenciadores;
* scraping complexo;
* análise competitiva avançada;
* pesquisa automática baseada em dados pagos externos.

O produto precisa permanecer extremamente focado.

---

# 7. Princípio Central do Produto

O sistema não deve simplesmente gerar conteúdo.

Ele deve tomar decisões estratégicas.

Existe uma diferença essencial entre:

> “Gere 30 hooks para este produto.”

e:

> “Crie uma estratégia de 30 conteúdos para este produto, distribuindo diferentes públicos, dores, objeções, benefícios, níveis de consciência, formatos e argumentos comerciais para evitar repetição.”

A segunda abordagem representa a inteligência central da plataforma.

---

# 8. Core Loop

O principal ciclo de uso deve ser:

```text
Adicionar produto
      ↓
Informar contexto
      ↓
Engine analisa produto
      ↓
Engine cria estratégia comercial
      ↓
Usuário define quantidade de conteúdos
      ↓
Engine monta plano de conteúdo
      ↓
Conteúdos são gerados
      ↓
Usuário organiza produção
      ↓
Creator grava
      ↓
Conteúdo é marcado como produzido
      ↓
Usuário solicita novos conteúdos
```

Esse ciclo deve poder ser repetido continuamente.

---

# 9. Estrutura Conceitual do Sistema

O produto possui cinco grandes entidades conceituais:

```text
Produto
   ↓
Estratégia
   ↓
Plano
   ↓
Conteúdo
   ↓
Produção
```

---

# 10. Produto

Produto representa aquilo que o creator pretende vender.

Cada produto deve possuir um espaço próprio dentro da plataforma.

## Informações mínimas

O usuário poderá informar:

* nome do produto;
* URL;
* descrição;
* categoria;
* preço, quando relevante;
* principais características;
* imagens;
* observações.

Nem todas devem ser obrigatórias.

O sistema deve permitir começar rapidamente.

O ideal é que o usuário consiga fornecer apenas um link ou descrição e posteriormente complementar informações.

---

# 11. Contexto da Estratégia

Antes da geração, o sistema pode solicitar informações adicionais.

O objetivo não é criar um formulário enorme.

Somente informações que alterem significativamente a estratégia.

Exemplos:

* objetivo;
* quantidade desejada de conteúdos;
* estilo de conteúdo;
* presença ou ausência do creator em vídeo;
* experiência com o produto;
* público desejado;
* observações;
* restrições;
* língua;
* mercado.

Grande parte dessas informações pode possuir valores automáticos sugeridos pelo sistema.

---

# 12. Commerce Intelligence Engine

Esta é a principal propriedade intelectual do produto.

A engine deve interpretar o produto como uma oportunidade comercial e não apenas como um objeto.

A análise deve produzir uma estrutura estratégica reutilizável.

## 12.1 Análise do produto

A engine deve identificar:

* problema que o produto resolve;
* benefícios funcionais;
* benefícios emocionais;
* diferenciais;
* características relevantes;
* possíveis casos de uso;
* contexto de utilização;
* gatilhos de compra;
* barreiras de compra;
* riscos de comunicação;
* possíveis argumentos de venda.

---

# 13. Público

A engine deve identificar potenciais públicos compradores.

Não basta produzir uma persona genérica.

O objetivo é descobrir diferentes grupos que permitam criar conteúdo comercial.

Exemplo:

Um mini aspirador pode ser vendido para:

* donos de carro;
* pais;
* pessoas com animais;
* pessoas preocupadas com limpeza;
* motoristas de aplicativo;
* pessoas que trabalham no carro.

Cada público pode gerar estratégias diferentes.

---

# 14. Dores

A engine deve identificar diferentes tipos de dores.

### Dor funcional

Problema concreto.

Exemplo:

> sujeira acumulada entre os bancos do carro.

### Dor emocional

Sentimento associado.

Exemplo:

> vergonha de oferecer carona em um carro sujo.

### Dor de conveniência

Exemplo:

> dificuldade de levar aspirador convencional até o carro.

### Dor financeira

Exemplo:

> pagar lavagem constantemente.

Dores devem ser utilizadas como matéria-prima para criação de conteúdo.

---

# 15. Desejos

A engine deve identificar aquilo que o consumidor pretende alcançar.

Exemplos:

* praticidade;
* economia;
* aparência;
* conforto;
* organização;
* status;
* rapidez;
* segurança;
* autonomia.

---

# 16. Objeções

A plataforma deve trabalhar explicitamente com objeções.

Exemplos:

* “isso funciona mesmo?”;
* “parece fraco”;
* “é caro”;
* “já tenho algo parecido”;
* “parece difícil de usar”;
* “não preciso disso”.

As objeções devem virar ângulos próprios de conteúdo.

---

# 17. Benefícios

A engine deve diferenciar:

**feature**

> bateria de 4.000 mAh

de:

**benefício**

> você consegue utilizar sem depender de tomada.

e:

**resultado desejado**

> consegue limpar o carro onde estiver.

O conteúdo deve priorizar benefício e resultado em vez de apenas características técnicas.

---

# 18. Ângulos de Conteúdo

Ângulo representa a perspectiva comercial utilizada para vender o produto.

A plataforma deverá possuir uma taxonomia própria de ângulos.

Exemplos:

* problema → solução;
* antes e depois;
* demonstração;
* transformação;
* comparação;
* objeção;
* curiosidade;
* descoberta;
* prova;
* conveniência;
* economia;
* lifestyle;
* desejo;
* experiência pessoal;
* erro comum;
* oportunidade;
* uso inesperado;
* reação;
* benefício específico.

A engine deve selecionar ângulos baseando-se no produto e no contexto.

Não deve utilizar categorias aleatórias simplesmente para atingir quantidade.

---

# 19. Hooks

Cada conteúdo deve possuir um hook.

Hooks devem ser gerados com função estratégica.

Exemplos de objetivos:

* interromper scroll;
* criar curiosidade;
* evidenciar problema;
* prometer resultado;
* gerar identificação;
* quebrar objeção;
* demonstrar descoberta.

O sistema deve evitar repetir estruturas excessivamente semelhantes.

---

# 20. Estrutura do Conteúdo

Cada conteúdo precisa possuir uma narrativa.

Exemplo:

```text
Hook
↓
Problema
↓
Introdução do produto
↓
Demonstração
↓
Resultado
↓
CTA
```

Outro:

```text
Hook
↓
Objeção
↓
Teste
↓
Prova
↓
Conclusão
↓
CTA
```

A engine deve escolher a estrutura adequada ao ângulo.

---

# 21. Script

O script deve ser gravável.

O sistema não deve entregar textos longos com aparência de artigo.

O script deve considerar:

* fala;
* ação;
* cena;
* produto;
* demonstração;
* mudança de enquadramento;
* CTA.

Exemplo:

```text
Cena 1
Mostrar sujeira entre os bancos.

Fala:
“Olha a quantidade de sujeira que fica aqui e você nem percebe.”

Cena 2
Mostrar o produto.

Fala:
“Eu comecei a usar esse mini aspirador justamente por causa disso.”

Cena 3
Demonstrar.

Cena 4
Mostrar resultado.

CTA:
“Eu deixei esse modelo aqui no carrinho.”
```

---

# 22. CTA

CTAs devem fazer parte da estratégia.

A engine deve variar CTAs de acordo com o contexto.

Exemplos:

* descoberta;
* compra;
* urgência;
* curiosidade;
* preço;
* disponibilidade;
* continuidade.

A plataforma deve evitar que todos os conteúdos terminem de maneira idêntica.

---

# 23. Content Plan

O plano de conteúdo é uma coleção organizada de conteúdos planejados para um produto ou objetivo.

Exemplo:

```text
Produto: Escova modeladora

Meta: 30 conteúdos
```

A engine pode distribuir:

```text
6 problema/solução
5 demonstrações
4 objeções
4 transformações
3 comparações
3 curiosidades
3 benefícios
2 lifestyle
```

Essa distribuição não deve ser fixa.

Deve ser resultado da estratégia.

---

# 24. Controle de Variedade

Uma das funções mais importantes do produto é impedir repetição.

A plataforma deve monitorar o que já foi criado para aquele produto.

Deve considerar:

* ângulos utilizados;
* hooks utilizados;
* dores utilizadas;
* benefícios utilizados;
* objeções trabalhadas;
* estruturas utilizadas;
* CTAs utilizados;
* públicos trabalhados.

Ao gerar novos conteúdos, deve preferir lacunas e variações relevantes.

Exemplo:

```text
Conteúdos anteriores:

12 demonstração
8 problema/solução
6 benefício
1 objeção
0 comparação
```

A próxima geração pode priorizar:

* objeções;
* comparações;
* novas dores;
* novos públicos.

---

# 25. Content Memory

A plataforma precisa possuir memória do histórico de cada produto.

Ela deve saber:

* quais conteúdos foram gerados;
* quais foram aprovados;
* quais foram descartados;
* quais foram gravados;
* quais ângulos já foram utilizados;
* quais hooks já foram utilizados;
* quais estratégias já foram exploradas.

Essa memória é fundamental para diferenciar o produto de uma interface genérica de IA.

---

# Briefing do Conteúdo

Cada conteúdo criado dentro de um plano deve possuir uma representação operacional chamada **Briefing do Conteúdo**.

O Briefing reúne tudo que o creator precisa para entender, revisar e produzir aquele conteúdo:

* objetivo;
* público;
* dor, desejo ou objeção trabalhada;
* benefício;
* ângulo;
* hook;
* roteiro;
* cenas;
* CTA;
* duração ou orientações relevantes.

Um plano com 20 conteúdos gera 20 briefings independentes.

Cada briefing pode ser:

* revisado;
* editado;
* regenerado parcialmente;
* descartado;
* aprovado.

Somente conteúdos aprovados seguem para produção.

Após aprovação, o conteúdo poderá ser executado:

```text
pelo próprio creator
ou
pela AI Content Production Engine, quando disponível no plano
```

O Briefing do Conteúdo é o contrato entre a estratégia criada pela plataforma e sua execução.


# 26. Production Queue

Depois da estratégia, conteúdos devem entrar em uma fila de produção.

Status mínimos:

```text
Ideia
Pronto para gravar
Gravado
Publicado
Arquivado
```

Não é necessário rastrear publicação automaticamente no MVP.

O próprio usuário poderá atualizar o status.

---

# 27. Modo de Gravação

Conteúdos prontos podem possuir uma experiência simplificada para execução.

A tela deve mostrar apenas o necessário.

Exemplo:

```text
VÍDEO 12 DE 30

Ângulo
Problema → solução

HOOK

SCRIPT

CENAS

CTA

[Anterior]

[Marcar como gravado]

[Próximo]
```

O objetivo é permitir que o creator utilize o produto durante sessões reais de gravação.

---

# 28. Batch de Produção

A plataforma deve permitir selecionar múltiplos conteúdos para formar lotes de gravação.

Exemplo:

```text
Lote de hoje

Produto: Escova XYZ
Quantidade: 12 vídeos
```

A plataforma poderá organizar os conteúdos por fatores como:

* produto;
* cenário;
* tipo de gravação;
* objeto necessário;
* estilo;
* estrutura semelhante.

No MVP, essa organização pode começar simples.

---

# 29. Content Vault

O Content Vault representa o histórico e biblioteca de conteúdo do usuário.

Deve permitir visualizar:

* produto;
* conteúdo;
* hook;
* ângulo;
* data;
* status;
* campanha;
* tags.

O Vault não é simplesmente armazenamento de mídia.

No MVP, ele funciona principalmente como memória intelectual e operacional.

---

# 30. Dashboard

O dashboard deve ser minimalista.

Não deve parecer uma ferramenta de analytics.

Informações prioritárias:

```text
Hoje

12 conteúdos para gravar
8 gravados
3 produtos ativos
```

Produtos:

```text
Escova XYZ
18 / 30 produzidos

Mini projetor
12 / 20 produzidos

Air fryer
7 / 25 produzidos
```

Ações principais:

* novo produto;
* gerar plano;
* continuar produção.

---

# 31. Fluxo Principal de Onboarding

O onboarding deve conduzir rapidamente ao primeiro valor.

Fluxo desejado:

```text
Criar conta
↓
Adicionar primeiro produto
↓
Informar objetivo
↓
Selecionar quantidade
↓
Gerar estratégia
↓
Receber primeiros conteúdos
```

A meta deve ser fazer o usuário chegar ao primeiro plano de conteúdo rapidamente.

O onboarding não deve ensinar toda a plataforma.

O próprio produto deve ensinar através do uso.

---

# 32. Fluxo de Novo Produto

```text
Novo Produto
↓
Colar URL ou inserir manualmente
↓
Confirmar informações
↓
Definir contexto
↓
Gerar estratégia
↓
Visualizar estratégia
↓
Gerar plano
```

---

# 33. Fluxo de Nova Geração

Após um produto já possuir contexto estratégico:

```text
Produto
↓
Novo lote
↓
Quantidade
↓
Objetivo opcional
↓
Gerar
↓
Engine consulta histórico
↓
Engine evita repetição
↓
Novos conteúdos adicionados
```

---

# 34. Quantidades e Planos

A inteligência estratégica deve permanecer igual em todos os planos pagos.

A diferença comercial será baseada principalmente em capacidade de uso.

Possíveis limitadores:

* quantidade de produtos ativos;
* conteúdos gerados por mês;
* campanhas;
* número de lotes;
* armazenamento/histórico;
* membros;
* funcionalidades operacionais adicionais.

Não deve existir:

> IA ruim no plano básico e IA boa no plano premium.

Isso prejudicaria a proposta do produto.

---

# 35. Regeneração

Usuários devem poder rejeitar ou regenerar elementos específicos.

Exemplos:

* gerar novo hook;
* trocar ângulo;
* mudar CTA;
* gerar nova estrutura;
* gerar nova versão completa.

O sistema deve preservar contexto.

O usuário não deve precisar explicar novamente todo o produto.

---

# 36. Feedback sobre Conteúdo

Cada conteúdo pode possuir ações simples:

* gostei;
* não gostei;
* excluir;
* regenerar;
* editar;
* duplicar.

No futuro, esses sinais podem ajudar personalização.

No MVP, o principal objetivo é melhorar a experiência operacional.

---

# 37. Edição Manual

Todo conteúdo gerado deve ser editável.

O creator mantém controle final sobre:

* hook;
* script;
* cenas;
* CTA;
* título interno;
* observações.

A plataforma é um sistema de inteligência e produtividade, não uma caixa-preta.

---

# 38. Campanhas

Campanha pode existir como agrupamento opcional.

Exemplo:

```text
Black Friday
↓
Air Fryer
Escova
Projetor
```

Entretanto, o MVP não deve transformar campanhas em uma estrutura obrigatória.

Produto deve continuar sendo o principal objeto da experiência.

---

# 39. Busca e Filtros

Filtros mínimos:

* produto;
* status;
* ângulo;
* data.

Busca textual poderá localizar:

* hooks;
* scripts;
* produtos;
* tags.

---

# 40. Interface

O princípio visual do produto deve ser:

**complexidade por trás, simplicidade na frente.**

A engine pode ser altamente sofisticada.

A interface não deve expor essa complexidade desnecessariamente.

Evitar dashboards cheios de:

* gráficos;
* indicadores;
* porcentagens;
* scores;
* métricas técnicas.

A pergunta visual deve sempre ser:

> “Qual é a próxima coisa útil que o creator precisa fazer?”

---

# 41. Navegação Principal

Uma estrutura inicial possível:

```text
Home

Produtos

Conteúdo

Produção

Vault
```

Configurações e conta podem permanecer em navegação secundária.

---

# 42. Tela de Produto

A página de produto deve funcionar como centro operacional.

Exemplo:

```text
Mini Projetor XYZ

30 conteúdos planejados
18 gravados
12 pendentes

[Estratégia]
[Conteúdos]
[Produção]
[Histórico]
```

A estratégia não precisa ocupar permanentemente a tela.

Ela deve servir como base para tudo.

---

# 43. Página de Estratégia

Deve permitir ao creator compreender rapidamente como o sistema pretende vender o produto.

Exemplo:

```text
Produto
Mini Projetor XYZ

Principais públicos
- casais
- estudantes
- famílias
- pessoas sem TV

Principais dores
- tela pequena
- TV cara
- pouco espaço

Desejos
- cinema em casa
- praticidade
- entretenimento

Objeções
- qualidade
- brilho
- tamanho
- instalação

Ângulos prioritários
...
```

O usuário pode editar ou regenerar elementos.

---

# 44. Página do Plano

Deve mostrar uma visão organizada do lote.

Exemplo:

```text
30 conteúdos

8 Problema
6 Demonstração
5 Curiosidade
4 Objeção
3 Comparação
2 Lifestyle
2 Benefício
```

Abaixo:

```text
#01
“Se sua TV ocupa metade do quarto…”

Problema → solução
Pronto para gravar

#02
“Eu achei que isso seria muito pior que uma TV…”

Objeção
Pronto para gravar
```

---

# 45. Objeto Content

Cada conteúdo deve possuir conceitualmente:

```text
Content

id

product

strategy context

target audience

pain

desire

objection

benefit

angle

hook

structure

script

scenes

cta

status

createdAt

updatedAt
```

Nem todos precisam aparecer para o usuário.

Esses elementos permitem manter inteligência e rastreabilidade.

---

# 46. Princípio de Explicabilidade

O sistema pode opcionalmente mostrar por que determinada ideia foi criada.

Exemplo:

> “Este vídeo trabalha a objeção de que o produto é fraco.”

Isso ajuda o creator a compreender estratégia sem transformar a experiência em curso de marketing.

---

# 47. Personalização

O sistema deve começar genérico, mas preparado para aprender preferências.

Possíveis informações futuras:

* estilo do creator;
* duração média;
* presença em câmera;
* tom;
* tipos favoritos de hook;
* categorias mais utilizadas;
* formato de script preferido.

No MVP, personalização pode ser baseada principalmente em configurações explícitas.

---

# 48. Internacionalização

Mesmo com TikTok Shop como foco inicial, o domínio do produto deve ser preparado para diferentes mercados.

Os elementos estratégicos são universais:

* dor;
* desejo;
* objeção;
* benefício;
* hook;
* CTA;
* script;
* ângulo.

Textos e terminologias podem ser adaptados por idioma e mercado.

---

# 49. Métricas de Produto

As métricas principais do MVP devem medir comportamento dentro da plataforma.

## Ativação

* usuário adicionou primeiro produto;
* estratégia foi gerada;
* primeiro plano foi criado;
* primeiro conteúdo foi marcado como gravado.

## Engajamento

* conteúdos gerados por usuário;
* produtos ativos;
* sessões por semana;
* conteúdos revisados;
* conteúdos movidos para produção.

## Retenção

* usuários que retornam para gerar novos lotes;
* usuários que continuam usando o mesmo produto;
* usuários ativos semanalmente.

## Conversão

* free → pago, caso exista free;
* trial → pago;
* upgrade por limite de utilização.

---

# 50. North Star Metric

Uma candidata forte para métrica principal é:

**Quantidade de conteúdos planejados que avançam para “Gravado”.**

Isso conecta inteligência à execução.

Outra métrica complementar:

**Creators que produzem conteúdo através da plataforma semanalmente.**

---

# 51. Critérios de Sucesso do MVP

O MVP estará validado se houver evidência consistente de que:

1. usuários adicionam produtos;
2. geram estratégias;
3. utilizam os conteúdos produzidos pela plataforma;
4. retornam semanalmente;
5. criam novos lotes;
6. mantêm múltiplos produtos;
7. utilizam a fila de produção;
8. marcam conteúdos como gravados;
9. atingem limites de uso;
10. demonstram disposição de pagamento.

A métrica mais importante não será número de textos gerados.

Será:

> **A plataforma está entrando no processo real de produção do creator?**

---

# 52. Hipótese Principal

A hipótese central do MVP é:

> Creators de TikTok Shop que precisam produzir conteúdo em alto volume pagarão por uma plataforma que transforme produtos em estratégias comerciais completas e conteúdos organizados prontos para gravação.

---

# 53. Hipóteses Secundárias

### Hipótese A

Creators têm dificuldade recorrente para decidir o que gravar.

### Hipótese B

Ferramentas genéricas de IA não resolvem adequadamente organização e memória operacional.

### Hipótese C

Variedade estratégica aumenta valor percebido.

### Hipótese D

Organização da fila de gravação aumenta retenção.

### Hipótese E

Creators trabalharão múltiplos produtos dentro da plataforma.

### Hipótese F

A geração automática de vídeo não é necessária para validar o valor central.

---

# 54. Riscos do MVP

## Qualidade estratégica

Se os conteúdos parecerem genéricos, o produto perde valor.

## Repetição

Gerar variações superficiais do mesmo conteúdo destruirá a percepção de inteligência.

## Complexidade da UX

Se a plataforma expuser toda a engine, ficará pesada demais.

## Produto percebido como “wrapper de ChatGPT”

O diferencial precisa aparecer através de:

* memória;
* estrutura;
* estratégia;
* workflow;
* organização;
* continuidade;
* contexto acumulado.

## Ausência de performance externa

Sem integração com TikTok, inicialmente o sistema não sabe automaticamente qual conteúdo vendeu melhor.

Isso deve ser aceito no MVP.

---

# 55. Diferenciação

O produto não compete apenas através da geração textual.

A vantagem está na soma:

```text
Conhecimento comercial especializado
+
Estratégia de conteúdo
+
Contexto permanente
+
Memória de produto
+
Controle de variedade
+
Planejamento
+
Workflow de produção
+
Organização
```

É essa composição que precisa tornar o sistema mais útil que simplesmente conversar com um modelo de linguagem.

---

# 56. Fora do MVP, mas Preparado Conceitualmente

## AI Production

No futuro:

```text
Content
↓
Production Specification
↓
AI Video Provider
↓
Vídeo
```

A estratégia permanece exatamente a mesma.

A diferença é o executor.

### Creator

```text
Estratégia
↓
Plano
↓
Creator grava
```

### IA

```text
Estratégia
↓
Plano
↓
IA produz
```

Essa expansão não deve exigir reconstrução do core estratégico.

---

# 57. Evoluções Futuras

Após validar o MVP:

### Fase 2

* melhorias avançadas de Content Vault;
* aprendizado de preferências;
* análise manual de performance;
* sugestões baseadas em conteúdos vencedores;
* templates especializados;
* colaboração.

### Fase 3

* integração TikTok;
* importação de dados;
* performance por conteúdo;
* aprendizado baseado em vendas;
* otimização automática de estratégia.

### Fase 4

* geração de vídeo;
* geração de imagem;
* geração de voice-over;
* produção multimodal;
* múltiplos providers;
* créditos.

### Fase 5

Expansão para:

* Instagram;
* Shopee;
* Amazon;
* outras plataformas de social commerce.

---

# 58. Definição Final do MVP

O MVP deve permitir que um creator:

1. cadastre um produto;
2. forneça contexto básico;
3. receba uma análise comercial;
4. receba uma estratégia de conteúdo;
5. escolha quantos conteúdos deseja produzir;
6. receba um plano estratégico diversificado;
7. visualize hooks, scripts, cenas e CTAs;
8. edite e regenere partes;
9. organize conteúdos em fila;
10. utilize um modo de gravação;
11. marque conteúdos como gravados;
12. consulte o histórico;
13. gere novos lotes sem repetir excessivamente o que já foi explorado.

Se essas treze etapas funcionarem muito bem, temos o produto.

Todo o resto pode esperar.

---

# 59. Definição de Produto em Uma Frase

> **Uma plataforma de inteligência comercial para creators de TikTok Shop que transforma produtos em estratégias e planos completos de conteúdo de vendas prontos para gravação.**

---

# 60. Regra de Produto

Sempre que surgir uma nova funcionalidade durante o desenvolvimento do MVP, ela deve responder a pelo menos uma das seguintes perguntas:

> Isso ajuda o creator a saber **o que gravar**?

> Isso ajuda o creator a saber **como gravar**?

> Isso ajuda o creator a **organizar o que precisa gravar**?

> Isso ajuda a plataforma a evitar **repetição e estratégia ruim**?

Se a resposta for não, provavelmente não pertence ao MVP.
