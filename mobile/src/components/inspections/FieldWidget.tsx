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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import Input from '../ui/Input';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { Star, Camera as CameraIcon, Image as ImageIcon, X, Sparkles, Wrench, Trash2, Calendar, Clock, Eye, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { inspectionsService } from '../../services/inspections';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system';
import SignatureCanvas from 'react-native-signature-canvas';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import Badge from '../ui/Badge';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { apiRequestJson, API_URL } from '../../services/api';

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
    autoContext,
    onChange,
    onMarkedForReviewChange,
    onLogMaintenance,
  } = props;
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  // Normalize field object to ensure all boolean properties are actual booleans
  const safeField = useMemo(() => {
    const normalized: TemplateField = { ...field };
    // Ensure all boolean properties are actual booleans, not strings
    if (typeof normalized.required === 'string') {
      normalized.required = normalized.required.toLowerCase() === 'true';
    } else {
      normalized.required = !!normalized.required;
    }
    if (typeof normalized.includeCondition === 'string') {
      normalized.includeCondition = normalized.includeCondition.toLowerCase() === 'true';
    } else {
      normalized.includeCondition = !!normalized.includeCondition;
    }
    if (typeof normalized.includeCleanliness === 'string') {
      normalized.includeCleanliness = normalized.includeCleanliness.toLowerCase() === 'true';
    } else {
      normalized.includeCleanliness = !!normalized.includeCleanliness;
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
  const [localCondition, setLocalCondition] = useState<number | undefined>(
    value?.condition
  );
  const [localCleanliness, setLocalCleanliness] = useState<number | undefined>(
    value?.cleanliness
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
    if (value && typeof value === 'object' && (!!safeField.includeCondition || !!safeField.includeCleanliness)) {
      const parsedValue = parseValue(value.value);
      setLocalValue(parsedValue);
      setLocalCondition(value.condition);
      setLocalCleanliness(value.cleanliness);
    } else {
      setLocalValue(parseValue(value));
    }
  }, [value, safeField.includeCondition, safeField.includeCleanliness]);

  useEffect(() => {
    if (note !== undefined && localNote !== note) {
      setLocalNote(note || '');
    }
  }, [note]);

  useEffect(() => {
    // Only update if the prop has changed and is different from local state
    if (photos && JSON.stringify(localPhotos) !== JSON.stringify(photos)) {
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
    setLocalValue(newValue);
    const composedValue = composeValue(newValue, localCondition, localCleanliness);
    onChange(composedValue, localNote, localPhotos);
  };

  const handleNoteChange = (newNote: string) => {
    setLocalNote(newNote);
    const composedValue = composeValue(localValue, localCondition, localCleanliness);
    onChange(composedValue, newNote, localPhotos);
  };

  const handleConditionChange = (rating: number) => {
    setLocalCondition(rating);
    const composedValue = composeValue(localValue, rating, localCleanliness);
    onChange(composedValue, localNote, localPhotos);
  };

  const handleCleanlinessChange = (rating: number) => {
    setLocalCleanliness(rating);
    const composedValue = composeValue(localValue, localCondition, rating);
    onChange(composedValue, localNote, localPhotos);
  };

  const composeValue = (val: any, condition?: number, cleanliness?: number) => {
    const includeCondition = !!safeField.includeCondition;
    const includeCleanliness = !!safeField.includeCleanliness;
    if (includeCondition || includeCleanliness) {
      return {
        value: val,
        ...(includeCondition && { condition }),
        ...(includeCleanliness && { cleanliness }),
      };
    }
    return val;
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
      const response = await fetch(`${API_URL}/api/ai-analyses`, {
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

  // Upload photo to server
  const uploadPhoto = async (uri: string): Promise<string> => {
    try {
      // Read file extension
      const extension = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';

      // Create FormData for React Native
      const formData = new FormData();
      formData.append('file', {
        uri,
        type: mimeType,
        name: `photo.${extension}`,
      } as any);

      // Construct full URL (API_URL should already be a full URL)
      const uploadUrl = API_URL.startsWith('http') 
        ? `${API_URL}/api/objects/upload-direct`
        : `/api/objects/upload-direct`; // Fallback - but API_URL should always have http

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for file uploads

      try {
        // For FormData, React Native automatically sets Content-Type with boundary
        // DO NOT set Content-Type manually - it will break the upload
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            // Only set non-content-type headers
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
          },
          body: formData,
          credentials: 'include',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = 'Failed to upload photo';
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch {
            errorMessage = errorText || `Server error: ${response.status} ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        // The endpoint returns { url, uploadURL } - use url or uploadURL
        return data.url || data.uploadURL || data.path || data.objectUrl || `/objects/${data.objectId}`;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        // Handle abort (timeout)
        if (fetchError.name === 'AbortError') {
          throw new Error('Upload timeout. Please check your internet connection and try again.');
        }

        // Handle network errors
        if (fetchError.message?.includes('Network request failed') || 
            fetchError.message?.includes('Failed to fetch') ||
            fetchError.message?.includes('ERR_CONNECTION_REFUSED')) {
          throw new Error(
            `Cannot connect to server at ${API_URL}. ` +
            `Please check your internet connection and ensure the backend server is running.`
          );
        }

        throw fetchError;
      }
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      // Re-throw with more context if it's not already a proper error
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(error?.message || 'Failed to upload photo');
    }
  };

  const handleTakePhoto = async () => {
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
        const uploadedUrl = await uploadPhoto(uri);
        const newPhotos = [...localPhotos, uploadedUrl];
        setLocalPhotos(newPhotos);
        const composedValue = composeValue(localValue, localCondition, localCleanliness);
        onChange(composedValue, localNote, newPhotos);
      } catch (uploadError: any) {
        console.error('Error uploading photo:', uploadError);
        Alert.alert(
          'Upload Failed',
          uploadError.message || 'Failed to upload photo. Please check your internet connection and try again.'
        );
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

      for (const uri of uris) {
        setUploadingPhotos(prev => ({ ...prev, [uri]: true }));
        try {
          const uploadedUrl = await uploadPhoto(uri);
          newPhotos.push(uploadedUrl);
        } catch (uploadError: any) {
          hasUploadError = true;
          console.error('Error uploading photo:', uploadError);
          // Don't show alert for each photo, just log it
          // The error will be shown at the end if no photos were uploaded
        } finally {
          setUploadingPhotos(prev => {
            const newState = { ...prev };
            delete newState[uri];
            return newState;
          });
        }
      }

      if (newPhotos.length > 0) {
        const updatedPhotos = [...localPhotos, ...newPhotos];
        setLocalPhotos(updatedPhotos);
        const composedValue = composeValue(localValue, localCondition, localCleanliness);
        onChange(composedValue, localNote, updatedPhotos);
        
        if (hasUploadError && newPhotos.length < uris.length) {
          Alert.alert(
            'Partial Success',
            `Successfully uploaded ${newPhotos.length} of ${uris.length} photos. Some photos failed to upload.`
          );
        }
      } else if (hasUploadError) {
        Alert.alert('Upload Failed', 'Failed to upload photos. Please check your internet connection and try again.');
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

  const handleRemovePhoto = (photoUrl: string) => {
    const newPhotos = localPhotos.filter(p => p !== photoUrl);
    setLocalPhotos(newPhotos);
    const composedValue = composeValue(localValue, localCondition, localCleanliness);
    onChange(composedValue, localNote, newPhotos);
  };

  const handleAnalyzeField = async () => {
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
          />
        );

      case 'select':
      case 'dropdown':
        return (
          <View style={styles.selectContainer}>
            <Text style={styles.label}>
              {safeField.label}
              {!!safeField.required && <Text style={styles.required}> *</Text>}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
              {safeField.options?.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.optionButton,
                    localValue === option && styles.optionButtonSelected,
                  ]}
                  onPress={() => handleValueChange(option)}
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
            style={styles.checkboxContainer}
            onPress={() => handleValueChange(!boolValue)}
          >
            <View style={[styles.checkbox, boolValue && styles.checkboxChecked]}>
              {boolValue && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>{safeField.label}</Text>
          </TouchableOpacity>
        );

      case 'date':
        return (
          <View style={styles.dateContainer}>
            <Calendar size={20} color={colors.text.muted} />
            <Input
              label={safeField.label}
              value={localValue || ''}
              onChangeText={handleValueChange}
              placeholder="YYYY-MM-DD"
              required={!!safeField.required}
            />
          </View>
        );

      case 'time':
        return (
          <View style={styles.dateContainer}>
            <Clock size={20} color={colors.text.muted} />
            <Input
              label={safeField.label}
              value={localValue || ''}
              onChangeText={handleValueChange}
              placeholder="HH:MM"
              required={!!safeField.required}
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
          />
        );

      case 'signature':
        return (
          <View style={styles.signatureContainer}>
            <Text style={styles.label}>
              {safeField.label}
              {!!safeField.required && <Text style={styles.required}> *</Text>}
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
                <Text style={styles.signatureButtonText}>Tap to Sign</Text>
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
              <Eye size={16} color={colors.primary.DEFAULT} />
              <Text style={styles.checkInReferenceTitle}>Check-In Reference Photos</Text>
            </View>
            <Text style={styles.checkInReferenceText}>
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
                        ? `${API_URL}${photoUrl}`
                        : `${API_URL}/objects/${photoUrl}`
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
            <Text style={styles.photoLabel}>
              {safeField.label}
              {!!safeField.required && <Text style={styles.required}> *</Text>}
            </Text>
            <TouchableOpacity
              style={styles.photoButton}
              onPress={() => setShowPhotoPicker(true)}
              activeOpacity={0.8}
            >
              <CameraIcon size={18} color={colors.primary.foreground || '#ffffff'} />
              <Text style={styles.photoButtonText}>Add Photo</Text>
            </TouchableOpacity>
          </View>

          {localPhotos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} style={styles.photosContainer}>
              {localPhotos.map((photo, index) => {
                const photoUrl = photo.startsWith('http') ? photo : `${API_URL}${photo}`;
                const hasAnalysis = aiAnalyses[photo];
                const isAnalyzing = analyzingPhoto === photo;

                return (
                  <View key={index} style={styles.photoItem}>
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedPhoto(photoUrl);
                        setShowPhotoViewer(true);
                      }}
                    >
                      <Image source={{ uri: photoUrl }} style={styles.photoThumbnail} />
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
        <Text style={styles.fieldLabel}>
          {safeField.label}
          {!!safeField.required && <Text style={styles.required}> *</Text>}
        </Text>
        {!!isCheckOut && (safeField.type === 'photo' || safeField.type === 'photo_array') && (
          <TouchableOpacity
            style={styles.markForReviewButton}
            onPress={() => handleMarkedForReviewChange(!localMarkedForReview)}
          >
            <View style={[styles.markCheckbox, localMarkedForReview && styles.markCheckboxChecked]}>
              {localMarkedForReview && <CheckCircle2 size={16} color="#fff" />}
            </View>
            <Text style={styles.markForReviewText}>Mark for Review</Text>
          </TouchableOpacity>
        )}
      </View>

      {renderFieldInput()}

      {/* Condition Rating */}
      {!!safeField.includeCondition && (
        <View style={styles.ratingContainer}>
          <Text style={styles.ratingLabel}>Condition Rating</Text>
          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((rating) => (
              <TouchableOpacity
                key={rating}
                onPress={() => handleConditionChange(rating)}
                style={styles.starButton}
              >
                <Star
                  size={24}
                  color={rating <= (localCondition || 0) ? '#FFD700' : colors.text.muted}
                  fill={rating <= (localCondition || 0) ? '#FFD700' : 'transparent'}
                />
              </TouchableOpacity>
            ))}
            {localCondition && (
              <Text style={styles.ratingText}>{localCondition} / 5</Text>
            )}
          </View>
        </View>
      )}

      {/* Cleanliness Rating */}
      {!!safeField.includeCleanliness && (
        <View style={styles.ratingContainer}>
          <Text style={styles.ratingLabel}>Cleanliness Rating</Text>
          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((rating) => (
              <TouchableOpacity
                key={rating}
                onPress={() => handleCleanlinessChange(rating)}
                style={styles.starButton}
              >
                <Star
                  size={24}
                  color={rating <= (localCleanliness || 0) ? '#FFD700' : colors.text.muted}
                  fill={rating <= (localCleanliness || 0) ? '#FFD700' : 'transparent'}
                />
              </TouchableOpacity>
            ))}
            {localCleanliness && (
              <Text style={styles.ratingText}>{localCleanliness} / 5</Text>
            )}
          </View>
        </View>
      )}

      {/* AI Analysis Button - for photo fields */}
      {inspectionId && (safeField.type === 'photo' || safeField.type === 'photo_array') && localPhotos.length > 0 && (
        <Card style={styles.aiButtonCard}>
          <TouchableOpacity
            style={styles.aiButton}
            onPress={handleAnalyzeField}
            disabled={!!(analyzingField || !isOnline)}
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
              : 'Use AI to analyze all photos and generate a detailed inspection report'}
          </Text>
        </Card>
      )}

      {/* Notes - now shown for ALL field types including photo fields */}
      <View style={styles.notesContainer}>
        <Text style={styles.notesLabel}>Notes (optional)</Text>
        <Input
          value={localNote}
          onChangeText={handleNoteChange}
          placeholder="Add any observations or notes..."
          multiline={true}
          style={styles.notesInput}
        />
        {localNote && localNote.length > 0 && (
          <View style={styles.notesIndicator}>
            <Sparkles size={12} color={colors.primary.DEFAULT} />
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
          onPress={() => onLogMaintenance(safeField.label, localPhotos)}
        >
          <Wrench size={16} color={colors.warning} />
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
            <Image source={{ uri: selectedPhoto }} style={styles.photoViewer} resizeMode="contain" />
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
    color: colors.text.primary,
    flex: 1,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
    color: colors.text.primary,
  },
  required: {
    color: colors.destructive.DEFAULT,
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
    color: colors.text.secondary,
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
    color: colors.primary.foreground,
    fontSize: 16,
    fontWeight: typography.fontWeight.bold,
  },
  checkboxLabel: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  ratingContainer: {
    marginBottom: spacing[4],
  },
  ratingLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
    color: colors.text.primary,
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
    color: colors.text.secondary,
    marginLeft: spacing[2],
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
    color: colors.text.secondary,
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
    backgroundColor: colors.primary.light,
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
    color: colors.text.primary,
  },
  checkInReferenceText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginBottom: spacing[2],
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
    color: colors.text.primary,
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
    color: colors.primary.foreground || '#ffffff',
    fontWeight: typography.fontWeight.semibold,
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
    backgroundColor: colors.primary.light || `${colors.primary.DEFAULT}15`,
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
    color: colors.text.secondary,
    marginBottom: spacing[2],
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
    backgroundColor: '#fff',
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
