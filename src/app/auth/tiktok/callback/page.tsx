import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";

import logoTextDark from "@/assets/logo/logo_text_dark.webp";
import logoTextLight from "@/assets/logo/logo_text_light.webp";
import { Button } from "@/components/ui/button";

import styles from "./callback.module.css";

export const metadata: Metadata = {
  title: "Autenticação do TikTok — Viewefy",
  description: "Confirmação de autenticação do TikTok recebida pela Viewefy.",
};

/**
 * Retorno temporário do TikTok (GET /auth/tiktok/callback): página pública e
 * estática — sem troca de code/token e sem leitura de query params. Confirma
 * o recebimento da autenticação e deixa explícito que a conexão definitiva
 * está em preparação (nada é inventado como concluído).
 */
export default function TikTokCallbackPage() {
  return (
    <main className={styles.page}>
      <section aria-labelledby="tiktok-callback-title" className={styles.content}>
        <Image
          alt=""
          className={`${styles.logo} ${styles.logoDark}`}
          priority
          src={logoTextDark}
        />
        <Image
          alt=""
          className={`${styles.logo} ${styles.logoLight}`}
          priority
          src={logoTextLight}
        />
        <h1 className={styles.title} id="tiktok-callback-title">
          <Check aria-hidden="true" className={styles.successIcon} />
          Autenticação do TikTok recebida
        </h1>
        <p className={styles.lead}>
          Recebemos a confirmação de autenticação do TikTok para a sua conta.
        </p>
        <p className={styles.note}>
          A conexão definitiva entre a Viewefy e o TikTok ainda está em
          preparação. Você não precisa fazer nada agora — avisaremos quando
          estiver disponível.
        </p>
        <Button nativeButton={false} render={<Link href="/access" />} size="lg">
          <ArrowLeft aria-hidden="true" />
          Voltar para a entrada
        </Button>
        <nav aria-label="Links legais" className={styles.legalNav}>
          <Link className={styles.legalLink} href="/terms">
            Termos de serviço
          </Link>
          <Link className={styles.legalLink} href="/privacy">
            Privacidade
          </Link>
        </nav>
      </section>
    </main>
  );
}
