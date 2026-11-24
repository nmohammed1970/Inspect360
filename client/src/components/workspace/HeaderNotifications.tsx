import { Bell, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Staff header notifications control (bell + unread badge + recent list).
 */
export function HeaderNotifications() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    handleViewNotification,
    deleteNotification,
  } = useNotifications();

  const recent = (notifications || []).slice(0, 12);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0"
          data-testid="button-header-notifications"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(28rem,calc(100vw-1.5rem))] p-0">
        <DropdownMenuLabel className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span>Notifications</span>
          {unreadCount > 0 ? (
            <span className="text-xs font-normal text-muted-foreground">
              {unreadCount} unread
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />
        {recent.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            No notifications yet
          </div>
        ) : (
          <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
            {recent.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "flex items-start gap-1 border-b border-border/60 last:border-b-0",
                  !n.isRead && "bg-primary/[0.04]",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 px-3 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                  data-testid={`notification-item-${n.id}`}
                  onClick={() => {
                    if (!n.isRead) markAsRead?.(n.id);
                    handleViewNotification?.(n);
                  }}
                >
                  <span className="block text-sm font-medium leading-snug text-foreground">
                    {n.title}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                    {n.message}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-1.5 mr-1.5 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Delete notification"
                  data-testid={`button-delete-notification-${n.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteNotification?.(n.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuItem asChild className="rounded-none justify-center py-2.5 text-xs">
          <Link href="/dashboard" className="w-full justify-center text-center">
            Back to dashboard
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
