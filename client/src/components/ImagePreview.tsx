import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PreviewImage = {
  src: string;
  alt?: string;
  title?: string;
  caption?: string;
};

type ImagePreviewContextValue = {
  openPreview: (image: PreviewImage, gallery?: PreviewImage[], index?: number) => void;
};

const ImagePreviewContext = createContext<ImagePreviewContextValue | null>(null);

export function useImagePreview() {
  const context = useContext(ImagePreviewContext);
  if (!context) {
    throw new Error("useImagePreview must be used within ImagePreviewProvider");
  }
  return context;
}

export function ImagePreviewProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [gallery, setGallery] = useState<PreviewImage[]>([]);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const current = gallery[index];

  const openPreview = useCallback((image: PreviewImage, images?: PreviewImage[], startIndex = 0) => {
    if (!image.src) return;
    const nextGallery = images && images.length > 0 ? images.filter((item) => item.src) : [image];
    const nextIndex = Math.min(Math.max(startIndex, 0), nextGallery.length - 1);
    setGallery(nextGallery);
    setIndex(nextIndex);
    setZoom(1);
    setLoading(true);
    setFailed(false);
    setOpen(true);
  }, []);

  const step = useCallback((direction: -1 | 1) => {
    setIndex((currentIndex) => {
      const next = currentIndex + direction;
      if (next < 0 || next >= gallery.length) return currentIndex;
      return next;
    });
    setZoom(1);
    setLoading(true);
    setFailed(false);
  }, [gallery.length]);

  const indexRef = useRef(index);
  const galleryLengthRef = useRef(gallery.length);
  indexRef.current = index;
  galleryLengthRef.current = gallery.length;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && indexRef.current > 0) step(-1);
      if (event.key === "ArrowRight" && indexRef.current < galleryLengthRef.current - 1) step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step]);

  return (
    <ImagePreviewContext.Provider value={{ openPreview }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[96vh] max-w-[min(96vw,1200px)] w-[96vw] gap-0 overflow-hidden p-0 sm:p-0">
          <DialogTitle className="sr-only">{current?.title || current?.alt || "Image preview"}</DialogTitle>
          <DialogDescription className="sr-only">
            {current?.caption || "Large preview of the selected image"}
          </DialogDescription>
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3 pr-12">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{current?.title || current?.alt || "Image"}</p>
              {current?.caption ? <p className="truncate text-xs text-muted-foreground">{current.caption}</p> : null}
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" size="icon" variant="ghost" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(1, value - 0.5))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(3, value + 0.5))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="relative flex h-[min(68vh,760px)] items-center justify-center bg-muted/40">
            {gallery.length > 1 ? (
              <Button type="button" size="icon" variant="secondary" className="absolute left-3 z-10" aria-label="Previous image" disabled={index === 0} onClick={() => step(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : null}
            <div className="h-full w-full overflow-auto p-4">
              <div className="flex min-h-full items-center justify-center">
                {loading && !failed ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading image" />
                  </div>
                ) : null}
                {failed ? (
                  <p className="text-sm text-muted-foreground">Unable to load image.</p>
                ) : current ? (
                  <img
                    src={current.src}
                    alt={current.alt || current.title || "Preview"}
                    className="max-h-[70vh] w-auto max-w-full object-contain"
                    style={zoom > 1 ? { maxHeight: "none", maxWidth: "none", width: `${zoom * 100}%` } : undefined}
                    onLoad={() => setLoading(false)}
                    onError={() => { setLoading(false); setFailed(true); }}
                  />
                ) : null}
              </div>
            </div>
            {gallery.length > 1 ? (
              <Button type="button" size="icon" variant="secondary" className="absolute right-3 z-10" aria-label="Next image" disabled={index >= gallery.length - 1} onClick={() => step(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          {gallery.length > 1 ? (
            <p className="border-t px-4 py-2 text-center text-xs text-muted-foreground">{index + 1} of {gallery.length}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </ImagePreviewContext.Provider>
  );
}

export function PreviewableFileImage({
  file,
  className,
}: {
  file: File;
  className?: string;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!src) return null;
  return <PreviewableImage src={src} alt={file.name} title={file.name} className={className} />;
}

type PreviewableImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  title?: string;
  caption?: string;
  gallery?: PreviewImage[];
  index?: number;
  showHint?: boolean;
  fallback?: React.ReactNode;
};

export function PreviewableImage({
  src,
  alt,
  title,
  caption,
  gallery,
  index = 0,
  showHint = true,
  fallback,
  className,
  ...props
}: PreviewableImageProps) {
  const { openPreview } = useImagePreview();
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className={cn("flex items-center justify-center bg-muted text-xs text-muted-foreground", className)}>
        Unable to load image.
      </div>
    );
  }
  const label = title || alt || "View image";
  const fills = typeof className === "string" && /\bw-full\b/.test(className);
  return (
    <button
      type="button"
      className={cn(
        "group relative cursor-pointer text-left",
        fills ? "block w-full" : "inline-block max-w-full",
      )}
      aria-label={`View image: ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        openPreview({ src, alt, title, caption }, gallery, index);
      }}
    >
      <img
        {...props}
        src={src}
        alt={alt || label}
        className={className}
        onError={() => setBroken(true)}
      />
      {showHint ? (
        <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-background/80 p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Expand className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </button>
  );
}
