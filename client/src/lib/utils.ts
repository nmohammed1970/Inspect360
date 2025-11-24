import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extracts the file URL from an Uppy upload response.
 * The upload-direct endpoint returns: { url: "/objects/...", uploadURL: "/objects/..." }
 * This function checks multiple possible locations in the response structure.
 */
export function extractFileUrlFromUploadResponse(file: any, response?: any): string | null {
  // Method 1: Check file.response.body (most reliable - Uppy stores PUT response here)
  if (file?.response?.body) {
    try {
      const body = typeof file.response.body === 'string' 
        ? JSON.parse(file.response.body) 
        : file.response.body;
      const url = body?.url || body?.uploadURL;
      if (url && url.startsWith('/objects/')) {
        return url;
      }
    } catch (e) {
      // Not JSON or invalid
    }
  }
  
  // Method 2: Check file.response directly
  if (file?.response) {
    const url = file.response.url || file.response.uploadURL;
    if (url && url.startsWith('/objects/')) {
      return url;
    }
  }
  
  // Method 3: Check response.body
  if (response?.body) {
    try {
      const body = typeof response.body === 'string' 
        ? JSON.parse(response.body) 
        : response.body;
      const url = body?.url || body?.uploadURL;
      if (url && url.startsWith('/objects/')) {
        return url;
      }
    } catch (e) {
      // Not JSON
    }
  }
  
  // Method 4: Check top-level response
  if (response) {
    const url = response.url || response.uploadURL;
    if (url && url.startsWith('/objects/')) {
      return url;
    }
  }
  
  // Method 5: Construct from objectId if available in metadata
  if (file?.meta?.objectId) {
    return `/objects/${file.meta.objectId}`;
  }
  
  // Method 6: Extract objectId from upload URL
  if (file?.meta?.originalUploadURL) {
    try {
      const uploadUrl = file.meta.originalUploadURL;
      const urlObj = new URL(uploadUrl);
      const objectId = urlObj.searchParams.get('objectId');
      if (objectId) {
        return `/objects/${objectId}`;
      }
    } catch (e) {
      // Invalid URL
    }
  }
  
  return null;
}
