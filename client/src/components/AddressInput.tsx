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
    let handlePacContainerClick: ((e: Event) => void) | null = null;
    let handleBlur: (() => void) | null = null;
    let handleClickOutside: ((e: MouseEvent) => void) | null = null;
    
    // Update position on window resize/scroll - defined in outer scope for cleanup
    const updatePositionOnScroll = () => {
      if (fixPacContainerZIndex) {
        fixPacContainerZIndex();
      }
    };

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

        // Handler to prevent clicks on pac-container from propagating
        handlePacContainerClick = (e: Event) => {
          e.stopPropagation();
          // Don't prevent default - allow Google's click handler to run
          // This ensures the address selection works properly
        };

        // Helper function to extract city and country from address
        const extractCityAndCountry = (address: string) => {
          const parts = address.split(',').map(p => p.trim()).filter(p => p.length > 0);
          let city = '';
          let country = '';
          
          if (parts.length >= 2) {
            // Last part is country
            country = parts[parts.length - 1];
            // Second to last part is city (may include postal code like "London W1F")
            city = parts[parts.length - 2];
          } else if (parts.length === 1) {
            // Only one part, assume it's the address without city/country
            city = '';
            country = '';
          }
          
          return { city, country };
        };

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
            
            // Extract city and country from the address
            const { city, country } = extractCityAndCountry(addressValue);
            
            // Update city field if it exists
            if (city) {
              const cityField = document.querySelector('input[name="city"]') as HTMLInputElement;
              if (cityField) {
                cityField.value = city;
                cityField.dispatchEvent(new Event('input', { bubbles: true }));
                cityField.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
            
            // Update country field if it exists
            if (country) {
              const countryField = document.querySelector('input[name="country"]') as HTMLInputElement;
              if (countryField) {
                countryField.value = country;
                countryField.dispatchEvent(new Event('input', { bubbles: true }));
                countryField.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
            
            // Update form field if name is provided
            if (name && inputRef.current) {
              inputRef.current.value = addressValue;
              // Trigger multiple events to ensure form libraries pick it up
              inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
              inputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
              // Also trigger React's synthetic event
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
              )?.set;
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(inputRef.current, addressValue);
                const event = new Event('input', { bubbles: true });
                inputRef.current.dispatchEvent(event);
              }
            }
            
            // Hide the autocomplete dropdown after selection
            setTimeout(() => {
              const pacContainer = document.querySelector('.pac-container') as HTMLElement;
              if (pacContainer) {
                pacContainer.style.display = 'none';
              }
            }, 100);
          }
        });

        // Fix z-index and positioning for Google Maps Autocomplete dropdown
        // The pac-container is created by Google Maps, we need to ensure it has proper z-index and positioning
        fixPacContainerZIndex = () => {
          const pacContainer = document.querySelector('.pac-container') as HTMLElement;
          if (pacContainer && inputRef.current) {
            // Only show if input is focused
            if (inputRef.current !== document.activeElement) {
              pacContainer.style.display = 'none';
              return;
            }
            
            // Get input position relative to viewport
            const inputRect = inputRef.current.getBoundingClientRect();
            
            pacContainer.style.zIndex = '99999';
            pacContainer.style.position = 'fixed';
            pacContainer.style.left = `${inputRect.left}px`;
            pacContainer.style.top = `${inputRect.bottom + 4}px`;
            pacContainer.style.width = `${inputRect.width}px`;
            pacContainer.style.maxWidth = `${inputRect.width}px`;
            pacContainer.style.display = 'block';
            // Ensure pointer events work
            pacContainer.style.pointerEvents = 'auto';
            
            // Prevent clicks on pac-container from closing dialogs
            // Remove existing listeners to avoid duplicates
            pacContainer.removeEventListener('mousedown', handlePacContainerClick);
            pacContainer.removeEventListener('click', handlePacContainerClick);
            pacContainer.removeEventListener('touchstart', handlePacContainerClick);
            
            // Add click handlers to prevent event propagation (use capture phase)
            pacContainer.addEventListener('mousedown', handlePacContainerClick, true);
            pacContainer.addEventListener('click', handlePacContainerClick, true);
            pacContainer.addEventListener('touchstart', handlePacContainerClick, true);
            
            console.log('[AddressInput] Fixed pac-container positioning and z-index');
          }
        };

        // Fix z-index immediately and also set up observer for when dropdown appears
        fixPacContainerZIndex();
        
        // Use MutationObserver to fix z-index when dropdown is created/shown
        // Also hide it if input is not focused or user is not typing
        observer = new MutationObserver(() => {
          const pacContainer = document.querySelector('.pac-container') as HTMLElement;
          if (pacContainer && inputRef.current) {
            // If input is not focused, hide the dropdown immediately
            if (inputRef.current !== document.activeElement) {
              pacContainer.style.display = 'none';
              return; // Don't show it if not focused
            }
            // Also hide if input is empty (user hasn't typed anything)
            if (inputRef.current.value.length === 0) {
              pacContainer.style.display = 'none';
              return;
            }
          }
          if (fixPacContainerZIndex) {
            fixPacContainerZIndex();
          }
        });

        // Observe the document body for when pac-container is added
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
        
        // Also fix on input focus/input/blur (when dropdown might appear or needs repositioning)
        if (inputRef.current && fixPacContainerZIndex) {
          const updatePosition = () => {
            // Small delay to ensure pac-container is created
            setTimeout(() => {
              if (fixPacContainerZIndex) {
                fixPacContainerZIndex();
              }
            }, 50);
          };
          
          // Don't show dropdown on focus - only when typing
          inputRef.current.addEventListener('focus', () => {
            // Hide dropdown on focus if there's no text or user hasn't started typing
            const pacContainer = document.querySelector('.pac-container') as HTMLElement;
            if (pacContainer) {
              pacContainer.style.display = 'none';
            }
          });
          
          // Show dropdown only when user is actively typing
          inputRef.current.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            updatePosition();
            // Show dropdown only when typing (has text and is focused)
            if (target.value.length > 0 && inputRef.current === document.activeElement) {
              setTimeout(() => {
                const pacContainer = document.querySelector('.pac-container') as HTMLElement;
                if (pacContainer) {
                  pacContainer.style.display = 'block';
                  if (fixPacContainerZIndex) {
                    fixPacContainerZIndex();
                  }
                }
              }, 100);
            } else {
              // Hide dropdown if input is cleared or not focused
              const pacContainer = document.querySelector('.pac-container') as HTMLElement;
              if (pacContainer) {
                pacContainer.style.display = 'none';
              }
            }
          });
          
          // Hide pac-container immediately when input loses focus
          handleBlur = () => {
            // Close dropdown immediately when field loses focus
            const pacContainer = document.querySelector('.pac-container') as HTMLElement;
            if (pacContainer) {
              pacContainer.style.display = 'none';
            }
          };
          
          inputRef.current.addEventListener('blur', handleBlur);
          
          // Also hide on any click outside the input
          handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (inputRef.current && 
                target !== inputRef.current && 
                !target.closest('.pac-container') &&
                inputRef.current !== document.activeElement) {
              const pacContainer = document.querySelector('.pac-container') as HTMLElement;
              if (pacContainer) {
                pacContainer.style.display = 'none';
              }
            }
          };
          
          // Listen for clicks on the document to hide dropdown when clicking elsewhere
          document.addEventListener('click', handleClickOutside, true);
        }
        
        window.addEventListener('scroll', updatePositionOnScroll, true);
        window.addEventListener('resize', updatePositionOnScroll);

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
      // Cleanup window event listeners
      window.removeEventListener('scroll', updatePositionOnScroll, true);
      window.removeEventListener('resize', updatePositionOnScroll);
      // Cleanup event listeners
      if (inputRef.current && handleBlur) {
        inputRef.current.removeEventListener('blur', handleBlur);
      }
      
      // Remove click outside listener
      if (handleClickOutside) {
        document.removeEventListener('click', handleClickOutside, true);
      }
      
      // Cleanup and hide pac-container
      const pacContainerForCleanup = document.querySelector('.pac-container') as HTMLElement;
      if (pacContainerForCleanup) {
        if (handlePacContainerClick) {
          pacContainerForCleanup.removeEventListener('mousedown', handlePacContainerClick, true);
          pacContainerForCleanup.removeEventListener('click', handlePacContainerClick, true);
          pacContainerForCleanup.removeEventListener('touchstart', handlePacContainerClick, true);
        }
        // Hide the pac-container when component unmounts
        pacContainerForCleanup.style.display = 'none';
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

