import type { Metadata } from "next";

import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Termos de serviço | Viewefy",
  description: "Termos de serviço da Viewefy.",
};

export default function TermsPage() {
  return (
    <>
      <header className={styles.documentHeader}>
        <p className={styles.eyebrow}>Documentos legais</p>
        <h1 id="terms-title">Termos de serviço</h1>
        <p className={styles.lead}>
          Estes termos explicam as regras para usar a Viewefy, uma plataforma de inteligência comercial e organização de conteúdo para creators.
        </p>
        <p className={styles.updatedAt}>Última atualização: 17 de setembro de 2026</p>
      </header>

      <nav aria-label="Seções dos termos de serviço" className={styles.contents}>
        <span className={styles.contentsLabel}>Nesta página</span>
        <a href="#aceitacao">Aceitação</a>
        <a href="#servico">Serviço</a>
        <a href="#conta">Conta</a>
        <a href="#conteudo">Conteúdo</a>
        <a href="#uso">Uso aceitável</a>
        <a href="#encerramento">Encerramento</a>
        <a href="#contato">Contato</a>
      </nav>

      <article aria-labelledby="terms-title" className={styles.document}>
        <section className={styles.section} id="aceitacao">
          <h2>1. Aceitação destes termos</h2>
          <p>
            Ao criar uma conta, acessar ou usar a Viewefy, você concorda com estes Termos de serviço e com a nossa Política de privacidade. Se você não concordar com alguma parte, não use o serviço.
          </p>
          <p>
            Se você usa a Viewefy em nome de uma pessoa ou empresa, declara que tem autorização para aceitar estes termos em nome dela.
          </p>
        </section>

        <section className={styles.section} id="servico">
          <h2>2. O serviço</h2>
          <p>
            A Viewefy oferece ferramentas para registrar informações de produtos, organizar preferências, analisar oportunidades comerciais e preparar conteúdos para revisão e gravação.
          </p>
          <p>
            A plataforma é uma ferramenta de apoio à decisão. Os resultados podem conter imprecisões e não substituem a revisão, o julgamento profissional ou a responsabilidade do creator sobre o conteúdo que produzir e publicar.
          </p>
          <div className={styles.note}>
            <p>
              Você é responsável por verificar fatos, ofertas, alegações, direitos de uso e regras aplicáveis antes de publicar qualquer conteúdo.
            </p>
          </div>
        </section>

        <section className={styles.section} id="conta">
          <h2>3. Conta e segurança</h2>
          <p>
            Para usar recursos que exigem autenticação, você deve fornecer informações corretas e manter os dados da conta atualizados. Você também deve proteger suas credenciais e avisar a Viewefy ao perceber uso não autorizado.
          </p>
          <p>
            A conta é pessoal. Você não pode compartilhar credenciais, permitir acesso indevido ou tentar contornar limites, controles de segurança ou regras de uso da plataforma.
          </p>
        </section>

        <section className={styles.section} id="conteudo">
          <h2>4. Conteúdo e resultados</h2>
          <p>
            Você mantém os direitos sobre as informações, instruções e materiais que inserir na Viewefy, desde que tenha autorização para usá-los. Você concede à Viewefy apenas as permissões necessárias para hospedar, processar, exibir e proteger esses materiais enquanto o serviço for utilizado.
          </p>
          <p>
            Você é responsável por garantir que seu conteúdo não viole direitos autorais, marcas, privacidade, publicidade, propriedade intelectual ou qualquer outra lei aplicável.
          </p>
          <p>
            A Viewefy não garante que uma sugestão, análise ou briefing produzirá vendas, alcance, aprovação por uma plataforma ou qualquer resultado comercial específico.
          </p>
        </section>

        <section className={styles.section} id="uso">
          <h2>5. Uso aceitável</h2>
          <p>Você não pode usar a Viewefy para:</p>
          <ul>
            <li>violar leis, direitos de terceiros ou regras de plataformas de distribuição;</li>
            <li>enviar malware, conteúdo ilícito, fraudulento ou que exponha dados de outra pessoa sem autorização;</li>
            <li>interferir no funcionamento, na segurança ou na disponibilidade do serviço;</li>
            <li>fazer engenharia reversa, explorar vulnerabilidades ou acessar áreas não autorizadas;</li>
            <li>contornar limites de uso, controles de acesso ou mecanismos de cobrança; ou</li>
            <li>usar resultados automatizados sem a revisão necessária para o contexto em que serão publicados.</li>
          </ul>
          <p>
            Podemos limitar ou suspender o acesso quando necessário para proteger usuários, terceiros ou a integridade do serviço, inclusive diante de uso que viole estes termos.
          </p>
        </section>

        <section className={styles.section}>
          <h2>6. Serviços de terceiros</h2>
          <p>
            A Viewefy pode depender de serviços de hospedagem, armazenamento, processamento e outros provedores necessários à operação. Esses provedores podem ter termos e políticas próprios.
          </p>
          <p>
            TikTok, TikTok Shop e suas marcas pertencem aos respectivos titulares. A Viewefy não é patrocinada, administrada ou endossada pelo TikTok. O uso de recursos do TikTok continua sujeito aos termos, políticas e diretrizes do próprio TikTok.
          </p>
        </section>

        <section className={styles.section}>
          <h2>7. Disponibilidade e alterações</h2>
          <p>
            Trabalhamos para manter a Viewefy disponível e segura, mas o serviço pode ficar temporariamente indisponível para manutenção, atualizações, falhas de infraestrutura ou eventos fora do nosso controle.
          </p>
          <p>
            Podemos alterar recursos, limites ou estes termos para refletir mudanças no serviço, na legislação ou na segurança. Quando a alteração for relevante, apresentaremos a versão atualizada nesta página e indicaremos a nova data de atualização.
          </p>
        </section>

        <section className={styles.section} id="encerramento">
          <h2>8. Encerramento</h2>
          <p>
            Você pode parar de usar a Viewefy a qualquer momento. Podemos suspender ou encerrar uma conta em caso de violação destes termos, risco à segurança, exigência legal ou encerramento do serviço.
          </p>
          <p>
            O encerramento não elimina obrigações que, por sua natureza, devam continuar válidas, nem impede o cumprimento de solicitações legais ou a preservação mínima exigida por lei.
          </p>
        </section>

        <section className={styles.section}>
          <h2>9. Disposições gerais</h2>
          <p>
            Se alguma disposição destes termos for considerada inválida, as demais continuarão vigentes. A ausência de cobrança imediata de uma obrigação não representa renúncia permanente a esse direito.
          </p>
          <p>
            Estes termos devem ser interpretados de acordo com a legislação aplicável ao relacionamento entre você e a Viewefy, sem afastar direitos que não possam ser limitados por lei.
          </p>
        </section>

        <section className={styles.section} id="contato">
          <h2>10. Fale conosco</h2>
          <p>
            Para dúvidas sobre estes termos, solicitações relacionadas à sua conta ou comunicações legais, use o canal de suporte disponibilizado dentro da plataforma.
          </p>
        </section>
      </article>
    </>
  );
}
