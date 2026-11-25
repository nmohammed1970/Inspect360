import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getTeamRoleDisplayLabel } from "@shared/roleLabels";
import {
  messagingDisplayName,
  messagingInitials,
  type MessagingConversation,
  type MessagingUserSummary,
} from "../types";

export interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listCategory: "direct" | "maintenance";
  onCreated: (conversation: MessagingConversation) => void;
}

export const NewConversationDialog = ({
  open,
  onOpenChange,
  listCategory,
  onCreated,
}: NewConversationDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mrPickerQuery, setMrPickerQuery] = useState("");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState("");

  const { data: maintenanceRequestsForPicker = [] } = useQuery<
    Array<{
      id: string;
      title: string;
      status: string;
      property?: { name?: string } | null;
    }>
  >({
    queryKey: ["/api/messaging/mr-picker", user?.role],
    queryFn: async () => {
      const path =
        user?.role === "tenant"
          ? "/api/tenant/maintenance-requests"
          : "/api/maintenance";
      const res = await apiRequest("GET", path);
      const data = await res.json();
      return Array.isArray(data) ? data : data.requests || data.items || [];
    },
    enabled: !!user && open && listCategory === "maintenance",
  });

  const { data: directory = [] } = useQuery<MessagingUserSummary[]>({
    queryKey: ["/api/messaging/directory", directoryQuery],
    queryFn: async () => {
      const q = directoryQuery.trim()
        ? `?q=${encodeURIComponent(directoryQuery.trim())}`
        : "";
      const res = await apiRequest("GET", `/api/messaging/directory${q}`);
      return res.json();
    },
    enabled: !!user && open && listCategory === "direct",
  });

  const createConversationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/messaging/conversations", {
        participantIds: selectedPeople,
        title:
          selectedPeople.length > 1
            ? groupTitle.trim() || undefined
            : undefined,
      });
      return res.json() as Promise<MessagingConversation>;
    },
    onSuccess: (conv) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/messaging/conversations"],
      });
      setSelectedPeople([]);
      setGroupTitle("");
      onOpenChange(false);
      onCreated(conv);
    },
    onError: (err: Error) => {
      toast({
        title: "Could not start chat",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const openMaintenanceDiscussion = async (maintenanceRequestId: string) => {
    const res = await apiRequest(
      "POST",
      "/api/messaging/maintenance-discussions",
      { maintenanceRequestId },
    );
    const conv = (await res.json()) as MessagingConversation;
    queryClient.invalidateQueries({
      queryKey: ["/api/messaging/conversations"],
    });
    onOpenChange(false);
    onCreated(conv);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {listCategory === "maintenance"
              ? "Open maintenance discussion"
              : "New conversation"}
          </DialogTitle>
        </DialogHeader>
        {listCategory === "maintenance" ? (
          <>
            <Input
              placeholder="Search requests"
              value={mrPickerQuery}
              onChange={(e) => setMrPickerQuery(e.target.value)}
              data-testid="input-mr-picker-search"
            />
            <ScrollArea className="h-64">
              <div className="space-y-1">
                {maintenanceRequestsForPicker
                  .filter((r) => {
                    const needle = mrPickerQuery.trim().toLowerCase();
                    if (!needle) return true;
                    return (
                      r.title?.toLowerCase().includes(needle) ||
                      r.id.toLowerCase().includes(needle) ||
                      r.property?.name?.toLowerCase().includes(needle)
                    );
                  })
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="flex w-full flex-col rounded-md px-2 py-2 text-left hover:bg-muted"
                      onClick={() => {
                        void openMaintenanceDiscussion(r.id).catch((err) =>
                          toast({
                            title: "Could not open discussion",
                            description:
                              err instanceof Error ? err.message : "Try again",
                            variant: "destructive",
                          }),
                        );
                      }}
                      data-testid={`button-mr-picker-${r.id}`}
                    >
                      <span className="truncate text-sm font-medium">
                        {r.title}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[r.status, r.property?.name]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  ))}
              </div>
            </ScrollArea>
          </>
        ) : (
          <>
            <Input
              placeholder="Search people"
              value={directoryQuery}
              onChange={(e) => setDirectoryQuery(e.target.value)}
              data-testid="input-directory-search"
            />
            {selectedPeople.length > 1 && (
              <Input
                placeholder="Group title"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
              />
            )}
            <ScrollArea className="h-64">
              <div className="space-y-1">
                {directory.map((person) => {
                  const selected = selectedPeople.includes(person.id);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted",
                        selected && "bg-muted",
                      )}
                      onClick={() =>
                        setSelectedPeople((prev) =>
                          selected
                            ? prev.filter((id) => id !== person.id)
                            : [...prev, person.id],
                        )
                      }
                      data-testid={`button-directory-user-${person.id}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={person.profileImageUrl || undefined}
                        />
                        <AvatarFallback>
                          {messagingInitials(person)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {messagingDisplayName(person)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {getTeamRoleDisplayLabel(person.role || "")}
                        </p>
                      </div>
                      {selected && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
            <Button
              disabled={
                selectedPeople.length === 0 ||
                (selectedPeople.length > 1 && !groupTitle.trim()) ||
                createConversationMutation.isPending
              }
              onClick={() => createConversationMutation.mutate()}
              data-testid="button-create-conversation"
            >
              {createConversationMutation.isPending
                ? "Starting…"
                : "Start chat"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
