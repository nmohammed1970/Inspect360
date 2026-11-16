import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { FeedbackStatusBadge, FeedbackTypeBadge } from "@/components/feedback/FeedbackBadges";
import {
  FeedbackImageDropzone,
  type FeedbackImageFile,
} from "@/components/feedback/FeedbackImageDropzone";
import { pagePad } from "@/lib/responsive";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

type DetailResponse = {
  feedback: {
    id: string;
    reference: string;
    type: string;
    subject: string;
    description: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    reporterUserId: string;
  };
  messages: Array<{
    id: string;
    body: string;
    visibility: string;
    authorUserId: string;
    authorNameSnapshot: string | null;
    createdAt: string;
  }>;
  attachments: Array<{
    id: string;
    originalFilename: string | null;
    mimeType: string;
    messageId: string | null;
    createdAt: string;
  }>;
};

export default function FeedbackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [images, setImages] = useState<FeedbackImageFile[]>([]);

  const { data, isLoading, error } = useQuery<DetailResponse>({
    queryKey: ["/api/feedback", id],
    enabled: Boolean(id),
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("body", body.trim());
      for (const img of images) form.append("images", img.file, img.file.name);
      const res = await fetch(`/api/feedback/${id}/messages`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to send follow-up");
      }
      return res.json();
    },
    onSuccess: () => {
      setBody("");
      for (const img of images) URL.revokeObjectURL(img.previewUrl);
      setImages([]);
      queryClient.invalidateQueries({ queryKey: ["/api/feedback", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/mine"] });
      toast({ title: "Follow-up sent" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not send", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className={pagePad}>
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data?.feedback) {
    return (
      <div className={pagePad}>
        <p className="text-destructive">Could not load this feedback case.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/feedback">Back to Feedback</Link>
        </Button>
      </div>
    );
  }

  const { feedback, messages, attachments } = data;
  const caseAttachments = attachments.filter((a) => !a.messageId);
  const publicMessages = messages.filter((m) => m.visibility === "public");

  return (
    <div className={pagePad}>
      <Button asChild variant="ghost" className="mb-4 -ml-2">
        <Link href="/feedback">
          <ArrowLeft className="h-4 w-4 mr-2" />
          My Feedback
        </Link>
      </Button>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="font-mono text-sm font-semibold">{feedback.reference}</span>
        <FeedbackTypeBadge type={feedback.type} />
        <FeedbackStatusBadge status={feedback.status} />
      </div>
      <h1 className="text-2xl font-bold mb-6">{feedback.subject}</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Original message</CardTitle>
              <CardDescription>
                Submitted {feedback.createdAt ? format(new Date(feedback.createdAt), "dd MMM yyyy HH:mm") : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{feedback.description}</p>
              {caseAttachments.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {caseAttachments.map((a) => (
                    <a
                      key={a.id}
                      href={`/api/feedback/attachments/${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-28 h-28 rounded-lg border overflow-hidden bg-muted"
                    >
                      <img
                        src={`/api/feedback/attachments/${a.id}`}
                        alt={a.originalFilename || "Screenshot"}
                        className="w-full h-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conversation</CardTitle>
              <CardDescription>Replies from you and the Inspect360 team</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {publicMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No replies yet.</p>
              ) : (
                publicMessages.map((m) => {
                  const mine = m.authorUserId === user?.id;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "rounded-xl border p-3",
                        mine ? "bg-primary/5 border-primary/20" : "bg-muted/30",
                      )}
                    >
                      <div className="flex justify-between gap-2 text-xs text-muted-foreground mb-1">
                        <span className="font-medium text-foreground">
                          {mine ? "You" : m.authorNameSnapshot || "Inspect360 team"}
                        </span>
                        <span>
                          {m.createdAt ? format(new Date(m.createdAt), "dd MMM yyyy HH:mm") : ""}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {attachments
                          .filter((a) => a.messageId === m.id)
                          .map((a) => (
                            <a
                              key={a.id}
                              href={`/api/feedback/attachments/${a.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block w-20 h-20 rounded border overflow-hidden"
                            >
                              <img
                                src={`/api/feedback/attachments/${a.id}`}
                                alt={a.originalFilename || "Attachment"}
                                className="w-full h-full object-cover"
                              />
                            </a>
                          ))}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a follow-up</CardTitle>
              <CardDescription>
                {(feedback.status === "resolved" || feedback.status === "closed") &&
                  "Sending a follow-up will reopen this case for review. "}
                Attach screenshots if they help.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={10000}
                placeholder="Add more detail for the team…"
              />
              <FeedbackImageDropzone files={images} onChange={setImages} disabled={replyMutation.isPending} />
              <Button
                disabled={!body.trim() || replyMutation.isPending}
                onClick={() => replyMutation.mutate()}
              >
                <Send className="h-4 w-4 mr-2" />
                {replyMutation.isPending ? "Sending…" : "Send follow-up"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Current</span>
              <FeedbackStatusBadge status={feedback.status} />
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Updated</span>
              <span>
                {feedback.updatedAt ? format(new Date(feedback.updatedAt), "dd MMM yyyy") : "—"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
