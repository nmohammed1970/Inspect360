import { useQuery } from "@tanstack/react-query";

export type GoogleMapsConfig = {
  apiKey: string | null;
  configured: boolean;
};

export const GOOGLE_MAPS_CONFIG_QUERY_KEY = ["google-maps-config"] as const;

export async function fetchGoogleMapsConfig(): Promise<GoogleMapsConfig> {
  const res = await fetch("/api/config/google-maps-key", { credentials: "include" });
  if (!res.ok) {
    return { apiKey: null, configured: false };
  }
  const data = await res.json();
  return {
    apiKey: data.apiKey || null,
    configured: !!data.configured && !!data.apiKey,
  };
}

/** Shared Maps config query — one cache shape for AddressInput, PropertyDetail, BlockDetail. */
export function useGoogleMapsConfig() {
  return useQuery({
    queryKey: GOOGLE_MAPS_CONFIG_QUERY_KEY,
    queryFn: fetchGoogleMapsConfig,
    staleTime: Infinity,
    retry: false,
  });
}
