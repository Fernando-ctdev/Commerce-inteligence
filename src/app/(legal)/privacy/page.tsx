import type { Metadata } from "next";

import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Política de privacidade | Viewefy",
  description: "Política de privacidade da Viewefy.",
};

export default function PrivacyPage() {
  return (
    <>
      <header className={styles.documentHeader}>
        <p className={styles.eyebrow}>Documentos legais</p>
        <h1 id="privacy-title">Política de privacidade</h1>
        <p className={styles.lead}>
          Esta política descreve quais dados a Viewefy trata, por que precisa deles e quais escolhas e direitos você possui.
        </p>
        <p className={styles.updatedAt}>Última atualização: 17 de setembro de 2026</p>
      </header>

      <nav aria-label="Seções da política de privacidade" className={styles.contents}>
        <span className={styles.contentsLabel}>Nesta página</span>
        <a href="#escopo">Escopo</a>
        <a href="#dados">Dados tratados</a>
        <a href="#finalidades">Finalidades</a>
        <a href="#tiktok">TikTok</a>
        <a href="#compartilhamento">Compartilhamento</a>
        <a href="#retencao">Retenção</a>
        <a href="#direitos">Seus direitos</a>
        <a href="#contato">Contato</a>
      </nav>

      <article aria-labelledby="privacy-title" className={styles.document}>
        <section className={styles.section} id="escopo">
          <h2>1. Escopo e responsável</h2>
          <p>
            Esta Política de privacidade se aplica à Viewefy e aos dados tratados quando você cria uma conta, usa a plataforma ou entra em contato conosco.
          </p>
          <p>
            Neste documento, “Viewefy”, “nós” e “nosso” indicam a operação da plataforma; “você” indica a pessoa que usa o serviço ou fornece dados em seu contexto.
          </p>
        </section>

        <section className={styles.section} id="dados">
          <h2>2. Dados que podemos tratar</h2>
          <p>Tratamos somente os dados necessários para oferecer, proteger e melhorar a plataforma, incluindo:</p>
          <ul>
            <li><strong>Dados da conta e autenticação:</strong> e-mail, identificadores da conta, informações básicas de cadastro, dados de sessão e informações necessárias para autenticar e proteger o acesso;</li>
            <li><strong>Dados de produtos:</strong> nome, descrição, categoria, preço, características, preferências de preparação e outras informações inseridas por você;</li>
            <li><strong>Dados de criação:</strong> preferências do creator, briefings, roteiros, cenas, CTAs, revisões e demais materiais enviados ou gerados no seu espaço;</li>
            <li><strong>Dados de integrações:</strong> quando você conecta a Viewefy a uma plataforma de terceiros, como o TikTok, podemos receber informações disponibilizadas por essa plataforma de acordo com as permissões que você conceder, como identificadores da conta, informações básicas de perfil, produtos, informações comerciais e outros dados necessários às funcionalidades que você solicitar;</li>
            <li><strong>Dados de uso:</strong> ações realizadas, páginas acessadas, status de operações e informações necessárias para diagnosticar erros; e</li>
            <li><strong>Dados de comunicação:</strong> informações que você fornece ao solicitar suporte ou enviar uma comunicação legal.</li>
          </ul>
          <p>
            Também podemos receber dados técnicos básicos, como endereço IP, tipo de dispositivo, navegador e registros de segurança, conforme necessário para prevenir abuso e manter o serviço funcionando.
          </p>
        </section>

        <section className={styles.section} id="finalidades">
          <h2>3. Como usamos os dados</h2>
          <p>Usamos os dados para:</p>
          <ul>
            <li>criar e manter sua conta e seu espaço de trabalho;</li>
            <li>processar produtos, preferências e solicitações feitas na plataforma;</li>
            <li>gerar e organizar análises e conteúdos solicitados por você;</li>
            <li>autenticar acessos, aplicar limites e proteger a conta, o serviço e terceiros;</li>
            <li>corrigir falhas, medir a estabilidade e melhorar a experiência; e</li>
            <li>cumprir obrigações legais, responder a solicitações válidas e exercer direitos.</li>
          </ul>
          <p>
            O tratamento se apoia, conforme o caso, na execução do serviço solicitado, no cumprimento de obrigações legais, no exercício regular de direitos e em interesses legítimos compatíveis com a operação segura da Viewefy. Quando a lei exigir consentimento, solicitaremos essa autorização e permitiremos sua revogação.
          </p>
        </section>

        <section className={styles.section} id="tiktok">
          <h2>4. Integração com o TikTok</h2>
          <p>
            Quando você conecta sua conta do TikTok à Viewefy, o acesso ocorre por meio dos mecanismos oficiais de autorização disponibilizados pelo TikTok. A Viewefy acessa somente os dados e recursos correspondentes às permissões concedidas por você e necessários para as funcionalidades habilitadas.
          </p>
          <p>
            Você pode negar permissões ou desconectar a integração. Quando aplicável, a Viewefy deixará de realizar novas solicitações usando aquela autorização e adotará as medidas cabíveis em relação aos dados anteriormente recebidos, observadas as obrigações legais e necessidades legítimas de retenção.
          </p>
        </section>

        <section className={styles.section}>
          <h2>5. Inteligência e provedores de processamento</h2>
          <p>
            Para entregar recursos de análise e geração, os dados necessários à solicitação podem ser processados por provedores de infraestrutura e de modelos contratados pela Viewefy. Compartilhamos apenas o contexto necessário para executar a funcionalidade, com controles contratuais e técnicos compatíveis com a finalidade.
          </p>
          <p>
            Não usamos suas credenciais de acesso para instruir provedores externos. O conteúdo gerado é uma sugestão de trabalho e continua sujeito à sua revisão antes de qualquer uso fora da Viewefy.
          </p>
        </section>

        <section className={styles.section} id="compartilhamento">
          <h2>6. Quando compartilhamos dados</h2>
          <p>Podemos compartilhar dados com:</p>
          <ul>
            <li>provedores que hospedam, armazenam, monitoram ou protegem a infraestrutura da Viewefy;</li>
            <li>provedores necessários para executar recursos solicitados, como análise e geração de conteúdo;</li>
            <li>autoridades públicas, quando houver obrigação ou ordem legal válida; e</li>
            <li>terceiros envolvidos em uma reorganização ou operação societária, com as salvaguardas aplicáveis.</li>
          </ul>
          <p>
            Não vendemos dados pessoais. Também não compartilhamos o conteúdo do seu espaço com outros usuários, salvo quando você solicitar uma ação que exija esse compartilhamento ou quando houver obrigação legal.
          </p>
        </section>

        <section className={styles.section} id="retencao">
          <h2>7. Retenção e segurança</h2>
          <p>
            Mantemos os dados pelo tempo necessário para prestar o serviço, cumprir obrigações legais, resolver disputas, fazer cumprir acordos e preservar registros essenciais de segurança. Quando os dados deixam de ser necessários, eles são excluídos, anonimizados ou mantidos somente pelo período exigido por lei.
          </p>
          <p>
            Usamos controles de acesso, sessões protegidas, armazenamento adequado e medidas de monitoramento para reduzir riscos. Nenhum serviço conectado à internet é absolutamente seguro; por isso, também dependemos de você para proteger suas credenciais e avisar sobre atividades suspeitas.
          </p>
        </section>

        <section className={styles.section} id="direitos">
          <h2>8. Seus direitos</h2>
          <p>
            Observadas as condições e exceções da legislação aplicável, você pode solicitar confirmação da existência de tratamento, acesso, correção, atualização, anonimização, bloqueio, eliminação, portabilidade quando regulamentada, informação sobre compartilhamentos e revisão de decisões tomadas unicamente com base em tratamento automatizado de dados pessoais que afetem seus interesses, nos casos previstos pela legislação aplicável.
          </p>
          <p>
            Você também pode revogar um consentimento, quando o tratamento depender dele, sem afetar o que foi feito anteriormente de forma válida. Para exercer seus direitos ou fazer solicitações relacionadas à privacidade, entre em contato pelo e-mail <a href="mailto:privacidade@viewefy.com">privacidade@viewefy.com</a>. Podemos pedir informações para confirmar sua identidade e proteger sua conta.
          </p>
        </section>

        <section className={styles.section}>
          <h2>9. Cookies e tecnologias semelhantes</h2>
          <p>
            Usamos cookies e tecnologias semelhantes necessários para manter sessões, lembrar preferências e proteger o acesso. Podemos usar registros técnicos para segurança, desempenho e diagnóstico. Você pode controlar cookies pelo navegador, mas desativar os estritamente necessários pode impedir o funcionamento de partes da plataforma.
          </p>
        </section>

        <section className={styles.section}>
          <h2>10. Transferências internacionais e menores</h2>
          <p>
            Alguns provedores podem processar dados fora do país em que você está. Quando isso ocorrer, adotaremos as medidas exigidas pela legislação aplicável para proteger os dados e autorizar a transferência.
          </p>
          <p>
            A Viewefy não é destinada a crianças. Se você entender que uma criança forneceu dados pessoais sem autorização adequada, use o canal de suporte para que possamos avaliar e tomar as medidas cabíveis.
          </p>
        </section>

        <section className={styles.section}>
          <h2>11. Alterações nesta política</h2>
          <p>
            Podemos atualizar esta política para refletir mudanças na Viewefy, nos provedores, na legislação ou nas práticas de segurança. A versão vigente estará sempre disponível nesta página, com a data de atualização no início do documento.
          </p>
        </section>

        <section className={styles.section} id="contato">
          <h2>12. Fale conosco</h2>
          <p>
            Para dúvidas, solicitações de direitos ou comunicações sobre privacidade, entre em contato pelo e-mail <a href="mailto:privacidade@viewefy.com">privacidade@viewefy.com</a>.
          </p>
        </section>
      </article>
    </>
  );
}
