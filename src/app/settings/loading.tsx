import { LogOut, SunMoon } from "lucide-react";

import { ProductShell } from "@/components/products/product-shell";
import { Skeleton } from "@/components/ui/skeleton";
import settingsStyles from "@/components/settings/settings-view.module.css";

/* Estrutura estática real (headings, labels, botões); Skeleton apenas
   nos valores dinâmicos: avatar e e-mail da sessão. */
export default function SettingsLoading() {
  return (
    <ProductShell active="settings" title="Sua conta">
      <div className={settingsStyles.surface}>
        <section className={settingsStyles.section}>
          <p className={settingsStyles.eyebrow}>Conta</p>
          <div className={settingsStyles.identity}>
            <Skeleton className="h-11 w-11 rounded-full" />
            <h2>Seu acesso</h2>
          </div>
          <dl className={settingsStyles.facts}>
            <div className={settingsStyles.fact}>
              <dt>E-mail</dt>
              <dd>
                <Skeleton
                  className="rounded-md"
                  style={{ blockSize: 22, inlineSize: 200 }}
                />
              </dd>
            </div>
            <div className={settingsStyles.fact}>
              <dt>Workspace</dt>
              <dd>Workspace pessoal</dd>
            </div>
          </dl>
          <p>
            Seu workspace é individual: nenhuma outra pessoa acessa seus
            produtos e conteúdos.
          </p>
        </section>
        <section className={settingsStyles.section}>
          <p className={settingsStyles.eyebrow}>Preferências</p>
          <div className={settingsStyles.sectionHeading}>
            <SunMoon aria-hidden="true" className={settingsStyles.sectionIcon} />
            <h2>Aparência</h2>
          </div>
          <div className={settingsStyles.field}>
            <label htmlFor="appearance-theme">Tema da interface</label>
            <button
              disabled
              id="appearance-theme"
              style={{ blockSize: 44 }}
              type="button"
            >
              Claro
            </button>
            <p className={settingsStyles.fieldHelp}>
              A escolha fica neste dispositivo e é aplicada imediatamente.
            </p>
          </div>
        </section>
        <section className={settingsStyles.section}>
          <p className={settingsStyles.eyebrow}>Sessão</p>
          <div className={settingsStyles.sectionHeading}>
            <LogOut aria-hidden="true" className={settingsStyles.sectionIcon} />
            <h2>Encerrar acesso neste dispositivo</h2>
          </div>
          <p>
            Ao sair, a sessão deste navegador é encerrada. Seus dados permanecem
            preservados no workspace.
          </p>
          <button disabled type="button">
            Sair
          </button>
        </section>
      </div>
    </ProductShell>
  );
}
