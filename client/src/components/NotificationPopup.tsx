import { useEffect } from "react";
import { X, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Notification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";

interface NotificationPopupProps {
  notification: Notification;
  onClose: () => void;
  onView: () => void;
}

export function NotificationPopup({ notification, onClose, onView }: NotificationPopupProps) {
  // Auto-close after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 10000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true });

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-5 duration-300 max-w-md w-full sm:w-96">
      <Card className="shadow-lg border-2 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">{notification.title}</CardTitle>
                <CardDescription className="text-xs mt-1">{timeAgo}</CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground mb-4">{notification.message}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onView}
              className="flex-1"
            >
              View Details
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onClose}
            >
              Dismiss
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

