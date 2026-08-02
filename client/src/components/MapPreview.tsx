import { MapPin, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MapPreviewProps {
  address?: string | null;
  title?: string;
  testId?: string;
  externalLinkTestId?: string;
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
}: MapPreviewProps) {
  if (!address?.trim()) {
    return (
      <div className="aspect-video relative">
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-2 text-primary opacity-50" />
            <p className="text-sm">Map preview unavailable</p>
            <p className="text-xs mt-2 opacity-75">No address on file</p>
          </div>
        </div>
      </div>
    );
  }

  const embedSrc = `https://www.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed`;
  const openSrc = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <div className="aspect-video relative">
      <iframe
        src={embedSrc}
        className="w-full h-full border-0"
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
        className="absolute bottom-2 right-2"
        data-testid={externalLinkTestId}
      >
        <Button size="sm" variant="secondary">
          <ExternalLink className="h-4 w-4 mr-2" />
          Open in Maps
        </Button>
      </a>
    </div>
  );
}
