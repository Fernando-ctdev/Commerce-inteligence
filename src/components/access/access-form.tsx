"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";

import logoTextDark from "@/assets/logo/logo_text_dark.webp";
import logoTextLight from "@/assets/logo/logo_text_light.webp";

import styles from "./access-form.module.css";

type AccessMode = "register" | "login";
type FieldErrors = Partial<Record<"email" | "password", string>>;

type AccessResponse = {
  error?: string;
  fieldErrors?: FieldErrors;
  redirectTo?: string;
};

type AccessFormProps = {
  sessionExpired: boolean;
};

function isAccessResponse(value: unknown): value is AccessResponse {
  return typeof value === "object" && value !== null;
}

export function AccessForm({ sessionExpired }: AccessFormProps) {
  const [mode, setMode] = useState<AccessMode>("register");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  function changeMode(nextMode: AccessMode) {
    setMode(nextMode);
    setError(null);
    setFieldErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/access/${mode}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    }).catch(() => null);

    if (!response) {
      setError("Não foi possível concluir agora. Verifique sua conexão e tente novamente.");
      setPending(false);
      return;
    }

    const data: unknown = await response.json().catch(() => null);
    if (response.ok && isAccessResponse(data) && typeof data.redirectTo === "string") {
      window.location.assign(data.redirectTo);
      return;
    }

    if (isAccessResponse(data)) {
      setError(data.error ?? "Não foi possível concluir agora. Tente novamente.");
      setFieldErrors(data.fieldErrors ?? {});
    } else {
      setError("Não foi possível concluir agora. Tente novamente.");
    }
    setPending(false);
  }

  const title = mode === "register" ? "Crie seu espaço de trabalho" : "Entre no seu espaço de trabalho";
  const submitLabel = mode === "register" ? "Criar conta" : "Entrar";

  return (
    <main className={styles.page}>
      <section className={styles.surface} aria-labelledby="access-title">
        <div className={styles.brand}>
          <Image
            alt="Viewefy"
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
        </div>

        <div className={styles.intro}>
          {/* <h1 id="access-title">{title}</h1> */}
          <p>Transforme produtos em estratégias e conteúdos que vendem.</p>
        </div>

        {sessionExpired && (
          <p className={styles.notice} role="status">
            Sua sessão expirou. Entre novamente para continuar.
          </p>
        )}

        <div className={styles.modeSwitch} aria-label="Escolha o tipo de acesso">
          <button
            aria-pressed={mode === "register"}
            className={mode === "register" ? styles.modeActive : styles.modeButton}
            disabled={pending}
            onClick={() => changeMode("register")}
            type="button"
          >
            Criar conta
          </button>
          <button
            aria-pressed={mode === "login"}
            className={mode === "login" ? styles.modeActive : styles.modeButton}
            disabled={pending}
            onClick={() => changeMode("login")}
            type="button"
          >
            Entrar
          </button>
        </div>

        <form aria-busy={pending} className={styles.form} method="post" onSubmit={submit} noValidate>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.field}>
            <label htmlFor="email">E-mail</label>
            <div className={styles.inputWrap}>
              <Mail aria-hidden="true" className={styles.inputIcon} size={20} />
              <input
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                aria-invalid={Boolean(fieldErrors.email)}
                autoComplete="email"
                id="email"
                name="email"
                placeholder="voce@email.com"
                required
                type="email"
              />
            </div>
            {fieldErrors.email && <p id="email-error" className={styles.fieldError} role="alert">{fieldErrors.email}</p>}
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Senha</label>
            <div className={styles.inputWrap}>
              <LockKeyhole aria-hidden="true" className={styles.inputIcon} size={20} />
              <input
                aria-describedby={fieldErrors.password ? "password-help password-error" : "password-help"}
                aria-invalid={Boolean(fieldErrors.password)}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                id="password"
                maxLength={200}
                minLength={8}
                name="password"
                placeholder="Pelo menos 8 caracteres"
                required
                type={showPassword ? "text" : "password"}
              />
              <button
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className={styles.passwordToggle}
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
              </button>
            </div>
            <p id="password-help" className={styles.help}>Pelo menos 8 caracteres.</p>
            {fieldErrors.password && <p id="password-error" className={styles.fieldError} role="alert">{fieldErrors.password}</p>}
          </div>

          <button className={styles.submit} disabled={pending} type="submit">
            {submitLabel}
            {pending && <span className={styles.pendingText}> — enviando</span>}
          </button>
        </form>
      </section>
    </main>
  );
}
