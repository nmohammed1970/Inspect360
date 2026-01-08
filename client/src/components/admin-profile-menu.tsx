import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function AdminProfileMenu() {
  const [, navigate] = useLocation();

  // Fetch admin user
  const { data: adminUser } = useQuery({
    queryKey: ["/api/admin/me"],
    retry: false,
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/logout", {});
    },
    onSuccess: () => {
      navigate("/admin/login");
    },
  });

  if (!adminUser) return null;

  const getInitials = () => {
    if (adminUser.firstName && adminUser.lastName) {
      return `${adminUser.firstName[0]}${adminUser.lastName[0]}`.toUpperCase();
    }
    if (adminUser.firstName) {
      return adminUser.firstName.substring(0, 2).toUpperCase();
    }
    if (adminUser.email) {
      return adminUser.email.substring(0, 2).toUpperCase();
    }
    return "A";
  };

  const getDisplayName = () => {
    if (adminUser.firstName && adminUser.lastName) {
      return `${adminUser.firstName} ${adminUser.lastName}`;
    }
    if (adminUser.firstName) {
      return adminUser.firstName;
    }
    return adminUser.email;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-9 w-9 rounded-full"
          data-testid="button-admin-profile-menu"
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback>{getInitials()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none" data-testid="text-admin-name">
              {getDisplayName()}
            </p>
            <p className="text-xs leading-none text-muted-foreground" data-testid="text-admin-email">
              {adminUser.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          className="cursor-pointer"
          data-testid="button-admin-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

