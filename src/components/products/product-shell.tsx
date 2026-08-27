"use client";

import Link from "next/link";
import { CalendarDays, Clapperboard, Home, Menu, Settings2, Tag, type LucideIcon, UserPen, Trophy, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import styles from "./product-shell.module.css";

type ProductShellProps = {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  active?: "home" | "products";
};

const destinations = [
  { key: "home", label: "Home", href: "/today", icon: Home },
  { key: "products", label: "Produtos", href: "/products", icon: Tag },
  { key: "studio", label: "Estúdio", icon: Clapperboard },
  { key: "agenda", label: "Agenda", icon: CalendarDays },
  { key: "top-conteudos", label: "Virais", icon: Trophy },
  { key: "influencer", label: "IA Influencer", icon: UserPen },
  { key: "settings", label: "Configurações", icon: Settings2 },
];

function Navigation({ active, compact = false }: { active: "home" | "products"; compact?: boolean }) {
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => menuPanelRef.current?.querySelector<HTMLElement>("a, [tabindex='0']")?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileMenu();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  function closeMobileMenu() {
    setMobileMenuOpen(false);
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

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
          <button aria-controls="mobile-navigation" aria-expanded={mobileMenuOpen} aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"} className={styles.mobileMenuButton} onClick={() => setMobileMenuOpen((current) => !current)} ref={menuButtonRef} title={mobileMenuOpen ? "Fechar menu" : "Abrir menu"} type="button">
            {mobileMenuOpen ? <X aria-hidden="true" size={22} strokeWidth={1.8} /> : <Menu aria-hidden="true" size={22} strokeWidth={1.8} />}
          </button>
        </header>

        <main className={styles.main}>{children}</main>

        {mobileMenuOpen && <div className={styles.mobileMenuOverlay} onClick={closeMobileMenu} role="presentation">
          <div aria-label="Navegação mobile" aria-modal="true" className={styles.mobileMenuPanel} id="mobile-navigation" onClick={(event) => event.stopPropagation()} ref={menuPanelRef} role="dialog">
            <div className={styles.mobileMenuHeader}><strong>Menu</strong><button aria-label="Fechar menu" className={styles.mobileMenuClose} onClick={closeMobileMenu} type="button"><X aria-hidden="true" size={20} strokeWidth={1.8} /></button></div>
            <Navigation active={active} />
          </div>
        </div>}
      </div>
    </div>
  );
}
