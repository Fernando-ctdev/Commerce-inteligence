# SPEC — Slice 012: Entrada de Product por URL via CaptAPI HTTP

**Status:** Implementado
**Dependência:** Slice 002; o Product confirmado segue a fronteira do Slice 003
**ADR:** ADR-027 (integração CaptAPI) e ADR-028 (contrato do Slice 012; ADR-022 deixa de governar este fluxo)
**Domain Areas:** Product, Product Import, Identity/Tenant

## User Outcome

O creator cola uma URL pública do TikTok Shop no mesmo formulário de criação de
Product, recebe os fatos que a CaptAPI conseguir extrair, corrige ou completa
as lacunas e confirma explicitamente o cadastro. Se a URL, o provedor ou os
dados não forem utilizáveis, ele continua no formulário manual sem perder o
que já informou.

URL e entrada manual convergem para a mesma superfície, os mesmos campos, a
mesma validação e o mesmo caso de uso de persistência. A importação nunca é
uma confirmação implícita nem cria Product antes da ação explícita de salvar.

## Escopo

- Consultar somente `GET https://api.captapi.com/v1/tiktok-shop/product-details`.
- Enviar `url` com a URL final de produto validada — short links `vt.tiktok.com`/`vm.tiktok.com` são resolvidos antes — e `region=BR`.
- Enviar `Authorization: Bearer <CAPTAPI_API_KEY>`, com o valor vindo somente
  do ambiente do servidor.
- Normalizar a resposta em um `ProductCandidate` factual, não confiável e
  editável.
- Reutilizar o formulário manual de `/products/new`, sem uma tela ou etapa de
  confirmação separada.
- Persistir somente depois de o creator confirmar no mesmo formulário, usando
  o caso de uso/serviço manual existente.
- Manter a ação posterior `Analisar produto` explícita; salvar o Product não
  cria `CommerceIntelligenceJob`.

Ficam fora do escopo Browser, Chromium, browser automation, scraping, portal,
MCP em runtime, OAuth TikTok, TikTok Shop API, login/cookies do creator,
analytics, schema novo, tabela de Candidate e PLAN deste slice.

## Fluxo convergente

```text
/products/new
  ├─ creator preenche fatos manualmente
  └─ creator cola URL pública → Importar dados
                                  ↓
                         CaptAPI HTTP (BR)
                                  ↓
              Candidate no mesmo formulário, sem persistência
                                  ↓
                 creator revisa/corrige/completa os campos
                                  ↓
                         Salvar produto (explícito)
                                  ↓
                 serviço manual → Product no Tenant
                                  ↓
                         Analisar produto (explícito)
```

Uma resposta completa também passa pela revisão e confirmação do formulário;
não existe atalho que transforme resposta do provedor em Product ativo. Uma
resposta parcial abre o mesmo formulário com os valores disponíveis e deixa
vazios os campos ausentes. Nenhum valor é inferido, copiado de outra fonte ou
substituído por default factual.

## Contrato do ProductCandidate

O Candidate expõe somente fatos que o formulário/serviço atual suportam:

```ts
type ProductCandidate = {
  name?: string;
  description?: string;
  category?: string;
  price?: string;
  priceCurrency?: "R$" | "USD" | "EUR";
  features: string[];
  imageRefs: string[]; // zero ou uma entrada: somente data.images[0]
  sourceUrl: string;
  discountType?: "PERCENTAGE";
  discountValue?: string;
  gaps: Array<"name" | "description" | "category" | "price" | "priceCurrency" | "features">;
  signals?: {
    salesCount?: number;
    ratingValue?: number;
    reviewCount?: number;
  };
};
```

`seller`, marca, variantes e qualquer outro atributo sem campo suportado no
formulário/serviço não fazem parte do Candidate deste slice. Não devem virar
gap, ser mostrados como se fossem editáveis ou ser persistidos por um contrato
paralelo.

`signals` são opcionais, somente leitura e não fazem parte dos fatos salvos do
Product. Cada sinal só aparece quando a CaptAPI o fornecer explicitamente com
tipo e faixa válidos. Ausência, `null`, texto não numérico ou valor inválido
significa ausência; não há zero, média ou estimativa implícita.

`imageRefs` considera somente `data.images[0]` quando essa entrada é uma URL
HTTP(S) válida. O restante da galeria é descartado para não violar o contrato
atual de imagens/capa.

## CaptAPI e normalização

- O servidor valida a URL antes de qualquer chamada: HTTPS, host/path público
  permitido do TikTok Shop — incluindo short links mobile
  `https://vt.tiktok.com/<token>` e `https://vm.tiktok.com/<token>` com um
  único segmento não vazio —, sem credenciais embutidas e sem destino privado.
- Short links são resolvidos server-side antes da CaptAPI: `fetch` com
  `redirect: "manual"`, cada `Location` revalidado contra HTTPS, hosts TikTok
  permitidos (`vt.tiktok.com`, `vm.tiktok.com`, `shop.tiktok.com`,
  `www.tiktok.com`) e ausência de credenciais, com no máximo 5 hops, detecção
  de loop e nenhum follow automático de destino arbitrário. A consulta só
  prossegue se a URL final for uma rota completa de produto válida, que é a
  única forma enviada à CaptAPI e usada como `sourceUrl` do Candidate. URLs
  completas `shop.tiktok.com`/`www.tiktok.com` não passam por resolução.
  Falhas de resolução (fora do TikTok, loop, hop, timeout ou final
  não-produto) caem no fallback manual com erro sanitizado.
- A requisição externa ocorre fora da transação curta de persistência.
- `CAPTAPI_API_KEY` é lida exclusivamente no servidor, nunca no browser,
  código de teste como segredo real, resposta ou log.
- Resposta 2xx precisa conter JSON válido, confirmação de sucesso e objeto de
  dados com shape reconhecível. Campos ausentes dentro desse objeto produzem
  Candidate parcial; resposta sem shape de dados é erro de shape recuperável.
- Preço, moeda, textos, características, desconto, imagem e sinais são
  normalizados com limites e allowlists antes de chegar ao formulário.
- O Candidate preserva `sourceUrl` exatamente na forma canônica validada e não
  recebe fatos da URL, HTML, browser ou outra chamada auxiliar.

## Confirmação e persistência

O botão de importação apenas consulta e hidrata o formulário. O botão primário
de salvar continua sendo a única confirmação humana. Antes de persistir, o
mesmo formulário deve exigir as regras do cadastro manual vigente: nome,
descrição, categoria, preço/moeda e ao menos uma característica válida; os
demais campos seguem suas regras atuais.

O POST manual recebe somente os campos do contrato manual. `signals`, gaps,
payload bruto da CaptAPI e atributos não suportados não são enviados nem
persistidos. O cliente não envia `provenanceOrigin` e não pode forjar a origem:
`sourceUrl`/`submittedUrl` podem ser mantidos como URLs do fluxo, enquanto o
service manual permanece gravando `origin: manual`, sem criar uma tabela de
Candidate ou alterar o schema neste slice.

## Fallback manual e erros

Toda falha recuperável mantém o formulário utilizável e oferece a ação manual.
O creator pode corrigir a URL, continuar sem URL ou preencher os fatos do zero.
Nenhuma falha cria Product parcial.

| Situação | Estado do formulário | Mensagem/ação |
|---|---|---|
| URL ausente ou inválida | Manual | corrigir URL ou continuar manualmente |
| `CAPTAPI_API_KEY` ausente | Manual | importação automática indisponível; preencher manualmente |
| timeout/rede/provedor 4xx/5xx | Manual | consulta indisponível; tentar novamente ou preencher manualmente |
| JSON inválido, resposta grande ou shape inválido | Manual | dados não puderam ser lidos; revisar manualmente |
| Candidate parcial | Editável | preservar campos disponíveis e destacar faltas |
| validação manual no salvar | Mesmo formulário | erros por campo; nenhum registro inválido |

Mensagens são sanitizadas, estáveis em `pt-BR` e não incluem chave, Authorization,
cookies, tokens, URL interna ou payload bruto.

## Estados de UX

- `manual/idle`: formulário disponível; URL pode estar vazia.
- `importing`: consulta em andamento; botão de importar desabilitado e status
  anunciado por live region.
- `candidate-ready`: fatos retornados no mesmo formulário; sinais opcionais
  aparecem como leitura e gaps permanecem editáveis.
- `candidate-partial`: mensagem clara de que faltam campos; CTA continua
  sendo completar e salvar, não confirmar automaticamente.
- `fallback-manual`: erro recuperável visível, valores preservados e ação
  manual disponível.
- `saving`: confirmação manual em andamento; impedir duplo envio.
- `saved`: Product confirmado; seguir para o resumo atual.

O fluxo não exibe progresso, score, ETA ou certeza que a CaptAPI não forneceu.
Sinais de comércio não podem substituir preço, descrição ou outros fatos do
cadastro.

## Acessibilidade e responsividade

- URL tem label persistente, instrução de formato e erro associado ao campo.
- Importar, continuar, salvar e cancelar são controles de teclado com foco
  visível e alvo mínimo de `44×44px`.
- Status de importação e erro usam `aria-live`/`role="status"` ou `role="alert"`
  sem roubar foco; após erro de validação, o foco vai para o primeiro campo
  inválido.
- Candidate parcial não usa cor como único indicador: gaps têm texto e erro
  associado.
- Mobile mantém a experiência completa em uma coluna; desktop amplia o
  formulário sem criar uma etapa paralela ou painel obrigatório.
- Movimento, loading e foco seguem `DESIGN.md`, com leitura clara em light e
  dark mode e sem depender de hover.

## Tenant e segurança

- Sessão server-side resolve usuário e Tenant; nenhum `tenantId` do cliente é
  autoridade.
- Importação e confirmação exigem sessão; origem/CSRF segue o contrato manual.
- Ids e chaves de idempotência são escopados ao Tenant.
- O servidor faz allowlist de URL/host, limita o timeout total (resolução de
  short link + CaptAPI) a 60s e o tamanho da resposta, não segue destinos
  fora do allowlist TikTok e não aceita credenciais na URL.
- CaptAPI é o único egress desta entrada. Não há browser, portal, MCP, cookies
  ou login TikTok em runtime.
- Conteúdo do provider é dado não confiável: nunca instrução, regra, autorização
  ou fonte para alterar quota, estado, Tenant ou persistência.
- Logs contêm apenas código/motivo sanitizado; não contêm API key, Authorization,
  cookies, tokens, payload bruto ou sinais não necessários.

## Idempotência e concorrência

- A consulta URL-first recebe chave de importação válida por tentativa,
  reutilizável em retry da mesma ação e escopada ao Tenant/URL.
- Importação não cria Product nem reserva quota; replay nunca cria registro.
- A confirmação usa a chave própria do cadastro manual, distinta da chave da
  consulta, e preserva o replay do serviço existente.
- Duplo clique em importar não pode produzir duas confirmações; duplo clique em
  salvar segue a idempotência do POST manual.
- Candidate local pode ser descartado sem operação de remoção no banco.

## Testes previstos

Testes determinísticos, sem créditos reais e sem segredos:

- URL válida, região BR, endpoint CaptAPI e header de Authorization mockado;
- short link `vt`/`vm.tiktok.com` resolvido server-side com cadeia multi-hop e
  `Location` relativo, enviando somente a URL final à CaptAPI;
- redirect para fora do TikTok, loop, excesso de hops e término sem produto
  rejeitados sem seguir destino e sem payload bruto;
- URL completa de produto sem nenhuma chamada de resolução;
- payload completo e payload parcial com `price: null` retornando Candidate;
- campos ausentes preservados como ausentes, sem valores inventados;
- `salesCount`, `ratingValue` e `reviewCount` válidos somente como leitura;
- sinais ausentes/nulos/inválidos não aparecem nem são persistidos;
- oito imagens retornadas resultam em exatamente `imageRefs = [images[0]]`;
- Candidate parcial não persiste antes da confirmação;
- completar campos no mesmo formulário e salvar persiste pelo serviço manual;
- produto completo também exige confirmação explícita;
- URL inválida, configuração ausente, timeout, rede, 4xx/5xx, JSON inválido,
  shape inválido, resposta grande e desconto inválido caem no fallback;
- replay e concorrência por Tenant não duplicam Product;
- nenhum teste imprime ou contém API key real, cookies, tokens ou payload bruto.

## Critérios de aceite

1. Usuário autenticado cola uma URL pública válida e a CaptAPI é consultada uma
   única vez com `region=BR` e credencial somente do ambiente servidor.
2. URL e cadastro manual convergem no mesmo formulário e no mesmo contrato de
   persistência.
3. Resposta completa não persiste até o creator clicar em salvar/confirmar.
4. Resposta parcial abre Candidate editável, mantém valores disponíveis e deixa
   faltas vazias, incluindo preço ausente.
5. Nenhum Product inválido ou parcial é persistido antes da confirmação.
6. Depois de completar os campos obrigatórios, o Product é salvo pelo serviço
   manual atual e a análise continua sendo uma ação separada.
7. `imageRefs` contém no máximo `images[0]`; a galeria restante não entra no
   contrato.
8. Sinais `salesCount`, `ratingValue` e `reviewCount`, quando presentes, são
   somente leitura, opcionais e nunca inventados/persistidos como fatos.
9. Falhas de URL, configuração, rede, HTTP, JSON e shape preservam fallback
   manual com mensagens sanitizadas e sem vazamento de segredo.
10. Sessão, Tenant, CSRF, allowlist de URL, timeout, limite de resposta e
    idempotência são aplicados no servidor.
11. A experiência atende teclado, foco, live regions, contraste e mobile do
    `DESIGN.md`.
