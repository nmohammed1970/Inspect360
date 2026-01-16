import { QueryClient } from '@tanstack/react-query';
import { getQueryFn } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't set default queryFn - let each query specify its own
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      staleTime: 30000, // 30 seconds
      retry: 1, // Retry once on failure
      retryDelay: 1000, // Wait 1 second before retry
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    },
    mutations: {
      retry: false,
    },
  },
});

