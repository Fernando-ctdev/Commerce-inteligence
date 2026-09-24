"use client";

import { useState } from "react";
import { FileText, ImageOff, Video } from "lucide-react";

import type { ShowcaseItem } from "@/modules/products/showcase";
import { Button } from "@/components/ui/button";
import type { ProductManualDraft } from "../shared/product-form-model";
import listStyles from "./product-list.module.css";
import styles from "../shared/showcase.module.css";

/* priceLabel chega em pt-BR exato do response ("R$ 1.234,56"); converte para
   o formato do draft ("1234.56") de forma mecânica: remove símbolos, trata
   "." como milhar quando existe ",", troca "," por ".". Falha => sem prefill. */
function priceFromLabel(label: string): string | null {
  const digits = label.replace(/[^\d.,]/g, "");
  if (!digits) return null;
  const normalized = digits.includes(",")
    ? digits.replace(/\./g, "").replace(",", ".")
    : digits;
  return /^\d+(?:\.\d{1,2})?$/.test(normalized) ? normalized : null;
}

/** Pré-carga segura do formulário manual: apenas fatos do allowlist do DTO.
    Descrição não existe no DTO por design — chega vazia e é obrigatória na
    revisão (validação existente do formulário). priceLabel permanece intacto
    no card; aqui vira somente o formato aceito pelo campo Preço. */
export function showcaseToDraft(item: ShowcaseItem): Partial<ProductManualDraft> {
  const price = item.priceLabel ? priceFromLabel(item.priceLabel) : null;
  const coverUrl = item.coverUrl ?? item.imageUrls?.[0];
  return {
    name: item.title,
    category: item.categoryName ?? "",
    ...(price ? { price } : {}),
    ...(coverUrl ? { imageReferences: coverUrl } : {}),
  };
}

function ShowcaseCover({ coverUrl, title }: { coverUrl?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const usable = coverUrl !== undefined && /^https:\/\//i.test(coverUrl) && !failed;
  if (!usable) {
    return (
      <div
        aria-label={`Item ${title} sem imagem`}
        className={styles.fallback}
        role="img"
      >
        <ImageOff aria-hidden="true" />
        Sem imagem
      </div>
    );
  }
  return (
    /* <img> em vez de next/image: o showcase consome hosts remotos variáveis
       do DTO allowlist (CDN do TikTok) sem acoplar next.config.ts a cada host;
       sem otimizador (equivalente a unoptimized) e com fallback local. */
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      alt={`Imagem do item ${title}`}
      className={listStyles.cardImage}
      height={180}
      loading="lazy"
      onError={() => setFailed(true)}
      src={coverUrl}
      width={320}
    />
  );
}

/** Card do showcase no grid unificado da Vitrine. Dados remotos são fatos
    read-only de apresentação: comissão/desconto/estoque aparecem com o valor
    exato do response quando existem e nunca persistem no Product
    (ADR-030/031). commissionRate do DTO é basis point (900 = 9%). */
export function ShowcaseCard({ item, onUse }: { item: ShowcaseItem; onUse: () => void }) {
  const commission = item.affiliateInfo;
  const commissionText = commission
    ? commission.commissionRate > 0
      ? `${commission.commissionWithCurrency} (${(commission.commissionRate / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)`
      : commission.commissionWithCurrency
    : null;
  const labelTexts = (item.labels ?? [])
    .map((label) => label.text?.trim())
    .filter((text): text is string => Boolean(text));

  return (
    <li className={`${listStyles.card} ${styles.showcaseCard}`}>
      <ShowcaseCover
        coverUrl={item.coverUrl ?? item.imageUrls?.[0]}
        title={item.title}
      />
      <div className={listStyles.cardBody}>
        <div className={listStyles.cardHeader}>
          <span className={styles.badge}>TikTok Shop</span>
          <h3>{item.title}</h3>
        </div>
        {/* Estado parcial: campo ausente mostra "não informado" — nunca inventado.
            Categoria/Vendedor não aparecem no card, mas seguem no DTO e na busca. */}
        <dl className={styles.facts}>
          <div>
            <dt>Preço</dt>
            <dd className={item.priceLabel ? undefined : styles.missing}>
              {item.priceLabel ?? "Não informado"}
            </dd>
          </div>
          {commissionText && (
            <div>
              <dt>Comissão</dt>
              <dd>{commissionText}</dd>
            </div>
          )}
          {item.stockCount !== undefined && (
            <div>
              <dt>Estoque</dt>
              <dd>{item.stockCount}</dd>
            </div>
          )}
        </dl>
        {/* Rótulos do response (ex.: "31% off"): texto exato, read-only. */}
        {labelTexts.length > 0 && (
          <div className={styles.labels}>
            {labelTexts.map((text) => (
              <span className={styles.badge} key={text}>
                {text}
              </span>
            ))}
          </div>
        )}
        {/* Resumo operacional honesto: o item remoto nunca foi analisado —
            os contadores reais começam em zero; nada é lido ou inventado do
            response (mesmo padrão/semântica dos cards manuais). */}
        <div aria-label="Resumo operacional" className={listStyles.cardMetrics}>
          <span>
            <FileText aria-hidden="true" />
            <strong>0</strong> conteúdos
          </span>
          <span>
            <Video aria-hidden="true" />
            <strong>0</strong> gravados
          </span>
        </div>
      </div>
      {item.canAdd !== false && (
        <div className={styles.cardCta}>
          {/* Ação compacta e fixa sobre a capa (desktop e mobile), sempre
              visível. A etapa é seleção/preenchimento — a análise continua
              explícita depois de salvar, na página do produto. */}
          <Button
            aria-label="Selecionar produto"
            className={styles.ctaButton}
            onClick={onUse}
            type="button"
            variant="outline"
          >
            Selecionar
          </Button>
        </div>
      )}
    </li>
  );
}
