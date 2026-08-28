"use client";

import { useEffect, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import styles from "./settings-view.module.css";

const THEME_STORAGE_KEY = "ci-theme";

type SettingsViewProps = {
  email: string;
};

export function SettingsView({ email }: SettingsViewProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // O script pré-pintura aplica a classe antes da hidratação; este readback
    // assíncrono alinha o Select após a montagem sem setState síncrono em efeito.
    const frame = window.requestAnimationFrame(() => {
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function changeTheme(next: "light" | "dark") {
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preferência é local ao dispositivo; falha de storage não bloqueia a troca.
    }
  }


  async function logout() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/access/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).catch(() => null);
    const data: unknown = response
      ? await response.json().catch(() => null)
      : null;

    if (
      response?.ok &&
      typeof data === "object" &&
      data !== null &&
      "redirectTo" in data &&
      typeof data.redirectTo === "string"
    ) {
      window.location.assign(data.redirectTo);
      return;
    }

    setError("Não foi possível sair agora. Tente novamente.");
    setPending(false);
  }

  return (
    <div className={styles.surface}>
      <section aria-labelledby="account-title" className={styles.section}>
        <p className={styles.eyebrow}>Conta</p>
        <div className={styles.identity}>
          <Avatar size="lg">
            <AvatarFallback>{email.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <h2 id="account-title">Seu acesso</h2>
        </div>
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>E-mail</dt>
            <dd>{email}</dd>
          </div>
          <div className={styles.fact}>
            <dt>Workspace</dt>
            <dd>Workspace pessoal</dd>
          </div>
        </dl>
        <p>
          Seu workspace é individual: nenhuma outra pessoa acessa seus produtos
          e conteúdos.
        </p>
      </section>

      <section aria-labelledby="appearance-title" className={styles.section}>
        <p className={styles.eyebrow}>Preferências</p>
        <h2 id="appearance-title">Aparência</h2>
        <div className={styles.field}>
          <label htmlFor="appearance-theme">Tema da interface</label>
          <Select onValueChange={(value) => changeTheme(value as "light" | "dark")} value={theme}>
            <SelectTrigger className="h-11 w-full" id="appearance-theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Claro</SelectItem>
              <SelectItem value="dark">Escuro</SelectItem>
            </SelectContent>
          </Select>
          <p className={styles.fieldHelp}>A escolha fica neste dispositivo e é aplicada imediatamente.</p>
        </div>
      </section>

      <section aria-labelledby="session-title" className={styles.section}>
        <p className={styles.eyebrow}>Sessão</p>
        <h2 id="session-title">Encerrar acesso neste dispositivo</h2>
        <p>
          Ao sair, a sessão deste navegador é encerrada. Seus dados permanecem
          preservados no workspace.
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Button disabled={pending} onClick={() => void logout()} variant="outline">
          Sair{pending && " — saindo"}
        </Button>
      </section>
    </div>
  );
}
