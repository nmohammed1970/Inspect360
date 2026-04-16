import { cn } from "@/lib/utils";

interface SignatureDisplayProps {
  signature?: string | null;
  className?: string;
  emptyLabel?: string;
  imageClassName?: string;
}

export function SignatureDisplay({
  signature,
  className,
  emptyLabel = "Not signed",
  imageClassName,
}: SignatureDisplayProps) {
  const trimmedSignature = signature?.trim();

  if (!trimmedSignature) {
    return <span className="text-muted-foreground italic">{emptyLabel}</span>;
  }

  if (trimmedSignature.startsWith("data:image/")) {
    return (
      <img
        src={trimmedSignature}
        alt="Signature"
        className={cn(
          "max-w-md h-32 object-contain border rounded bg-background p-2",
          imageClassName,
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "max-w-md min-h-20 border rounded bg-background px-4 py-3 flex items-center",
        className,
      )}
    >
      <span className="text-xl italic" style={{ fontFamily: "cursive" }}>
        {trimmedSignature}
      </span>
    </div>
  );
}
