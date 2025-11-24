// Google Maps API type declarations
declare global {
  interface Window {
    google: typeof google;
  }
}

declare namespace google {
  namespace maps {
    namespace places {
      interface AutocompleteOptions {
        componentRestrictions?: { country: string | string[] };
        fields?: string[];
        types?: string[];
      }

      class Autocomplete {
        constructor(inputField: HTMLInputElement, opts?: AutocompleteOptions);
        getPlace(): PlaceResult;
        addListener(eventName: string, handler: () => void): void;
      }

      interface PlaceResult {
        formatted_address?: string;
        address_components?: AddressComponent[];
        geometry?: {
          location?: {
            lat(): number;
            lng(): number;
          };
        };
      }

      interface AddressComponent {
        long_name: string;
        short_name: string;
        types: string[];
      }
    }

    namespace event {
      function clearInstanceListeners(instance: any): void;
    }
  }
}

export {};

