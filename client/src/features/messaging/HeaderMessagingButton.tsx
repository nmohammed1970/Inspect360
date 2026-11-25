import { MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMessagingUnread } from "./useMessagingUnread";
import { dispatchToggleMessagingDock } from "./messagingDockStore";

export const HeaderMessagingButton = () => {
  const { data } = useMessagingUnread();
  const count = data?.count ?? 0;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="relative h-9 w-9"
      onClick={() => dispatchToggleMessagingDock()}
      data-testid="button-header-messaging"
      aria-label={
        count > 0 ? `Messages, ${count} unread` : "Messages"
      }
    >
      <MessagesSquare className="h-5 w-5" />
      {count > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
          data-testid="badge-header-messaging-unread"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Button>
  );
};
