import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Share, MoreVertical, Plus, Monitor, Smartphone, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type BrowserType = 'chrome' | 'safari' | 'firefox' | 'edge' | 'samsung' | 'opera' | 'other';
type DeviceType = 'ios' | 'android' | 'desktop';

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [browserType, setBrowserType] = useState<BrowserType>('other');
  const [deviceType, setDeviceType] = useState<DeviceType>('desktop');

  const isStandalone = () => {
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as any).standalone === true;
  };

  const checkIfInstalled = () => {
    if (isStandalone()) return true;
    if (localStorage.getItem('pwa-installed') === 'true') return true;
    return false;
  };

  const [isInstalled, setIsInstalled] = useState(() => checkIfInstalled());

  const detectBrowser = (): BrowserType => {
    const ua = window.navigator.userAgent.toLowerCase();
    
    if (ua.includes('edg/')) return 'edge';
    if (ua.includes('opr/') || ua.includes('opera')) return 'opera';
    if (ua.includes('samsungbrowser')) return 'samsung';
    if (ua.includes('firefox') || ua.includes('fxios')) return 'firefox';
    if (ua.includes('crios') || (ua.includes('chrome') && !ua.includes('edg'))) return 'chrome';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'safari';
    
    return 'other';
  };

  const detectDevice = (): DeviceType => {
    const ua = window.navigator.userAgent;
    
    if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'desktop';
  };

  useEffect(() => {
    if (checkIfInstalled()) {
      setIsInstalled(true);
      return;
    }

    setBrowserType(detectBrowser());
    setDeviceType(detectDevice());

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      localStorage.setItem('pwa-installed', 'true');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
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
        setIsInstalled(true);
      }

      setDeferredPrompt(null);
    } catch (error) {
      console.error('Error showing install prompt:', error);
    }
  };

  if (isInstalled) {
    return null;
  }

  const getDeviceIcon = () => {
    if (deviceType === 'desktop') return <Monitor className="w-4 h-4" />;
    return <Smartphone className="w-4 h-4" />;
  };

  const getBrowserName = () => {
    const names: Record<BrowserType, string> = {
      chrome: 'Chrome',
      safari: 'Safari',
      firefox: 'Firefox',
      edge: 'Edge',
      samsung: 'Samsung Internet',
      opera: 'Opera',
      other: 'Browser'
    };
    return names[browserType];
  };

  const renderInstallInstructions = () => {
    if (deferredPrompt) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Click the button below to install Inspect360 on your device for quick access and offline support.
          </p>
          <Button 
            onClick={handleInstallClick} 
            className="w-full text-xs h-8"
            size="sm"
            data-testid="button-install-pwa"
          >
            <Download className="w-3 h-3 mr-2" />
            Install Now
          </Button>
        </div>
      );
    }

    if (deviceType === 'ios') {
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Follow these steps to install Inspect360 on your iPhone or iPad:
          </p>
          <ol className="space-y-1.5 text-xs">
            <li className="flex items-start gap-2">
              <Badge variant="secondary" className="mt-0.5 shrink-0">1</Badge>
              <span>
                Tap the <strong>Share</strong> button{" "}
                <Share className="w-4 h-4 inline-block align-text-bottom text-primary" />{" "}
                at the bottom of your screen
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Badge variant="secondary" className="mt-0.5 shrink-0">2</Badge>
              <span>
                Scroll down and tap{" "}
                <strong className="inline-flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add to Home Screen
                </strong>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Badge variant="secondary" className="mt-0.5 shrink-0">3</Badge>
              <span>Tap <strong>Add</strong> in the top right corner</span>
            </li>
          </ol>
        </div>
      );
    }

    if (deviceType === 'android') {
      if (browserType === 'chrome' || browserType === 'edge') {
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Follow these steps to install Inspect360 on your Android device:
            </p>
            <ol className="space-y-1.5 text-xs">
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">1</Badge>
                <span>
                  Tap the <strong>menu</strong> button{" "}
                  <MoreVertical className="w-4 h-4 inline-block align-text-bottom text-primary" />{" "}
                  in the top right corner
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">2</Badge>
                <span>
                  Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">3</Badge>
                <span>Tap <strong>Install</strong> to confirm</span>
              </li>
            </ol>
          </div>
        );
      }

      if (browserType === 'firefox') {
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Follow these steps to install Inspect360 using Firefox:
            </p>
            <ol className="space-y-1.5 text-xs">
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">1</Badge>
                <span>
                  Tap the <strong>menu</strong> button{" "}
                  <MoreVertical className="w-4 h-4 inline-block align-text-bottom text-primary" />{" "}
                  in the top right corner
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">2</Badge>
                <span>Tap <strong>"Install"</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">3</Badge>
                <span>Tap <strong>Add</strong> to confirm</span>
              </li>
            </ol>
          </div>
        );
      }

      if (browserType === 'samsung') {
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Follow these steps to install Inspect360 using Samsung Internet:
            </p>
            <ol className="space-y-1.5 text-xs">
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">1</Badge>
                <span>
                  Tap the <strong>menu</strong> button at the bottom of the screen
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">2</Badge>
                <span>Tap <strong>"Add page to"</strong> then <strong>"Home screen"</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">3</Badge>
                <span>Tap <strong>Add</strong> to confirm</span>
              </li>
            </ol>
          </div>
        );
      }
    }

    if (deviceType === 'desktop') {
      if (browserType === 'chrome') {
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Follow these steps to install Inspect360 on your computer:
            </p>
            <ol className="space-y-1.5 text-xs">
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">1</Badge>
                <span>
                  Look for the <strong>install icon</strong>{" "}
                  <Download className="w-4 h-4 inline-block align-text-bottom text-primary" />{" "}
                  in the address bar (right side)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">2</Badge>
                <span>Click <strong>"Install"</strong> in the popup</span>
              </li>
            </ol>
            <p className="text-xs text-muted-foreground mt-2">
              Or click the menu <MoreVertical className="w-3 h-3 inline" /> then "Install Inspect360..."
            </p>
          </div>
        );
      }

      if (browserType === 'edge') {
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Follow these steps to install Inspect360 on your computer:
            </p>
            <ol className="space-y-1.5 text-xs">
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">1</Badge>
                <span>
                  Look for the <strong>install icon</strong>{" "}
                  <Plus className="w-4 h-4 inline-block align-text-bottom text-primary" />{" "}
                  in the address bar (right side)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">2</Badge>
                <span>Click <strong>"Install"</strong> to add the app</span>
              </li>
            </ol>
            <p className="text-xs text-muted-foreground mt-2">
              Or click the menu <MoreVertical className="w-3 h-3 inline" /> then "Apps" then "Install this site as an app"
            </p>
          </div>
        );
      }

      if (browserType === 'safari') {
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Follow these steps to add Inspect360 to your Dock:
            </p>
            <ol className="space-y-1.5 text-xs">
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">1</Badge>
                <span>
                  Click <strong>File</strong> in the menu bar
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">2</Badge>
                <span>Click <strong>"Add to Dock"</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">3</Badge>
                <span>Click <strong>Add</strong> to confirm</span>
              </li>
            </ol>
          </div>
        );
      }

      if (browserType === 'firefox') {
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Firefox desktop doesn't support PWA installation natively. For the best experience:
            </p>
            <ol className="space-y-1.5 text-xs">
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">1</Badge>
                <span>
                  Open this page in <strong>Chrome</strong> or <strong>Edge</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="secondary" className="mt-0.5 shrink-0">2</Badge>
                <span>Look for the install icon in the address bar</span>
              </li>
            </ol>
            <p className="text-xs text-muted-foreground mt-2">
              Or bookmark this page for quick access.
            </p>
          </div>
        );
      }
    }

    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          To install Inspect360 on your device:
        </p>
        <ol className="space-y-1.5 text-xs">
          <li className="flex items-start gap-2">
            <Badge variant="secondary" className="mt-0.5 shrink-0">1</Badge>
            <span>Open the browser menu</span>
          </li>
          <li className="flex items-start gap-2">
            <Badge variant="secondary" className="mt-0.5 shrink-0">2</Badge>
            <span>Look for <strong>"Install"</strong>, <strong>"Add to Home Screen"</strong>, or similar option</span>
          </li>
          <li className="flex items-start gap-2">
            <Badge variant="secondary" className="mt-0.5 shrink-0">3</Badge>
            <span>Confirm the installation</span>
          </li>
        </ol>
      </div>
    );
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 md:left-2 md:translate-x-0 z-50 w-[calc(100%-1rem)] max-w-[16rem] md:w-[16rem] px-2" data-testid="pwa-install-prompt">
      <Card className="shadow-lg border-2 border-primary/30 bg-card w-full overflow-hidden">
        <CardHeader className="pb-2 px-2 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
                <Download className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <CardTitle className="text-sm font-semibold truncate">Install Inspect360</CardTitle>
                <CardDescription className="text-xs flex items-center gap-1 mt-0.5">
                  {getDeviceIcon()}
                  <span className="truncate">{getBrowserName()}</span>
                </CardDescription>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              data-testid="button-toggle-install-instructions"
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronUp className="w-3 h-3" />
              )}
            </Button>
          </div>
        </CardHeader>
        {isExpanded && (
          <CardContent className="pt-0 pb-3 px-2">
            {renderInstallInstructions()}
          </CardContent>
        )}
        {!isExpanded && (
          <CardContent className="pt-0 pb-2 px-2">
            <p className="text-xs text-muted-foreground">
              Tap to see how to install the app on your device
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
