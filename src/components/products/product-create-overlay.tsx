"use client";

import * as React from "react";
import { Plus, XIcon } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { ProductCreateForm } from "./product-create-form";
import type { ProductManualDraft } from "./product-form-model";

type ProductCreateOverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rascunho inicial (ex.: item da vitrine via "Usar produto"). */
  initialDraft?: Partial<ProductManualDraft>;
  /** Navega ao produto criado após salvar (Analisar produto fica explícito lá)
      em vez de permanecer na superfície que abriu o overlay. */
  navigateAfterSave?: boolean;
};

/**
 * Cadastro de Produto local (sem navegar para /products/new).
 * Desktop/tablet: Sheet side=right; mobile: Drawer bottom sheet (DESIGN.md §3).
 * Fecha com confirmação quando há rascunho preenchido (dirty).
 */
export function ProductCreateOverlay({
  open,
  onOpenChange,
  initialDraft,
  navigateAfterSave = false,
}: ProductCreateOverlayProps) {
  const isMobile = useIsMobile();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const dirtyRef = React.useRef(false);

  const handleSaved = React.useCallback(() => {
    dirtyRef.current = false;
    onOpenChange(false);
  }, [onOpenChange]);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) {
        dirtyRef.current = false;
        setConfirmOpen(false);
        onOpenChange(true);
        return;
      }
      if (dirtyRef.current) {
        setConfirmOpen(true);
        return;
      }
      onOpenChange(false);
    },
    [onOpenChange]
  );

  const markDirty = React.useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const formBody = (
    <div
      className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      onInputCapture={markDirty}
      onChangeCapture={markDirty}
    >
      {/* Pré-carga da vitrine: a descrição não existe no DTO por design —
          aviso visível e acessível orienta o preenchimento obrigatório. */}
      {initialDraft && (
        <div
          className="mb-3 rounded-md border bg-surface-secondary p-3 text-sm text-text-secondary"
          role="status"
        >
          <p className="font-semibold text-text">
            Falta uma descrição para analisar este produto.
          </p>
          <p className="mt-1">
            Descreva o que o produto faz, para quem é e o principal benefício
            que ele entrega.
          </p>
        </div>
      )}
      <ProductCreateForm
        mode="create"
        initialDraft={initialDraft}
        onSaved={handleSaved}
        onCancel={() => handleOpenChange(false)}
        /* Sem no-op o formulário chamaria router.back() ao salvar dentro do
           overlay; com navigateAfterSave o form navega ao produto criado. */
        onAfterSave={navigateAfterSave ? undefined : () => {}}
      />
    </div>
  );

  const confirmDialog = (
    <ConfirmationDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      onConfirm={() => {
        dirtyRef.current = false;
        setConfirmOpen(false);
        onOpenChange(false);
      }}
      title="Descartar rascunho?"
      description="Existem dados preenchidos neste cadastro. Fechar agora descarta as alterações."
      confirmLabel="Descartar"
      destructive
    />
  );

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={handleOpenChange} swipeDirection="right">
          <DrawerContent className="data-[swipe-axis=x]:w-full max-w-[40rem]">
            <DrawerHeader className="flex-row items-center justify-between border-b px-4 py-3">
              <DrawerTitle>Adicionar produto</DrawerTitle>
              <DrawerClose
                aria-label="Fechar cadastro"
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              >
                <XIcon aria-hidden="true" />
              </DrawerClose>
              <DrawerDescription className="sr-only">
                Cadastre um Produto por URL ou manualmente.
              </DrawerDescription>
            </DrawerHeader>
            {formBody}
          </DrawerContent>
        </Drawer>
        {confirmDialog}
      </>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-xl"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Adicionar produto</SheetTitle>
            <SheetDescription>
              Cadastre um Produto por URL ou manualmente.
            </SheetDescription>
          </SheetHeader>
          {formBody}
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </>
  );
}

/** Botão + overlay: reutilizado pelos gatilhos de Home e Produtos. */
export function ProductCreateTrigger({
  className,
  size,
}: {
  className?: string;
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button className={className} onClick={() => setOpen(true)} size={size}>
        <Plus aria-hidden="true" />
        Adicionar produto
      </Button>
      <ProductCreateOverlay open={open} onOpenChange={setOpen} />
    </>
  );
}
