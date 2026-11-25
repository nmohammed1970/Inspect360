import { Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessagingAttachment } from "../types";

export const AttachmentChip = ({
  attachment,
  tone,
}: {
  attachment: MessagingAttachment;
  tone: "primary" | "muted";
}) => {
  const href = `/api/messaging/attachments/${attachment.id}/download`;
  if (attachment.mimeType.startsWith("image/")) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block">
        <img
          src={href}
          alt={attachment.fileName}
          className="max-h-48 max-w-full rounded-md object-cover"
        />
      </a>
    );
  }
  return (
    <a
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs underline-offset-2 hover:underline",
        tone === "primary" ? "bg-primary-foreground/15" : "bg-background",
      )}
    >
      <Paperclip className="h-3 w-3" />
      {attachment.fileName}
    </a>
  );
};
