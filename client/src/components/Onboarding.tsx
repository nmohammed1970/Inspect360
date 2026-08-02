import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import useEmblaCarousel from "embla-carousel-react";
import { useLocation } from "wouter";
import { 
  Building2, 
  ClipboardCheck, 
  Camera, 
  Sparkles, 
  Shield, 
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Upload,
  X,
  ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import type { User, Organization } from "@shared/schema";
import { SIGNUP_CREDIT_GRANT } from "@/config/billingTiers";

interface OnboardingProps {
  onComplete: () => void;
}

interface OnboardingSlide {
  id: number;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  features?: string[];
  isInteractive?: boolean;
}

const slides: OnboardingSlide[] = [
  {
    id: 1,
    icon: Building2,
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
    title: "Welcome to Inspect360",
    subtitle: "The smarter way to manage property inspections",
    features: [
      "Streamlined property management",
      "Organized blocks and units",
      "Centralized tenant information"
    ]
  },
  {
    id: 2,
    icon: ImageIcon,
    iconColor: "text-accent",
    iconBg: "bg-accent/10",
    title: "Customize Your Brand",
    subtitle: "Add your company logo and details for professional reports",
    isInteractive: true
  },
  {
    id: 3,
    icon: ClipboardCheck,
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
    title: "Powerful Inspections",
    subtitle: "Professional reports in minutes, not hours",
    features: [
      "Customizable inspection templates",
      "Condition and cleanliness ratings",
      "Automatic PDF report generation"
    ]
  },
  {
    id: 4,
    icon: Camera,
    iconColor: "text-accent",
    iconBg: "bg-accent/10",
    title: "AI-Powered Analysis",
    subtitle: "Let AI do the heavy lifting",
    features: [
      "Photo analysis for damage detection",
      "Smart comparison reports",
      "Automated condition assessments"
    ]
  },
  {
    id: 5,
    icon: Shield,
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
    title: "Complete Compliance",
    subtitle: "Stay ahead of regulations",
    features: [
      "Document expiry tracking",
      "Compliance alerts and reminders",
      "Audit-ready documentation"
    ]
  },
  {
    id: 6,
    icon: Sparkles,
    iconColor: "text-accent",
    iconBg: "bg-accent/10",
    title: "You're All Set!",
    subtitle: `Start with ${SIGNUP_CREDIT_GRANT} free inspection credits`,
    features: [
      "Begin your first inspection",
      "Add your properties and blocks",
      "Explore the AI-powered features"
    ]
  }
];

export function Onboarding({ onComplete }: OnboardingProps) {
  const [, navigate] = useLocation();
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandingName, setBrandingName] = useState("");
  const [brandingEmail, setBrandingEmail] = useState("");
  const [brandingPhone, setBrandingPhone] = useState("");
  const [brandingAddress, setBrandingAddress] = useState("");
  const [brandingWebsite, setBrandingWebsite] = useState("");

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  const { data: organization } = useQuery<Organization>({
    queryKey: ["/api/organizations", user?.organizationId],
    enabled: !!user?.organizationId,
  });

  // Track if we've already auto-populated to prevent overwriting user edits
  const hasAutoPopulated = useRef(false);

  // Auto-populate company name and email from registration when component mounts
  useEffect(() => {
    if (user && organization && !hasAutoPopulated.current) {
      // Auto-populate company name from organization name (which comes from username during registration)
      if (organization.name) {
        setBrandingName(organization.name);
      }
      // Auto-populate email from user email
      if (user.email) {
        setBrandingEmail(user.email);
      }
      hasAutoPopulated.current = true;
    }
  }, [user, organization]);

  const updateBrandingMutation = useMutation({
    mutationFn: async () => {
      if (!user?.organizationId) return null;
      const response = await apiRequest("PATCH", `/api/organizations/${user.organizationId}/branding`, {
        logoUrl,
        brandingName: brandingName || null,
        brandingEmail: brandingEmail || null,
        brandingPhone: brandingPhone || null,
        brandingAddress: brandingAddress || null,
        brandingWebsite: brandingWebsite || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", user?.organizationId] });
    }
  });

  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      if (logoUrl || brandingName || brandingEmail || brandingPhone || brandingAddress || brandingWebsite) {
        await updateBrandingMutation.mutateAsync();
      }
      const response = await apiRequest("POST", "/api/auth/complete-onboarding");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      onComplete();
      // Navigate to dashboard after onboarding completes
      navigate("/dashboard");
    }
  });

  const scrollPrev = useCallback(() => {
    if (emblaApi && !isUploadModalOpen) emblaApi.scrollPrev();
  }, [emblaApi, isUploadModalOpen]);

  const scrollNext = useCallback(() => {
    if (emblaApi && !isUploadModalOpen) emblaApi.scrollNext();
  }, [emblaApi, isUploadModalOpen]);

  const scrollTo = useCallback((index: number) => {
    if (emblaApi && !isUploadModalOpen) emblaApi.scrollTo(index);
  }, [emblaApi, isUploadModalOpen]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  const isLastSlide = selectedIndex === slides.length - 1;

  const handleCTA = () => {
    if (isLastSlide) {
      completeOnboardingMutation.mutate();
    } else {
      scrollNext();
    }
  };

  const getUploadParameters = async () => {
    const response = await apiRequest("POST", "/api/upload/generate-upload-url", {
      folder: "branding",
      fileName: `logo-${Date.now()}.png`,
      contentType: "image/*",
    });
    const data = await response.json();
    return {
      method: "PUT" as const,
      url: data.uploadUrl,
    };
  };

  const handleUploadComplete = (result: any) => {
    if (result.successful && result.successful.length > 0) {
      const uploadedFile = result.successful[0];
      const fileUrl = uploadedFile.uploadURL || uploadedFile.meta?.extractedFileUrl;
      if (fileUrl) {
        setLogoUrl(fileUrl);
      }
    }
    setIsUploadModalOpen(false);
  };

  const handleUploadModalOpen = () => {
    setIsUploadModalOpen(true);
  };

  const handleUploadModalClose = () => {
    setIsUploadModalOpen(false);
  };

  const removeLogo = () => {
    setLogoUrl(null);
  };

  const renderBrandingSlide = (slide: OnboardingSlide) => {
    const IconComponent = slide.icon;
    return (
      <div
        key={slide.id}
        className="flex-[0_0_100%] min-w-0"
      >
        <div className="p-8 sm:p-12 flex flex-col items-center text-center">
          <div className={cn(
            "w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center mb-6",
            slide.iconBg
          )}>
            <IconComponent className={cn("w-12 h-12 sm:w-14 sm:h-14", slide.iconColor)} />
          </div>
          
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
            {slide.title}
          </h1>
          
          <p className="text-muted-foreground text-base sm:text-lg mb-6">
            {slide.subtitle}
          </p>
          
          <div className="w-full max-w-md space-y-4 text-left">
            <div className="flex flex-col items-center gap-4 mb-6">
              <Label className="text-center font-medium">Company Logo</Label>
              {logoUrl ? (
                <div className="relative">
                  <div className="w-32 h-32 rounded-md border border-border overflow-hidden bg-muted flex items-center justify-center">
                    <img 
                      src={logoUrl} 
                      alt="Company logo" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute -top-2 -right-2"
                    onClick={removeLogo}
                    data-testid="button-remove-logo"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div onClick={(e) => e.stopPropagation()}>
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={5242880}
                    onGetUploadParameters={getUploadParameters}
                    onComplete={handleUploadComplete}
                    onModalOpen={handleUploadModalOpen}
                    onModalClose={handleUploadModalClose}
                    buttonClassName="h-32 w-32 border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center gap-2 bg-muted/50"
                  >
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Upload Logo</span>
                  </ObjectUploader>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                Your logo will appear on reports, portals, and communications
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="brandingName" className="text-sm">Company Name (for reports)</Label>
                <Input
                  id="brandingName"
                  value={brandingName}
                  onChange={(e) => setBrandingName(e.target.value)}
                  placeholder="Your company name"
                  className="mt-1"
                  data-testid="input-branding-name"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="brandingEmail" className="text-sm">Email</Label>
                  <Input
                    id="brandingEmail"
                    type="email"
                    value={brandingEmail}
                    onChange={(e) => setBrandingEmail(e.target.value)}
                    placeholder="contact@company.com"
                    className="mt-1"
                    data-testid="input-branding-email"
                  />
                </div>
                <div>
                  <Label htmlFor="brandingPhone" className="text-sm">Phone</Label>
                  <Input
                    id="brandingPhone"
                    value={brandingPhone}
                    onChange={(e) => setBrandingPhone(e.target.value)}
                    placeholder="+44 20 1234 5678"
                    className="mt-1"
                    data-testid="input-branding-phone"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="brandingWebsite" className="text-sm">Website</Label>
                <Input
                  id="brandingWebsite"
                  value={brandingWebsite}
                  onChange={(e) => setBrandingWebsite(e.target.value)}
                  placeholder="www.yourcompany.com"
                  className="mt-1"
                  data-testid="input-branding-website"
                />
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground text-center pt-2">
              You can update these settings anytime in your account settings
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderStandardSlide = (slide: OnboardingSlide) => {
    const IconComponent = slide.icon;
    return (
      <div
        key={slide.id}
        className="flex-[0_0_100%] min-w-0"
      >
        <div className="p-8 sm:p-12 flex flex-col items-center text-center">
          <div className={cn(
            "w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center mb-8",
            slide.iconBg
          )}>
            <IconComponent className={cn("w-12 h-12 sm:w-14 sm:h-14", slide.iconColor)} />
          </div>
          
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
            {slide.title}
          </h1>
          
          <p className="text-muted-foreground text-base sm:text-lg mb-8">
            {slide.subtitle}
          </p>
          
          {slide.features && (
            <ul className="space-y-3 text-left w-full max-w-sm">
              {slide.features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <ChevronRight className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-foreground/90">{feature}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6">
        <div className="bg-card rounded-2xl shadow-2xl overflow-hidden border border-border">
          <div className="relative overflow-hidden" ref={emblaRef}>
            <div className="flex">
              {slides.map((slide) => (
                slide.isInteractive 
                  ? renderBrandingSlide(slide)
                  : renderStandardSlide(slide)
              ))}
            </div>
          </div>
          
          <div className="px-8 sm:px-12 pb-8 sm:pb-10">
            <div className="flex items-center justify-center gap-2 mb-8">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => scrollTo(index)}
                  className={cn(
                    "w-2.5 h-2.5 rounded-full transition-all duration-300",
                    index === selectedIndex
                      ? "bg-primary w-8"
                      : "bg-muted hover:bg-muted-foreground/30"
                  )}
                  data-testid={`onboarding-dot-${index}`}
                />
              ))}
            </div>
            
            <div className="flex items-center justify-between gap-4">
              <Button
                variant="ghost"
                onClick={scrollPrev}
                disabled={!canScrollPrev}
                className={cn(
                  "transition-opacity",
                  !canScrollPrev && "opacity-0 pointer-events-none"
                )}
                data-testid="button-onboarding-prev"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              
              <Button
                onClick={handleCTA}
                disabled={completeOnboardingMutation.isPending}
                className="min-w-[180px]"
                data-testid="button-onboarding-next"
              >
                {completeOnboardingMutation.isPending ? (
                  "Starting..."
                ) : isLastSlide ? (
                  <>
                    Get Started
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
              
              {!isLastSlide && (
                <Button
                  variant="ghost"
                  onClick={() => completeOnboardingMutation.mutate()}
                  disabled={completeOnboardingMutation.isPending}
                  className="text-muted-foreground"
                  data-testid="button-onboarding-skip"
                >
                  Skip
                </Button>
              )}
              
              {isLastSlide && (
                <div className="w-[68px]" />
              )}
            </div>
          </div>
        </div>
        
        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Powered by <span className="text-primary font-semibold">Inspect360</span>
          </p>
        </div>
      </div>
    </div>
  );
}
