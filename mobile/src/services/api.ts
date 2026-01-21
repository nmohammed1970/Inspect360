import Constants from 'expo-constants';
import * as Network from 'expo-network';

const getBaseUrl = () => {
  // 1. Prioritize hostUri for Expo Go/physical device development
  // Extract IP from hostUri (e.g., "192.168.1.10:8081") to connect to local backend from physical device
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    // console.log(`[API] Detected host IP: ${ip}`);
    return `http://${ip}:5005`;
  }

  // 2. Fallback to explicit environment variables
  if (process.env.EXPO_PUBLIC_API_URL && !process.env.EXPO_PUBLIC_API_URL.includes('localhost')) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  if (Constants.expoConfig?.extra?.apiUrl) return Constants.expoConfig.extra.apiUrl;

  return 'http://localhost:5005';
};

const API_URL = getBaseUrl();

export interface ApiError {
  message: string;
  error?: string;
  status?: number;
}

async function throwIfResNotOk(res: Response): Promise<void> {
  if (!res.ok) {
    let errorMessage = res.statusText;

    try {
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const errorData = await res.json();
        errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
      } else {
        errorMessage = await res.text() || res.statusText;
      }
    } catch (e) {
      // If parsing fails, use status text
      errorMessage = res.statusText;
    }

    const error: ApiError = {
      message: errorMessage,
      status: res.status,
    };

    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
  options?: { timeout?: number },
): Promise<Response> {
  const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;

  // Use longer timeout for AI analysis endpoints (2 minutes), default to 10 seconds for other requests
  const isAiEndpoint = url.includes('/ai/') || url.includes('/analyze-image') || url.includes('/analyze');
  const defaultTimeout = isAiEndpoint ? 120000 : 10000;
  const timeout = options?.timeout ?? defaultTimeout;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Check network status (non-blocking, don't wait if it takes too long)
    const networkCheck = Network.getNetworkStateAsync().catch(() => ({ isConnected: true }));
    const networkState = await Promise.race([
      networkCheck,
      new Promise(resolve => setTimeout(() => resolve({ isConnected: true }), 500))
    ]) as { isConnected: boolean };

    if (!networkState.isConnected) {
      clearTimeout(timeoutId);
      throw new Error('No network connection. Please check your internet connection.');
    }

    const res = await fetch(fullUrl, {
      method,
      signal: controller.signal,
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
      credentials: "include", // Important for session cookies
    });

    clearTimeout(timeoutId);
    await throwIfResNotOk(res);
    return res;
  } catch (error: any) {
    clearTimeout(timeoutId);

    // Handle abort (timeout)
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout. The server at ${API_URL} is not responding.`);
    }

    // Provide more helpful error messages
    if (error.message?.includes('Failed to fetch') || error.message?.includes('ERR_CONNECTION_REFUSED')) {
      throw new Error(
        `Cannot connect to backend server at ${API_URL}. ` +
        `Please make sure the backend server is running. ` +
        `Run 'npm run dev' in the root directory.`
      );
    }
    throw error;
  }
}

export async function apiRequestJson<T>(
  method: string,
  url: string,
  data?: unknown,
  options?: { timeout?: number },
): Promise<T> {
  const res = await apiRequest(method, url, data, options);
  
  // Check content type
  const contentType = res.headers.get('content-type') || '';
  
  // Try to parse as JSON
  try {
    const text = await res.text();
    
    // If content type indicates JSON or we got a response, try to parse it
    if (contentType && !contentType.includes('application/json')) {
      // Not JSON content type - might be HTML error page
      console.error(`[apiRequestJson] Expected JSON but got ${contentType} for ${method} ${url}`);
      console.error(`[apiRequestJson] Response preview:`, text.substring(0, 500));
      
      // Check if it looks like HTML
      if (text.trim().startsWith('<')) {
        throw new Error(`Server returned HTML instead of JSON. The route "${url}" may not exist on the backend. Please ensure the backend server is running and has been restarted with the latest code. Response preview: ${text.substring(0, 200)}`);
      }
      
      throw new Error(`Expected JSON response but got ${contentType}. Response: ${text.substring(0, 200)}`);
    }
    
    // Try to parse as JSON
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    return JSON.parse(text) as T;
  } catch (error: any) {
    // If parsing fails, provide better error message
    if (error.message) {
      throw error;
    }
    throw new Error(`Failed to parse JSON response: ${error.message || 'Unknown error'}`);
  }
}

// Query function for React Query
export const getQueryFn = async <T>({ queryKey }: { queryKey: string[] }): Promise<T> => {
  const url = queryKey.join("/");
  const cacheBuster = `?t=${Date.now()}`;
  const urlWithCacheBuster = url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}${cacheBuster}`;

  const res = await fetch(`${API_URL}${urlWithCacheBuster}`, {
    credentials: "include",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });

  if (res.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || res.statusText);
  }

  return await res.json();
};

export { API_URL };

