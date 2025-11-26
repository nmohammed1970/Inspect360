import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { useQuery } from "@tanstack/react-query";

interface AddressInputProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string; // For form integration
  placeholder?: string;
  id?: string;
  required?: boolean;
  className?: string;
  "data-testid"?: string;
}

// Load Google Maps script
function loadGoogleMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if script is already loaded
    if (window.google && window.google.maps && window.google.maps.places) {
      console.log('[AddressInput] Google Maps already loaded');
      resolve();
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
    if (existingScript) {
      console.log('[AddressInput] Google Maps script already loading, waiting...');
      existingScript.addEventListener('load', () => {
        console.log('[AddressInput] Existing script loaded');
        resolve();
      });
      existingScript.addEventListener('error', () => {
        console.error('[AddressInput] Existing script failed to load');
        reject(new Error('Failed to load Google Maps script'));
      });
      return;
    }

    // Create and load script
    console.log('[AddressInput] Creating new Google Maps script tag');
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      console.log('[AddressInput] Google Maps script loaded successfully');
      resolve();
    };
    script.onerror = (error) => {
      console.error('[AddressInput] Failed to load Google Maps script:', error);
      reject(new Error('Failed to load Google Maps script'));
    };
    document.head.appendChild(script);
    console.log('[AddressInput] Google Maps script tag added to head');
  });
}

// Fetch Google Maps API key from server
async function getGoogleMapsApiKey(): Promise<string | null> {
  try {
    const response = await fetch('/api/config/google-maps-key', { credentials: 'include' });
    if (!response.ok) {
      console.error('[AddressInput] Failed to fetch API key, status:', response.status);
      // If server error, return null to allow manual input
      return null;
    }
    const data = await response.json();
    console.log('[AddressInput] API key response:', { 
      configured: data.configured, 
      hasApiKey: !!data.apiKey,
      apiKeyLength: data.apiKey?.length || 0 
    });
    // Return null if not configured, so component can work without autocomplete
    return data.apiKey || null;
  } catch (error) {
    console.error('[AddressInput] Error fetching API key:', error);
    return null;
  }
}

export function AddressInput({
  value,
  defaultValue,
  onChange,
  name,
  placeholder = "Enter address...",
  id,
  required,
  className,
  "data-testid": dataTestId,
}: AddressInputProps) {
  const { countryCode } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [internalValue, setInternalValue] = useState(value || defaultValue || "");
  
  // Use controlled value if provided, otherwise use internal state
  const currentValue = value !== undefined ? value : internalValue;

  // Fetch API key
  const { data: apiKey, isLoading: isLoadingKey, error: apiKeyError } = useQuery({
    queryKey: ['google-maps-api-key'],
    queryFn: getGoogleMapsApiKey,
    staleTime: Infinity, // API key doesn't change
    retry: false, // Don't retry if API key is not configured
    // Don't block input if API key fetch fails - allow manual entry
    onError: (error) => {
      console.warn('[AddressInput] Failed to fetch API key:', error);
      setIsLoading(false);
    },
    onSuccess: (key) => {
      console.log('[AddressInput] API key fetched:', key ? 'configured' : 'not configured');
      // If API key is null (not configured), enable input immediately
      if (!key) {
        console.warn('[AddressInput] Google Maps API key not configured. Address autocomplete will not be available.');
        setIsLoading(false);
      }
    },
  });

  // Initialize Google Maps Autocomplete
  useEffect(() => {
    // If still loading key, wait
    if (isLoadingKey) {
      setIsLoading(true);
      return;
    }

    // If no API key (null or undefined), allow manual input
    if (!apiKey) {
      console.log('[AddressInput] No API key available, allowing manual input only');
      setIsLoading(false);
      return;
    }

    // Wait for input ref to be available
    if (!inputRef.current) {
      console.log('[AddressInput] Input ref not available yet, waiting...');
      // Use a small timeout to wait for the input to be mounted
      const timeout = setTimeout(() => {
        if (inputRef.current) {
          console.log('[AddressInput] Input ref now available');
        }
      }, 100);
      return () => clearTimeout(timeout);
    }

    let mounted = true;
    let observer: MutationObserver | null = null;
    let fixPacContainerZIndex: (() => void) | null = null;

    const initializeAutocomplete = async () => {
      try {
        setIsLoading(true);
        setError(null);

        console.log('[AddressInput] Loading Google Maps script with API key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'none');

        // Load Google Maps script
        await loadGoogleMapsScript(apiKey);

        console.log('[AddressInput] Google Maps script loaded successfully');

        if (!mounted || !inputRef.current) {
          console.warn('[AddressInput] Component unmounted or input ref not available after script load');
          setIsLoading(false);
          return;
        }

        // Verify Google Maps is loaded
        if (!window.google || !window.google.maps || !window.google.maps.places) {
          console.error('[AddressInput] Google Maps Places API not available after script load');
          throw new Error('Google Maps Places API not loaded');
        }

        console.log('[AddressInput] Creating Autocomplete instance for country:', countryCode);
        
        // Create autocomplete instance
        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: countryCode.toLowerCase() }, // Restrict to user's country
          fields: ['formatted_address', 'address_components', 'geometry'],
          types: ['address'], // Focus on addresses
        });

        autocompleteRef.current = autocomplete;

        // Debug: Log autocomplete initialization
        console.log('[AddressInput] Google Maps Autocomplete initialized successfully for country:', countryCode);
        
        // Test that autocomplete is working
        console.log('[AddressInput] Autocomplete instance created:', !!autocomplete);

        // Handle place selection
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          console.log('[AddressInput] Place selected:', place.formatted_address);
          if (place.formatted_address) {
            const addressValue = place.formatted_address;
            setInternalValue(addressValue);
            if (onChange) {
              onChange(addressValue);
            }
            // Update form field if name is provided
            if (name && inputRef.current) {
              inputRef.current.value = addressValue;
              // Trigger input event for form libraries
              inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        });

        // Fix z-index for Google Maps Autocomplete dropdown to appear above dialogs
        // The pac-container is created by Google Maps, we need to ensure it has proper z-index
        fixPacContainerZIndex = () => {
          const pacContainer = document.querySelector('.pac-container') as HTMLElement;
          if (pacContainer) {
            pacContainer.style.zIndex = '9999';
            pacContainer.style.position = 'absolute';
            // Ensure pointer events work
            pacContainer.style.pointerEvents = 'auto';
            console.log('[AddressInput] Fixed pac-container z-index to 9999');
          }
        };

        // Fix z-index immediately and also set up observer for when dropdown appears
        fixPacContainerZIndex();
        
        // Use MutationObserver to fix z-index when dropdown is created/shown
        observer = new MutationObserver(() => {
          if (fixPacContainerZIndex) {
            fixPacContainerZIndex();
          }
        });

        // Observe the document body for when pac-container is added
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        // Also fix on input focus (when dropdown might appear)
        if (inputRef.current && fixPacContainerZIndex) {
          inputRef.current.addEventListener('focus', fixPacContainerZIndex);
          inputRef.current.addEventListener('input', fixPacContainerZIndex);
        }

        setIsLoading(false);
        console.log('[AddressInput] Autocomplete setup complete - ready for user input');
      } catch (err) {
        console.error('[AddressInput] Failed to initialize Google Maps:', err);
        console.error('[AddressInput] Error details:', {
          apiKey: apiKey ? 'present' : 'missing',
          countryCode,
          hasInput: !!inputRef.current,
          googleMapsLoaded: !!(window.google && window.google.maps),
        });
        // Don't show error to user - just allow manual input
        setError(null);
        setIsLoading(false);
      }
    };

    initializeAutocomplete();

    return () => {
      mounted = false;
      // Cleanup observer
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      // Cleanup event listeners
      if (inputRef.current && fixPacContainerZIndex) {
        inputRef.current.removeEventListener('focus', fixPacContainerZIndex);
        inputRef.current.removeEventListener('input', fixPacContainerZIndex);
      }
      // Cleanup autocomplete
      if (autocompleteRef.current) {
        try {
          google.maps.event.clearInstanceListeners(autocompleteRef.current);
        } catch (e) {
          console.warn('[AddressInput] Error clearing listeners:', e);
        }
        autocompleteRef.current = null;
      }
    };
  }, [apiKey, isLoadingKey, countryCode, onChange, name]);

  // Only disable if actively loading AND we have an API key to load
  // If no API key, allow manual input
  const shouldDisable = isLoading && apiKey !== undefined;

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        name={name}
        value={currentValue}
        defaultValue={defaultValue}
        onChange={(e) => {
          const newValue = e.target.value;
          setInternalValue(newValue);
          if (onChange) {
            onChange(newValue);
          }
        }}
        placeholder={isLoading && apiKey ? "Loading address suggestions..." : placeholder}
        required={required}
        className={className}
        data-testid={dataTestId}
        disabled={shouldDisable}
      />
      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}
      {apiKeyError && (
        <p className="text-xs text-muted-foreground mt-1">
          Address suggestions unavailable. You can still type the address manually.
        </p>
      )}
    </div>
  );
}

