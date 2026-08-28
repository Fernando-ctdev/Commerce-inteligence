import Link from "next/link";
import { CalendarDays, Clapperboard, Home, Settings2, Tag, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import styles from "./product-shell.module.css";

type ProductShellProps = {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  active?: "home" | "products" | "settings";
};

const destinations = [
  { key: "home", label: "Home", href: "/today", icon: Home },
  { key: "products", label: "Produtos", href: "/products", icon: Tag },
  { key: "studio", label: "Estúdio", icon: Clapperboard },
  { key: "agenda", label: "Agenda", icon: CalendarDays },
  { key: "settings", label: "Configurações", href: "/settings", icon: Settings2 },
];

function Navigation({ active, compact = false }: { active: "home" | "products" | "settings"; compact?: boolean }) {
  return (
    <nav aria-label="Navegação principal" className={styles.nav}>
      {destinations.map((destination) => {
        const isActive = destination.key === active;
        const className = isActive ? `${styles.navLink} ${styles.navActive}` : destination.href ? styles.navLink : styles.navDisabled;
        const Icon = destination.icon as LucideIcon;
        const content = (
          <>
            <Icon aria-hidden="true" className={styles.navIcon} size={19} strokeWidth={1.8} />
            <span className={styles.navLabel}>{destination.label}</span>
          </>
        );

        const tooltipProps = compact ? { "data-tooltip": destination.label, title: destination.label } : {};
        return destination.href ? (
          <Link aria-current={isActive ? "page" : undefined} aria-label={compact ? destination.label : undefined} className={className} href={destination.href} key={destination.label} {...tooltipProps}>
            {content}
          </Link>
        ) : (
          <span aria-disabled="true" className={className} key={destination.label} {...tooltipProps}>
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
        <Link className={styles.brand} href="/today">
          <span aria-hidden="true" className={styles.brandMark}>CI</span>
          <span className={styles.brandName}><span>Commerce</span><span>Intelligence</span></span>
        </Link>
        <Navigation active={active} />
      </aside>

      <aside aria-label="Navegação compacta" className={styles.rail}>
        <Link aria-label="Commerce Intelligence" className={`${styles.brand} ${styles.brandCompact}`} href="/today"><span aria-hidden="true" className={styles.brandMark}>CI</span></Link>
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

        <nav aria-label="Navegação principal" className={styles.bottomNav}>
          {destinations.map((destination) => {
            const isActive = destination.key === active;
            const Icon = destination.icon as LucideIcon;
            const className = isActive ? `${styles.bottomNavLink} ${styles.bottomNavActive}` : destination.href ? styles.bottomNavLink : styles.bottomNavDisabled;
            const item = (
              <>
                <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
                <span>{destination.label}</span>
              </>
            );
            return destination.href ? (
              <Link aria-current={isActive ? "page" : undefined} className={className} href={destination.href} key={destination.label}>
                {item}
              </Link>
            ) : (
              <span aria-disabled="true" className={className} key={destination.label}>
                {item}
              </span>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
