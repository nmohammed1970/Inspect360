import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, ClipboardCheck, Sparkles, Shield, Users, TrendingUp } from "lucide-react";
import { useLocation } from "wouter";
import logoUrl from "@assets/Inspect360 Logo_1761302629835.png";

export default function Landing() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header/Nav */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Inspect360" className="h-10" />
            <span className="text-2xl font-bold text-primary">Inspect360</span>
          </div>
          <Button
            onClick={() => (navigate("/auth"))}
            variant="outline"
            data-testid="button-login-header"
          >
            Sign In
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-block rounded-lg bg-accent/10 px-4 py-2 text-sm font-medium text-accent mb-4">
            AI-Powered Property Inspections
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Building Inspection Platform for{" "}
            <span className="text-primary">Build-to-Rent</span> Operations
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Streamline property inspections with AI-powered photo analysis, offline mobile support, 
            and comprehensive compliance tracking for modern rental operations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              size="lg"
              onClick={() => (navigate("/auth"))}
              className="text-lg px-8"
              data-testid="button-get-started"
            >
              Get Started Free
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => (navigate("/auth"))}
              className="text-lg px-8"
              data-testid="button-sign-in"
            >
              Sign In
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            No credit card required • Start with 5 free AI credits
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Everything You Need</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Comprehensive tools for property managers, inspectors, compliance officers, and tenants
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <Card className="hover-elevate">
            <CardHeader>
              <Building2 className="w-12 h-12 text-accent mb-2" />
              <CardTitle>Property Management</CardTitle>
              <CardDescription>
                Manage multiple properties and units with ease. Track inspections, maintenance, and tenant assignments all in one place.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <ClipboardCheck className="w-12 h-12 text-accent mb-2" />
              <CardTitle>Mobile Inspections</CardTitle>
              <CardDescription>
                PWA-ready offline inspections with photo capture. Conduct inspections in the field without internet connectivity.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <Sparkles className="w-12 h-12 text-accent mb-2" />
              <CardTitle>AI Photo Analysis</CardTitle>
              <CardDescription>
                OpenAI-powered analysis of inspection photos. Automatically detect damage, wear, and generate detailed condition reports.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <Shield className="w-12 h-12 text-accent mb-2" />
              <CardTitle>Compliance Tracking</CardTitle>
              <CardDescription>
                Track certificates, licenses, and documents with expiry alerts. Stay compliant with automated reminders.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <Users className="w-12 h-12 text-accent mb-2" />
              <CardTitle>Tenant Portal</CardTitle>
              <CardDescription>
                Self-service portal for tenants to submit maintenance requests and view comparison reports for their units.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <TrendingUp className="w-12 h-12 text-accent mb-2" />
              <CardTitle>Comparison Reports</CardTitle>
              <CardDescription>
                AI-generated check-in vs check-out comparisons. Make informed decisions about security deposits.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-16 bg-muted/30 rounded-xl my-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground">Get started in minutes with our simple workflow</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto">
                1
              </div>
              <h3 className="text-xl font-semibold">Create Account</h3>
              <p className="text-muted-foreground">
                Sign up and set up your organization with properties and units
              </p>
            </div>
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto">
                2
              </div>
              <h3 className="text-xl font-semibold">Conduct Inspections</h3>
              <p className="text-muted-foreground">
                Use mobile app to capture photos and rate conditions during inspections
              </p>
            </div>
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-2xl font-bold mx-auto">
                3
              </div>
              <h3 className="text-xl font-semibold">AI Analysis</h3>
              <p className="text-muted-foreground">
                Generate AI-powered reports and comparison analysis automatically
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto text-center space-y-6 bg-primary text-primary-foreground rounded-xl p-12">
          <h2 className="text-3xl md:text-4xl font-bold">
            Ready to Transform Your Inspection Process?
          </h2>
          <p className="text-lg opacity-90">
            Join property managers who are saving time and improving accuracy with AI-powered inspections
          </p>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => (navigate("/auth"))}
            className="text-lg px-8"
            data-testid="button-cta-bottom"
          >
            Get Started Now
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30 mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">
            <p>&copy; 2025 Inspect360. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
