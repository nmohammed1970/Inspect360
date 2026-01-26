import Constants from 'expo-constants';
import * as Network from 'expo-network';
import { Platform } from 'react-native';

// Lazy function to get base URL - re-evaluates each time to get latest hostUri
const getBaseUrl = (): string => {
  // Check if we're in development mode
  const isDevelopment = Constants.executionEnvironment !== 'standalone' && 
                        Constants.executionEnvironment !== 'storeClient';
  
  // Priority order:
  // 1. EXPO_PUBLIC_API_URL from .env (runtime check - most reliable)
  // 2. app.config.js extra.apiUrl (build-time fallback from .env)
  let apiUrl = process.env.EXPO_PUBLIC_API_URL;
  
  // If not found in process.env, check Constants (from app.config.js which reads from .env)
  if (!apiUrl) {
    apiUrl = (Constants.expoConfig?.extra as any)?.apiUrl || Constants.expoConfig?.extra?.apiUrl;
  }
  
  // Log what we found for debugging (only in development to reduce production logs)
  if (isDevelopment) {
    console.log('[API] Environment check:', {
      'process.env.EXPO_PUBLIC_API_URL': process.env.EXPO_PUBLIC_API_URL || '(not set)',
      'Constants.expoConfig?.extra?.apiUrl': Constants.expoConfig?.extra?.apiUrl || '(not set)',
      'selected apiUrl': apiUrl || '(ERROR: not configured)'
    });
  }
  
  // Require API URL to be set - but provide a fallback for production builds
  if (!apiUrl) {
    const errorMsg = '[API] ERROR: EXPO_PUBLIC_API_URL is not set in .env file. Please set it in mobile/.env';
    console.error(errorMsg);
    // In production builds, use production URL as fallback instead of crashing
    if (Constants.executionEnvironment === 'standalone' || Constants.executionEnvironment === 'storeClient') {
      console.warn('[API] Using production fallback URL: https://portal.inspect360.ai');
      return 'https://portal.inspect360.ai';
    }
    throw new Error(errorMsg);
  }

  // Check if we're in development mode and using localhost
  // On physical devices/emulators, localhost refers to the device itself, not the dev machine
  if (isDevelopment && (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1'))) {
    const isAndroid = Platform.OS === 'android';
    
    // Try to get the machine's IP from Expo hostUri (re-check each time)
    // hostUri might not be available immediately, so we check multiple sources
    let hostUri = Constants.expoConfig?.hostUri;
    
    // Also try to get from Constants directly
    if (!hostUri && Constants.expoConfig?.hostUri) {
      hostUri = Constants.expoConfig.hostUri;
    }
    
    // Also check debuggerHostUri as fallback
    if (!hostUri && (Constants as any).debuggerHostUri) {
      hostUri = (Constants as any).debuggerHostUri;
    }
    
    const isIOS = Platform.OS === 'ios';
    
    console.log('[API] Localhost conversion check:', {
      'Platform.OS': Platform.OS,
      'isAndroid': isAndroid,
      'isIOS': isIOS,
      'hostUri': hostUri || '(not available)',
      'executionEnvironment': Constants.executionEnvironment
    });
    
    // Priority: Try to use hostUri IP first (works for both iOS and Android, emulator and physical device)
    if (hostUri) {
      // Extract IP from hostUri (format: "192.168.1.100:8081" or "192.168.1.100")
      const ip = hostUri.split(':')[0];
      // Replace localhost/127.0.0.1 with the actual IP
      apiUrl = apiUrl.replace(/localhost|127\.0\.0\.1/g, ip);
      console.log('[API] Converted localhost to device-accessible IP from hostUri:', apiUrl);
    } else if (isAndroid) {
      // Android emulator fallback: use 10.0.2.2 (only works for emulator, not physical devices)
      // For physical Android devices, user must set IP in .env
      apiUrl = apiUrl.replace(/localhost|127\.0\.0\.1/g, '10.0.2.2');
      console.log('[API] Android detected but no hostUri - using 10.0.2.2 (emulator only):', apiUrl);
      console.warn('[API] If this is a physical Android device, 10.0.2.2 won\'t work. Update .env with your machine IP.');
    } else if (isIOS) {
      // iOS: Try to get IP from additional sources, or use localhost as fallback
      // iOS simulator can sometimes use localhost, but physical devices need IP
      // Check if we can get IP from other Constants sources
      const manifestUrl = (Constants as any).manifest?.hostUri || (Constants as any).manifest2?.hostUri;
      const expoGoUrl = (Constants as any).expoGoUrl;
      
      if (manifestUrl || expoGoUrl) {
        const sourceUrl = manifestUrl || expoGoUrl;
        const ip = sourceUrl.split(':')[0].replace('http://', '').replace('https://', '');
        if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
          apiUrl = apiUrl.replace(/localhost|127\.0\.0\.1/g, ip);
          console.log('[API] iOS - Converted localhost using manifest/expoGo URL:', apiUrl);
        } else {
          // iOS simulator - localhost might work, but warn for physical devices
          console.warn('[API] iOS - Using localhost. This may work for iOS simulator but not for physical devices.');
          console.warn('[API] For iOS physical devices, update .env with your machine IP address.');
        }
      } else {
        // iOS simulator - localhost might work, but warn for physical devices
        console.warn('[API] iOS - Using localhost. This may work for iOS simulator but not for physical devices.');
        console.warn('[API] For iOS physical devices, update .env with your machine IP address.');
      }
    } else {
      // Unknown platform - log warning
      console.warn('[API] Using localhost - hostUri not available and platform not recognized.');
      console.warn('[API] Update .env with your machine IP address for physical devices.');
    }
  }

  return apiUrl;
};

// Export a getter function that re-evaluates each time (lazy evaluation)
// This ensures hostUri is available when accessed, not at module load time
export const getAPI_URL = (): string => {
  return getBaseUrl();
};

// Cache for API URL to avoid re-evaluation on every access
let _cachedAPI_URL: string | null = null;
let _lastCheck = 0;
const CACHE_DURATION = 2000; // Cache for 2 seconds to avoid excessive re-evaluation

const getCachedAPI_URL = (): string => {
  const now = Date.now();
  // Re-evaluate if cache is stale or doesn't exist
  if (!_cachedAPI_URL || (now - _lastCheck) > CACHE_DURATION) {
    _cachedAPI_URL = getBaseUrl();
    _lastCheck = now;
  }
  return _cachedAPI_URL;
};

// Initialize cache
const initialUrl = getBaseUrl();
_cachedAPI_URL = initialUrl;
_lastCheck = Date.now();
console.log('[API] Initialized with API_URL:', initialUrl);

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

    // Provide user-friendly messages for authentication errors
    if (res.status === 401 || res.status === 403) {
      // For login endpoints, provide a simple message
      if (res.url?.includes('/api/login')) {
        errorMessage = 'Email or password is incorrect. Please try again.';
      } else {
        errorMessage = 'Unauthorized. Please log in again.';
      }
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
  const baseUrl = getAPI_URL();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;

  // Use longer timeout for AI analysis endpoints (2 minutes), default to 10 seconds for other requests
  const isAiEndpoint = url.includes('/ai/') || url.includes('/analyze-image') || url.includes('/analyze');
  const defaultTimeout = isAiEndpoint ? 120000 : 10000;
  const timeout = options?.timeout ?? defaultTimeout;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`[API] ${method} ${fullUrl}`, data ? '(with data)' : '');
    
    // Check network status (non-blocking, don't wait if it takes too long)
    const networkCheck = Network.getNetworkStateAsync().catch(() => ({ isConnected: true }));
    const networkState = await Promise.race([
      networkCheck,
      new Promise(resolve => setTimeout(() => resolve({ isConnected: true }), 500))
    ]) as { isConnected: boolean };

    if (!networkState.isConnected) {
      clearTimeout(timeoutId);
      console.error('[API] No network connection');
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
    console.log(`[API] Response status: ${res.status} for ${method} ${fullUrl}`);
    await throwIfResNotOk(res);
    return res;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    // If error already has a user-friendly message (from throwIfResNotOk), use it
    if (error.status === 401 || error.status === 403) {
      throw error; // Already has user-friendly message
    }

    const currentBaseUrl = getAPI_URL();
    
    // Only log network errors in development, not authentication errors
    const isDevelopment = Constants.executionEnvironment !== 'standalone' && 
                          Constants.executionEnvironment !== 'storeClient';
    if (isDevelopment) {
      console.error(`[API] Request failed for ${method} ${fullUrl}:`, error.message);
    }

    // Handle abort (timeout)
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout. The server is not responding. Please check your internet connection.`);
    }

    // Provide more helpful error messages for network errors
    if (error.message?.includes('Failed to fetch') || 
        error.message?.includes('ERR_CONNECTION_REFUSED') ||
        error.message?.includes('Network request failed') ||
        error.message?.includes('NetworkError')) {
      throw new Error(
        `Cannot connect to server. Please check your internet connection and ensure the server is accessible.`
      );
    }
    
    // Handle SSL/Certificate errors
    if (error.message?.includes('SSL') || error.message?.includes('certificate') || error.message?.includes('CERT')) {
      throw new Error(`SSL certificate error. Please contact support.`);
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

  const baseUrl = String(getAPI_URL());
  const res = await fetch(`${baseUrl}${urlWithCacheBuster}`, {
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

// getAPI_URL is already exported above, no need to re-export

