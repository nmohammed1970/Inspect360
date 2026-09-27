import { QueryClient, QueryFunction } from "@tanstack/react-query";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type LockCode = "TRIAL_EXPIRED" | "CREDITS_EXPIRED";
type LockListener = (code: LockCode) => void;
const lockListeners = new Set<LockListener>();

export function subscribeEntitlementLock(listener: LockListener): () => void {
  lockListeners.add(listener);
  return () => {
    lockListeners.delete(listener);
  };
}

export function notifyEntitlementLock(code: LockCode) {
  lockListeners.forEach((listener) => listener(code));
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText;
    let code: string | undefined;

    try {
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const errorData = await res.json();
        errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
        code = typeof errorData.code === "string" ? errorData.code : undefined;
      } else {
        errorMessage = await res.text() || res.statusText;
      }
    } catch (e) {
      errorMessage = res.statusText;
    }

    if (code === "TRIAL_EXPIRED" || code === "CREDITS_EXPIRED") {
      notifyEntitlementLock(code);
    }

    throw new ApiError(errorMessage, res.status, code);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data 
      ? { 
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        } 
      : {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    cache: "no-store", // Never cache
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Add cache-busting headers to prevent any caching
    const url = queryKey.join("/") as string;
    const cacheBuster = `?t=${Date.now()}`;
    const urlWithCacheBuster = url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}${cacheBuster}`;
    
    const res = await fetch(urlWithCacheBuster, {
      credentials: "include",
      cache: "no-store", // Never cache
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnMount: true, // Refetch when component mounts (after invalidation)
      staleTime: 0, // Allow queries to refetch after invalidation
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
