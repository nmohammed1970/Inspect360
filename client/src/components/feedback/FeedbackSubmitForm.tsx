import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bug, Lightbulb, HelpCircle, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  FeedbackImageDropzone,
  type FeedbackImageFile,
} from "@/components/feedback/FeedbackImageDropzone";

const TYPE_OPTIONS = [
  {
    value: "issue",
    title: "Report an Issue",
    description: "Something is broken or not working as expected.",
    icon: Bug,
  },
  {
    value: "feature_request",
    title: "Feature Request",
    description: "Suggest a new capability or improvement for the product.",
    icon: Lightbulb,
  },
  {
    value: "question",
    title: "General Question",
    description: "Ask how something works or request clarification.",
    icon: HelpCircle,
  },
] as const;

type Props = {
  onCancel?: () => void;
  className?: string;
};

export function FeedbackSubmitForm({ onCancel, className }: Props) {
  const { toast } = useToast();
  const [type, setType] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<FeedbackImageFile[]>([]);
  const [success, setSuccess] = useState<{ reference: string; id: string } | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("type", type);
      form.append("subject", subject.trim());
      form.append("description", description.trim());
      form.append("sourcePage", window.location.pathname);
      form.append(
        "clientContext",
        JSON.stringify({
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
        }),
      );
      for (const img of images) {
        form.append("images", img.file, img.file.name);
      }
      const res = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: {
          "Idempotency-Key": `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to submit feedback");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/mine"] });
      for (const img of images) URL.revokeObjectURL(img.previewUrl);
      setImages([]);
      setSuccess({ reference: data.reference, id: data.id });
      if (data.attachmentWarning) {
        toast({
          title: "Submitted with a warning",
          description: data.attachmentWarning,
        });
      }
    },
    onError: (e: Error) => {
      toast({ title: "Could not submit", description: e.message, variant: "destructive" });
    },
  });

  if (success) {
    return (
      <Card className={cn("border-l-4 border-l-emerald-500", className)}>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Thank you — we received your feedback</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your reference is{" "}
                <span className="font-mono font-semibold text-foreground">{success.reference}</span>.
                Our team will review it when they can.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/feedback/${success.id}`}>View My Feedback</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSuccess(null);
                setType("");
                setSubject("");
                setDescription("");
              }}
            >
              Submit Another
            </Button>
            {onCancel && (
              <Button variant="ghost" onClick={onCancel}>
                Close
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const canSubmit =
    Boolean(type) &&
    subject.trim().length > 0 &&
    description.trim().length > 0 &&
    !submitMutation.isPending;

  return (
    <div className={cn("space-y-6", className)}>
      <div>
        <Label className="text-base">What would you like to share?</Label>
        <div className="grid gap-3 mt-3 sm:grid-cols-3">
          {TYPE_OPTIONS.map((opt) => {
            const selected = type === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={cn(
                  "text-left rounded-xl border p-4 transition-colors min-h-[120px]",
                  selected
                    ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                    : "hover:bg-muted/40",
                )}
                aria-pressed={selected}
              >
                <Icon className={cn("h-6 w-6 mb-2", selected ? "text-primary" : "text-muted-foreground")} />
                <p className="font-semibold text-sm">{opt.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-subject">Subject</Label>
        <Input
          id="feedback-subject"
          value={subject}
          maxLength={150}
          placeholder="Short summary"
          onChange={(e) => setSubject(e.target.value)}
        />
        <p className="text-xs text-muted-foreground text-right">{subject.length}/150</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-description">Description</Label>
        <Textarea
          id="feedback-description"
          value={description}
          maxLength={10000}
          rows={6}
          placeholder="Tell us what happened, what you expected, or what you'd like to see."
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="text-xs text-muted-foreground text-right">{description.length}/10,000</p>
      </div>

      <div className="space-y-2">
        <Label>Screenshots (optional)</Label>
        <FeedbackImageDropzone files={images} onChange={setImages} disabled={submitMutation.isPending} />
      </div>

      <div className="flex flex-wrap gap-2 sticky bottom-0 bg-background/95 py-3 border-t sm:border-0 sm:static sm:py-0">
        <Button
          disabled={!canSubmit}
          onClick={() => submitMutation.mutate()}
          data-testid="button-submit-feedback"
        >
          {submitMutation.isPending ? "Submitting…" : "Submit Feedback"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitMutation.isPending}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
