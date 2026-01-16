import Constants from 'expo-constants';
import * as Network from 'expo-network';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5005';

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
): Promise<Response> {
  const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
  
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
  
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
): Promise<T> {
  const res = await apiRequest(method, url, data);
  return await res.json();
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

