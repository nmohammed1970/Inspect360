import { useCallback, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3;
const ACCEPT = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export type FeedbackImageFile = {
  id: string;
  file: File;
  previewUrl: string;
};

type Props = {
  files: FeedbackImageFile[];
  onChange: (files: FeedbackImageFile[]) => void;
  disabled?: boolean;
  className?: string;
};

function isAllowed(file: File): boolean {
  return ACCEPT.includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
}

export function FeedbackImageDropzone({ files, onChange, disabled, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback(
    (incoming: File[]) => {
      setError(null);
      const next = [...files];
      for (const file of incoming) {
        if (next.length >= MAX_FILES) {
          setError(`Maximum ${MAX_FILES} images`);
          break;
        }
        if (!isAllowed(file)) {
          setError("Only PNG, JPEG and WebP images are allowed");
          continue;
        }
        if (file.size > MAX_BYTES) {
          setError("Each image must be 10 MB or smaller");
          continue;
        }
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      onChange(next);
    },
    [files, onChange],
  );

  const onPaste = (e: React.ClipboardEvent) => {
    if (disabled) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const pasted: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) {
          pasted.push(
            new File([f], f.name || `screenshot-${Date.now()}.png`, {
              type: f.type || "image/png",
            }),
          );
        }
      }
    }
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  const removeAt = (id: string) => {
    const target = files.find((f) => f.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(files.filter((f) => f.id !== id));
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div
        tabIndex={0}
        role="button"
        aria-label="Paste or drop screenshot images"
        onPaste={onPaste}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          addFiles(Array.from(e.dataTransfer.files || []));
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          "rounded-2xl border-2 border-dashed px-4 py-10 text-center cursor-pointer transition-all outline-none",
          "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          dragOver
            ? "border-primary bg-primary/5 scale-[1.01] motion-reduce:scale-100"
            : "border-border/70 bg-gradient-to-b from-muted/30 to-background hover:border-primary/50 hover:from-primary/5",
          disabled && "opacity-50 pointer-events-none",
        )}
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <ImagePlus className="h-6 w-6 text-primary" />
        </div>
        <p className="text-sm font-semibold">Paste a screenshot (Ctrl+V / Cmd+V)</p>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto leading-relaxed">
          Or drag and drop / choose file · PNG, JPEG, WebP · max 3 × 10 MB
        </p>
        <p className="text-xs text-amber-800/90 mt-3 max-w-md mx-auto rounded-lg bg-amber-50 border border-amber-200/60 px-3 py-2">
          Please avoid including passwords or sensitive personal information in screenshots.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            addFiles(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {files.map((f) => (
            <div
              key={f.id}
              className="relative w-28 h-28 rounded-xl border bg-muted overflow-hidden shadow-sm group"
            >
              <img src={f.previewUrl} alt={f.file.name} className="w-full h-full object-cover" />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute top-1.5 right-1.5 h-7 w-7 opacity-90 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(f.id);
                }}
                aria-label="Remove image"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
              <p className="absolute bottom-0 inset-x-0 bg-black/55 text-[10px] text-white px-1.5 py-0.5 truncate">
                {(f.file.size / 1024).toFixed(0)} KB
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
