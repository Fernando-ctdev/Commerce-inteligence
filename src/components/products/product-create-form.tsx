"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Trash2 } from "lucide-react";
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
  ProductApiError,
  type ProductRecord,
  updateProduct,
} from "./product-api";
import { createIdempotencyKey } from "./product-create-model";
import {
  buildManualProductPayload,
  DEFAULT_PRODUCT_CURRENCY,
  digitsToPrice,
  formatPriceDisplay,
  preparationIsWithinLimits,
  validateProductManualDraft,
  type ProductManualDraft,
  type ProductManualFieldErrors,
} from "./product-form-model";
import type { ContentPreparationPreferences } from "./product-import-model";
import styles from "./product-form.module.css";

const emptyDraft: ProductManualDraft = {
  name: "",
  description: "",
  category: "",
  price: "",
  currency: DEFAULT_PRODUCT_CURRENCY,
  characteristics: "",
  imageReferences: "",
  url: "",
};

type ProductCreateFormProps = {
  mode?: "create" | "edit";
  product?: ProductRecord;
  onSaved?: (product: ProductRecord) => void;
  onDeleteRequest?: () => void;
  deleting?: boolean;
};

const currencyOptions = [
  { value: "BRL", label: "R$ Real" },
  { value: "USD", label: "$ Dólar" },
  { value: "EUR", label: "€ Euro" },
];

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
    label: "Ambos",
    description:
      "Os conteúdos podem alternar entre apresentação em câmera e demonstração do produto.",
  },
] as const;

type ImageSource = "links" | "files";
type FormStep = "facts" | "preparation";
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
    characteristics: product.characteristics.join("\n"),
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
  "characteristics",
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

export function ProductCreateForm({
  mode = "create",
  product,
  onSaved,
  onDeleteRequest,
  deleting = false,
}: ProductCreateFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [draft, setDraft] = useState<ProductManualDraft>(() =>
    draftFromProduct(product),
  );
  const [version, setVersion] = useState(product?.version ?? 0);
  const [quantity, setQuantity] = useState(product?.targetContentCount ?? 20);
  const [creatorPresence, setCreatorPresence] = useState<
    ContentPreparationPreferences["creatorPresence"]
  >(product?.creatorPresence ?? "either");
  const [notes, setNotes] = useState(product?.observations ?? "");
  const [saving, setSaving] = useState(false);
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

  function update(field: keyof ProductManualDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError(null);
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setValidationVisible(true);
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
    setError(null);
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
        delete payload.constraints;
        const mutation = await updateProduct(product.id, {
          ...payload,
          expectedVersion: version,
        });
        const latest = await getProduct(mutation.id);
        setVersion(latest.version);
        onSaved?.(latest);
        router.back();
      } else {
        await createProduct(payload);
      }
      toast.success(isEdit ? "Alterações salvas." : "Produto salvo.");
      idempotencyKey.current = undefined;
      if (!isEdit) router.push("/products");
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
  const previewImage = selectedImage ?? firstPreviewLink ?? uploadedImages[0] ?? null;

  return (
    <form
      aria-busy={saving}
      className={styles.form}
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
            <strong>Informações do produto</strong>
          </li>
          <li aria-current={formStep === "preparation" ? "step" : undefined}>
            <span aria-hidden="true">2</span>
            <strong>Preparação dos conteúdos</strong>
          </li>
        </ol>
      )}

      {(isEdit || formStep === "facts") && (
        <section
          aria-labelledby="new-product-facts-title"
          className={styles.section}
        >
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>
              {isEdit ? "Editar produto" : "Novo produto"}
            </p>
            <h2 id="new-product-facts-title">
              Informe os dados que você conhece
            </h2>
          </div>
          <TextField
            error={combinedErrors.name}
            id={fieldId("name")}
            placeholder="Ex.: Fone de ouvido Bluetooth com cancelamento de ruído"
            label="Nome do produto"
            onChange={(value) => update("name", value)}
            required
            value={draft.name}
          />
          <TextField
            error={combinedErrors.description}
            placeholder="Ex.: Fone sem fio com até 30 horas de bateria, ideal para estudos e trabalho..."
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
          </div>
          <TextField
            error={combinedErrors.characteristics}
            id={fieldId("characteristics")}
            label="Características do produto"
            multiline
            onChange={(value) => update("characteristics", value)}
            placeholder="Uma por linha. Ex.: Recarregável por USB-C"
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
                  max={30}
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
                  <span>30</span>
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
            placeholder="Ex.: Sem gírias; mencionar a garantia de 12 meses."
            showCounter
            value={notes}
          />
        </section>
      )}

      <div className={styles.submitBar}>
        {!isEdit && formStep === "facts" && (
          <Button onClick={continueToPreparation} type="button">
            Continuar
          </Button>
        )}
        {!isEdit && formStep === "preparation" && (
          <Button
            disabled={saving}
            onClick={() => setFormStep("facts")}
            type="button"
            variant="outline"
          >
            Voltar
          </Button>
        )}
        {(isEdit || formStep === "preparation") && (
          <Button disabled={saving} type="submit">
            {saving
              ? `${isEdit ? "Salvar alterações" : "Salvar produto"} — salvando`
              : isEdit
                ? "Salvar alterações"
                : "Salvar produto"}
          </Button>
        )}
        {isEdit && onDeleteRequest && (
          <Button
            disabled={saving || deleting}
            onClick={onDeleteRequest}
            type="button"
            variant="destructive"
          >
            {deleting ? "Excluindo…" : "Excluir produto"}
          </Button>
        )}
        {/* Cancelar bloqueado durante o salvamento: navegar com POST em
            voo poderia persistir um Product após o cancelamento (B-006). */}
        {saving ? (
          <Button disabled type="button" variant="outline">
            Cancelar
          </Button>
        ) : (
          <Link className={styles.cancelLink} href="/products">
            Cancelar
          </Link>
        )}
      </div>
    </form>
  );
}
