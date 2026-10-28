import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, ImageOff, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  IMAGE_LOAD_ERROR_MESSAGE,
  IMAGE_POOR_NETWORK_MESSAGE,
  IMAGE_SLOW_LOAD_MS,
  isImageAlreadyComplete,
} from "@shared/imageLoadingUx";

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

/** Shared overlay for slow-load / spinner messaging (thumbnail + lightbox). */
export function ImageLoadOverlay({
  showSlowMessage,
  compact = false,
  className,
}: {
  showSlowMessage: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted/80 px-3 text-center",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "animate-spin rounded-full border-2 border-primary border-t-transparent",
          compact ? "h-5 w-5" : "h-8 w-8",
        )}
        aria-hidden
      />
      {showSlowMessage ? (
        <p
          className={cn(
            "max-w-[18rem] text-muted-foreground",
            compact ? "text-[10px] leading-snug" : "text-xs sm:text-sm leading-snug",
          )}
        >
          {IMAGE_POOR_NETWORK_MESSAGE}
        </p>
      ) : (
        <span className="sr-only">Loading image</span>
      )}
    </div>
  );
}

function useSlowLoadFlag(active: boolean) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    setSlow(false);
    const t = window.setTimeout(() => setSlow(true), IMAGE_SLOW_LOAD_MS);
    return () => window.clearTimeout(t);
  }, [active]);
  return slow;
}

export function ImagePreviewProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [gallery, setGallery] = useState<PreviewImage[]>([]);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const current = gallery[index];
  const showSlow = useSlowLoadFlag(loading && !failed && open);

  const openPreview = useCallback((image: PreviewImage, images?: PreviewImage[], startIndex = 0) => {
    if (!image.src) return;
    const nextGallery = images && images.length > 0 ? images.filter((item) => item.src) : [image];
    const nextIndex = Math.min(Math.max(startIndex, 0), nextGallery.length - 1);
    setGallery(nextGallery);
    setIndex(nextIndex);
    setZoom(1);
    setLoading(true);
    setFailed(false);
    setRetryKey((k) => k + 1);
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
    setRetryKey((k) => k + 1);
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

  // Cached images may complete before onLoad fires
  useEffect(() => {
    if (!open || !current?.src || failed) return;
    const el = imgRef.current;
    if (isImageAlreadyComplete(el)) {
      setLoading(false);
    }
  }, [open, current?.src, retryKey, failed]);

  return (
    <ImagePreviewContext.Provider value={{ openPreview }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="left-2 right-2 top-[50%] w-auto max-w-[min(96vw,1200px)] translate-x-0 sm:left-[50%] sm:right-auto sm:w-[min(96vw,1200px)] sm:translate-x-[-50%] max-h-[96vh] gap-0 overflow-hidden p-0 sm:p-0">
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
              <div className="relative flex min-h-full items-center justify-center">
                {loading && !failed ? (
                  <ImageLoadOverlay showSlowMessage={showSlow} />
                ) : null}
                {failed ? (
                  <div className="flex flex-col items-center gap-3 px-4 text-center">
                    <ImageOff className="h-8 w-8 text-muted-foreground" aria-hidden />
                    <p className="text-sm text-muted-foreground">{IMAGE_LOAD_ERROR_MESSAGE}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setFailed(false);
                        setLoading(true);
                        setRetryKey((k) => k + 1);
                      }}
                    >
                      Retry
                    </Button>
                  </div>
                ) : current ? (
                  <img
                    key={`${current.src}-${retryKey}`}
                    ref={imgRef}
                    src={current.src}
                    alt={current.alt || current.title || "Preview"}
                    className={cn(
                      "max-h-[70vh] w-auto max-w-full object-contain transition-opacity",
                      loading ? "opacity-0" : "opacity-100",
                    )}
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
  /** When false, render as a non-clickable image (still gets loading UX). Default true when preview context exists. */
  enablePreview?: boolean;
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
  loading: loadingAttr,
  enablePreview = true,
  ...props
}: PreviewableImageProps) {
  const previewCtx = useContext(ImagePreviewContext);
  const [broken, setBroken] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const srcRef = useRef(src);

  useEffect(() => {
    if (src !== srcRef.current) {
      srcRef.current = src;
      setBroken(false);
      setImgLoading(true);
      setRetryKey((k) => k + 1);
    }
  }, [src]);

  const showSlow = useSlowLoadFlag(!!src && imgLoading && !broken);

  useEffect(() => {
    if (!src || broken) return;
    const el = imgRef.current;
    if (isImageAlreadyComplete(el)) {
      setImgLoading(false);
    }
  }, [src, retryKey, broken]);

  const handleRetry = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    setBroken(false);
    setImgLoading(true);
    setRetryKey((k) => k + 1);
  };

  if (!src) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className={cn("flex items-center justify-center bg-muted text-xs text-muted-foreground", className)}>
        {IMAGE_LOAD_ERROR_MESSAGE}
      </div>
    );
  }

  if (broken) {
    if (fallback) return <>{fallback}</>;
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 bg-muted px-2 py-3 text-center text-xs text-muted-foreground",
          className,
        )}
        role="img"
        aria-label={IMAGE_LOAD_ERROR_MESSAGE}
      >
        <ImageOff className="h-5 w-5 shrink-0 opacity-70" aria-hidden />
        <span>{IMAGE_LOAD_ERROR_MESSAGE}</span>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={handleRetry}>
          Retry
        </Button>
      </div>
    );
  }

  const label = title || alt || "View image";
  const fills = typeof className === "string" && /\bw-full\b/.test(className);
  const canPreview = enablePreview && !!previewCtx;

  const imageEl = (
    <>
      <img
        key={`${src}-${retryKey}`}
        ref={imgRef}
        {...props}
        src={src}
        alt={alt || label}
        loading={loadingAttr ?? "lazy"}
        className={cn(className, imgLoading && "opacity-0")}
        onLoad={(e) => {
          setImgLoading(false);
          props.onLoad?.(e);
        }}
        onError={(e) => {
          setImgLoading(false);
          setBroken(true);
          props.onError?.(e);
        }}
      />
      {imgLoading ? <ImageLoadOverlay showSlowMessage={showSlow} compact /> : null}
      {canPreview && showHint ? (
        <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-background/80 p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Expand className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </>
  );

  if (!canPreview) {
    return (
      <div className={cn("relative", fills ? "block w-full" : "inline-block max-w-full")}>
        {imageEl}
      </div>
    );
  }

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
        previewCtx!.openPreview({ src, alt, title, caption }, gallery, index);
      }}
    >
      {imageEl}
    </button>
  );
}
