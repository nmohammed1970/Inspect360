import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  ScrollView,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Camera } from 'expo-camera';
import Input from '../ui/Input';
import Card from '../ui/Card';
import Button from '../ui/Button';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import { Star, Camera as CameraIcon, Image as ImageIcon, X, Sparkles, Wrench, Trash2, Calendar, Clock, Eye, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { inspectionsService } from '../../services/inspections';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { storeImageLocally, getImageSource, isLocalPath } from '../../services/offline/storage';
import SignatureCanvas from 'react-native-signature-canvas';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import Badge from '../ui/Badge';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useTheme } from '../../contexts/ThemeContext';
import { apiRequestJson, getAPI_URL } from '../../services/api';
// No offline functionality - app requires server connection
import { format } from 'date-fns';

interface TemplateField {
  id: string;
  key?: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  validation?: Record<string, any>;
  dependsOn?: Record<string, any>;
  includeCondition?: boolean;
  includeCleanliness?: boolean;
}

interface FieldWidgetProps {
  field: TemplateField;
  value?: any;
  note?: string;
  photos?: string[];
  inspectionId: string;
  entryId?: string;
  sectionName?: string;
  isCheckOut?: boolean;
  markedForReview?: boolean;
  disabled?: boolean;
  autoContext?: {
    inspectorName?: string;
    address?: string;
    tenantNames?: string;
    inspectionDate?: string;
  };
  onChange: (value: any, note?: string, photos?: string[]) => void;
  onMarkedForReviewChange?: (marked: boolean) => void;
  onLogMaintenance?: (fieldLabel: string, photos: string[]) => void;
}

function FieldWidgetComponent(props: FieldWidgetProps) {
  const {
    field,
    value,
    note,
    photos = [],
    inspectionId,
    entryId,
    sectionName,
    isCheckOut = false,
    markedForReview = false,
    disabled = false,
    autoContext,
    onChange,
    onMarkedForReviewChange,
    onLogMaintenance,
  } = props;
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const theme = useTheme();
  const themeColors = (theme && theme.colors) ? theme.colors : colors;

  // Normalize field object to ensure all boolean properties are actual booleans
  const safeField = useMemo(() => {
    const normalized: TemplateField = { ...field };
    // Ensure all boolean properties are actual booleans, not strings
    const raw = field as any;
    if (typeof raw.required === 'string') {
      normalized.required = raw.required.toLowerCase() === 'true';
    } else {
      normalized.required = !!raw.required;
    }
    if (typeof raw.includeCondition === 'string') {
      normalized.includeCondition = raw.includeCondition.toLowerCase() === 'true';
    } else {
      normalized.includeCondition = !!raw.includeCondition;
    }
    if (typeof raw.includeCleanliness === 'string') {
      normalized.includeCleanliness = raw.includeCleanliness.toLowerCase() === 'true';
    } else {
      normalized.includeCleanliness = !!raw.includeCleanliness;
    }
    return normalized;
  }, [field]);

  // Parse value and ensure boolean fields are actual booleans
  const parseValue = (val: any) => {
    if (val === null || val === undefined) return val;
    // If it's a string "true" or "false", convert to boolean
    if (typeof val === 'string') {
      if (val.toLowerCase() === 'true') return true;
      if (val.toLowerCase() === 'false') return false;
    }
    return val;
  };

  const [localValue, setLocalValue] = useState(() => parseValue(value));
  const [localNote, setLocalNote] = useState(note || '');
  const [localPhotos, setLocalPhotos] = useState<string[]>(photos || []);
  // Condition and Cleanliness are now strings matching web app
  const [localCondition, setLocalCondition] = useState<string | undefined>(
    value?.condition || (typeof value === 'object' && value?.condition) ? value.condition : undefined
  );
  const [localCleanliness, setLocalCleanliness] = useState<string | undefined>(
    value?.cleanliness || (typeof value === 'object' && value?.cleanliness) ? value.cleanliness : undefined
  );
  const [localMarkedForReview, setLocalMarkedForReview] = useState(!!markedForReview);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [analyzingField, setAnalyzingField] = useState(false);
  const [analyzingPhoto, setAnalyzingPhoto] = useState<string | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState<Record<string, boolean>>({});
  const [showSignature, setShowSignature] = useState(false);
  const [aiAnalyses, setAiAnalyses] = useState<Record<string, any>>({});
  const autoSaveTriggeredRef = useRef(false);
  const signatureRef = useRef<any>(null);

  // Fetch check-in reference for check-out inspections
  const { data: checkInReference } = useQuery({
    queryKey: [`/api/inspections/${inspectionId}/check-in-reference`],
    queryFn: async () => {
      if (!inspectionId || !isCheckOut || (safeField.type !== 'photo' && safeField.type !== 'photo_array')) {
        return null;
      }
      try {
        return await apiRequestJson<any>(`GET`, `/api/inspections/${inspectionId}/check-in-reference`);
      } catch {
        return null;
      }
    },
    enabled: !!inspectionId && isCheckOut && (safeField.type === 'photo' || safeField.type === 'photo_array'),
    retry: false,
  });

  // Find matching check-in entry for this field
  const checkInEntry = checkInReference?.checkInEntries?.find((entry: any) => {
    if (entry.fieldRef === safeField.id) return true;
    const checkOutFieldKey = safeField.id || safeField.key || '';
    const mappedCheckInFieldKey = checkOutFieldKey.replace(/field_checkout_/g, 'field_checkin_');
    const entryFieldKey = entry.fieldKey || entry.fieldRef || '';
    if (entryFieldKey.toLowerCase() === mappedCheckInFieldKey.toLowerCase()) return true;
    const mappedCheckOutFieldKey = entryFieldKey.replace(/field_checkin_/g, 'field_checkout_');
    if (checkOutFieldKey.toLowerCase() === mappedCheckOutFieldKey.toLowerCase()) return true;
    return false;
  });
  const checkInPhotos = checkInEntry?.photos || [];

  // Rehydrate local state when props change (e.g., when existing entries load)
  useEffect(() => {
    try {
      if (value && typeof value === 'object' && (!!safeField.includeCondition || !!safeField.includeCleanliness)) {
        const parsedValue = parseValue(value.value);
        setLocalValue(parsedValue);
        // Safely extract condition and cleanliness, ensuring they're valid strings
        const condition = value.condition && typeof value.condition === 'string' && value.condition.trim() !== ''
          ? value.condition.trim()
          : undefined;
        const cleanliness = value.cleanliness && typeof value.cleanliness === 'string' && value.cleanliness.trim() !== ''
          ? value.cleanliness.trim()
          : undefined;
        setLocalCondition(condition);
        setLocalCleanliness(cleanliness);
      } else {
        setLocalValue(parseValue(value));
      }
    } catch (error) {
      console.error('[FieldWidget] Error rehydrating state from value:', error);
      // On error, reset to safe defaults
      setLocalValue(parseValue(value));
      setLocalCondition(undefined);
      setLocalCleanliness(undefined);
    }
  }, [value, safeField.includeCondition, safeField.includeCleanliness]);

  useEffect(() => {
    if (note !== undefined && localNote !== note) {
      setLocalNote(note || '');
    }
  }, [note]);

  useEffect(() => {
    // Only update if the prop has changed and is different from local state
    // CRITICAL FIX: Don't filter out photos - keep all photos from props
    // Photos should only be removed when user explicitly deletes them
    // The verification was too aggressive and was removing valid photos
    if (photos && JSON.stringify(localPhotos) !== JSON.stringify(photos)) {
      // Use photos as-is - don't filter based on database existence
      // Photos might be:
      // - Server URLs (not in local DB but valid)
      // - Local paths (not yet in DB but valid)
      // - In DB but verification might fail due to timing
      setLocalPhotos(photos);
    }
  }, [photos]);

  useEffect(() => {
    setLocalMarkedForReview(!!markedForReview);
  }, [markedForReview]);

  // Auto-populate auto fields
  useEffect(() => {
    if (!autoContext) return;
    if (autoSaveTriggeredRef.current) return;

    const isAutoField = safeField.type.startsWith('auto_');
    if (!isAutoField) return;

    let autoValue = '';
    switch (safeField.type) {
      case 'auto_inspector':
        autoValue = autoContext.inspectorName || '';
        break;
      case 'auto_address':
        autoValue = autoContext.address || '';
        break;
      case 'auto_tenant_names':
        autoValue = autoContext.tenantNames || '';
        break;
      case 'auto_inspection_date':
        autoValue = autoContext.inspectionDate || '';
        break;
    }

    if (!value && autoValue) {
      autoSaveTriggeredRef.current = true;
      setLocalValue(autoValue);
      onChange(autoValue, undefined, undefined);
    } else if (value) {
      autoSaveTriggeredRef.current = true;
    }
  }, [safeField.type, autoContext, value, onChange]);

  const handleValueChange = (newValue: any) => {
    if (disabled) {
      Alert.alert('Inspection Completed', 'You cannot modify a completed inspection.');
      return;
    }
    setLocalValue(newValue);
    const composedValue = composeValue(newValue, localCondition, localCleanliness);
    onChange(composedValue, localNote, localPhotos);
  };

  const handleNoteChange = (newNote: string) => {
    setLocalNote(newNote);
    const composedValue = composeValue(localValue, localCondition, localCleanliness);
    onChange(composedValue, newNote, localPhotos);
  };

  const handleConditionChange = (conditionValue: string) => {
    try {
      // Validate condition value
      const validCondition = conditionValue && typeof conditionValue === 'string' && conditionValue.trim() !== ''
        ? conditionValue.trim()
        : undefined;
      
      setLocalCondition(validCondition);
      const composedValue = composeValue(localValue, validCondition, localCleanliness);
      onChange(composedValue, localNote, localPhotos);
    } catch (error) {
      console.error('[FieldWidget] Error handling condition change:', error);
      // Don't update state if there's an error - keep previous value
    }
  };

  const handleCleanlinessChange = (cleanlinessValue: string) => {
    try {
      // Validate cleanliness value
      const validCleanliness = cleanlinessValue && typeof cleanlinessValue === 'string' && cleanlinessValue.trim() !== ''
        ? cleanlinessValue.trim()
        : undefined;
      
      setLocalCleanliness(validCleanliness);
      const composedValue = composeValue(localValue, localCondition, validCleanliness);
      onChange(composedValue, localNote, localPhotos);
    } catch (error) {
      console.error('[FieldWidget] Error handling cleanliness change:', error);
      // Don't update state if there's an error - keep previous value
    }
  };

  const composeValue = (val: any, condition?: string, cleanliness?: string) => {
    const includeCondition = !!safeField.includeCondition;
    const includeCleanliness = !!safeField.includeCleanliness;
    if (includeCondition || includeCleanliness) {
      // Ensure we only include condition/cleanliness if they have valid string values
      // This prevents undefined/null from causing sync errors
      const result: any = {
        value: val !== undefined && val !== null ? val : '',
      };
      
      // Only add condition if it's a valid non-empty string
      if (includeCondition && condition && typeof condition === 'string' && condition.trim() !== '') {
        result.condition = condition.trim();
      }
      
      // Only add cleanliness if it's a valid non-empty string
      if (includeCleanliness && cleanliness && typeof cleanliness === 'string' && cleanliness.trim() !== '') {
        result.cleanliness = cleanliness.trim();
      }
      
      return result;
    }
    return val !== undefined && val !== null ? val : '';
  };

  const handleMarkedForReviewChange = (marked: boolean) => {
    setLocalMarkedForReview(marked);
    onMarkedForReviewChange?.(marked);
  };

  const handleAnalyzePhoto = async (photoUrl: string) => {
    if (!inspectionId || !photoUrl) {
      Alert.alert('Error', 'Unable to analyze photo - missing inspection data');
      return;
    }

    setAnalyzingPhoto(photoUrl);

    try {
      const response = await fetch(`${getAPI_URL()}/api/ai-analyses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          inspectionId,
          inspectionEntryId: entryId,
          imageUrl: photoUrl,
          context: `Analyze this photo for ${safeField.label}. Provide a detailed assessment of the condition, noting any issues, damage, or concerns.`,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze photo');
      }

      const result = await response.json();
      setAiAnalyses(prev => ({ ...prev, [photoUrl]: result }));
      Alert.alert('Analysis Complete', 'AI analysis generated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to analyze photo');
    } finally {
      setAnalyzingPhoto(null);
    }
  };

  // Request camera permissions
  const requestCameraPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera permission is required to take photos');
      return false;
    }
    return true;
  };

  // Request media library permissions
  const requestMediaLibraryPermission = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Media library permission is required to select photos. Please grant permission in your device settings.'
        );
        return false;
      }
      return true;
    } catch (error: any) {
      console.error('Error requesting media library permission:', error);
      Alert.alert('Permission Error', error.message || 'Failed to request media library permission');
      return false;
    }
  };

  // Upload photo to server (with offline support)
  const uploadPhoto = async (uri: string): Promise<string> => {
    if (!inspectionId) {
      throw new Error('Missing inspection ID');
    }

    // If offline, store locally and return local path
    if (!isOnline) {
      try {
        const localPath = await storeImageLocally(uri, inspectionId, entryId);
        console.log(`[FieldWidget] Photo stored locally: ${localPath}`);
        
        // Add local path to photos array
        const composedValue = composeValue(localValue, localCondition, localCleanliness);
        const currentPhotos = [...localPhotos, localPath];
        onChange(composedValue, localNote, currentPhotos);
        
        return localPath;
      } catch (error: any) {
        console.error('[FieldWidget] Error storing photo locally:', error);
        Alert.alert('Error', 'Failed to save photo locally. Please try again.');
        throw error;
      }
    }

    // Online - upload to server
    try {
      // Ensure URI is in correct format for React Native
      // In Expo Go, file URIs from ImagePicker are already in the correct format
      let fileUri = uri;
      if (!uri.startsWith('file://') && !uri.startsWith('content://') && !uri.startsWith('ph://')) {
        // Add file:// prefix if not present and not a content:// or ph:// URI
        fileUri = `file://${uri}`;
      }
      
      console.log('[FieldWidget] File URI format:', {
        original: uri,
        processed: fileUri,
        platform: Platform.OS,
      });
      
      // Verify file exists before attempting upload
      let fileInfo;
      try {
        fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (!fileInfo.exists) {
          // Try without file:// prefix if it failed
          if (fileUri.startsWith('file://')) {
            const altUri = fileUri.replace('file://', '');
            const altInfo = await FileSystem.getInfoAsync(altUri);
            if (altInfo.exists) {
              fileUri = altUri;
              fileInfo = altInfo;
              console.log('[FieldWidget] Using alternative URI format:', fileUri);
            } else {
              throw new Error('Image file not found. Please try capturing the photo again.');
            }
          } else {
            throw new Error('Image file not found. Please try capturing the photo again.');
          }
        }
      } catch (fileError: any) {
        console.error('[FieldWidget] Error checking file:', fileError);
        // Continue anyway - the file might still be accessible for upload
        console.warn('[FieldWidget] Continuing with upload despite file check error');
        fileInfo = { exists: true }; // Assume file exists for upload attempt
      }
      
      // Read file extension from URI
      const extension = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = `image/${extension === 'jpg' || extension === 'jpeg' ? 'jpeg' : extension}`;

      // Construct full URL
      const apiUrl = getAPI_URL();
      const uploadUrl = `${apiUrl}/api/objects/upload-direct`;
      
      console.log('[FieldWidget] Upload configuration:', {
        apiUrl,
        uploadUrl,
        fileUri,
        mimeType,
        extension,
      });
      
      // Validate API URL
      if (!apiUrl || apiUrl === 'undefined' || !apiUrl.startsWith('http')) {
        const errorMsg = `Invalid API URL: ${apiUrl}. Please check your EXPO_PUBLIC_API_URL configuration.`;
        console.error(`[FieldWidget] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // Create FormData for React Native
      // React Native FormData requires uri, type, and name properties
      const formData = new FormData();
      
      // For React Native, use the file:// URI directly
      formData.append('file', {
        uri: fileUri,
        type: mimeType,
        name: `photo_${Date.now()}.${extension}`,
      } as any);

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        console.log('[FieldWidget] Starting upload:', {
          url: uploadUrl,
          uri: fileUri,
          mimeType,
          hasFile: fileInfo?.exists,
          formDataKeys: Object.keys(formData),
        });

        // For FormData, React Native automatically sets Content-Type with boundary
        // DO NOT set Content-Type header manually - it will break the upload
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            // DO NOT set 'Content-Type' - React Native sets it automatically with boundary
          },
          body: formData,
          credentials: 'include',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log('[FieldWidget] Upload response:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries()),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = 'Failed to upload photo';
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch {
            errorMessage = errorText || `Server error: ${response.status} ${response.statusText}`;
          }
          console.error(`[FieldWidget] Upload failed: ${errorMessage}`, {
            status: response.status,
            statusText: response.statusText,
            errorText,
          });
          throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log('[FieldWidget] Upload response data:', data);
        
        // The endpoint returns { url, uploadURL } - use url or uploadURL
        const serverUrl = data.url || data.uploadURL || data.path || data.objectUrl || `/objects/${data.objectId}`;

        if (!serverUrl) {
          throw new Error('Server did not return a valid URL for the uploaded file');
        }

        console.log(`[FieldWidget] Photo uploaded successfully to server: ${serverUrl}`);

        // Trigger onChange with updated photos array (server URLs only)
        const composedValue = composeValue(localValue, localCondition, localCleanliness);
        const currentPhotos = [...localPhotos, serverUrl];
        onChange(composedValue, localNote, currentPhotos);

        return serverUrl;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        // Log detailed error for debugging
        console.error('[FieldWidget] Upload error:', {
          name: fetchError.name,
          message: fetchError.message,
          url: uploadUrl,
          uri: fileUri,
          apiUrl: apiUrl,
          isOnline: isOnline,
          errorType: fetchError.constructor?.name,
          stack: fetchError.stack,
        });
        
        // Re-throw with user-friendly message
        if (fetchError.name === 'AbortError') {
          throw new Error('Upload timeout: The server took too long to respond. Please try again.');
        } else if (fetchError.message?.includes('Network request failed') || fetchError.message?.includes('Failed to fetch')) {
          // Check if it's a CORS or connectivity issue
          throw new Error('Network request failed. Please check your internet connection and ensure the server is accessible.');
        } else {
          throw fetchError;
        }
      }
    } catch (error: any) {
      console.error('[FieldWidget] Error in uploadPhoto:', error);
      throw error;
    }
  };

  const handleTakePhoto = async () => {
    if (disabled) {
      Alert.alert('Inspection Completed', 'You cannot add photos to a completed inspection.');
      return;
    }

    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        setShowPhotoPicker(false);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images' as any,
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled) {
        setShowPhotoPicker(false);
        return;
      }

      if (!result.assets || result.assets.length === 0) {
        Alert.alert('No Photo', 'No photo was captured');
        setShowPhotoPicker(false);
        return;
      }

      const uri = result.assets[0].uri;
      setUploadingPhotos(prev => ({ ...prev, [uri]: true }));

      try {
        // Upload the photo to server
        const uploadedUrl = await uploadPhoto(uri);
        
        // Update UI with server URL
        const newPhotos = [...localPhotos, uploadedUrl];
        setLocalPhotos(newPhotos);
        const composedValue = composeValue(localValue, localCondition, localCleanliness);
        onChange(composedValue, localNote, newPhotos);
      } catch (uploadError: any) {
        console.error('Error uploading photo:', uploadError);
        Alert.alert('Upload Failed', uploadError.message || 'Failed to upload photo. Please try again.');
      } finally {
        setUploadingPhotos(prev => {
          const newState = { ...prev };
          delete newState[uri];
          return newState;
        });
      }
    } catch (error: any) {
      console.error('Error taking photo:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
      Alert.alert(
        'Failed to Take Photo',
        `An error occurred while taking photo: ${errorMessage}. Please try again.`
      );
    } finally {
      setShowPhotoPicker(false);
    }
  };

  const handlePickPhoto = async () => {
    if (disabled) {
      Alert.alert('Inspection Completed', 'You cannot add photos to a completed inspection.');
      return;
    }

    try {
      const hasPermission = await requestMediaLibraryPermission();
      if (!hasPermission) {
        setShowPhotoPicker(false);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as any,
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: 0, // 0 means no limit
      });

      if (result.canceled) {
        setShowPhotoPicker(false);
        return;
      }

      if (!result.assets || result.assets.length === 0) {
        Alert.alert('No Photos Selected', 'Please select at least one photo');
        setShowPhotoPicker(false);
        return;
      }

      const uris = result.assets.map(asset => asset.uri);
      const newPhotos: string[] = [];
      let hasUploadError = false;

      // CRITICAL FIX: Process photos in batches to handle 500+ photos efficiently
      // Update UI immediately as photos are added to show progress
      const BATCH_SIZE = 10; // Process 10 photos at a time
      
      for (let i = 0; i < uris.length; i += BATCH_SIZE) {
        const batch = uris.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (uri) => {
          setUploadingPhotos(prev => ({ ...prev, [uri]: true }));
          try {
            const uploadedUrl = await uploadPhoto(uri);
            // Update UI immediately with this photo
            const currentPhotos = [...localPhotos, ...newPhotos, uploadedUrl];
            setLocalPhotos(currentPhotos);
            return uploadedUrl;
          } catch (uploadError: any) {
            hasUploadError = true;
            console.error('Error uploading photo:', uploadError);
            return null;
          } finally {
            setUploadingPhotos(prev => {
              const newState = { ...prev };
              delete newState[uri];
              return newState;
            });
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        newPhotos.push(...batchResults.filter(url => url !== null) as string[]);
      }

      // CRITICAL FIX: Update UI with all successfully processed photos
      // Remove duplicates and ensure all photos are displayed
      const allPhotos = [...localPhotos];
      for (const photoUrl of newPhotos) {
        if (photoUrl && !allPhotos.includes(photoUrl)) {
          allPhotos.push(photoUrl);
        }
      }
      
      if (allPhotos.length > localPhotos.length) {
        setLocalPhotos(allPhotos);
        const composedValue = composeValue(localValue, localCondition, localCleanliness);
        onChange(composedValue, localNote, allPhotos);
      }

      if (hasUploadError && newPhotos.length < uris.length) {
        Alert.alert(
          'Partial Success',
          `Successfully processed ${newPhotos.length} of ${uris.length} photos. ${uris.length - newPhotos.length} photos failed to upload.`
        );
      } else if (hasUploadError && newPhotos.length === 0) {
        Alert.alert(
          'Upload Failed',
          'All photos failed to upload. Please check your internet connection and try again.'
        );
      }
    } catch (error: any) {
      console.error('Error picking photo:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
      Alert.alert(
        'Failed to Pick Photo',
        `An error occurred while selecting photos: ${errorMessage}. Please try again.`
      );
    } finally {
      setShowPhotoPicker(false);
    }
  };

  const handleRemovePhoto = async (photoUrl: string) => {
    if (disabled) {
      Alert.alert('Inspection Completed', 'You cannot modify photos in a completed inspection.');
      return;
    }

    if (!isOnline) {
      Alert.alert('Offline', 'Cannot remove photos while offline. Please connect to the internet.');
      return;
    }

    try {
      // Update local state immediately
      const newPhotos = localPhotos.filter(p => p !== photoUrl);
      setLocalPhotos(newPhotos);
      const composedValue = composeValue(localValue, localCondition, localCleanliness);
      onChange(composedValue, localNote, newPhotos);
      
      // Entry update will be handled by onChange callback which triggers updateEntry mutation
      // This will POST/PATCH to server with the updated photos array (without the removed photo)
    } catch (error) {
      console.error('[FieldWidget] Error removing photo:', error);
      // Still update UI even if error occurs
      const newPhotos = localPhotos.filter(p => p !== photoUrl);
      setLocalPhotos(newPhotos);
      const composedValue = composeValue(localValue, localCondition, localCleanliness);
      onChange(composedValue, localNote, newPhotos);
    }
  };

  const handleAnalyzeField = async () => {
    // Check if offline - AI analysis requires internet connection
    if (!isOnline) {
      Alert.alert(
        'Offline',
        'AI analysis requires an internet connection. Please connect to the internet and try again.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (localPhotos.length === 0) {
      Alert.alert('No Photos', 'Please upload at least one photo to use AI analysis');
      return;
    }

    setAnalyzingField(true);
    try {
      const result = await inspectionsService.analyzeField(
        inspectionId,
        safeField.id || safeField.key || '',
        safeField.label,
        safeField.placeholder || '',
        sectionName || '',
        localPhotos
      );

      if (result.tokenExceeded) {
        Alert.alert('Token Limit Exceeded', 'Please try again later');
        return;
      }

      setLocalNote(result.analysis);
      const composedValue = composeValue(localValue, localCondition, localCleanliness);
      onChange(composedValue, result.analysis, localPhotos);

      queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}/entries`] });
      Alert.alert('AI Analysis Complete', 'Analysis has been added to the notes field');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to analyze field');
    } finally {
      setAnalyzingField(false);
    }
  };

  const renderFieldInput = () => {
    switch (safeField.type) {
      case 'text':
      case 'short_text':
        return (
          <Input
            label={safeField.label}
            value={localValue !== null && localValue !== undefined ? String(localValue) : ''}
            onChangeText={handleValueChange}
            placeholder={safeField.placeholder || `Enter ${safeField.label.toLowerCase()}`}
            required={!!safeField.required}
            editable={!disabled}
          />
        );

      case 'textarea':
      case 'long_text':
        return (
          <Input
            label={safeField.label}
            value={localValue !== null && localValue !== undefined ? String(localValue) : ''}
            onChangeText={handleValueChange}
            placeholder={safeField.placeholder || `Enter ${safeField.label.toLowerCase()}`}
            multiline={true}
            required={!!safeField.required}
            editable={!disabled}
          />
        );

      case 'number':
        return (
          <Input
            label={safeField.label}
            value={localValue?.toString() || ''}
            onChangeText={(text) => handleValueChange(text ? parseFloat(text) : undefined)}
            placeholder={safeField.placeholder || 'Enter number'}
            keyboardType="numeric"
            required={!!safeField.required}
            editable={!disabled}
          />
        );

      case 'select':
      case 'dropdown':
        return (
          <View style={styles.selectContainer}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>
              {safeField.label}
              {!!safeField.required && <Text style={[styles.required, { color: themeColors.destructive.DEFAULT }]}> *</Text>}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
              {safeField.options?.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.optionButton,
                    localValue === option && styles.optionButtonSelected,
                    disabled && styles.optionButtonDisabled,
                  ]}
                  onPress={() => handleValueChange(option)}
                  disabled={disabled}
                >
                  <Text
                    style={[
                      styles.optionText,
                      localValue === option && styles.optionTextSelected,
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        );

      case 'checkbox':
      case 'boolean':
        // Ensure localValue is a boolean for checkbox
        const boolValue = !!localValue;
        return (
          <TouchableOpacity
            style={[styles.checkboxContainer, disabled && styles.checkboxContainerDisabled]}
            onPress={() => handleValueChange(!boolValue)}
            disabled={disabled}
          >
            <View style={[styles.checkbox, boolValue && styles.checkboxChecked]}>
              {boolValue && <Text style={[styles.checkmark, { color: themeColors.primary.foreground || '#ffffff' }]}>✓</Text>}
            </View>
            <Text style={[styles.checkboxLabel, { color: themeColors.text.primary }]}>{safeField.label}</Text>
          </TouchableOpacity>
        );

      case 'date':
        return (
          <DatePicker
            label={safeField.label}
            value={localValue ? (typeof localValue === 'string' ? new Date(localValue) : localValue) : null}
            onChange={(date) => {
              if (date) {
                handleValueChange(format(date, 'yyyy-MM-dd'));
              } else {
                handleValueChange('');
              }
            }}
            placeholder="Select date"
            required={!!safeField.required}
            disabled={disabled}
          />
        );

      case 'time':
        return (
          <View style={styles.dateContainer}>
            <Clock size={20} color={themeColors.text.muted} />
            <Input
              label={safeField.label}
              value={localValue || ''}
              onChangeText={handleValueChange}
              placeholder="HH:MM"
              required={!!safeField.required}
              editable={!disabled}
            />
          </View>
        );

      case 'datetime':
        return (
          <Input
            label={safeField.label}
            value={localValue !== null && localValue !== undefined ? String(localValue) : ''}
            onChangeText={handleValueChange}
            placeholder="YYYY-MM-DDTHH:MM"
            required={!!safeField.required}
            editable={!disabled}
          />
        );

      case 'signature':
        return (
          <View style={styles.signatureContainer}>
            <Text style={[styles.label, { color: themeColors.text.primary }]}>
              {safeField.label}
              {!!safeField.required && <Text style={[styles.required, { color: themeColors.destructive.DEFAULT }]}> *</Text>}
            </Text>
            {localValue ? (
              <View style={styles.signaturePreview}>
                <Image source={{ uri: localValue }} style={styles.signatureImage} />
                <Button
                  title="Clear"
                  onPress={() => {
                    handleValueChange('');
                    setShowSignature(false);
                  }}
                  variant="outline"
                  size="sm"
                />
              </View>
            ) : (
              <TouchableOpacity
                style={styles.signatureButton}
                onPress={() => setShowSignature(true)}
              >
                <Text style={[styles.signatureButtonText, { color: themeColors.text.secondary }]}>Tap to Sign</Text>
              </TouchableOpacity>
            )}
          </View>
        );

      case 'auto_inspector':
      case 'auto_address':
      case 'auto_tenant_names':
      case 'auto_inspection_date':
        const autoValue = localValue ||
          (safeField.type === 'auto_inspector' ? autoContext?.inspectorName :
            safeField.type === 'auto_address' ? autoContext?.address :
              safeField.type === 'auto_tenant_names' ? autoContext?.tenantNames :
                autoContext?.inspectionDate) || '';
        return (
          <View style={styles.autoFieldContainer}>
            <Input
              label={safeField.label}
              value={autoValue}
              editable={false}
              style={styles.autoInput}
            />
            <Badge variant="secondary" size="sm">Auto</Badge>
          </View>
        );

      case 'photo':
      case 'photo_array':
        return renderPhotoField();

      default:
        return (
          <Input
            label={safeField.label}
            value={localValue?.toString() || ''}
            onChangeText={handleValueChange}
            placeholder={safeField.placeholder}
            required={!!safeField.required}
            editable={!disabled}
          />
        );
    }
  };

  const renderPhotoField = () => {
    return (
      <View style={styles.photoFieldContainer}>
        {/* Check-In Reference Photos for Check-Out */}
        {!!isCheckOut && checkInPhotos.length > 0 && (
          <Card style={styles.checkInReferenceCard}>
            <View style={styles.checkInReferenceHeader}>
              <Eye size={16} color={themeColors.primary.DEFAULT} />
              <Text style={[styles.checkInReferenceTitle, { color: themeColors.text.primary }]}>Check-In Reference Photos</Text>
            </View>
            <Text style={[styles.checkInReferenceText, { color: themeColors.text.secondary }]}>
              Match these angles when taking your Check-Out photos for accurate comparison
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} style={styles.checkInPhotosContainer}>
              {checkInPhotos.map((photoUrl: string, index: number) => (
                <Image
                  key={index}
                  source={{
                    uri: photoUrl.startsWith('http')
                      ? photoUrl
                      : photoUrl.startsWith('/')
                        ? `${getAPI_URL()}${photoUrl}`
                        : `${getAPI_URL()}/objects/${photoUrl}`
                  }}
                  style={styles.checkInPhoto}
                />
              ))}
            </ScrollView>
          </Card>
        )}

        {/* Current Photos */}
        <View style={styles.photoSection}>
          <View style={styles.photoHeader}>
            <Text style={[styles.photoLabel, { color: themeColors.text.primary }]}>
              {safeField.label}
              {!!safeField.required && <Text style={[styles.required, { color: themeColors.destructive.DEFAULT }]}> *</Text>}
            </Text>
            <TouchableOpacity
              style={styles.photoButton}
              onPress={() => setShowPhotoPicker(true)}
              activeOpacity={0.8}
            >
              <CameraIcon size={18} color={themeColors.primary.foreground || '#ffffff'} />
              <Text style={[styles.photoButtonText, { color: themeColors.primary.foreground || '#ffffff' }]}>Add Photo</Text>
            </TouchableOpacity>
          </View>

          {localPhotos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} style={styles.photosContainer}>
              {localPhotos.map((photo, index) => {
                // Resolve photo URL: handle both server URLs and local paths
                let photoUrl: string;
                let imageSource: { uri: string };
                
                if (isLocalPath(photo)) {
                  // Local offline path - use getImageSource helper
                  imageSource = getImageSource(photo);
                  photoUrl = imageSource.uri;
                } else if (photo.startsWith('http://') || photo.startsWith('https://')) {
                  // Full server URL - use as-is
                  photoUrl = photo;
                  imageSource = { uri: photoUrl };
                } else if (photo.startsWith('/')) {
                  // Relative server path - prepend API URL
                  photoUrl = `${getAPI_URL()}${photo}`;
                  imageSource = { uri: photoUrl };
                } else {
                  // Assume it's a server object path
                  photoUrl = `${getAPI_URL()}/objects/${photo}`;
                  imageSource = { uri: photoUrl };
                }

                return (
                  <View key={index} style={styles.photoItem}>
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedPhoto(photoUrl);
                        setShowPhotoViewer(true);
                      }}
                    >
                      <Image source={imageSource} style={styles.photoThumbnail} />
                    </TouchableOpacity>
                    <View style={styles.photoActions}>
                      <TouchableOpacity
                        style={styles.removePhotoButton}
                        onPress={() => handleRemovePhoto(photo)}
                      >
                        <X size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

        </View>
      </View>
    );
  };

  return (
    <Card style={styles.card}>
      {/* Field Label and Mark for Review */}
      <View style={styles.fieldHeader}>
        <Text style={[styles.fieldLabel, { color: themeColors.text.primary }]}>
          {safeField.label}
          {!!safeField.required && <Text style={[styles.required, { color: themeColors.destructive.DEFAULT }]}> *</Text>}
        </Text>
        {!!isCheckOut && (safeField.type === 'photo' || safeField.type === 'photo_array') && (
          <TouchableOpacity
            style={styles.markForReviewButton}
            onPress={() => handleMarkedForReviewChange(!localMarkedForReview)}
          >
            <View style={[styles.markCheckbox, localMarkedForReview && styles.markCheckboxChecked]}>
              {localMarkedForReview && <CheckCircle2 size={16} color="#fff" />}
            </View>
            <Text style={[styles.markForReviewText, { color: themeColors.text.secondary }]}>Mark for Review</Text>
          </TouchableOpacity>
        )}
      </View>

      {renderFieldInput()}

      {/* Condition Dropdown */}
      {!!safeField.includeCondition && (
        <View style={styles.dropdownContainer}>
          <Text style={[styles.dropdownLabel, { color: themeColors.text.primary }]}>Condition</Text>
          <Select
            value={localCondition || ''}
            options={[
              { label: 'New', value: 'New' },
              { label: 'Excellent', value: 'Excellent' },
              { label: 'Good', value: 'Good' },
              { label: 'Fair', value: 'Fair' },
              { label: 'Poor', value: 'Poor' },
              { label: 'Missing', value: 'Missing' },
            ]}
            placeholder="Select condition"
            onValueChange={(val) => {
              try {
                handleConditionChange(val || '');
              } catch (error) {
                console.error('[FieldWidget] Error in condition dropdown onChange:', error);
              }
            }}
            disabled={disabled}
            testID={`select-condition-${field.id || field.key}`}
          />
        </View>
      )}

      {/* Cleanliness Dropdown */}
      {!!safeField.includeCleanliness && (
        <View style={styles.dropdownContainer}>
          <Text style={[styles.dropdownLabel, { color: themeColors.text.primary }]}>Cleanliness</Text>
          <Select
            value={localCleanliness || ''}
            options={[
              { label: 'Excellent', value: 'Excellent' },
              { label: 'Good', value: 'Good' },
              { label: 'Fair', value: 'Fair' },
              { label: 'Poor', value: 'Poor' },
              { label: 'Very Poor', value: 'Very Poor' },
            ]}
            placeholder="Select cleanliness"
            onValueChange={(val) => {
              try {
                handleCleanlinessChange(val || '');
              } catch (error) {
                console.error('[FieldWidget] Error in cleanliness dropdown onChange:', error);
              }
            }}
            disabled={disabled}
            testID={`select-cleanliness-${field.id || field.key}`}
          />
        </View>
      )}

      {/* AI Analysis Button - for photo fields */}
      {inspectionId && (safeField.type === 'photo' || safeField.type === 'photo_array') && localPhotos.length > 0 && (
        <Card style={styles.aiButtonCard}>
          <TouchableOpacity
            style={[
              styles.aiButton,
              (!isOnline || analyzingField) && styles.aiButtonDisabled
            ]}
            onPress={handleAnalyzeField}
            disabled={!!(analyzingField || !isOnline)}
            activeOpacity={(!isOnline || analyzingField) ? 1 : 0.7}
          >
            {analyzingField ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Sparkles size={16} color="#fff" />
            )}
            <Text style={styles.aiButtonText}>
              {analyzingField ? 'Analyzing...' : 'Analyze Field with AI'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.aiButtonDescription}>
            {analyzingField
              ? 'Analyzing images with AI...'
              : !isOnline
              ? 'AI analysis requires an internet connection'
              : 'Use AI to analyze all photos and generate a detailed inspection report'}
          </Text>
        </Card>
      )}

      {/* Notes - now shown for ALL field types including photo fields */}
      <View style={styles.notesContainer}>
        <Text style={[styles.notesLabel, { color: themeColors.text.secondary }]}>Notes (optional)</Text>
        <Input
          value={localNote}
          onChangeText={handleNoteChange}
          placeholder="Add any observations or notes..."
          multiline={true}
          style={styles.notesInput}
        />
        {localNote && localNote.length > 0 && (
          <View style={styles.notesIndicator}>
            <Sparkles size={12} color={themeColors.primary.DEFAULT} />
            <Text style={styles.notesIndicatorText}>
              {localNote.includes('AI') || localNote.length > 200 ? 'AI Analysis added' : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Maintenance Logging */}
      {localPhotos.length > 0 && onLogMaintenance && (
        <TouchableOpacity
          style={styles.maintenanceButton}
          onPress={() => onLogMaintenance?.(safeField.label, localPhotos)}
        >
          <Wrench size={16} color={themeColors.warning} />
          <Text style={styles.maintenanceButtonText}>Log Maintenance</Text>
        </TouchableOpacity>
      )}

      {/* Signature Modal */}
      {safeField.type === 'signature' && showSignature && (
        <Modal
          visible={!!showSignature}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowSignature(false)}
        >
          <View style={styles.signatureModalContainer}>
            <View style={styles.signatureModalContent}>
              <Text style={styles.signatureModalTitle}>Sign Here</Text>
              <View style={styles.signatureCanvasContainer}>
                <SignatureCanvas
                  ref={(ref: any) => {
                    signatureRef.current = ref;
                  }}
                  onOK={(signature) => {
                    handleValueChange(signature);
                    setShowSignature(false);
                  }}
                  onClear={() => {
                    // Clear the signature when user taps Clear
                  }}
                  descriptionText=""
                  clearText="Clear"
                  confirmText=""
                  webStyle={`
                    .m-signature-pad {
                      box-shadow: none;
                      border: 1px solid ${colors.border.DEFAULT};
                      border-radius: ${borderRadius.md}px;
                    }
                    .m-signature-pad--footer {
                      display: none;
                    }
                  `}
                />
              </View>
              <View style={styles.signatureModalActions}>
                <Button
                  title="Cancel"
                  onPress={() => setShowSignature(false)}
                  variant="outline"
                  style={styles.signatureCancelButton}
                />
                <Button
                  title="Save"
                  onPress={() => {
                    if (signatureRef.current) {
                      // Get signature data from the canvas
                      signatureRef.current.readSignature();
                    }
                  }}
                  variant="default"
                  style={styles.signatureSaveButton}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Photo Picker Modal */}
      <Modal
        visible={!!showPhotoPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPhotoPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Photo</Text>
            <Button
              title="Take Photo"
              onPress={handleTakePhoto}
              variant="default"
            />
            <Button
              title="Choose from Library"
              onPress={handlePickPhoto}
              variant="secondary"
            />
            <Button
              title="Cancel"
              onPress={() => setShowPhotoPicker(false)}
              variant="outline"
            />
          </View>
        </View>
      </Modal>

      {/* Photo Viewer Modal */}
      <Modal
        visible={!!showPhotoViewer}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPhotoViewer(false)}
      >
        <View style={styles.photoViewerContainer}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setShowPhotoViewer(false)}
          >
            <X size={24} color="#fff" />
          </TouchableOpacity>
          {selectedPhoto && (
            <Image 
              source={isLocalPath(selectedPhoto) ? getImageSource(selectedPhoto) : { uri: selectedPhoto }} 
              style={styles.photoViewer} 
              resizeMode="contain" 
            />
          )}
        </View>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing[4],
    padding: spacing[4],
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  fieldLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    flex: 1,
    // Color applied dynamically via themeColors
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
    // Color applied dynamically via themeColors
  },
  required: {
    // Color applied dynamically via themeColors
  },
  markForReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  markCheckbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: colors.primary.DEFAULT,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markCheckboxChecked: {
    backgroundColor: colors.primary.DEFAULT,
  },
  markForReviewText: {
    fontSize: typography.fontSize.sm,
    // Color applied dynamically via themeColors
  },
  selectContainer: {
    marginBottom: spacing[4],
  },
  optionButton: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
    backgroundColor: colors.secondary.DEFAULT,
    marginRight: spacing[2],
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  optionButtonSelected: {
    backgroundColor: colors.primary.DEFAULT,
    borderColor: colors.primary.border,
  },
  optionText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  optionTextSelected: {
    color: colors.primary.foreground,
    fontWeight: typography.fontWeight.semibold,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.primary.DEFAULT,
    borderRadius: borderRadius.sm,
    marginRight: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary.DEFAULT,
  },
  checkmark: {
    fontSize: 16,
    fontWeight: typography.fontWeight.bold,
    // Color applied dynamically via themeColors
  },
  checkboxLabel: {
    fontSize: typography.fontSize.base,
    // Color applied dynamically via themeColors
  },
  dropdownContainer: {
    marginTop: spacing[4],
    marginBottom: spacing[2],
  },
  dropdownLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
    // Color applied dynamically via themeColors
  },
  ratingContainer: {
    marginBottom: spacing[4],
  },
  ratingLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
    // Color applied dynamically via themeColors
  },
  starsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  starButton: {
    padding: spacing[1],
  },
  ratingText: {
    fontSize: typography.fontSize.sm,
    marginLeft: spacing[2],
    // Color applied dynamically via themeColors
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  signatureContainer: {
    marginBottom: spacing[4],
  },
  signatureButton: {
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
    padding: spacing[6],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted.DEFAULT,
  },
  signatureButtonText: {
    fontSize: typography.fontSize.base,
    // Color applied dynamically via themeColors
  },
  signatureButtonDisabled: {
    opacity: 0.5,
    backgroundColor: colors.muted.DEFAULT,
  },
  signatureButtonTextDisabled: {
    // Color applied dynamically via themeColors
  },
  optionButtonDisabled: {
    opacity: 0.5,
  },
  checkboxContainerDisabled: {
    opacity: 0.5,
  },
  signaturePreview: {
    alignItems: 'center',
    gap: spacing[2],
  },
  signatureImage: {
    width: '100%',
    height: 150,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  signatureModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signatureModalContent: {
    backgroundColor: colors.card.DEFAULT,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    width: '90%',
    maxHeight: '80%',
  },
  signatureModalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing[4],
    textAlign: 'center',
    color: colors.text.primary,
  },
  signatureCanvasContainer: {
    height: 300,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginBottom: spacing[4],
  },
  signatureModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  signatureCancelButton: {
    flex: 1,
  },
  signatureSaveButton: {
    flex: 1,
  },
  autoFieldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  autoInput: {
    flex: 1,
    backgroundColor: colors.muted.DEFAULT,
  },
  photoFieldContainer: {
    marginBottom: spacing[4],
  },
  checkInReferenceCard: {
    marginBottom: spacing[4],
    backgroundColor: colors.primary.light || '#E0F7FA',
    borderWidth: 1,
    borderColor: colors.primary.DEFAULT,
  },
  checkInReferenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  checkInReferenceTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    // Color applied dynamically via themeColors
  },
  checkInReferenceText: {
    fontSize: typography.fontSize.xs,
    marginBottom: spacing[2],
    // Color applied dynamically via themeColors
  },
  checkInPhotosContainer: {
    marginTop: spacing[2],
  },
  checkInPhoto: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
    marginRight: spacing[2],
  },
  photoSection: {
    marginBottom: spacing[4],
    padding: spacing[3],
    backgroundColor: colors.card.DEFAULT,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
    paddingBottom: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  photoLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    // Color applied dynamically via themeColors
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary.DEFAULT,
    ...shadows.sm,
  },
  photoButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    // Color applied dynamically via themeColors
  },
  photosContainer: {
    marginBottom: spacing[3],
    paddingVertical: spacing[2],
  },
  photoItem: {
    position: 'relative',
    marginRight: spacing[3],
    marginBottom: spacing[2],
    padding: spacing[2],
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    ...shadows.xs,
  },
  photoThumbnail: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    backgroundColor: colors.muted.DEFAULT,
  },
  photoActions: {
    position: 'absolute',
    top: spacing[1],
    right: spacing[1],
    flexDirection: 'row',
    gap: spacing[1],
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: borderRadius.md,
    padding: spacing[1] / 2,
    ...shadows.sm,
  },
  photoActionButton: {
    backgroundColor: colors.primary.DEFAULT,
    borderRadius: borderRadius.full,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  removePhotoButton: {
    backgroundColor: colors.destructive.DEFAULT,
    borderRadius: borderRadius.full,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  analysisBadge: {
    position: 'absolute',
    bottom: spacing[1],
    left: spacing[1],
    backgroundColor: colors.primary.DEFAULT,
    borderRadius: borderRadius.full,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    ...shadows.xs,
  },
  aiButtonCard: {
    marginBottom: spacing[4],
    backgroundColor: colors.primary.light || '#E0F7FA',
    borderWidth: 1,
    borderColor: colors.primary.DEFAULT + '33',
    padding: spacing[3],
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.DEFAULT,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
  },
  aiButtonDisabled: {
    backgroundColor: colors.muted || '#9CA3AF',
    opacity: 0.6,
    borderRadius: borderRadius.lg,
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  aiButtonText: {
    color: colors.primary.foreground || '#ffffff',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  aiButtonDescription: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    paddingHorizontal: spacing[1],
  },
  notesContainer: {
    marginTop: spacing[3],
    marginBottom: spacing[4],
  },
  notesLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
    // Color applied dynamically via themeColors
  },
  notesInput: {
    minHeight: 80,
  },
  notesIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[2],
    paddingHorizontal: spacing[2],
  },
  notesIndicatorText: {
    fontSize: typography.fontSize.xs,
    color: colors.primary.DEFAULT,
    fontWeight: typography.fontWeight.medium,
  },
  maintenanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning + '20',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
    gap: spacing[2],
    borderWidth: 1,
    borderColor: colors.warning,
    marginTop: spacing[2],
  },
  maintenanceButtonText: {
    color: colors.warning,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card.DEFAULT,
    borderRadius: 12,
    padding: 24,
    width: '80%',
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  photoViewerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 8,
  },
  photoViewer: {
    width: '100%',
    height: '100%',
  },
});

export const FieldWidget = React.memo(FieldWidgetComponent);
