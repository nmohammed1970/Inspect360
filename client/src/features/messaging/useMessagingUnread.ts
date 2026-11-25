import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

export function useMessagingUnread() {
  const { user } = useAuth();
  return useQuery<{ count: number }>({
    queryKey: ["/api/messaging/unread-count"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/messaging/unread-count");
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });
}
