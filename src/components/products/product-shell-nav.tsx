"use client";

import Link from "next/link";
import { CalendarDays, Clapperboard, Flame, Home, Settings2, Sparkles, Tag } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";

import styles from "./product-shell.module.css";

type DestinationKey =
  | "home"
  | "products"
  | "studio"
  | "agenda"
  | "settings"
  | "ai-influencer"
  | "virais";

const destinations: {
  key: DestinationKey;
  label: string;
  href?: string;
  icon: typeof Home;
}[] = [
  { key: "home", label: "Home", href: "/today", icon: Home },
  { key: "products", label: "Produtos", href: "/products", icon: Tag },
  { key: "studio", label: "Estúdio", icon: Clapperboard },
  { key: "agenda", label: "Agenda", icon: CalendarDays },
  // Placeholders futuros: sem href/rota/store — inertes por decisão de escopo.
  { key: "ai-influencer", label: "IA Influencer", icon: Sparkles },
  { key: "virais", label: "Virais", icon: Flame },
  { key: "settings", label: "Configurações", href: "/settings", icon: Settings2 },
];

/**
 * Adaptado do Sidebar shadcn: o breakpoint define o estado inicial
 * (768–1199px nasce colapsado no rail de 72px; desktop nasce expandido)
 * e o SidebarTrigger permite colapsar/reabrir — DESIGN v1.5.
 */
export function ShellRoot({
  sidebar,
  children,
  initialOpen = true,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  initialOpen?: boolean;
}) {
  const [openOverride, setOpenOverride] = useState<boolean>(initialOpen);

  return (
    <SidebarProvider
      open={openOverride}
      onOpenChange={(nextOpen) => {
        document.documentElement.dataset.sidebarState = String(nextOpen);
        setOpenOverride(nextOpen);
      }}
    >
      {sidebar}
      {children}
    </SidebarProvider>
  );
}
export function ShellNav({ active }: { active: DestinationKey }) {
  const { setOpenMobile } = useSidebar();

  return (
    <nav aria-label="Navegação principal">
      <SidebarMenu className={styles.navMenu}>
        {destinations.map((destination) => {
          const isActive = destination.key === active;
          const Icon = destination.icon;
          const buttonClassName = destination.href
            ? styles.navButton
            : styles.navPlaceholder;
          const content = (
            <>
              <Icon aria-hidden="true" strokeWidth={1.8} />
              <span>{destination.label}</span>
            </>
          );

          if (!destination.href) {
            return (
              <SidebarMenuItem key={destination.label}>
                <SidebarMenuButton
                  aria-disabled="true"
                  className={buttonClassName}
                  render={<span />}
                  title={destination.label}
                >
                  {content}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          return (
            <SidebarMenuItem key={destination.label}>
              <SidebarMenuButton
                aria-current={isActive ? "page" : undefined}
                className={buttonClassName}
                isActive={isActive}
                onClick={() => setOpenMobile(false)}
                render={<Link href={destination.href} />}
                tooltip={destination.label}
              >
                {content}
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}
