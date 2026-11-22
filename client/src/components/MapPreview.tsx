import { MapPin, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MapPreviewProps {
  address?: string | null;
  title?: string;
  testId?: string;
  externalLinkTestId?: string;
  /** Extra classes on the map container (e.g. h-full to stretch in a flex card). */
  className?: string;
}

/**
 * Embedded map preview. Uses the standard Google Maps embed URL
 * (`output=embed`), which does not require the Maps Embed API product
 * to be enabled on the API key (unlike `/maps/embed/v1/place`).
 */
export function MapPreview({
  address,
  title,
  testId = "map-embed",
  externalLinkTestId = "link-map-external",
  className,
}: MapPreviewProps) {
  const shellClass = cn("relative aspect-video min-h-[12rem]", className);

  if (!address?.trim()) {
    return (
      <div className={shellClass}>
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <div className="text-center text-muted-foreground">
            <MapPin className="mx-auto mb-2 h-12 w-12 text-primary opacity-50" />
            <p className="text-sm">Map preview unavailable</p>
            <p className="mt-2 text-xs opacity-75">No address on file</p>
          </div>
        </div>
      </div>
    );
  }

  const embedSrc = `https://www.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed`;
  const openSrc = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <div className={shellClass}>
      <iframe
        src={embedSrc}
        className="absolute inset-0 h-full w-full border-0"
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title={title || `Map of ${address}`}
        data-testid={testId}
      />
      <a
        href={openSrc}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-2 right-2 z-[1]"
        data-testid={externalLinkTestId}
      >
        <Button size="sm" variant="secondary">
          <ExternalLink className="mr-2 h-4 w-4" />
          Open in Maps
        </Button>
      </a>
    </div>
  );
}
