import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import logo from "@/assets/logo/logo.png";
import logoText from "@/assets/logo/logo_text.png";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import { ShellNav, ShellRoot } from "./product-shell-nav";
import { GenerationToast } from "./generation-toast";
import styles from "./product-shell.module.css";

type ProductShellProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  active?: "home" | "products" | "settings";
  /** Identidade autenticada resolvida server-side (requireSession). */
  user?: { name?: string | null; email: string };
};

function userInitials(user: { name?: string | null; email: string }) {
  const source = (user.name ?? user.email).trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? source[0] ?? "?")
    .concat(parts[1]?.[0] ?? "")
    .toUpperCase();
}

export function ProductShell({
  active = "products",
  title,
  action,
  children,
  user,
}: ProductShellProps) {
  const sidebar = (
    <Sidebar collapsible="icon" side="left">
      <SidebarHeader className={styles.sidebarHeader}>
        <Link aria-label="Viewefy" className={styles.brand} href="/today">
          <Image alt="" className={styles.brandLogo} src={logo} />
          <Image
            alt=""
            className={styles.brandLogoText}
            priority
            src={logoText}
          />
        </Link>
      </SidebarHeader>
      <SidebarContent className={styles.sidebarContent}>
        <ShellNav active={active} />
      </SidebarContent>
      {user && (
        <SidebarFooter className={styles.sidebarFooter}>
          <div className={styles.user}>
            <Avatar className={styles.userAvatar}>
              <AvatarFallback>{userInitials(user)}</AvatarFallback>
            </Avatar>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user.name ?? user.email}</span>
              {user.name && (
                <span className={styles.userEmail}>{user.email}</span>
              )}
            </div>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );

  return (
    <ShellRoot sidebar={sidebar}>
      <SidebarInset className={styles.inset}>
        <header className={styles.toolbar}>
          <SidebarTrigger aria-label="Alternar navegação" />
          <h1 className={styles.title}>{title}</h1>
          {action && <div className={styles.toolbarAction}>{action}</div>}
        </header>

        <header className={styles.mobileHeader}>
          <SidebarTrigger
            aria-label="Abrir navegação"
            className={styles.mobileTrigger}
          />
          <h1 className={styles.title}>{title}</h1>
        </header>
        <GenerationToast />

        <div className={styles.main}>{children}</div>
      </SidebarInset>
    </ShellRoot>
  );
}
