"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Tag, Trash2 } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  createProduct,
  getProduct,
  importProduct,
  ProductApiError,
  type ProductRecord,
  updateProduct,
} from "./product-api";
import { createGenerationIdempotencyKey, startGeneration } from "./generation-api";
import { createIdempotencyKey } from "./product-create-model";
import {
  buildManualProductPayload,
  buildProductPayload,
  COMMISSION_TYPES,
  DEFAULT_PRODUCT_CURRENCY,
  digitsToPrice,
  formatCommission,
  formatDiscount,
  formatPriceDisplay,
  formatPriceWithCurrency,
  preparationIsWithinLimits,
  validateProductManualDraft,
  type ProductManualDraft,
  type ProductManualFieldErrors,
} from "./product-form-model";
import {
  candidateSignalsForDisplay,
  gapLabels,
  importDisabled,
  importStatusAnnouncement,
  mergeImportedCandidate,
  type CandidateGap,
  type ContentPreparationPreferences,
  type ImportStatusState,
  type ProductSignals,
} from "./product-import-model";
import styles from "./product-form.module.css";

const emptyDraft: ProductManualDraft = {
  name: "",
  description: "",
  category: "",
  price: "",
  currency: DEFAULT_PRODUCT_CURRENCY,
  commissionType: "",
  commission: "",
  characteristics: "",
  discountType: "PERCENTAGE",
  discountValue: "",
  imageReferences: "",
  url: "",
};

type ProductCreateFormProps = {
  mode?: "create" | "edit";
  product?: ProductRecord;
  onSaved?: (product: ProductRecord) => void;
  /** Substitui o router.back() pós-salvamento: a edição inline volta ao resumo. */
  onAfterSave?: () => void;
};

const currencyOptions = [
  { value: "R$", label: "R$ Real" },
  { value: "USD", label: "$ Dólar" },
  { value: "EUR", label: "€ Euro" },
];

const commissionTypeOptions = [
  { value: "PERCENT", label: "% Porcentagem" },
  { value: "AMOUNT", label: "R$ Valor fixo" },
] satisfies Array<{ value: (typeof COMMISSION_TYPES)[number]; label: string }>;

const productCategories = [
  "Moda e acessórios",
  "Beleza e cuidados pessoais",
  "Eletrônicos",
  "Casa e decoração",
  "Saúde e bem-estar",
  "Esportes e lazer",
  "Bebês e crianças",
  "Brinquedos e jogos",
  "Alimentos e bebidas",
  "Pet shop",
  "Automotivo",
  "Livros e papelaria",
  "Ferramentas e construção",
  "Joias e relógios",
] as const;

const creatorPresenceOptions = [
  {
    value: "on_camera",
    label: "Em câmera",
    description:
      "Você apresenta o produto diante da câmera e fala diretamente com o público.",
  },
  {
    value: "hands_only_product",
    label: "Mão e produto",
    description:
      "O foco fica nas mãos demonstrando o produto, sem precisar mostrar o rosto.",
  },
  {
    value: "either",
    label: "Em câmera + Mão e produto",
    description:
      "Os conteúdos podem alternar entre apresentação em câmera e demonstração do produto.",
  },
] as const;
type ImageSource = "links" | "files";
type FormStep = "facts" | "preparation" | "summary";
type UploadedImage = { name: string; reference: string };

function imageReferenceLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((reference) => reference.trim())
    .filter(Boolean);
}

function draftFromProduct(product?: ProductRecord): ProductManualDraft {
  if (!product) return emptyDraft;
  return {
    name: product.name,
    description: product.description,
    category: product.category,
    price: product.price.replace(",", "."),
    currency: product.priceCurrency,
    commissionType: product.commissionType,
    characteristics: product.characteristics.join("\n"),
    commission: product.commission,
    /* O ProductRecord já normaliza: registro legado chega como PERCENTAGE + valor. */
    discountType: product.discountType ?? "PERCENTAGE",
    discountValue: product.discountValue,
    imageReferences: product.imageReferences.join("\n"),
    url: product.url,
  };
}

function uploadedImagesFromProduct(product?: ProductRecord): UploadedImage[] {
  return (product?.imageReferences ?? [])
    .filter((reference) => reference.startsWith("data:image/"))
    .map((reference, index) => ({
      name: `Imagem enviada ${index + 1}`,
      reference,
    }));
}

const errorFieldOrder: Array<keyof ProductManualFieldErrors> = [
  "name",
  "description",
  "category",
  "price",
  "currency",
  "commissionType",
  "commission",
  "characteristics",
  "discountType",
  "discountValue",
  "imageReferences",
  "url",
  "targetContentCount",
  "creatorPresence",
  "constraints",
];

function fieldId(field: string) {
  return `new-product-${field}`;
}

function CurrencySelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const errorId = `${fieldId("currency")}-error`;
  return (
    <Select
      items={currencyOptions}
      onValueChange={(next) => onChange(next ?? "")}
      value={value || null}
    >
      <SelectTrigger
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        aria-label="Moeda"
        className={styles.currencyTrigger}
        id={fieldId("currency")}
      >
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent className={styles.currencyContent}>
        {currencyOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  required = false,
  multiline = false,
  inputMode,
  type,
  maxLength,
  help,
  placeholder,
  financial = false,
  showCounter = false,
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  multiline?: boolean;
  inputMode?: "decimal";
  type?: "url";
  maxLength?: number;
  help?: string;
  placeholder?: string;
  financial?: boolean;
  showCounter?: boolean;
}) {
  const errorId = `${id}-error`;
  const countId = `${id}-count`;
  const helpId = help ? `${id}-help` : undefined;
  const describedBy =
    [error ? errorId : undefined, helpId, showCounter ? countId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) =>
    onChange(
      financial ? digitsToPrice(event.target.value) : event.target.value,
    );
  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {multiline ? (
        <textarea
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          id={id}
          maxLength={maxLength}
          name={id}
          placeholder={placeholder}
          onChange={handleChange}
          required={required}
          value={value}
        />
      ) : (
        <input
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          id={id}
          inputMode={inputMode}
          maxLength={maxLength}
          name={id}
          placeholder={placeholder}
          onChange={handleChange}
          required={required}
          type={type}
          value={financial ? formatPriceDisplay(value) : value}
        />
      )}
      {showCounter && maxLength !== undefined && (
        <p className={styles.charCount} id={countId}>
          {value.length}/{maxLength}
        </p>
      )}
      {help && (
        <p className={styles.help} id={helpId}>
          {help}
        </p>
      )}
      {error && (
        <p className={styles.fieldError} id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function CurrencyField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const errorId = `${fieldId("currency")}-error`;
  return (
    <div className={styles.field}>
      <label htmlFor={fieldId("currency")}>
        Moeda <span aria-hidden="true"> *</span>
      </label>
      <CurrencySelect error={error} onChange={onChange} value={value} />
      {error && (
        <p className={styles.fieldError} id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function CommissionField({
  price,
  currency,
  value,
  type,
  onChangeType,
  onChangeValue,
  typeError,
  valueError,
}: {
  price: string;
  currency: string;
  value: string;
  type: string;
  onChangeType: (value: string) => void;
  onChangeValue: (value: string) => void;
  typeError?: string;
  valueError?: string;
}) {
  const typeErrorId = `${fieldId("commissionType")}-error`;
  const valueErrorId = `${fieldId("commission")}-error`;
  const describedBy =
    [typeError ? typeErrorId : undefined, valueError ? valueErrorId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  const preview = formatCommission(type, value, price, currency);
  return (
    <div className={styles.field}>
      <label htmlFor={fieldId("commission")}>Comissão (opcional)</label>
      <div className={styles.commissionRow}>
        <Select
          items={commissionTypeOptions}
          onValueChange={(next) => onChangeType(next ?? "")}
          value={type || null}
        >
          <SelectTrigger
            aria-describedby={describedBy}
            aria-invalid={Boolean(typeError)}
            aria-label="Tipo de comissão"
            className={styles.commissionTypeTrigger}
            id={fieldId("commissionType")}
          >
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent className={styles.currencyContent}>
            {commissionTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          aria-describedby={describedBy}
          aria-invalid={Boolean(typeError || valueError)}
          className={styles.commissionInput}
          id={fieldId("commission")}
          inputMode="decimal"
          name={fieldId("commission")}
          onChange={(event) => onChangeValue(event.target.value)}
          placeholder={type === "PERCENT" ? "Ex.: 10" : "Ex.: 5,00"}
          value={value}
        />
      </div>
      {typeError && (
        <p className={styles.fieldError} id={typeErrorId} role="alert">
          {typeError}
        </p>
      )}
      {valueError && (
        <p className={styles.fieldError} id={valueErrorId} role="alert">
          {valueError}
        </p>
      )}
      {!typeError && !valueError && preview && (
        <p className={styles.commissionPreview}>= {preview}</p>
      )}
    </div>
  );
}

const discountTypeOptions = [
  { value: "PERCENTAGE", label: "% Porcentagem" },
  { value: "FIXED", label: "R$ Valor fixo" },
] as const;

function DiscountField({
  currency,
  value,
  type,
  onChangeType,
  onChangeValue,
  typeError,
  valueError,
}: {
  currency: string;
  value: string;
  type: string;
  onChangeType: (value: string) => void;
  onChangeValue: (value: string) => void;
  typeError?: string;
  valueError?: string;
}) {
  const typeErrorId = `${fieldId("discountType")}-error`;
  const valueErrorId = `${fieldId("discountValue")}-error`;
  const describedBy =
    [typeError ? typeErrorId : undefined, valueError ? valueErrorId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={fieldId("discountValue")}>Desconto (opcional)</label>
      <div className={styles.commissionRow}>
        <Select
          items={discountTypeOptions}
          onValueChange={(next) => onChangeType(next ?? "PERCENTAGE")}
          value={type || "PERCENTAGE"}
        >
          <SelectTrigger
            aria-describedby={typeError ? typeErrorId : undefined}
            aria-invalid={Boolean(typeError)}
            aria-label="Tipo de desconto"
            className={styles.commissionTypeTrigger}
            id={fieldId("discountType")}
          >
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent className={styles.currencyContent}>
            {discountTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          aria-describedby={valueError ? valueErrorId : undefined}
          aria-invalid={Boolean(valueError)}
          className={styles.commissionInput}
          id={fieldId("discountValue")}
          inputMode="decimal"
          name={fieldId("discountValue")}
          onChange={(event) => onChangeValue(event.target.value)}
          placeholder={type === "FIXED" ? `Ex.: 5,00 (${currency})` : "Ex.: 15,5"}
          value={value}
        />
      </div>
      {typeError && (
        <p className={styles.fieldError} id={typeErrorId} role="alert">
          {typeError}
        </p>
      )}
      {valueError && (
        <p className={styles.fieldError} id={valueErrorId} role="alert">
          {valueError}
        </p>
      )}
    </div>
  );
}

function CategoryField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = fieldId("category");
  const errorId = `${id}-error`;
  const [open, setOpen] = useState(false);
  const isCustomCategory =
    Boolean(value) && !productCategories.some((category) => category === value);
  const categories = isCustomCategory
    ? [value, ...productCategories]
    : productCategories;

  return (
    <div className={styles.field}>
      <label id={`${id}-label`} htmlFor={id}>
        Categoria <span aria-hidden="true">*</span>
      </label>
      <DropdownMenu onOpenChange={setOpen} open={open}>
        <DropdownMenuTrigger
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          aria-labelledby={`${id}-label ${id}-value`}
          id={id}
          render={
            <Button className={styles.categoryTrigger} variant="outline" />
          }
        >
          <span id={`${id}-value`}>{value || "Selecione uma categoria"}</span>
          <ChevronDown aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={styles.categoryMenu}>
          <DropdownMenuRadioGroup
            onValueChange={(nextValue) => {
              onChange(nextValue);
              setOpen(false);
            }}
            value={value}
          >
            {categories.map((category) => (
              <DropdownMenuRadioItem
                className={styles.categoryMenuItem}
                key={category}
                value={category}
              >
                {category}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p className={styles.fieldError} id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const creatorPresenceLabels: Record<
  ContentPreparationPreferences["creatorPresence"],
  string
> = {
  on_camera: "Em câmera",
  hands_only_product: "Mão e produto",
  either: "Em câmera + Mão e produto",
};

function ProductReviewSummary({
  draft,
  quantity,
  creatorPresence,
  notes,
}: {
  draft: ProductManualDraft;
  quantity: number;
  creatorPresence: ContentPreparationPreferences["creatorPresence"];
  notes: string;
}) {
  const discount = formatDiscount(
    draft.discountType,
    draft.discountValue ?? "",
    draft.currency,
  );
  return (
    <section aria-labelledby="product-review-title" className={styles.section}>
      <div className={styles.sectionHeading}>
        <h2 className={styles.sectionTitle} id="product-review-title">
          Resumo
        </h2>
        <p>Confira os dados antes de salvar o produto.</p>
      </div>
      <dl className={styles.reviewFacts}>
        <div>
          <dt>Produto</dt>
          <dd>{draft.name}</dd>
        </div>
        <div>
          <dt>Categoria</dt>
          <dd>{draft.category}</dd>
        </div>
        <div>
          <dt>Preço</dt>
          <dd>{formatPriceWithCurrency(draft.price, draft.currency)}</dd>
        </div>
        {discount && (
          <div>
            <dt>Desconto</dt>
            <dd>{discount}</dd>
          </div>
        )}
        <div>
          <dt>Descrição</dt>
          <dd>{draft.description}</dd>
        </div>
        <div>
          <dt>Características</dt>
          <dd>
            <ul className={styles.reviewList}>
              {imageReferenceLines(draft.characteristics).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt>Quantidade de conteúdos</dt>
          <dd>{quantity}</dd>
        </div>
        <div>
          <dt>Formato do creator</dt>
          <dd>{creatorPresenceLabels[creatorPresence]}</dd>
        </div>
        <div>
          <dt>Observações ou restrições</dt>
          <dd>{notes.trim() || "Nenhuma observação informada."}</dd>
        </div>
      </dl>
    </section>
  );
}

export function ProductCreateForm({
  mode = "create",
  product,
  onSaved,
  onAfterSave,
}: ProductCreateFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [draft, setDraft] = useState<ProductManualDraft>(() =>
    draftFromProduct(product),
  );
  const [version, setVersion] = useState(product?.version ?? 0);
  const [quantity, setQuantity] = useState(product?.targetContentCount ?? 5);
  const [creatorPresence, setCreatorPresence] = useState<
    ContentPreparationPreferences["creatorPresence"]
  >(product?.creatorPresence ?? "either");
  const submitIntent = useRef<"save" | "analyze">("save");
  const [notes, setNotes] = useState(product?.observations ?? "");
  const [saving, setSaving] = useState(false);
  /* Estados visíveis da importação por URL (SPEC Slice 012): idle,
     importing, ready, partial e fallback. Mensagem/gaps/sinais ficam locais;
     proveniência só existe depois de um candidato aplicado. */
  const [importState, setImportState] = useState<ImportStatusState>("idle");
  const importing = importState === "importing";
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importGaps, setImportGaps] = useState<CandidateGap[]>([]);
  const [importSignals, setImportSignals] = useState<ProductSignals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ProductManualFieldErrors>({});
  const [validationVisible, setValidationVisible] = useState(false);
  const [formStep, setFormStep] = useState<FormStep>("facts");
  const [imageSource, setImageSource] = useState<ImageSource>("links");
  const [imageLinksInput, setImageLinksInput] = useState(() =>
    (product?.imageReferences ?? [])
      .filter((reference) => /^https?:\/\//i.test(reference))
      .join("\n"),
  );
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>(() =>
    uploadedImagesFromProduct(product),
  );
  const [selectedImage, setSelectedImage] = useState<UploadedImage | null>(
    null,
  );
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  /* Uma chave por tentativa lógica: gerada no primeiro submit e reutilizada
     em todo retry; limpa só após sucesso (novo formulário = novo mount). */
  const idempotencyKey = useRef<string | undefined>(undefined);
  const importIdempotencyKey = useRef<string | undefined>(undefined);

  function update(field: keyof ProductManualDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError(null);
    if (field === "url" && !value.trim()) {
      /* URL limpa = formulário manual do zero: sem status de importação. */
      setImportState("idle");
      setImportMessage(null);
      setImportGaps([]);
      setImportSignals(null);
    }
  }

  function updateImageLinks(value: string) {
    setPreviewUnavailable(false);
    setImageLinksInput(value);
    const links = imageReferenceLines(value);
    const fileReferences = uploadedImages.map((image) => image.reference);
    update("imageReferences", [...links, ...fileReferences].join("\n"));
    if (
      selectedImage &&
      !selectedImage.reference.startsWith("data:image/") &&
      !links.includes(selectedImage.reference)
    ) {
      setSelectedImage(null);
    }
  }

  function showImagePreview(image: UploadedImage) {
    setPreviewUnavailable(false);
    setSelectedImage(image);
  }

  function removeImageLink(indexToRemove: number) {
    const remainingLinks = imageReferenceLines(imageLinksInput).filter(
      (_, index) => index !== indexToRemove,
    );
    const removedReference =
      imageReferenceLines(imageLinksInput)[indexToRemove];
    const nextValue = remainingLinks.join("\n");
    setPreviewUnavailable(false);
    setImageLinksInput(nextValue);
    update(
      "imageReferences",
      [
        ...remainingLinks,
        ...uploadedImages.map((image) => image.reference),
      ].join("\n"),
    );
    if (
      selectedImage?.reference === removedReference &&
      !remainingLinks.includes(removedReference ?? "")
    ) {
      setSelectedImage(null);
      setPreviewUnavailable(false);
    }
  }

  function removeUploadedImage(reference: string) {
    const remainingImages = uploadedImages.filter(
      (image) => image.reference !== reference,
    );
    const links = imageReferenceLines(imageLinksInput);
    setPreviewUnavailable(false);
    setUploadedImages(remainingImages);
    update(
      "imageReferences",
      [...links, ...remainingImages.map((image) => image.reference)].join("\n"),
    );
    if (selectedImage?.reference === reference) {
      setSelectedImage(null);
      setPreviewUnavailable(false);
    }
  }

  function readImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      const message = "Escolha um arquivo de imagem.";
      setError(message);
      toast.error(message);
      return;
    }
    if (file.size > 2_000_000) {
      const message = "A imagem deve ter no máximo 2 MB.";
      setError(message);
      toast.error(message);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setDraft((current) => ({
        ...current,
        imageReferences: `${current.imageReferences ?? ""}${current.imageReferences ? "\n" : ""}${reader.result}`,
      }));
      setUploadedImages((current) => [
        ...current,
        { name: file.name, reference: reader.result as string },
      ]);
      setPreviewUnavailable(false);
      setFieldErrors((current) => ({ ...current, imageReferences: undefined }));
      setError(null);
    };
    reader.onerror = () => {
      const message = "Não foi possível ler essa imagem.";
      setError(message);
      toast.error(message);
    };
    reader.readAsDataURL(file);
  }

  function focusFirstError(errors: ProductManualFieldErrors) {
    const first = errorFieldOrder.find((field) => Boolean(errors[field]));
    if (!first) return;
    requestAnimationFrame(() =>
      document.getElementById(fieldId(first))?.focus(),
    );
  }

  const contentPreferences: ContentPreparationPreferences = {
    targetContentCount: quantity,
    creatorPresence,
    ...(notes.trim() ? { constraints: notes.trim() } : {}),
  };

  function continueToPreparation() {
    setValidationVisible(true);
    const validation = validateProductManualDraft(draft, notes);
    delete validation.constraints;
    delete validation.targetContentCount;
    delete validation.creatorPresence;
    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      setError("Revise os fatos destacados para continuar.");
      focusFirstError(validation);
      return;
    }
    setFieldErrors({});
    setError(null);
    setFormStep("preparation");
  }

  async function importFromUrl() {
    if (isEdit || importDisabled(importing, saving)) return;
    const url = draft.url?.trim() ?? "";
    if (!url) {
      const message = "Cole uma URL pública do TikTok Shop para importar.";
      setFieldErrors((current) => ({ ...current, url: message }));
      setError(message);
      return;
    }
    setError(null);
    setFieldErrors((current) => ({ ...current, url: undefined }));
    setImportState("importing");
    setImportMessage(null);
    setImportGaps([]);
    setImportSignals(null);
    try {
      /* Uma chave por tentativa lógica: reutilizada em retry, renovada
         quando a consulta anterior respondeu. */
      const key = importIdempotencyKey.current ?? createIdempotencyKey();
      importIdempotencyKey.current = key;
      const result = await importProduct(url, key);
      /* Merge não destrutivo: fatos ausentes não apagam o que o creator
         já digitou. A confirmação continua sendo o botão de salvar. */
      /* Imagens do creator têm prioridade: a primeira imagem importada só
         entra quando não existe imagem manual/upload. */
      const manualImages = imageReferenceLines(draft.imageReferences ?? "");
      const firstImage =
        manualImages.length === 0 ? result.candidate.imageRefs[0] : undefined;
      setDraft(mergeImportedCandidate(draft, result.candidate));
      if (firstImage) {
        /* Primeira imagem apenas: substitui links e arquivos escolhidos. */
        setImageLinksInput(firstImage);
        setUploadedImages([]);
        setSelectedImage(null);
      }
      setImportState(result.partial ? "partial" : "ready");
      setImportMessage(result.message);
      setImportGaps(result.gaps);
      setImportSignals(result.candidate.signals ?? null);
      importIdempotencyKey.current = undefined;
    } catch (caught) {
      /* Fallback manual: valores preservados; erro no campo de URL e no
         status ao lado, sem toast e sem anúncio duplicado. */
      const message = caught instanceof ProductApiError
        ? caught.message
        : "Não foi possível importar agora. Continue com o preenchimento manual; seus dados continuam aqui.";
      setFieldErrors((current) => ({
        ...current,
        url: caught instanceof ProductApiError
          ? caught.fieldErrors.url ?? message
          : message,
      }));
      setImportState("fallback");
      setImportMessage(message);
    }
  }


  function continueToSummary() {
    setValidationVisible(true);
    const validation = validateProductManualDraft(draft, notes);
    delete validation.constraints;
    delete validation.targetContentCount;
    delete validation.creatorPresence;
    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      setFormStep("facts");
      setError("Revise os fatos destacados para continuar.");
      focusFirstError(validation);
      return;
    }
    if (!preparationIsWithinLimits(contentPreferences)) {
      const preparationErrors: ProductManualFieldErrors = {};
      if (quantity < 1 || quantity > 10 || !Number.isInteger(quantity)) {
        preparationErrors.targetContentCount =
          "Escolha uma quantidade entre 1 e 10.";
      }
      if (!creatorPresence) {
        preparationErrors.creatorPresence = "Escolha um formato.";
      }
      if (notes.length > 300) {
        preparationErrors.constraints = "Use no máximo 300 caracteres.";
      }
      setFieldErrors(preparationErrors);
      setError("Revise a preparação dos conteúdos antes de continuar.");
      return;
    }
    setFieldErrors({});
    setError(null);
    setFormStep("summary");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const shouldAnalyze = submitIntent.current === "analyze";
    submitIntent.current = "save";
    const validation = validateProductManualDraft(draft, notes);
    if (isEdit) {
      delete validation.constraints;
      delete validation.targetContentCount;
      delete validation.creatorPresence;
    }
    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      setError("Revise os campos destacados para continuar.");
      const firstError = errorFieldOrder.find((field) =>
        Boolean(validation[field]),
      );
      if (
        !isEdit &&
        (firstError === "targetContentCount" ||
          firstError === "creatorPresence" ||
          firstError === "constraints")
      ) {
        setFormStep("preparation");
      } else {
        setFormStep("facts");
      }
      focusFirstError(validation);
      return;
    }
    if (!isEdit && !preparationIsWithinLimits(contentPreferences)) {
      setFormStep("preparation");
      setError("Revise a preparação dos conteúdos antes de salvar.");
      return;
    }

    setSaving(true);
    let createdId: string | null = null;
    setFieldErrors({});
    const key = idempotencyKey.current ?? createIdempotencyKey();
    idempotencyKey.current = key;

    try {
      const payload = buildManualProductPayload(
        draft,
        contentPreferences,
        isEdit ? undefined : key,
      );
      if (isEdit && product) {
        delete payload.targetContentCount;
        delete payload.creatorPresence;
        const mutation = await updateProduct(product.id, {
          ...payload,
          /* buildManualProductPayload omite vazio; na edição constraints vai
             explícito (string vazia limpa no backend). Criação mantém contrato. */
          constraints: notes.trim(),
          expectedVersion: version,
        });
        const latest = await getProduct(mutation.id);
        setVersion(latest.version);
        onSaved?.(latest);
        if (onAfterSave) {
          onAfterSave();
        } else {
          router.back();
        }
      } else {
        createdId = (await createProduct(payload)).id;
        if (shouldAnalyze && createdId) {
          await startGeneration(createdId, createGenerationIdempotencyKey());
        }
      }
      toast.success(
        shouldAnalyze
          ? "Produto salvo. Análise iniciada."
          : isEdit
            ? "Alterações salvas."
            : "Produto salvo.",
      );
      idempotencyKey.current = undefined;
      if (!isEdit && createdId) router.push(`/products/${createdId}`);
    } catch (caught) {
      if (caught instanceof ProductApiError) {
        const apiErrors: ProductManualFieldErrors = {
          name: caught.fieldErrors.name,
          description: caught.fieldErrors.description,
          category: caught.fieldErrors.category,
          price: caught.fieldErrors.price,
          characteristics: caught.fieldErrors.characteristics,
          imageReferences: caught.fieldErrors.imageReferences,
          url: caught.fieldErrors.url,
          targetContentCount: caught.fieldErrors.targetContentCount,
          creatorPresence: caught.fieldErrors.creatorPresence,
          constraints: caught.fieldErrors.constraints,
          discountType: caught.fieldErrors.discountType,
          discountValue: caught.fieldErrors.discountValue,
        };
        setFieldErrors(apiErrors);
        setError(caught.message);
        toast.error(caught.message);
        focusFirstError(apiErrors);
      } else {
        const message =
          "Não foi possível salvar agora. Seus dados continuam nesta tela; tente novamente.";
        setError(message);
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  }

  const visibleValidation = validateProductManualDraft(draft, notes);
  if (isEdit) {
    delete visibleValidation.constraints;
    delete visibleValidation.targetContentCount;
    delete visibleValidation.creatorPresence;
  }
  const combinedErrors: ProductManualFieldErrors = validationVisible
    ? { ...visibleValidation, ...fieldErrors }
    : fieldErrors;
  const imageLinks = imageReferenceLines(imageLinksInput);
  const firstPreviewLink = imageLinks
    .map((reference, index) => ({
      name: `Imagem ${index + 1}`,
      reference,
    }))
    .find(({ reference }) => {
      if (/^(?:data:image\/|blob:)/i.test(reference)) return true;
      try {
        const url = new URL(reference);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    });
  const previewImage =
    selectedImage ?? firstPreviewLink ?? uploadedImages[0] ?? null;

  return (
    <form
      aria-busy={saving}
      className={styles.form}
      id={isEdit ? "product-edit-form" : undefined}
      noValidate
      onSubmit={submit}
    >
      {error && (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      )}

      {!isEdit && (
        <ol aria-label="Etapas do cadastro" className={styles.formSteps}>
          <li aria-current={formStep === "facts" ? "step" : undefined}>
            <span aria-hidden="true">1</span>
            <strong>Informações</strong>
          </li>
          <li aria-current={formStep === "preparation" ? "step" : undefined}>
            <span aria-hidden="true">2</span>
            <strong>Conteúdos</strong>
          </li>
          <li aria-current={formStep === "summary" ? "step" : undefined}>
            <span aria-hidden="true">3</span>
            <strong>Resumo</strong>
          </li>
        </ol>
      )}

      {(isEdit || formStep === "facts") && (
        <section
          aria-labelledby="new-product-facts-title"
          className={styles.section}
        >
          <div className={styles.sectionHeading}>
            <h2 className={styles.sectionTitle} id="new-product-facts-title">
              <Tag aria-hidden="true" className={styles.sectionIcon} />
              {isEdit ? "Dados do produto" : "Informe os dados do produto"}
            </h2>
            <p className={styles.sectionDescription}>
              Essas informações ajudam a inteligência do sistema a criar a
              melhor estratégia de conteúdo.
            </p>
          </div>
          <TextField
            error={combinedErrors.name}
            id={fieldId("name")}
            placeholder="Escreva o nome do produto"
            label="Nome do produto"
            onChange={(value) => update("name", value)}
            required
            value={draft.name}
          />
          <TextField
            error={combinedErrors.description}
            placeholder="Cole aqui a descrição do produto, ou descreva-o em detalhes"
            id={fieldId("description")}
            label="Descrição"
            multiline
            onChange={(value) => update("description", value)}
            required
            value={draft.description}
          />
          <div className={styles.factsGrid}>
            <CategoryField
              error={combinedErrors.category}
              onChange={(value) => update("category", value)}
              value={draft.category}
            />
            <TextField
              error={combinedErrors.price}
              financial
              id={fieldId("price")}
              placeholder="Ex.: 89,90"
              inputMode="decimal"
              label="Preço"
              onChange={(value) => update("price", value)}
              required
              value={draft.price}
            />
            <CurrencyField
              error={combinedErrors.currency}
              onChange={(value) => update("currency", value)}
              value={draft.currency}
            />
            <CommissionField
              currency={draft.currency}
              onChangeType={(value) => update("commissionType", value)}
              onChangeValue={(value) => update("commission", value)}
              price={draft.price}
              type={draft.commissionType ?? ""}
              typeError={combinedErrors.commissionType}
              value={draft.commission ?? ""}
              valueError={combinedErrors.commission}
            />
            <DiscountField
              currency={draft.currency}
              onChangeType={(value) => update("discountType", value)}
              onChangeValue={(value) => update("discountValue", value)}
              type={draft.discountType ?? "PERCENTAGE"}
              typeError={combinedErrors.discountType}
              value={draft.discountValue ?? ""}
              valueError={combinedErrors.discountValue}
            />
          </div>
          <TextField
            error={combinedErrors.characteristics}
            id={fieldId("characteristics")}
            label="Características do produto"
            multiline
            onChange={(value) => update("characteristics", value)}
            placeholder="Descreva as características do produto, isso ajuda a inteligencia do sistema a gerar conteúdos ainda melhores"
            required
            value={draft.characteristics}
          />
          <div className={styles.imageManager}>
            <div className={styles.imageControls}>
              <p className={styles.imageManagerLabel}>Imagens do produto</p>
              <Tabs
                onValueChange={(value) => setImageSource(value as ImageSource)}
                value={imageSource}
              >
                <TabsList className={styles.imageTabs} variant="line">
                  <TabsTrigger value="links">URL/Link</TabsTrigger>
                  <TabsTrigger value="files">Enviar arquivo</TabsTrigger>
                </TabsList>
                <TabsContent value="links">
                  <div className={styles.field}>
                    <label htmlFor={fieldId("imageReferences")}>
                      Cole aqui os links das imagens
                    </label>
                    <textarea
                      aria-invalid={Boolean(combinedErrors.imageReferences)}
                      id={fieldId("imageReferences")}
                      onChange={(event) => updateImageLinks(event.target.value)}
                      placeholder="https://exemplo.com/imagem.jpg"
                      rows={4}
                      value={imageLinksInput}
                    />
                  </div>
                  <div className={styles.imageList}>
                    {imageLinks.map((reference, index) => (
                      <div
                        className={styles.imageListItem}
                        key={`${reference}-${index}`}
                      >
                        <button
                          aria-pressed={previewImage?.reference === reference}
                          className={styles.imageListSelection}
                          onClick={() =>
                            showImagePreview({
                              name: `Imagem ${index + 1}`,
                              reference,
                            })
                          }
                          type="button"
                        >
                          {reference}
                        </button>
                        <Button
                          aria-label={`Remover imagem ${index + 1}`}
                          className={styles.imageRemoveButton}
                          onClick={() => removeImageLink(index)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="files">
                  <div className={styles.field}>
                    <div
                      className={styles.imageFileHeading}
                      id={`${fieldId("imageFile")}-label`}
                    >
                      <span>Selecione os arquivos de imagem</span>
                      <span>Imagens de até 2 MB cada.</span>
                    </div>
                    <input
                      accept="image/*"
                      aria-labelledby={`${fieldId("imageFile")}-label`}
                      className={styles.imageFileInput}
                      id={fieldId("imageFile")}
                      multiple
                      onChange={(event) => {
                        Array.from(event.target.files ?? []).forEach(
                          readImageFile,
                        );
                        event.target.value = "";
                      }}
                      ref={imageFileInputRef}
                      type="file"
                    />
                    <div className={styles.imageFilePicker}>
                      <Button
                        onClick={() => imageFileInputRef.current?.click()}
                        type="button"
                        variant="outline"
                      >
                        Escolher arquivos
                      </Button>
                      {uploadedImages.length === 0 && (
                        <span aria-live="polite">Nenhum arquivo escolhido</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.imageList}>
                    {uploadedImages.map((image, index) => (
                      <div
                        className={styles.imageListItem}
                        key={`${image.name}-${index}`}
                      >
                        <button
                          aria-pressed={
                            previewImage?.reference === image.reference
                          }
                          className={styles.imageListSelection}
                          onClick={() => showImagePreview(image)}
                          type="button"
                        >
                          {image.name}
                        </button>
                        <Button
                          aria-label={`Remover ${image.name}`}
                          className={styles.imageRemoveButton}
                          onClick={() => removeUploadedImage(image.reference)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
              {combinedErrors.imageReferences && (
                <p className={styles.fieldError} role="alert">
                  {combinedErrors.imageReferences}
                </p>
              )}
            </div>
            <div aria-live="polite" className={styles.imagePreview}>
              {previewImage && !previewUnavailable ? (
                <Image
                  alt={`Preview de ${previewImage.name}`}
                  height={320}
                  key={previewImage.reference}
                  onError={() => setPreviewUnavailable(true)}
                  src={previewImage.reference}
                  unoptimized
                  width={420}
                />
              ) : (
                <p>
                  {previewUnavailable
                    ? "Preview indisponível"
                    : "Selecione uma imagem"}
                </p>
              )}
            </div>
          </div>
          <TextField
            error={combinedErrors.url}
            help="Cole o link público (https) de um produto do TikTok Shop."
            id={fieldId("url")}
            label={
              <>
                URL do produto{" "}
                <span className={styles.optionalMark}>Opcional</span>
              </>
            }
            placeholder="https://exemplo.com/seu-produto"
            onChange={(value) => update("url", value)}
            type="url"
            value={draft.url ?? ""}
          />
          {!isEdit && (
            <>
              <div className={styles.importAction}>
                <Button
                  disabled={importDisabled(importing, saving)}
                  onClick={importFromUrl}
                  type="button"
                  variant="outline"
                >
                  {importing ? "Importando…" : "Importar do TikTok Shop"}
                </Button>
                <p>Se a consulta falhar, você pode continuar preenchendo os dados manualmente.</p>
              </div>
              {/* Status único da importação: anunciado sem roubar foco;
                  gaps e sinais são texto, nunca só cor. */}
              <div aria-live="polite" className={styles.importStatus} role="status">
                {importState !== "idle" && (
                  <p>{importStatusAnnouncement(importState, importMessage ?? undefined)}</p>
                )}
                {importGaps.length > 0 && (
                  <p className={styles.importGaps}>
                    <strong>Campos que faltaram: </strong>
                    {gapLabels(importGaps).join(", ")}.
                  </p>
                )}
                {importSignals && (
                  <div className={styles.importSignals}>
                    <p className={styles.importSignalsTitle}>
                      Sinais do TikTok Shop (somente leitura)
                    </p>
                    <ul>
                      {candidateSignalsForDisplay(importSignals).map((signal) => (
                        <li key={signal.label}>
                          <strong>{signal.label}:</strong> {signal.value}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
          {isEdit && (
            <TextField
              error={combinedErrors.constraints}
              id={fieldId("constraints")}
              help="Você pode informar preferências, restrições ou detalhes que devem orientar os conteúdos."
              label={
                <>
                  Observações ou restrições{" "}
                  <span className={styles.optionalMark}>Opcional</span>
                </>
              }
              maxLength={300}
              multiline
              onChange={setNotes}
              showCounter
              value={notes}
            />
          )}
        </section>
      )}

      {!isEdit && formStep === "preparation" && (
        <section
          aria-labelledby="content-preparation-title"
          className={styles.section}
        >
          <div className={styles.sectionHeading}>
            <h2 id="content-preparation-title">Preparação dos conteúdos</h2>
            <p>Defina as preferências para geração inicial dos briefings.</p>
          </div>
          <div className={styles.preparationGrid}>
            <fieldset className={styles.preparationGroup}>
              <legend>
                Quantidade inicial de conteúdos{" "}
                <span aria-hidden="true">*</span>
              </legend>
              <div className={styles.preparationQuantity}>
                <span aria-hidden="true" className={styles.quantityValue}>
                  {quantity}
                </span>
                <Slider
                  aria-describedby={
                    combinedErrors.targetContentCount
                      ? `${fieldId("targetContentCount")}-error ${fieldId("targetContentCount")}-help`
                      : `${fieldId("targetContentCount")}-help`
                  }
                  aria-invalid={Boolean(combinedErrors.targetContentCount)}
                  aria-label="Quantidade inicial de conteúdos"
                  className={styles.quantitySlider}
                  id={fieldId("targetContentCount")}
                  max={10}
                  min={1}
                  onValueChange={(value) =>
                    setQuantity(
                      Array.isArray(value) ? (value[0] ?? quantity) : quantity,
                    )
                  }
                  step={1}
                  value={[quantity]}
                />
                <div aria-hidden="true" className={styles.quantityBounds}>
                  <span>1</span>
                  <span>10</span>
                </div>
              </div>
              <p
                className={styles.help}
                id={`${fieldId("targetContentCount")}-help`}
              >
                Use o mouse para ajustar.
              </p>
              {combinedErrors.targetContentCount && (
                <p
                  className={styles.fieldError}
                  id={`${fieldId("targetContentCount")}-error`}
                  role="alert"
                >
                  {combinedErrors.targetContentCount}
                </p>
              )}
            </fieldset>
            <fieldset className={styles.preparationGroup}>
              <legend>
                Formato do creator <span aria-hidden="true">*</span>
              </legend>
              <Tabs
                aria-describedby={
                  combinedErrors.creatorPresence
                    ? `${fieldId("creatorPresence")}-error`
                    : undefined
                }
                aria-label="Formato do creator"
                className={styles.creatorModeTabs}
                onValueChange={(value) =>
                  setCreatorPresence(
                    value as ContentPreparationPreferences["creatorPresence"],
                  )
                }
                value={creatorPresence}
              >
                <TabsList className={styles.creatorOptions} variant="line">
                  {creatorPresenceOptions.map((option, index) => (
                    <TabsTrigger
                      id={index === 0 ? fieldId("creatorPresence") : undefined}
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {creatorPresenceOptions.map((option) => (
                  <TabsContent
                    className={styles.creatorDescription}
                    key={option.value}
                    value={option.value}
                  >
                    {" "}
                    {option.description}
                  </TabsContent>
                ))}
              </Tabs>
              {combinedErrors.creatorPresence && (
                <p
                  className={styles.fieldError}
                  id={`${fieldId("creatorPresence")}-error`}
                  role="alert"
                >
                  {combinedErrors.creatorPresence}
                </p>
              )}
            </fieldset>
          </div>
          <TextField
            error={combinedErrors.constraints}
            id={fieldId("constraints")}
            help="Você pode informar preferências, restrições ou detalhes que devem orientar os conteúdos."
            label={
              <>
                Observações ou restrições{" "}
                <span className={styles.optionalMark}>Opcional</span>
              </>
            }
            maxLength={300}
            multiline
            onChange={setNotes}
            showCounter
            value={notes}
          />
        </section>
      )}
      {!isEdit && formStep === "summary" && (
        <ProductReviewSummary
          creatorPresence={creatorPresence}
          draft={draft}
          notes={notes}
          quantity={quantity}
        />
      )}

      <div
        className={[
          styles.submitBar,
          !isEdit && formStep === "facts" ? styles.firstStepActions : "",
          formStep === "preparation" ? styles.preparationActions : "",
          formStep === "summary" ? styles.summaryActions : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {!isEdit && formStep === "facts" && (
          <Button className={styles.continueButton} onClick={continueToPreparation} type="button">
            Continuar
          </Button>
        )}
        {!isEdit && formStep === "preparation" && (
          <Button className={styles.continueButton} disabled={saving} onClick={continueToSummary} type="button">
            Continuar
          </Button>
        )}
        {!isEdit && (formStep === "preparation" || formStep === "summary") && (
          <Button
            className={styles.backButton}
            disabled={saving}
            onClick={() =>
              setFormStep(formStep === "preparation" ? "facts" : "preparation")
            }
            type="button"
            variant="outline"
          >
            Voltar
          </Button>
        )}
        {!isEdit &&
          (saving ? (
          <Button className={styles.cancelLink} disabled type="button" variant="outline">
            Cancelar
          </Button>
        ) : (
          <Link className={styles.cancelLink} href="/products">
            Cancelar
          </Link>
          ))}
        {!isEdit && formStep === "summary" && (
          <Button className={styles.saveButton} disabled={saving} type="submit">
            {saving ? "Salvar produto — salvando" : "Salvar produto"}
          </Button>
        )}
        {!isEdit && formStep === "summary" && (
          <Button
            className={styles.analysisButton}
            disabled={saving}
            onClick={() => {
              submitIntent.current = "analyze";
            }}
            type="submit"
          >
            {saving ? "Iniciando análise…" : "Analisar produto"}
          </Button>
        )}
      </div>
    </form>
  );
}
