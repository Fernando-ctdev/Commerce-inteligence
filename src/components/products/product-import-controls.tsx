"use client";

import { KeyboardEvent, ReactNode } from "react";

import { QUANTITY_MAX, QUANTITY_MIN, QUANTITY_PRESETS } from "./product-candidate-review-model";
import styles from "./product-import-flow.module.css";

// Controles compartilhados entre a revisão do candidate (T24) e o fallback manual (T25).

type ImportFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  help?: string;
  required?: boolean;
  multiline?: boolean;
  type?: "text" | "url";
  inputMode?: "text" | "decimal" | "numeric";
  maxLength?: number;
  children?: ReactNode;
};

export function ImportField({ id, label, value, onChange, error, help, required = false, multiline = false, type = "text", inputMode, maxLength, children }: ImportFieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const controlProps = {
    "aria-describedby": describedBy,
    "aria-invalid": Boolean(error),
    id,
    inputMode,
    maxLength,
    name: id,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    required,
    type,
    value,
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      {multiline ? <textarea {...controlProps} rows={4} /> : <input {...controlProps} />}
      {children}
      {help && <p className={styles.help} id={helpId}>{help}</p>}
      {error && <p className={styles.fieldError} id={errorId} role="alert">{error}</p>}
    </div>
  );
}

export function OriginNote({ origin }: { origin: "extracted" | "gap" | "confirmed" }) {
  if (origin === "confirmed") {
    return <p className={styles.originNote}>Confirmado por você — será salvo como fato confirmado.</p>;
  }
  if (origin === "gap") {
    return <p className={styles.gapNote}>Não encontramos esse dado</p>;
  }
  return <p className={styles.originNote}>Extraído da página — confira antes de confirmar.</p>;
}

type StringListEditorProps = {
  id: string;
  label: string;
  addLabel: string;
  items: string[];
  onItemsChange: (items: string[]) => void;
  error?: string;
  help?: string;
  placeholder?: string;
  type?: "text" | "url";
  maxLength?: number;
  maxItems: number;
};

// Lista editável por teclado (UX-AC4): Enter ou botão adiciona; remover tem alvo de 44px.
export function StringListEditor({ id, label, addLabel, items, onItemsChange, error, help, placeholder, type = "text", maxLength, maxItems }: StringListEditorProps) {
  const errorId = error ? `${id}-error` : undefined;
  const helpId = help ? `${id}-help` : undefined;

  function addItem() {
    const input = document.getElementById(id) as HTMLInputElement | null;
    const value = input?.value.trim() ?? "";
    if (!value || items.length >= maxItems) return;
    onItemsChange([...items, value]);
    if (input) input.value = "";
    input?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addItem();
    }
  }

  function removeItem(index: number) {
    onItemsChange(items.filter((_, position) => position !== index));
  }

  const atCapacity = items.length >= maxItems;

  return (
    <div className={styles.field}>
      <span className={styles.listLabel} id={`${id}-label`}>{label}</span>
      {items.length > 0 && (
        <ul className={styles.listRows} aria-labelledby={`${id}-label`}>
          {items.map((item, index) => (
            <li className={styles.listRow} key={`${item}-${index}`}>
              <span className={styles.listItemValue}>{item}</span>
              <button
                aria-label={`Remover ${item}`}
                className={styles.removeButton}
                onClick={() => removeItem(index)}
                type="button"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.listAddRow}>
        <input
          aria-describedby={[helpId, errorId].filter(Boolean).join(" ") || undefined}
          aria-invalid={Boolean(error)}
          className={styles.listInput}
          disabled={atCapacity}
          id={id}
          maxLength={maxLength}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          type={type}
        />
        <button className={styles.secondaryButton} disabled={atCapacity} onClick={addItem} type="button">
          {addLabel}
        </button>
      </div>
      {help && <p className={styles.help} id={helpId}>{help}{atCapacity ? ` Limite de ${maxItems} atingido.` : ""}</p>}
      {error && <p className={styles.fieldError} id={errorId} role="alert">{error}</p>}
    </div>
  );
}

type QuantitySelectorProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
};

// Presets 10/20/30/Outro (SPEC §Estados de UX); valor inicial chega resolvido server-side via prop (CONF-AC3).
export function QuantitySelector({ id, value, onChange, error, disabled = false }: QuantitySelectorProps) {
  const errorId = error ? `${id}-error` : undefined;
  const presetValue = QUANTITY_PRESETS.includes(Number(value) as (typeof QUANTITY_PRESETS)[number]) ? Number(value) : null;
  const isCustom = presetValue === null;

  function selectPreset(preset: number) {
    onChange(String(preset));
  }

  return (
    <fieldset aria-describedby={errorId} className={styles.quantityGroup} disabled={disabled}>
      <legend>Quantos conteúdos criar?</legend>
      {QUANTITY_PRESETS.map((preset) => (
        <label className={styles.quantityOption} key={preset}>
          <input
            checked={!isCustom && Number(value) === preset}
            name={id}
            onChange={() => selectPreset(preset)}
            type="radio"
            value={preset}
          />
          <span>{preset}</span>
        </label>
      ))}
      <label className={styles.quantityOption}>
        <input checked={isCustom} name={id} onChange={() => onChange("")} type="radio" value="outro" />
        <span>Outro</span>
      </label>
      {isCustom && (
        <input
          aria-label="Quantidade exata de conteúdos"
          className={styles.quantityInput}
          inputMode="numeric"
          max={QUANTITY_MAX}
          min={QUANTITY_MIN}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`Entre ${QUANTITY_MIN} e ${QUANTITY_MAX}`}
          type="number"
          value={value}
        />
      )}
      {error && <p className={styles.fieldError} id={errorId} role="alert">{error}</p>}
    </fieldset>
  );
}
