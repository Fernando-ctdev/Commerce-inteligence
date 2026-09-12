"use client";

import Link from "next/link";
import {
  CalendarDays,
  Clapperboard,
  Home,
  Settings2,
  Tag,
  Flame,
  MirrorRound,
  Fingerprint,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";
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
  | "virais"
  | "meu-estilo"
  | "ia-influencer"
  | "settings";

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
  { key: "virais", label: "Virais", icon: Flame },
  { key: "meu-estilo", label: "Meu estilo", href: "/my-style", icon: Fingerprint },
  { key: "ia-influencer", label: "IA Influencer", icon: MirrorRound },
  {
    key: "settings",
    label: "Configurações",
    href: "/settings",
    icon: Settings2,
  },
];

const subscribeToSidebarState = () => () => {};
const getServerSidebarState = () => true;
const getSidebarState = () =>
  document.documentElement.dataset.sidebarState !== "false";

/**
 * Adaptado do Sidebar shadcn: o breakpoint define o estado inicial
 * (768–1199px nasce colapsado no rail de 72px; desktop nasce expandido)
 * e o SidebarTrigger permite colapsar/reabrir — DESIGN v1.5.
 */
export function ShellRoot({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const persistedOpen = useSyncExternalStore(
    subscribeToSidebarState,
    getSidebarState,
    getServerSidebarState,
  );
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? persistedOpen;

  return (
    <SidebarProvider
      open={open}
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
          const itemClassName = destination.key === "settings" ? styles.settingsItem : undefined;
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
            const unavailableId = `${destination.key}-unavailable`;
            return (
              <SidebarMenuItem className={itemClassName} key={destination.label}>
                <SidebarMenuButton
                  aria-describedby={unavailableId}
                  aria-disabled="true"
                  className={buttonClassName}
                  render={<span />}
                  title={`${destination.label} Em breve`}
                >
                  {content}
                  <span className={styles.navUnavailable} id={unavailableId}>Em breve</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          return (
            <SidebarMenuItem className={itemClassName} key={destination.label}>
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
