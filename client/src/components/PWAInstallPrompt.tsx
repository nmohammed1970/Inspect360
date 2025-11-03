import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Download, Share } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [showAndroidPrompt, setShowAndroidPrompt] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Detect if running in standalone mode (already installed)
  const isStandalone = () => {
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as any).standalone === true;
  };

  // Detect iOS Safari
  const isIOSSafari = () => {
    const ua = window.navigator.userAgent;
    const iOS = /iPhone|iPad|iPod/.test(ua);
    const webkit = /WebKit/.test(ua);
    const notChrome = !/CriOS/.test(ua);
    const notFirefox = !/FxiOS/.test(ua);
    
    return iOS && webkit && notChrome && notFirefox;
  };

  // Check if user has previously dismissed the prompt
  const hasBeenDismissed = () => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (!dismissed) return false;
    
    // Check if dismissed more than 7 days ago
    const dismissedTime = parseInt(dismissed, 10);
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    return dismissedTime > sevenDaysAgo;
  };

  useEffect(() => {
    // Don't show if already installed or dismissed
    if (isStandalone() || hasBeenDismissed()) {
      return;
    }

    // Android: Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowAndroidPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // iOS: Show instructions after 5 seconds of page load
    if (isIOSSafari()) {
      const timer = setTimeout(() => {
        setShowIOSInstructions(true);
      }, 5000);
      
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }

    // Track successful installation
    const handleAppInstalled = () => {
      setShowAndroidPrompt(false);
      setDeferredPrompt(null);
      localStorage.removeItem('pwa-install-dismissed');
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;

      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }

      setDeferredPrompt(null);
      setShowAndroidPrompt(false);
    } catch (error) {
      console.error('Error showing install prompt:', error);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    setShowAndroidPrompt(false);
    setShowIOSInstructions(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // Don't render if dismissed
  if (isDismissed || isStandalone()) {
    return null;
  }

  // Android Install Prompt
  if (showAndroidPrompt && deferredPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-md">
        <Card className="shadow-lg border-2 border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">Install Inspect360</CardTitle>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 -mt-1"
                onClick={handleDismiss}
                data-testid="button-dismiss-install"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <CardDescription className="text-sm">
              Install our app for quick access, offline support, and a better experience
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex gap-2">
              <Button
                onClick={handleInstallClick}
                className="flex-1"
                data-testid="button-install-pwa"
              >
                Install App
              </Button>
              <Button
                onClick={handleDismiss}
                variant="outline"
                data-testid="button-not-now"
              >
                Not Now
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // iOS Instructions
  if (showIOSInstructions && isIOSSafari()) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-md">
        <Alert className="shadow-lg border-2 border-primary/20 bg-card">
          <div className="flex items-start justify-between gap-2">
            <Share className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold mb-1 text-sm">Install Inspect360</h4>
              <AlertDescription className="text-sm space-y-2">
                <p>Add this app to your home screen for quick access:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                  <li>Tap the <strong>Share</strong> button <Share className="w-3 h-3 inline" /> below</li>
                  <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                  <li>Tap <strong>"Add"</strong> to confirm</li>
                </ol>
                <Button
                  onClick={handleDismiss}
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  data-testid="button-dismiss-ios-instructions"
                >
                  Got it
                </Button>
              </AlertDescription>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 -mt-1"
              onClick={handleDismiss}
              data-testid="button-close-ios-instructions"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  return null;
}
