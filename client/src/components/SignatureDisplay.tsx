import { cn } from "@/lib/utils";
import { parseSignatureValue } from "@shared/signature";

interface SignatureDisplayProps {
  signature?: string | Record<string, unknown> | null;
  className?: string;
  emptyLabel?: string;
  imageClassName?: string;
  /** Overrides name stored on the signature payload */
  signedByName?: string | null;
  /** Overrides date stored on the signature payload (ISO string or Date) */
  signedAt?: string | Date | null;
  nameLabel?: string;
  dateLabel?: string;
}

function formatSignedAt(signedAt?: string | Date | null): string | null {
  if (!signedAt) return null;
  const date = signedAt instanceof Date ? signedAt : new Date(signedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function SignatureDisplay({
  signature,
  className,
  emptyLabel = "Not signed",
  imageClassName,
  signedByName,
  signedAt,
  nameLabel = "Name",
  dateLabel = "Date Signed",
}: SignatureDisplayProps) {
  const parsed = parseSignatureValue(signature);
  const trimmedSignature = parsed?.image?.trim();
  const displayName = (signedByName || parsed?.signedByName || "").trim();
  const displayDate = formatSignedAt(signedAt || parsed?.signedAt || null);

  if (!trimmedSignature) {
    return <span className="text-muted-foreground italic">{emptyLabel}</span>;
  }

  const meta = (displayName || displayDate) && (
    <div className="mt-3 space-y-1 text-sm text-foreground">
      {displayName && (
        <div>
          <span className="font-medium text-muted-foreground">{nameLabel}: </span>
          <span>{displayName}</span>
        </div>
      )}
      {displayDate && (
        <div>
          <span className="font-medium text-muted-foreground">{dateLabel}: </span>
          <span>{displayDate}</span>
        </div>
      )}
    </div>
  );

  if (trimmedSignature.startsWith("data:image/")) {
    return (
      <div className={cn("w-full max-w-2xl", className)}>
        <img
          src={trimmedSignature}
          alt="Signature"
          className={cn(
            "w-full min-h-48 h-48 object-contain border-2 rounded-md bg-background p-3",
            imageClassName,
          )}
        />
        {meta}
      </div>
    );
  }

  return (
    <div className={cn("w-full max-w-2xl", className)}>
      <div
        className={cn(
          "w-full min-h-48 border-2 rounded-md bg-background px-4 py-6 flex items-center",
        )}
      >
        <span className="text-2xl italic" style={{ fontFamily: "cursive" }}>
          {trimmedSignature}
        </span>
      </div>
      {meta}
    </div>
  );
}
