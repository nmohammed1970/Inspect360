import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Building2, Shield, Eye, EyeOff, FileCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { loginMutation, registerMutation, user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Registration form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("clerk");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    
    if (!loginEmail || !loginPassword) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all fields",
      });
      return;
    }

    const result = await loginMutation.mutateAsync({
      email: loginEmail,
      password: loginPassword,
    });
    
    if (result) {
      navigate("/dashboard");
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();

    // Validation
    if (!firstName || !lastName || !email || !username || !password || !confirmPassword) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all fields",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Passwords don't match",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Password must be at least 6 characters",
      });
      return;
    }

    const result = await registerMutation.mutateAsync({
      firstName,
      lastName,
      email,
      username,
      password,
      role: role as "owner" | "clerk" | "compliance" | "tenant",
    });

    if (result) {
      navigate("/onboarding");
    }
  }

  if (user) {
    navigate("/dashboard");
    return null;
  }

  return (
    <div className="flex h-screen">
      {/* Left Column - Form */}
      <div className="flex flex-1 items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold">
                {isLogin ? "Welcome back" : "Create account"}
              </CardTitle>
              <CardDescription>
                {isLogin
                  ? "Enter your credentials to access your account"
                  : "Fill in your details to create your Inspect360 account"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLogin ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email Address</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="Enter your email address"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      disabled={loginMutation.isPending}
                      data-testid="input-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Enter your password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      disabled={loginMutation.isPending}
                      data-testid="input-password"
                    />
                  </div>

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline"
                      onClick={() => navigate("/forgot-password")}
                      data-testid="button-forgot-password"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loginMutation.isPending}
                    data-testid="button-login"
                  >
                    {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign in
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="first-name">First name</Label>
                      <Input
                        id="first-name"
                        type="text"
                        placeholder="John"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        disabled={registerMutation.isPending}
                        data-testid="input-first-name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="last-name">Last name</Label>
                      <Input
                        id="last-name"
                        type="text"
                        placeholder="Doe"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={registerMutation.isPending}
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="john@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={registerMutation.isPending}
                      data-testid="input-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="company-name">Company Name</Label>
                    <Input
                      id="company-name"
                      type="text"
                      placeholder="Acme Property Management"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={registerMutation.isPending}
                      data-testid="input-register-username"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="register-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Create a strong password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={registerMutation.isPending}
                        data-testid="input-register-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={registerMutation.isPending}
                        data-testid="input-confirm-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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

                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select
                      value={role}
                      onValueChange={setRole}
                      disabled={registerMutation.isPending}
                    >
                      <SelectTrigger id="role" data-testid="select-role">
                        <SelectValue placeholder="Select your role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner Operator</SelectItem>
                        <SelectItem value="clerk">Inventory Clerk</SelectItem>
                        <SelectItem value="compliance">Compliance Officer</SelectItem>
                        <SelectItem value="contractor">Contractor</SelectItem>
                        <SelectItem value="tenant">Tenant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={registerMutation.isPending}
                    data-testid="button-register"
                  >
                    {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create account
                  </Button>
                </form>
              )}

              <div className="text-center text-sm">
                {isLogin ? (
                  <p className="text-muted-foreground">
                    Don't have an account?{" "}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setIsLogin(false)}
                      data-testid="button-switch-register"
                    >
                      Sign up
                    </button>
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Already have an account?{" "}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setIsLogin(true)}
                      data-testid="button-switch-login"
                    >
                      Sign in
                    </button>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right Column - Hero */}
      <div className="hidden lg:flex lg:flex-1 items-center justify-center p-12 relative overflow-hidden">
        {/* Navy gradient background */}
        <div className="absolute inset-0 bg-[#003764]"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-[#003764] via-[#000092]/20 to-[#59B677]/10"></div>

        {/* Content */}
        <div className="relative z-10 max-w-lg space-y-8 text-white">
          <div>
            <h1 className="text-4xl font-bold mb-4">AI-Powered Building Inspections</h1>
            <p className="text-lg text-white/90">
              Streamline your Build-to-Rent operations with mobile-first inspections, AI photo analysis, and comprehensive compliance tracking.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="bg-[#59B677] p-3 rounded-lg">
                <Eye className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">AI Photo Analysis</h3>
                <p className="text-sm text-white/80">
                  Powered by GPT-5 Vision for detailed condition assessments
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-[#59B677] p-3 rounded-lg">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Offline Mobile Inspections</h3>
                <p className="text-sm text-white/80">
                  Conduct field inspections without internet connectivity
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-[#59B677] p-3 rounded-lg">
                <FileCheck className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Compliance Tracking</h3>
                <p className="text-sm text-white/80">
                  Automated expiry alerts for certifications and licenses
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-[#59B677] p-3 rounded-lg">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Role-Based Access</h3>
                <p className="text-sm text-white/80">
                  Secure access for owners, clerks, compliance officers, and tenants
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
