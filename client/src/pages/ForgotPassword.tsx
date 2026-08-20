import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Error",
          description: data.message || "Failed to send reset email",
          variant: "destructive",
        });
        return;
      }

      // Same message whether or not the email exists (no account enumeration)
      toast({
        title: "Check your email",
        description:
          data.message ||
          "If an account exists for that email, a password reset code has been sent.",
      });
      navigate(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send reset email",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-screen">
      {/* Left Column - Form */}
      <div className="flex flex-1 items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/auth")}
                  data-testid="button-back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-2xl font-bold">Forgot Password</CardTitle>
              </div>
              <CardDescription>
                Enter your email address and we'll send you instructions to reset your password
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    disabled={isLoading}
                    data-testid="input-email"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || !email}
                  data-testid="button-submit"
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send reset instructions
                </Button>

                <div className="text-center space-y-2">
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline transition-all"
                    onClick={() => navigate("/reset-password")}
                    data-testid="button-have-code"
                  >
                    Already have a reset code?
                  </button>
                  <div>
                    <span className="text-sm text-muted-foreground">Don't have an account? </span>
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline transition-all"
                      onClick={() => navigate("/auth")}
                      data-testid="button-signup"
                    >
                      Sign up
                    </button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right Column - Hero (Same as Auth page) */}
      <div className="hidden lg:flex lg:flex-1 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#00D6C1]"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-[#00D6C1] via-[#00D6C1]/80 to-[#00D6C1]/60"></div>

        <div className="relative z-10 max-w-lg text-white">
          <h2 className="text-3xl font-bold mb-4">Secure Account Recovery</h2>
          <p className="text-lg text-white/90">
            We'll send you a secure link to reset your password. The link will expire in 1 hour for your security.
          </p>
        </div>
      </div>
    </div>
  );
}
