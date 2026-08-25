# ADR-011: Importação via Browser Service, profile persistente e Browser Harness

## Status

Aceito — decisão vigente para a importação de produtos do TikTok Shop; substitui o caminho de API/OAuth descrito no ADR-010.

## Contexto

O PRD `docs/product/PRD-Importation-product.md` mudou a experiência de entrada: o creator informa a URL, a aplicação abre o TikTok em um Chromium associado ao usuário, o creator resolve autenticação ou verificações humanas quando necessário e o sistema extrai os fatos do produto para confirmação.

A sessão autenticada não pode ser convertida em senha, token, cookie ou payload manipulado pela aplicação principal. O profile persistente do Chromium é uma credencial sensível, deve ser isolado por usuário e precisa sobreviver ao encerramento do navegador.

O Browser Harness é uma dependência oficial desta frente. Reimplementar sua inspeção, interação ou controle de CDP dentro do monólito criaria uma segunda engine de browser e aumentaria a fragilidade do fluxo.

## Decisão

1. O Slice 002 usa uma camada isolada `Browser Service` como fronteira de aplicação/infraestrutura. Ela cria ou reutiliza o profile associado ao Tenant/usuário, inicia e encerra Chromium, abre a URL, detecta necessidade de intervenção humana, expõe o browser interativo e delega controle ao Browser Harness.
2. O Browser Harness deve ser instalado, versionado e validado por uma POC antes da aceitação do slice. A POC deve comprovar profile persistente, login manual, reabertura autenticada e extração de um produto real.
3. O sistema guarda apenas a associação server-side `userId/Tenant → browserProfileId` e o estado operacional necessário. Não guarda senha, login, cookie, token ou dados internos da sessão do TikTok na aplicação principal.
4. Cada Tenant/usuário recebe profile isolado em volume protegido. O caminho do profile, permissões, ciclo de vida, limpeza de processos e acesso ao CDP pertencem ao Browser Service; módulos de Product não acessam o filesystem ou o CDP diretamente.
5. O `Product Extraction Agent` utiliza somente as capacidades do Browser Harness e inspeciona a página atual para extrair fatos do produto. A prioridade é Accessibility Tree, depois DOM/CDP, Structured Data e Network. O agente não navega por áreas sem relação com a extração e não implementa automação genérica.
6. Login, senha, QR Code, 2FA, CAPTCHA e qualquer confirmação humana ficam com o creator. Ao encontrar `LOGIN_REQUIRED`, `CAPTCHA_REQUIRED`, `2FA_REQUIRED` ou `USER_INTERACTION_REQUIRED`, a automação pausa, entrega o browser e só retoma após o estado ser verificado.
7. A extração produz `ProductCandidate`, rascunho não confiável com fatos, lacunas, origem e URL. A confirmação humana cria o Product ativo; edição e fallback manual permanecem disponíveis. Product Import não produz Strategy nem contexto estratégico.
8. O Browser Service encerra a instância ao terminar, falhar ou ser cancelada, mas preserva o profile para reutilização. Falhas de encerramento devem ser sanitizadas e não podem expor conteúdo do profile.

## Alternativas consideradas

| Opção | Decisão | Trade-off |
|---|---|---|
| Browser Service + Browser Harness (escolhida) | Mantém browser/profile/HITL isolados e reutiliza infraestrutura oficial | Exige operação de Chromium, volume persistente e controle rigoroso do profile |
| TikTok Shop API + OAuth | Rejeitada para esta frente | Não entrega a experiência definida pelo novo PRD e adiciona credenciais externas, scopes e dependência de API não comprovada |
| Scraping direto pela aplicação | Rejeitada | Fragilidade de seletores, vazamento de responsabilidades e dificuldade de pausar para interação humana |
| Reimplementar automação/CDP internamente | Rejeitada | Duplica capacidades do Browser Harness e cria uma engine genérica fora do escopo |
| Receber cookies ou senha do creator | Rejeitada | Aumenta risco de credencial, viola o PRD e impede isolamento seguro |

## Consequências positivas

- A experiência principal reduz a entrada manual ao link do produto.
- A sessão autenticada pode ser reutilizada sem a aplicação manipular credenciais do TikTok.
- A fronteira do Browser Service permite testar Product Import sem acoplar Product, Strategy ou UI ao CDP.
- Human-in-the-loop cobre login e desafios reais sem tentar burlar controles da plataforma.
- O ProductCandidate preserva revisão humana, lacunas e proveniência antes da persistência.

## Consequências negativas e riscos

- Chromium e profiles persistentes exigem isolamento de processos, filesystem, rede, permissões e observabilidade operacional.
- A disponibilidade da importação depende do comportamento da página e pode exigir intervenção humana.
- O Browser Harness passa a ser dependência de ambiente e precisa de validação reproduzível.
- Profiles representam material de sessão e devem receber tratamento equivalente a credenciais em backup, acesso e retenção.
- A extração semântica reduz fragilidade, mas não garante estabilidade contra toda mudança do TikTok; falhas devem cair em revisão ou fallback manual.

## Segurança e operação

- Nunca persistir ou logar senha, cookie, token, conteúdo integral do profile, CDP secret ou URL com credenciais.
- Validar URL e limitar processo, tempo, rede, origem e acesso ao profile conforme a operação aprovada.
- Impedir que um Tenant abra o profile, browser ou CDP de outro Tenant.
- Encerrar processos órfãos e manter o profile no volume isolado; não apagar o profile em uma falha comum de extração.
- Redigir erros do Browser Harness e do TikTok antes de retorná-los ou registrá-los.
- Backup, restauração e retenção de profiles devem ser tratados como material sensível e configurados pela operação antes da aceitação em produção.

## Relações

- `docs/product/PRD-Importation-product.md` — fluxo e responsabilidades da importação.
- [ADR-001](./adr-001-monolito-modular-e-stack-do-mvp.md) — monólito modular e fronteira de módulos.
- [ADR-003](./adr-003-postgresql-memoria-e-rastreabilidade.md) — ProductCandidate, Product e proveniência no PostgreSQL.
- [ADR-008](./adr-008-entrada-de-produto-manual-first.md) — URL-first, confirmação humana e fallback manual.
- [ADR-009](./adr-009-identidade-autorizacao-e-tenant-inicial.md) — Tenant e autorização server-side.
- [ADR-010](./adr-010-importacao-tiktok-shop-oficial.md) — decisão anterior, agora superseded.
- `docs/delivery/SLICES.md` — Slice 002 e dependência do Slice 003.
