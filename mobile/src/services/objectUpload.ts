import { File, UploadType } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { getAPI_URL } from './api';

type UploadLocalFileOptions = {
  mimeType?: string;
  fileName?: string;
};

function guessExtension(uri: string, fileName?: string): string {
  const source = fileName || uri;
  const ext = source.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext && ext.length <= 5) return ext;
  return 'jpg';
}

function guessMimeType(extension: string, explicit?: string): string {
  if (explicit) return explicit;
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'doc') return 'application/msword';
  if (extension === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/octet-stream';
}

function toObjectPath(path: string): string {
  if (path.startsWith('/objects/')) return path.split('?')[0];
  const match = path.match(/\/objects\/[^?]+/);
  return match ? match[0] : path;
}

function parseUploadBody(body: string): string {
  let data: any = {};
  try {
    data = JSON.parse(body || '{}');
  } catch {
    throw new Error('Upload succeeded but response was not JSON');
  }
  const path = data.url || data.uploadURL || data.path || data.objectUrl;
  if (!path || typeof path !== 'string') {
    throw new Error('Upload succeeded but no file URL was returned');
  }
  return toObjectPath(path);
}

async function prepareLocalFile(
  uri: string,
  mimeType: string,
): Promise<{ uri: string; mimeType: string }> {
  if (!mimeType.startsWith('image/')) {
    return { uri, mimeType };
  }
  try {
    // Normalize gallery/camera URIs (incl. HEIC) to a real file:// JPEG Expo can upload.
    const result = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return { uri: result.uri, mimeType: 'image/jpeg' };
  } catch (e) {
    console.warn('[objectUpload] manipulateAsync failed, using original URI:', e);
    return { uri, mimeType };
  }
}

/**
 * Preferred path for Expo SDK 57+: native File multipart upload (no RN FormData uri hack).
 */
async function uploadWithFileApi(
  uploadUrl: string,
  fileUri: string,
  mimeType: string,
): Promise<string> {
  const file = new File(fileUri);
  const result = await file.upload(uploadUrl, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType,
    sessionType: 'foreground',
    headers: {
      Accept: 'application/json',
    },
  });

  if (result.status < 200 || result.status >= 300) {
    let message = `Upload failed (${result.status})`;
    try {
      const data = JSON.parse(result.body || '{}');
      message = data.message || data.error || message;
    } catch {
      if (result.body) message = result.body;
    }
    throw new Error(message);
  }

  return parseUploadBody(result.body);
}

/**
 * Fallback: expo/fetch + File as FormData part (official Expo upload pattern).
 */
async function uploadWithExpoFetch(
  uploadUrl: string,
  fileUri: string,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', new File(fileUri));

  const response = await expoFetch(uploadUrl, {
    method: 'POST',
    body: formData,
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = `Upload failed (${response.status})`;
    try {
      const data = JSON.parse(errorText);
      message = data.message || data.error || message;
    } catch {
      if (errorText) message = errorText;
    }
    throw new Error(message);
  }

  const data = await response.json();
  const path = data.url || data.uploadURL || data.path || data.objectUrl;
  if (!path || typeof path !== 'string') {
    throw new Error('Upload succeeded but no file URL was returned');
  }
  return toObjectPath(path);
}

/**
 * Last resort: legacy FileSystem.uploadAsync multipart.
 */
async function uploadWithLegacyUploadAsync(
  uploadUrl: string,
  fileUri: string,
  mimeType: string,
): Promise<string> {
  const result = await FileSystem.uploadAsync(uploadUrl, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType,
    sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
    headers: {
      Accept: 'application/json',
    },
  });

  if (result.status < 200 || result.status >= 300) {
    let message = `Upload failed (${result.status})`;
    try {
      const data = JSON.parse(result.body || '{}');
      message = data.message || data.error || message;
    } catch {
      if (result.body) message = result.body;
    }
    throw new Error(message);
  }

  return parseUploadBody(result.body);
}

/**
 * Upload a local device file to `/api/objects/upload-direct`.
 * Returns a `/objects/...` path suitable for storing on the user profile.
 *
 * Avoids the RN `{ uri, type, name }` FormData hack that throws
 * "Unsupported FormDataPart implementation" on Expo 57 / RN 0.86.
 */
export async function uploadLocalFile(
  uri: string,
  options: UploadLocalFileOptions = {},
): Promise<string> {
  const apiUrl = getAPI_URL();
  if (!apiUrl || !apiUrl.startsWith('http')) {
    throw new Error(`Invalid API URL: ${apiUrl}. Check EXPO_PUBLIC_API_URL.`);
  }

  const extension = guessExtension(uri, options.fileName);
  const initialMime = guessMimeType(extension, options.mimeType);
  const prepared = await prepareLocalFile(uri, initialMime);
  const uploadUrl = `${apiUrl}/api/objects/upload-direct`;

  const info = await FileSystem.getInfoAsync(prepared.uri);
  if (!info.exists) {
    throw new Error('Selected file could not be read. Please try again.');
  }

  const errors: string[] = [];

  try {
    return await uploadWithFileApi(uploadUrl, prepared.uri, prepared.mimeType);
  } catch (error: any) {
    errors.push(`File.upload: ${error?.message || error}`);
  }

  try {
    return await uploadWithExpoFetch(uploadUrl, prepared.uri);
  } catch (error: any) {
    errors.push(`expo/fetch: ${error?.message || error}`);
  }

  try {
    return await uploadWithLegacyUploadAsync(uploadUrl, prepared.uri, prepared.mimeType);
  } catch (error: any) {
    errors.push(`uploadAsync: ${error?.message || error}`);
  }

  const combined = errors.join(' | ');
  if (
    combined.includes('Could not connect') ||
    combined.includes('Network request failed') ||
    combined.includes('Failed to fetch')
  ) {
    throw new Error(
      'Could not reach the server to upload. Check that your phone is on the same Wi‑Fi and EXPO_PUBLIC_API_URL matches your PC IP.',
    );
  }
  throw new Error(errors[errors.length - 1] || 'Failed to upload file');
}
