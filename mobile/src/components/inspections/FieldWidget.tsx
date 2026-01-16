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
import { colors, spacing, typography, borderRadius } from '../../theme';
import Badge from '../ui/Badge';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { apiRequestJson } from '../../services/api';
import Constants from 'expo-constants';

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

export function FieldWidget({
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
}: FieldWidgetProps) {
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

  const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5005';

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
      setLocalValue(parseValue(value.value));
      setLocalCondition(value.condition);
      setLocalCleanliness(value.cleanliness);
    } else {
      setLocalValue(parseValue(value));
    }
  }, [value, safeField.includeCondition, safeField.includeCleanliness]);

  useEffect(() => {
    setLocalNote(note || '');
  }, [note]);

  useEffect(() => {
    setLocalPhotos(photos);
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
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Media library permission is required to select photos');
      return false;
    }
    return true;
  };

  // Upload photo to server
  const uploadPhoto = async (uri: string): Promise<string> => {
    try {
      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Get file extension
      const extension = uri.split('.').pop() || 'jpg';
      const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';

      // Upload to server using the direct upload endpoint
      const formData = new FormData();
      formData.append('file', {
        uri,
        type: mimeType,
        name: `photo.${extension}`,
      } as any);

      const response = await fetch(`${API_URL}/api/objects/upload-direct`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to upload photo');
      }

      const data = await response.json();
      // The endpoint returns { url, uploadURL } - use url or uploadURL
      return data.url || data.uploadURL || data.path || data.objectUrl || `/objects/${data.objectId}`;
    } catch (error) {
      console.error('Error uploading photo:', error);
      throw error;
    }
  };

  const handleTakePhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setUploadingPhotos(prev => ({ ...prev, [uri]: true }));
        
        try {
          const uploadedUrl = await uploadPhoto(uri);
          const newPhotos = [...localPhotos, uploadedUrl];
          setLocalPhotos(newPhotos);
          const composedValue = composeValue(localValue, localCondition, localCleanliness);
          onChange(composedValue, localNote, newPhotos);
        } catch (error) {
          Alert.alert('Error', 'Failed to upload photo');
        } finally {
          setUploadingPhotos(prev => {
            const newState = { ...prev };
            delete newState[uri];
            return newState;
          });
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
    }
    setShowPhotoPicker(false);
  };

  const handlePickPhoto = async () => {
    const hasPermission = await requestMediaLibraryPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (!result.canceled && result.assets) {
        const uris = result.assets.map(asset => asset.uri);
        const newPhotos: string[] = [];
        
        for (const uri of uris) {
          setUploadingPhotos(prev => ({ ...prev, [uri]: true }));
          try {
            const uploadedUrl = await uploadPhoto(uri);
            newPhotos.push(uploadedUrl);
          } catch (error) {
            Alert.alert('Error', `Failed to upload photo: ${uri}`);
          } finally {
            setUploadingPhotos(prev => {
              const newState = { ...prev };
              delete newState[uri];
              return newState;
            });
          }
        }

        const updatedPhotos = [...localPhotos, ...newPhotos];
        setLocalPhotos(updatedPhotos);
        const composedValue = composeValue(localValue, localCondition, localCleanliness);
        onChange(composedValue, localNote, updatedPhotos);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick photo');
    }
    setShowPhotoPicker(false);
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
            value={localValue || ''}
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
            value={localValue || ''}
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
            value={localValue || ''}
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
            >
              <CameraIcon size={20} color={colors.primary.DEFAULT} />
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
                      {hasAnalysis && (
                        <View style={styles.analysisBadge}>
                          <Sparkles size={12} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                    <View style={styles.photoActions}>
                      <TouchableOpacity
                        style={styles.photoActionButton}
                        onPress={() => handleAnalyzePhoto(photo)}
                        disabled={!!isAnalyzing}
                      >
                        {isAnalyzing ? (
                          <ActivityIndicator size="small" color={colors.primary.DEFAULT} />
                        ) : (
                          <Sparkles size={16} color={colors.primary.DEFAULT} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.removePhotoButton}
                        onPress={() => handleRemovePhoto(photo)}
                      >
                        <X size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {localPhotos.length > 0 && (
            <TouchableOpacity
              style={styles.aiButton}
              onPress={handleAnalyzeField}
              disabled={!!analyzingField}
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
                  size={32}
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
                  size={32}
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

      {/* Notes - only show if not a photo field (photo fields have notes in their section) */}
      {safeField.type !== 'photo' && safeField.type !== 'photo_array' && (
        <Input
          label="Notes (optional)"
          value={localNote}
          onChangeText={handleNoteChange}
          placeholder="Add any observations or notes..."
          multiline={true}
        />
      )}

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
                  onOK={(signature) => {
                    handleValueChange(signature);
                    setShowSignature(false);
                  }}
                  onClear={() => {
                    handleValueChange('');
                  }}
                  descriptionText=""
                  clearText="Clear"
                  confirmText="Save"
                  webStyle={`
                    .m-signature-pad {
                      box-shadow: none;
                      border: 1px solid ${colors.border.DEFAULT};
                      border-radius: ${borderRadius.md}px;
                    }
                  `}
                />
              </View>
              <View style={styles.signatureModalActions}>
                <Button
                  title="Cancel"
                  onPress={() => setShowSignature(false)}
                  variant="secondary"
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
              variant="primary"
            />
            <Button
              title="Choose from Library"
              onPress={handlePickPhoto}
              variant="secondary"
            />
            <Button
              title="Cancel"
              onPress={() => setShowPhotoPicker(false)}
              variant="secondary"
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
    justifyContent: 'flex-end',
    gap: spacing[2],
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
  },
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  photoLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.md,
    backgroundColor: colors.secondary.DEFAULT,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  photoButtonText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary.DEFAULT,
    fontWeight: typography.fontWeight.medium,
  },
  photosContainer: {
    marginBottom: spacing[3],
  },
  photoItem: {
    position: 'relative',
    marginRight: spacing[3],
  },
  photoThumbnail: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  photoActions: {
    position: 'absolute',
    top: -8,
    right: -8,
    flexDirection: 'row',
    gap: spacing[1],
  },
  photoActionButton: {
    backgroundColor: colors.primary.DEFAULT,
    borderRadius: borderRadius.full,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoButton: {
    backgroundColor: colors.destructive.DEFAULT,
    borderRadius: borderRadius.full,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analysisBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: colors.primary.DEFAULT,
    borderRadius: borderRadius.full,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary.DEFAULT,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
    gap: spacing[2],
    marginTop: spacing[2],
  },
  aiButtonText: {
    color: colors.primary.foreground,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
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

