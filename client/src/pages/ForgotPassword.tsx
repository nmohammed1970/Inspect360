import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Lock } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { BRAND_LOGO_MASTER, BRAND_LOGO_ON_DARK } from "@/lib/brandAssets";

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
      <div className="flex flex-1 items-center justify-center p-4 md:p-8 bg-background">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8">
            <img src={BRAND_LOGO_MASTER} alt="Inspect360" className="h-14 w-auto object-contain" />
          </div>

          <Card className="border-border/60">
            <CardHeader className="space-y-3 pb-6">
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
              <CardDescription className="text-base">
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
                  className="w-full h-11 font-medium"
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
                      className="text-sm text-primary hover:underline font-medium transition-all"
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

      {/* Right Column - Hero (same as Auth page) */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(207,98%,20%)] via-[hsl(207,70%,16%)] to-[hsl(207,93%,11%)]"></div>
        <div className="absolute inset-0 bg-[hsl(177,96%,40%)]/15"></div>

        <div className="relative z-10 max-w-lg space-y-8 text-white">
          <div className="mb-8">
            <img src={BRAND_LOGO_ON_DARK} alt="Inspect360" className="h-16 w-auto object-contain" />
          </div>
          <div>
            <h1 className="font-heading text-4xl font-bold mb-4">Secure account recovery</h1>
            <p className="text-lg text-white/90">
              We'll send you a secure link to reset your password. The link will expire in 1 hour for your security.
            </p>
          </div>

          <div className="flex items-start gap-4">
            <div className="bg-primary p-3 rounded-lg">
              <Lock className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-1">Protected reset flow</h3>
              <p className="text-sm text-white/80">
                Reset codes expire quickly so only you can regain access to your account
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
