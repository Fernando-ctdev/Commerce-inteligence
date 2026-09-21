"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { Eye, EyeOff, Lightbulb, LockKeyhole, Mail, User } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import logoTextLight from "@/assets/logo/logo_text_light.webp";

import styles from "./access-form.module.css";

type AccessMode = "register" | "login";
type FieldErrors = Partial<Record<"name" | "email" | "password" | "passwordConfirmation", string>>;

type AccessResponse = {
  error?: string;
  fieldErrors?: FieldErrors;
  redirectTo?: string;
};

type AccessFormProps = {
  /** Server-side (NODE_ENV): cadastro fechado em produção — sem toggle e sem POST de registro. */
  registrationEnabled: boolean;
  sessionExpired: boolean;
};

type PasswordRule = { label: string; ok: boolean };

function passwordRules(value: string): PasswordRule[] {
  return [
    { label: "Mínimo 8 caracteres", ok: value.length >= 8 },
    { label: "Pelo menos uma letra", ok: /[a-zA-Z]/.test(value) },
    { label: "Pelo menos um número", ok: /\d/.test(value) },
  ];
}

function isAccessResponse(value: unknown): value is AccessResponse {
  return typeof value === "object" && value !== null;
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 48 48" width="18">
      <path
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        fill="#EA4335"
      />
      <path
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        fill="#4285F4"
      />
      <path
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        fill="#FBBC05"
      />
      <path
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        fill="#34A853"
      />
    </svg>
  );
}

export function AccessForm({ registrationEnabled, sessionExpired }: AccessFormProps) {
  const [mode, setMode] = useState<AccessMode>(registrationEnabled ? "register" : "login");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [hintOpen, setHintOpen] = useState(false);

  function changeMode(nextMode: AccessMode) {
    setMode(nextMode);
    setPassword("");
    setShowPassword(false);
    setHintOpen(false);
    setError(null);
    setFieldErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const body =
      mode === "register"
        ? {
            name: form.get("name"),
            email: form.get("email"),
            password: form.get("password"),
            passwordConfirmation: form.get("passwordConfirmation"),
          }
        : { email: form.get("email"), password: form.get("password") };

    const response = await fetch(`/api/access/${mode}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  const rules = passwordRules(password);
  const passwordValid = rules.every((rule) => rule.ok);
  const title = mode === "register" ? "Crie a sua conta" : "Entre na sua conta";
  const submitLabel = mode === "register" ? "Criar conta" : "Entrar";

  return (
    <main className={styles.page}>
      <section className={styles.surface} aria-labelledby="access-title">
        <aside className={styles.brandPanel} aria-label="Sobre o Commerce Intelligence">
          <div aria-hidden="true" className={styles.brandArt}>
            <svg className={styles.brandArtSvg} focusable="false" viewBox="0 0 480 400">
              <g className={styles.artGmv}>
                <rect fill="rgba(255,255,255,0.12)" height="184" rx="18" stroke="rgba(255,255,255,0.24)" width="136" x="52" y="112" />
                <rect fill="rgba(255,255,255,0.16)" height="66" rx="12" width="108" x="68" y="130" />
                <circle cx="122" cy="163" fill="rgba(255,255,255,0.28)" r="14" />
                <text fill="rgba(255,255,255,0.92)" fontSize="17" fontWeight="800" x="68" y="226">4.9</text>
                <path d="M0,-6 L1.76,-1.85 L6.22,-1.85 L2.7,0.95 L4.03,5.35 L0,2.7 L-4.03,5.35 L-2.7,0.95 L-6.22,-1.85 L-1.76,-1.85 Z" fill="rgba(255,255,255,0.90)" transform="translate(104 220)" />
                <text fill="rgba(255,255,255,0.70)" fontSize="13" fontWeight="600" x="68" y="252">12 mil vendas</text>
                <text fill="rgba(255,255,255,0.62)" fontSize="19" fontWeight="800" letterSpacing="2" x="68" y="282">$$$$$$</text>
              </g>
              <g className={styles.artClap}>
                <g className={styles.artClapBar}>
                  <rect fill="rgba(255,255,255,0.22)" height="38" rx="12" stroke="rgba(255,255,255,0.30)" width="224" x="196" y="142" />
                  <path d="M236 146h18l-12 30h-18z" fill="rgba(255,255,255,0.38)" />
                  <path d="M284 146h18l-12 30h-18z" fill="rgba(255,255,255,0.38)" />
                  <path d="M332 146h18l-12 30h-18z" fill="rgba(255,255,255,0.38)" />
                </g>
                <rect fill="rgba(255,255,255,0.14)" height="140" rx="18" stroke="rgba(255,255,255,0.25)" width="224" x="196" y="184" />
                <rect fill="rgba(255,255,255,0.30)" height="12" rx="6" width="120" x="220" y="212" />
                <rect fill="rgba(255,255,255,0.22)" height="12" rx="6" width="88" x="220" y="236" />
                <rect fill="rgba(255,255,255,0.20)" height="32" rx="16" width="110" x="220" y="270" />
                <circle cx="238" cy="286" fill="rgba(255,255,255,0.45)" r="6" />
                <rect fill="rgba(255,255,255,0.35)" height="10" rx="5" width="60" x="252" y="281" />
                <circle cx="206" cy="190" fill="rgba(255,255,255,0.50)" r="6" />
              </g>
            </svg>
          </div>
          <div className={styles.brand}>
            <Image alt="Viewefy" className={styles.logo} priority src={logoTextLight} />
          </div>
          <div className={styles.brandStatement}>
            <p>Inteligência e estratégia para criar conteúdos que vendem de verdade.</p>
          </div>
        </aside>

        <div className={styles.formPanel}>
          <div className={styles.intro}>
            <h1 id="access-title">{title}</h1>
            <p>Crie conteúdos com estratégia para vender mais.</p>
          </div>

          {sessionExpired && (
            <p className={styles.notice} role="status">
              Sua sessão expirou. Entre novamente para continuar.
            </p>
          )}

          {registrationEnabled && (
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
          )}

          <form aria-busy={pending} className={styles.form} method="post" onSubmit={submit} noValidate>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            {mode === "register" && (
              <div className={styles.field}>
                <label htmlFor="name">Nome</label>
                <div className={styles.inputWrap}>
                  <User aria-hidden="true" className={styles.inputIcon} size={20} />
                  <input
                    aria-describedby={fieldErrors.name ? "name-error" : undefined}
                    aria-invalid={Boolean(fieldErrors.name)}
                    autoComplete="name"
                    id="name"
                    name="name"
                    placeholder="Seu nome"
                    required
                    type="text"
                  />
                </div>
                {fieldErrors.name && <p id="name-error" className={styles.fieldError} role="alert">{fieldErrors.name}</p>}
              </div>
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
              {mode === "register" ? (
                <div className={styles.labelRow}>
                  <label htmlFor="password">Senha</label>
                  <Tooltip onOpenChange={setHintOpen} open={hintOpen}>
                    <TooltipTrigger
                      onClick={() => setHintOpen((open) => !open)}
                      render={
                        <button
                          aria-label="Ver requisitos de senha"
                          className={styles.hintButton}
                          type="button"
                        >
                          <Lightbulb aria-hidden="true" size={16} />
                        </button>
                      }
                    />
                    <TooltipContent align="end" className={styles.hintContent} side="bottom">
                      <ul aria-label="Requisitos de senha" className={styles.passwordChecklist}>
                        {rules.map((rule) => (
                          <li data-ok={rule.ok} key={rule.label}>{rule.label}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                <div className={`${styles.labelRow} ${styles.labelRowSpread}`}>
                  <label htmlFor="password">Senha</label>
                  <button className={styles.textLink} type="button">
                    Esqueci minha senha
                  </button>
                </div>
              )}
              <div className={styles.inputWrap}>
                <LockKeyhole aria-hidden="true" className={styles.inputIcon} size={20} />
                <input
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.password)}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  id="password"
                  maxLength={200}
                  minLength={8}
                  name="password"
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  placeholder={mode === "register" ? "Pelo menos 8 caracteres" : "Sua senha"}
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

              {fieldErrors.password && <p id="password-error" className={styles.fieldError} role="alert">{fieldErrors.password}</p>}
            </div>

            {mode === "register" && (
              <div className={styles.field}>
                <label htmlFor="passwordConfirmation">Confirmar senha</label>
                <div className={styles.inputWrap}>
                  <LockKeyhole aria-hidden="true" className={styles.inputIcon} size={20} />
                  <input
                    aria-describedby={fieldErrors.passwordConfirmation ? "passwordConfirmation-error" : undefined}
                    aria-invalid={Boolean(fieldErrors.passwordConfirmation)}
                    autoComplete="new-password"
                    id="passwordConfirmation"
                    maxLength={200}
                    minLength={8}
                    name="passwordConfirmation"
                    placeholder="Repita a senha"
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
                {fieldErrors.passwordConfirmation && (
                  <p id="passwordConfirmation-error" className={styles.fieldError} role="alert">{fieldErrors.passwordConfirmation}</p>
                )}
              </div>
            )}

            <button className={styles.submit} disabled={pending} type="submit">
              {submitLabel}
              {pending && <span className={styles.pendingText}> — enviando</span>}
            </button>
          </form>

          <p aria-live="polite" className={styles.validLive}>
            {mode === "register" && passwordValid ? "Senha atende aos requisitos." : ""}
          </p>

          <p className={styles.divider}>ou continue com</p>
          <button className={styles.googleButton} type="button">
            <GoogleIcon />
            Continuar com Google
          </button>
        </div>
      </section>
    </main>
  );
}
