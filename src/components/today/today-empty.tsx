"use client";

import Link from "next/link";
import { useState } from "react";

import styles from "./today-empty.module.css";

export function TodayEmpty() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/access/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).catch(() => null);
    const data: unknown = response ? await response.json().catch(() => null) : null;

    if (response?.ok && typeof data === "object" && data !== null && "redirectTo" in data && typeof data.redirectTo === "string") {
      window.location.assign(data.redirectTo);
      return;
    }

    setError("Não foi possível sair agora. Tente novamente.");
    setPending(false);
  }

  return (
    <main className={styles.page}>
      <header className={styles.toolbar}>
        <p>Commerce Intelligence</p>
        <button disabled={pending} onClick={logout} type="button">
          Sair{pending && " — saindo"}
        </button>
      </header>

      <section className={styles.content} aria-labelledby="today-title">
        <div className={styles.empty}>
          <p className={styles.eyebrow}>Hoje</p>
          <h1 id="today-title">Seu próximo conteúdo começa aqui.</h1>
          <p>
            Adicione um produto para transformar o que você vende em um plano claro de gravação.
          </p>
          <Link className={styles.action} href="/products/new">
            Adicionar produto
          </Link>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      </section>
    </main>
  );
}
