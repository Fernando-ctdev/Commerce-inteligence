import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import logo from "@/assets/logo/logo.png";

import styles from "./legal.module.css";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link aria-label="Viewefy" className={styles.brand} href="/access">
          <Image alt="" className={styles.logo} height={36} priority src={logo} width={36} />
          <span>Viewefy</span>
        </Link>

        <nav aria-label="Navegação legal" className={styles.nav}>
          <Link className={styles.navLink} href="/terms">
            Termos de serviço
          </Link>
          <Link className={styles.navLink} href="/privacy">
            Política de privacidade
          </Link>
        </nav>

        <Link className={styles.headerAction} href="/access">
          Acessar plataforma
        </Link>
      </header>

      <main className={styles.main}>{children}</main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} Viewefy</span>
        <nav aria-label="Links legais" className={styles.footerNav}>
          <Link href="/terms">Termos de serviço</Link>
          <Link href="/privacy">Privacidade</Link>
        </nav>
      </footer>
    </div>
  );
}
