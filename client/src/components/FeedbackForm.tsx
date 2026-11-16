import { useState } from "react";
import { Link } from "wouter";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FeedbackSubmitForm } from "@/components/feedback/FeedbackSubmitForm";

interface FeedbackFormProps {
  trigger?: React.ReactNode;
}

/** Legacy dialog entry — now opens the v2 submit form (no priority/category). */
export function FeedbackForm({ trigger }: FeedbackFormProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            Submit Feedback
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Feedback</DialogTitle>
          <DialogDescription>
            Prefer the full page?{" "}
            <Link href="/feedback" className="text-primary underline" onClick={() => setOpen(false)}>
              Open Feedback
            </Link>
          </DialogDescription>
        </DialogHeader>
        <FeedbackSubmitForm onCancel={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
