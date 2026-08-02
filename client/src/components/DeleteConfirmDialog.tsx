import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

/** Exact confirmation text required for all destructive deletes */
export const DELETE_CONFIRM_WORD = "Delete";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  /** Optional name of the item being deleted (shown in the body) */
  itemName?: string;
  confirmLabel?: string;
  isPending?: boolean;
  onConfirm: () => void;
}

/**
 * Themed delete confirmation. User must type "Delete" before the action is enabled.
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title = "Delete permanently?",
  description = "This action cannot be undone.",
  itemName,
  confirmLabel = "Delete",
  isPending = false,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (!open) setConfirmText("");
  }, [open]);

  const canDelete = confirmText === DELETE_CONFIRM_WORD && !isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirmText("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
            {itemName ? (
              <>
                {" "}
                <span className="font-medium text-foreground">{itemName}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="delete-confirm-input">
            Type <span className="font-bold text-foreground">{DELETE_CONFIRM_WORD}</span> to confirm
          </Label>
          <Input
            id="delete-confirm-input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={DELETE_CONFIRM_WORD}
            autoComplete="off"
            autoFocus
            data-testid="input-delete-confirm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canDelete) {
                e.preventDefault();
                onConfirm();
              }
            }}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            data-testid="button-cancel-delete"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!canDelete}
            onClick={onConfirm}
            data-testid="button-confirm-delete"
          >
            {isPending ? "Deleting..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
