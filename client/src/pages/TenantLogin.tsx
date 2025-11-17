import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Home } from "lucide-react";
import logoUrl from "@assets/Inspect360 Logo_1761302629835.png";

const tenantLoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type TenantLoginData = z.infer<typeof tenantLoginSchema>;

export default function TenantLogin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<TenantLoginData>({
    resolver: zodResolver(tenantLoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: TenantLoginData) => {
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/tenant/login", data);
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Login failed");
      }

      // Await response to ensure session is set
      const result = await res.json();

      // Verify user data exists
      if (!result?.user) {
        throw new Error("Invalid response from server");
      }

      // Set the user data in the cache directly (like staff login)
      queryClient.setQueryData(["/api/auth/user"], result.user);

      // Refetch to ensure session is fully established before navigation
      await queryClient.refetchQueries({ queryKey: ["/api/auth/user"], exact: true, type: "active" });

      toast({
        title: "Welcome back!",
        description: "You've successfully logged in.",
      });

      // Navigate only after auth state is fully updated
      navigate("/tenant/home");
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(174,100%,42%)] to-[hsl(193,40%,38%)] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <img src={logoUrl} alt="Inspect360" className="h-16 w-auto" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Tenant Portal</CardTitle>
            <CardDescription>Access your property information and maintenance</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="your.email@example.com"
                        data-testid="input-tenant-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="••••••••"
                        data-testid="input-tenant-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-tenant-login"
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center">
            <Button
              variant="ghost"
              onClick={() => navigate("/")}
              data-testid="button-back-home"
              className="text-sm"
            >
              <Home className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
