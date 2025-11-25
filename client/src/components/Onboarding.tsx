import { useState, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import useEmblaCarousel from "embla-carousel-react";
import { 
  Building2, 
  ClipboardCheck, 
  Camera, 
  Sparkles, 
  Shield, 
  ChevronRight,
  ChevronLeft,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  features: string[];
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
    icon: ClipboardCheck,
    iconColor: "text-accent",
    iconBg: "bg-accent/10",
    title: "Powerful Inspections",
    subtitle: "Professional reports in minutes, not hours",
    features: [
      "Customizable inspection templates",
      "Condition and cleanliness ratings",
      "Automatic PDF report generation"
    ]
  },
  {
    id: 3,
    icon: Camera,
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
    title: "AI-Powered Analysis",
    subtitle: "Let AI do the heavy lifting",
    features: [
      "Photo analysis for damage detection",
      "Smart comparison reports",
      "Automated condition assessments"
    ]
  },
  {
    id: 4,
    icon: Shield,
    iconColor: "text-accent",
    iconBg: "bg-accent/10",
    title: "Complete Compliance",
    subtitle: "Stay ahead of regulations",
    features: [
      "Document expiry tracking",
      "Compliance alerts and reminders",
      "Audit-ready documentation"
    ]
  },
  {
    id: 5,
    icon: Sparkles,
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
    title: "You're All Set!",
    subtitle: "Start with 10 free AI credits",
    features: [
      "Begin your first inspection",
      "Add your properties and blocks",
      "Explore the AI-powered features"
    ]
  }
];

export function Onboarding({ onComplete }: OnboardingProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/complete-onboarding");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      onComplete();
    }
  });

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const scrollTo = useCallback((index: number) => {
    if (emblaApi) emblaApi.scrollTo(index);
  }, [emblaApi]);

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

  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6">
        <div className="bg-card rounded-2xl shadow-2xl overflow-hidden border border-border">
          <div className="relative overflow-hidden" ref={emblaRef}>
            <div className="flex">
              {slides.map((slide) => {
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
                    </div>
                  </div>
                );
              })}
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
