import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bug, Lightbulb, HelpCircle, CheckCircle2, Check, Send } from "lucide-react";
import { Link } from "wouter";
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
    accent: "text-rose-700",
    well: "bg-rose-500/10",
    selected:
      "border-rose-400 bg-rose-50/80 ring-2 ring-rose-300/50 shadow-sm",
  },
  {
    value: "feature_request",
    title: "Feature Request",
    description: "Suggest a new capability or improvement for the product.",
    icon: Lightbulb,
    accent: "text-amber-700",
    well: "bg-amber-500/10",
    selected:
      "border-amber-400 bg-amber-50/80 ring-2 ring-amber-300/50 shadow-sm",
  },
  {
    value: "question",
    title: "General Question",
    description: "Ask how something works or request clarification.",
    icon: HelpCircle,
    accent: "text-sky-700",
    well: "bg-sky-500/10",
    selected:
      "border-sky-400 bg-sky-50/80 ring-2 ring-sky-300/50 shadow-sm",
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
      <div
        className={cn(
          "rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 md:p-8 space-y-5",
          className,
        )}
      >
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-emerald-500/15 shrink-0">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Thank you — we received it</h3>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Your reference is{" "}
              <span className="font-mono font-semibold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                {success.reference}
              </span>
              . Our team will review it when they can.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild>
            <Link href={`/feedback/${success.id}`}>View conversation</Link>
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
            Submit another
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Close
            </Button>
          )}
        </div>
      </div>
    );
  }

  const canSubmit =
    Boolean(type) &&
    subject.trim().length > 0 &&
    description.trim().length > 0 &&
    !submitMutation.isPending;

  return (
    <div className={cn("space-y-8", className)}>
      <section className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary/80">Step 1</p>
          <Label className="text-base font-semibold">What would you like to share?</Label>
          <p className="text-sm text-muted-foreground mt-0.5">Choose one — this helps us route your case.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {TYPE_OPTIONS.map((opt) => {
            const selected = type === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={cn(
                  "group relative text-left rounded-2xl border bg-card p-4 min-h-[132px] transition-all duration-200",
                  "hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0",
                  selected ? opt.selected : "border-border/80 hover:border-primary/40",
                )}
                aria-pressed={selected}
              >
                {selected && (
                  <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
                <div className={cn("inline-flex p-2.5 rounded-xl mb-3", opt.well)}>
                  <Icon className={cn("h-5 w-5", opt.accent)} />
                </div>
                <p className="font-semibold text-sm pr-6">{opt.title}</p>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-5 rounded-2xl border bg-muted/20 p-4 sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary/80">Step 2</p>
          <p className="text-base font-semibold">Tell us more</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <Label htmlFor="feedback-subject" className="font-medium">
              Subject
            </Label>
            <span className="text-[11px] tabular-nums text-muted-foreground">{subject.length}/150</span>
          </div>
          <Input
            id="feedback-subject"
            value={subject}
            maxLength={150}
            placeholder="Short summary"
            className="h-11 bg-background"
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <Label htmlFor="feedback-description" className="font-medium">
              Description
            </Label>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {description.length.toLocaleString()}/10,000
            </span>
          </div>
          <Textarea
            id="feedback-description"
            value={description}
            maxLength={10000}
            rows={6}
            placeholder="Tell us what happened, what you expected, or what you'd like to see."
            className="min-h-[140px] bg-background resize-y"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary/80">Step 3</p>
          <Label className="text-base font-semibold">Screenshots</Label>
          <p className="text-sm text-muted-foreground mt-0.5">Optional — paste or upload up to 3 images.</p>
        </div>
        <FeedbackImageDropzone files={images} onChange={setImages} disabled={submitMutation.isPending} />
      </section>

      <div className="flex flex-wrap items-center gap-2 sticky bottom-0 z-10 -mx-1 px-1 py-3 bg-background/90 backdrop-blur-sm border-t sm:static sm:border-0 sm:bg-transparent sm:backdrop-blur-none sm:py-0">
        <Button
          size="lg"
          disabled={!canSubmit}
          onClick={() => submitMutation.mutate()}
          data-testid="button-submit-feedback"
          className="min-w-[160px]"
        >
          <Send className="h-4 w-4 mr-2" />
          {submitMutation.isPending ? "Submitting…" : "Submit Feedback"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={submitMutation.isPending}>
            Cancel
          </Button>
        )}
        {!type && (
          <p className="text-xs text-muted-foreground w-full sm:w-auto sm:ml-2">Select a type to continue</p>
        )}
      </div>
    </div>
  );
}
