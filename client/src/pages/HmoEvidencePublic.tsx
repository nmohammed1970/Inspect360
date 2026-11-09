import { useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ModernFilePickerInline } from "@/components/ModernFilePickerInline";
import { pagePad } from "@/lib/responsive";
import { formatHmoDate } from "@/components/hmo/hmoLabels";
import { X } from "lucide-react";

type PublicRequest = {
  id: string;
  status: string;
  expiryAt: string;
  requestTemplate?: string | null;
};

export default function HmoEvidencePublic() {
  const [, params] = useRoute("/hmo/evidence/:token");
  const token = params?.token || "";
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, error } = useQuery<PublicRequest>({
    queryKey: ["/api/hmo/evidence", token],
    queryFn: async () => {
      const res = await fetch(`/api/hmo/evidence/${encodeURIComponent(token)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Request unavailable");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("Please choose a file first");
      const form = new FormData();
      form.append("file", selectedFile);
      const res = await fetch(`/api/hmo/evidence/${encodeURIComponent(token)}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
  });

  return (
    <div className={`${pagePad} max-w-lg mx-auto`} data-testid="hmo-evidence-public">
      <Card>
        <CardHeader>
          <CardTitle>Upload evidence</CardTitle>
          <CardDescription>
            This is a secure one-off link. You only upload the requested document — you cannot see
            other property information.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Checking your link…</p>}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
              <p className="text-sm font-medium text-rose-900">Link unavailable</p>
              <p className="text-sm text-rose-800 mt-1">
                {(error as Error).message || "This evidence link is invalid or has expired."}
              </p>
            </div>
          )}
          {data && !submitted && (
            <>
              {data.requestTemplate && (
                <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground mb-1">What is needed</p>
                  <p className="text-sm whitespace-pre-wrap">{data.requestTemplate}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Link expires {formatHmoDate(data.expiryAt)}
                {data.expiryAt
                  ? ` · ${new Date(data.expiryAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : ""}
              </p>

              <div className="space-y-2">
                <Label>Upload PDF or image</Label>
                <ModernFilePickerInline
                  onFilesSelected={(files) => setSelectedFile(files[0] || null)}
                  maxFiles={1}
                  maxFileSize={25 * 1024 * 1024}
                  accept="image/*,.pdf,application/pdf,.jpg,.jpeg,.jpe,.png,.webp,.heic,.heif,.gif,.bmp"
                  multiple={false}
                  isUploading={submitMutation.isPending}
                  height={220}
                />
                {selectedFile && (
                  <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    <span className="truncate">
                      {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setSelectedFile(null)}
                      aria-label="Clear selected file"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <Button
                onClick={() => submitMutation.mutate()}
                disabled={!selectedFile || submitMutation.isPending}
              >
                {submitMutation.isPending ? "Uploading…" : "Submit evidence"}
              </Button>
              {submitMutation.isError && (
                <p className="text-sm text-destructive">
                  {(submitMutation.error as Error).message}
                </p>
              )}
            </>
          )}
          {submitted && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 space-y-2">
              <p className="text-sm font-medium text-emerald-900">Thank you</p>
              <p className="text-sm text-emerald-800">
                Your file was received. The property team will review it and may contact you if
                anything else is needed.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
