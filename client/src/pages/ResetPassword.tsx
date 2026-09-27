import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, FileCheck, Building2 } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BRAND_LOGO_ON_DARK } from "@/lib/brandAssets";
import { MIN_PASSWORD_LENGTH } from "@shared/passwordPolicy";
import type { AuthPortal } from "./ForgotPassword";

type ResetPasswordProps = {
  /** When omitted, inferred from the current path (/admin/... → admin). */
  portal?: AuthPortal;
};

function resolvePortal(portal: AuthPortal | undefined, location: string): AuthPortal {
  if (portal) return portal;
  return location.startsWith("/admin/") ? "admin" : "user";
}

export default function ResetPassword({ portal }: ResetPasswordProps) {
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const emailFromUrl = urlParams.get("email");
  const [location, navigate] = useLocation();
  const resolvedPortal = resolvePortal(portal, location);
  const isAdmin = resolvedPortal === "admin";
  const loginPath = isAdmin ? "/admin/login" : "/auth";
  const forgotPath = isAdmin ? "/admin/forgot-password" : "/forgot-password";
  const resetApi = isAdmin ? "/api/admin/reset-password" : "/api/reset-password";

  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();

  // Pre-fill email from URL if present
  useEffect(() => {
    if (emailFromUrl) {
      setEmail(decodeURIComponent(emailFromUrl));
    }
  }, [emailFromUrl]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedToken = token.replace(/\D/g, "").trim();

    if (normalizedToken.length !== 6) {
      toast({
        title: "Error",
        description: "Please enter the 6-digit reset code from your email",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      toast({
        title: "Error",
        description: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await apiRequest("POST", resetApi, {
        email: normalizedEmail,
        token: normalizedToken,
        newPassword,
      });
      setIsSuccess(true);
      toast({
        title: "Password reset successful",
        description: isAdmin
          ? "You can now sign in to the Admin Portal with your new password"
          : "You can now sign in with your new password",
      });
    } catch (error: any) {
      const message = error.message || "Failed to reset password";
      const isExpired = /expired/i.test(message);
      toast({
        title: "Error",
        description: isExpired
          ? "This password reset link has expired. Please request a new one."
          : message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh lg:h-dvh">
      {/* Left Column - Form */}
      <div className="flex flex-1 items-start justify-center overflow-y-auto max-h-dvh p-4 md:p-8 bg-background">
        <div className="w-full max-w-md py-4 sm:py-8">
          <Card>
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate(loginPath)}
                  data-testid="button-back"
                  className="shrink-0"
                  aria-label="Back to login"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-xl sm:text-2xl font-bold">
                  {isAdmin ? "Admin Reset Password" : "Reset Password"}
                </CardTitle>
              </div>
              <CardDescription>
                Enter the code we sent to your email and choose a new password
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isSuccess ? (
                <div className="text-center space-y-4 py-8">
                  <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Password reset successful!</h3>
                    <p className="text-sm text-muted-foreground">
                      {isAdmin
                        ? "You can now sign in to the Admin Portal with your new password"
                        : "You can now sign in with your new password"}
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => navigate(loginPath)}
                    data-testid="button-back-to-login"
                  >
                    {isAdmin ? "Back to admin login" : "Back to login"}
                  </Button>
                </div>
              ) : (
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
                      disabled={isLoading || !!emailFromUrl}
                      data-testid="input-email"
                      className={emailFromUrl ? "bg-muted" : ""}
                      autoComplete="email"
                    />
                    {emailFromUrl && (
                      <p className="text-xs text-muted-foreground">
                        Email address is pre-filled from your reset request
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="token">Reset code</Label>
                    <Input
                      id="token"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      value={token}
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setToken(digitsOnly);
                      }}
                      placeholder="Enter 6-digit code"
                      required
                      disabled={isLoading}
                      maxLength={6}
                      data-testid="input-token"
                    />
                    <p className="text-xs text-muted-foreground">
                      Check your email for the 6-digit reset code
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        autoComplete="new-password"
                        required
                        disabled={isLoading}
                        data-testid="input-new-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                        data-testid="button-toggle-new-password"
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Must be at least {MIN_PASSWORD_LENGTH} characters
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        autoComplete="new-password"
                        required
                        disabled={isLoading}
                        data-testid="input-confirm-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        data-testid="button-toggle-confirm-password"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading || !email || !token || !newPassword || !confirmPassword}
                    data-testid="button-submit"
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Reset password
                  </Button>

                  <div className="text-center">
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline transition-all"
                      onClick={() => navigate(forgotPath)}
                      data-testid="button-request-new-code"
                    >
                      Request a new reset code
                    </button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right Column - Hero (same as Auth page) */}
      <div className="hidden lg:flex lg:flex-1 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(207,98%,20%)] via-[hsl(207,70%,16%)] to-[hsl(207,93%,11%)]"></div>
        <div className="absolute inset-0 bg-[hsl(177,96%,40%)]/15"></div>

        <div className="relative z-10 max-w-lg text-white">
          <div className="mb-6">
            <img src={BRAND_LOGO_ON_DARK} alt="Inspect360" className="h-16 w-auto object-contain mb-4" />
          </div>
          <h2 className="font-heading text-3xl font-bold mb-4">Secure password reset</h2>
          <p className="text-lg text-white/90 mb-6">
            Enter the 6-digit code we sent to your email and choose a strong new password to secure your account.
          </p>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <FileCheck className="h-5 w-5 mt-0.5 flex-shrink-0 text-primary" />
              <span>Code expires in 1 hour for security</span>
            </li>
            <li className="flex items-start gap-3">
              <Lock className="h-5 w-5 mt-0.5 flex-shrink-0 text-primary" />
              <span>Password must be at least 6 characters</span>
            </li>
            <li className="flex items-start gap-3">
              <Building2 className="h-5 w-5 mt-0.5 flex-shrink-0 text-primary" />
              <span>
                {isAdmin
                  ? "Access the Inspect360 Admin Portal securely"
                  : "Access your property inspections securely"}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
