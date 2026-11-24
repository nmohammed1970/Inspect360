import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Paperclip, Trash2, Loader2 } from "lucide-react";
import {
  COMPLIANCE_DOCUMENT_ACCEPT,
  ObjectUploader,
} from "@/components/ObjectUploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MAX_DOCUMENT_ATTACHMENTS } from "./attachmentLimits";

type AttachmentRow = {
  id: string;
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  storageKey: string;
  createdAt: string | null;
};

interface DocumentAttachmentsPanelProps {
  workOrderId: string;
  documentType: "quote" | "invoice";
  documentId: string;
  canEdit: boolean;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentAttachmentsPanel({
  workOrderId,
  documentType,
  documentId,
  canEdit,
}: DocumentAttachmentsPanelProps) {
  const { toast } = useToast();
  const basePath =
    documentType === "quote"
      ? `/api/work-orders/${workOrderId}/quotes/${documentId}/attachments`
      : `/api/work-orders/${workOrderId}/invoices/${documentId}/attachments`;

  const query = useQuery<AttachmentRow[]>({
    queryKey: [basePath],
    queryFn: async () => {
      const res = await fetch(basePath, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to load attachments");
      }
      return res.json();
    },
    enabled: Boolean(workOrderId && documentId),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: {
      storageKey: string;
      fileName: string;
      mimeType?: string | null;
      fileSizeBytes?: number | null;
    }) => {
      const res = await apiRequest("POST", basePath, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [basePath] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      await apiRequest("DELETE", `${basePath}/${attachmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [basePath] });
      toast({ title: "Attachment removed" });
    },
    onError: (e: Error) =>
      toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const remaining = Math.max(
    0,
    MAX_DOCUMENT_ATTACHMENTS - (query.data?.length || 0),
  );

  const handleUploadComplete = async (result: {
    successful: Array<{
      name: string;
      size: number;
      type: string;
      uploadURL?: string;
      source?: string;
    }>;
    failed: Array<{ error: Error }>;
  }) => {
    if (result.failed.length > 0) {
      toast({
        title: "Some uploads failed",
        description: result.failed[0]?.error?.message || "Please try again",
        variant: "destructive",
      });
    }
    for (const file of result.successful) {
      const storageKey = file.uploadURL || file.source;
      if (!storageKey) continue;
      try {
        await createMutation.mutateAsync({
          storageKey,
          fileName: file.name,
          mimeType: file.type || null,
          fileSizeBytes: file.size ?? null,
        });
      } catch (e) {
        toast({
          title: "Could not attach file",
          description: e instanceof Error ? e.message : "Upload registration failed",
          variant: "destructive",
        });
      }
    }
    if (result.successful.length > 0) {
      toast({ title: "Attachments uploaded" });
    }
  };

  const downloadAttachment = async (attachment: AttachmentRow) => {
    try {
      const res = await fetch(`${basePath}/${attachment.id}/download`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({
        title: "Download failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-primary" />
          Attachments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : null}

        {(query.data || []).length === 0 && !query.isLoading ? (
          <p className="text-sm text-muted-foreground">No attachments yet.</p>
        ) : null}

        <ul className="space-y-2">
          {(query.data || []).map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{file.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.fileSizeBytes)}
                  {file.mimeType ? ` · ${file.mimeType}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void downloadAttachment(file)}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(file.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>

        {canEdit && remaining > 0 ? (
          <ObjectUploader
            maxNumberOfFiles={Math.min(remaining, 5)}
            accept={COMPLIANCE_DOCUMENT_ACCEPT}
            onGetUploadParameters={async () => {
              const response = await fetch("/api/objects/upload", {
                method: "POST",
                credentials: "include",
              });
              if (!response.ok) throw new Error("Failed to get upload URL");
              const data = await response.json();
              return { method: "PUT" as const, url: data.uploadURL };
            }}
            onComplete={(result) => void handleUploadComplete(result)}
          >
            <Button type="button" variant="outline" size="sm">
              <Paperclip className="h-3.5 w-3.5 mr-1.5" />
              Add files
            </Button>
          </ObjectUploader>
        ) : null}

        {canEdit && remaining === 0 ? (
          <p className="text-xs text-muted-foreground">
            Maximum of {MAX_DOCUMENT_ATTACHMENTS} attachments reached.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
