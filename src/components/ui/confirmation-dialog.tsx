"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  pendingLabel?: string;
  error?: string | null;
  destructive?: boolean;
};

function ConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  pending = false,
  pendingLabel = "Confirmando…",
  error,
  destructive = false,
}: ConfirmationDialogProps) {
  return (
    <AlertDialog
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
      open={open}
    >
      <AlertDialogContent className="rounded-sheet! border border-border bg-popover shadow-xl ring-0 sm:max-w-md">
        <AlertDialogHeader className="place-items-start gap-2 text-left">
          <AlertDialogTitle className="text-xl leading-6.5 font-semibold">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[15px] leading-5.5 text-muted-foreground">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="text-sm leading-5 text-destructive" role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() => void onConfirm()}
            variant={destructive ? "destructive" : "default"}
          >
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { ConfirmationDialog };
export type { ConfirmationDialogProps };
