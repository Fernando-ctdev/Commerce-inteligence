import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./product-shell.module.css";

type ProductShellProps = {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  active?: "today" | "products";
};

const destinations = [
  { key: "today", label: "Hoje", href: "/today", glyph: "01" },
  { key: "products", label: "Produtos", href: "/products", glyph: "02" },
  { label: "Conteúdos", glyph: "03" },
  { label: "Produção", glyph: "04" },
  { label: "Vault", glyph: "05" },
];

function Navigation({ active, compact = false }: { active: "today" | "products"; compact?: boolean }) {
  return (
    <nav aria-label="Navegação principal" className={styles.nav}>
      {destinations.map((destination) => {
        const isActive = destination.key === active;
        const className = isActive ? `${styles.navLink} ${styles.navActive}` : destination.href ? styles.navLink : styles.navDisabled;
        const content = (
          <>
            <span aria-hidden="true" className={styles.navIcon}>{destination.glyph}</span>
            <span className={styles.navLabel}>{destination.label}</span>
          </>
        );

        const tooltipProps = compact ? { "aria-label": destination.label, "data-tooltip": destination.label, title: destination.label } : {};
        return destination.href ? (
          <Link aria-current={isActive ? "page" : undefined} className={className} href={destination.href} key={destination.label} {...tooltipProps}>
            {content}
          </Link>
        ) : (
          <span aria-disabled="true" className={className} key={destination.label} role={compact ? "link" : undefined} tabIndex={compact ? 0 : undefined} {...tooltipProps}>
            {content}
          </span>
        );
      })}
    </nav>
  );
}

export function ProductShell({ active = "products", eyebrow = "Produtos", title, action, children }: ProductShellProps) {
  return (
    <div className={styles.shell}>
      <aside aria-label="Navegação lateral" className={styles.sidebar}>
        <Link className={styles.brand} href="/today">Commerce Intelligence</Link>
        <Navigation active={active} />
      </aside>

      <aside aria-label="Navegação compacta" className={styles.rail}>
        <Link aria-label="Commerce Intelligence" className={styles.brand} href="/today">CI</Link>
        <Navigation active={active} compact />
      </aside>

      <div className={styles.content}>
        <header className={styles.toolbar}>
          <div className={styles.titleGroup}>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 className={styles.title}>{title}</h1>
          </div>
          {action && <div className={styles.toolbarAction}>{action}</div>}
        </header>

        <header className={styles.mobileHeader}>
          <div className={styles.titleGroup}>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 className={styles.title}>{title}</h1>
          </div>
        </header>

        <main className={styles.main}>{children}</main>

        <div aria-label="Ações da seção" className={styles.mobileNav}>
          <Navigation active={active} />
        </div>
      </div>
    </div>
  );
}
