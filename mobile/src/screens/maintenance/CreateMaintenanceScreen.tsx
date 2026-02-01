import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  TouchableOpacity,
  Modal,
  ImageStyle,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Upload, Sparkles, X, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { maintenanceService, type MaintenanceRequestWithDetails } from '../../services/maintenance';
import { propertiesService } from '../../services/properties';
import { apiRequestJson, getAPI_URL } from '../../services/api';
import type { MaintenanceStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import DatePicker from '../../components/ui/DatePicker';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { format, parse, isValid } from 'date-fns';
import { moderateScale, getFontSize } from '../../utils/responsive';
import { useWindowDimensions } from 'react-native';

type RoutePropType = RouteProp<MaintenanceStackParamList, 'CreateMaintenance'>;

type FormStep = 'form' | 'images' | 'suggestions' | 'review';

export default function CreateMaintenanceScreen() {
  const route = useRoute<RoutePropType>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const windowDimensions = useWindowDimensions();
  const screenWidth = windowDimensions?.width || Dimensions.get('window').width;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const theme = useTheme();
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  const params = route.params;
  const requestId = params?.requestId;

  const isTenant = user?.role === 'tenant';
  const isEditMode = !!requestId;

  // Form state
  const [currentStep, setCurrentStep] = useState<FormStep>(isTenant && !isEditMode ? 'form' : 'form');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [propertyId, setPropertyId] = useState<string>('');
  const [blockId, setBlockId] = useState<string>('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [formBlockFilter, setFormBlockFilter] = useState<string>('all');
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);

  // Fetch existing request for edit mode
  const { data: existingRequest, isLoading: isLoadingRequest, error: requestError } = useQuery({
    queryKey: ['/api/maintenance', requestId],
    queryFn: () => maintenanceService.getMaintenanceRequest(requestId!),
    enabled: !!requestId,
  });

  // Fetch properties and blocks
  const { data: properties = [] } = useQuery({
    queryKey: ['/api/properties'],
    queryFn: () => propertiesService.getProperties(),
  });

  const { data: blocks = [] } = useQuery({
    queryKey: ['/api/blocks'],
    queryFn: () => propertiesService.getBlocks(),
  });

  // Filter properties by block
  const filteredProperties = formBlockFilter === 'all'
    ? properties
    : properties.filter(p => p.blockId === formBlockFilter);

  // Load existing request data for edit mode - use ref to prevent re-initialization after user changes
  const initializedRef = useRef<string | null>(null);

  // Reset ref when requestId changes (different request being edited)
  useEffect(() => {
    if (requestId) {
      initializedRef.current = null;
      // Reset form fields when switching to a different request
      setTitle('');
      setDescription('');
      setPropertyId('');
      setBlockId('');
      setPriority('medium');
      setDueDate('');
      setUploadedImages([]);
      setAiSuggestions('');
      setFormBlockFilter('all');
    }
  }, [requestId]);

  // Load existing request data for edit mode
  useEffect(() => {
    // Only initialize if we have data, are in edit mode, and haven't already initialized for this request
    if (!existingRequest || !isEditMode || !requestId) {
      return;
    }

    // Check if we've already initialized for this request
    if (initializedRef.current === requestId) {
      console.log('[Edit Mode] Already initialized for request:', requestId);
      return;
    }

    console.log('[Edit Mode] Initializing form with maintenance request data:', {
      requestId,
      title: existingRequest.title,
      propertyId: existingRequest.propertyId,
      blockId: existingRequest.blockId,
      priority: existingRequest.priority,
      dueDate: existingRequest.dueDate,
    });

    // Populate form fields
    setTitle(existingRequest.title || '');
    setDescription(existingRequest.description || '');
    setPropertyId(existingRequest.propertyId || '');
    setBlockId(existingRequest.blockId || '');

    // Handle priority - convert 'urgent' to 'high' for UI
    const priorityValue = existingRequest.priority === 'urgent'
      ? 'high'
      : (existingRequest.priority === 'low' || existingRequest.priority === 'medium' || existingRequest.priority === 'high'
        ? existingRequest.priority
        : 'medium');
    setPriority(priorityValue as 'low' | 'medium' | 'high');

    // Handle due date - support both string and Date formats
    if (existingRequest.dueDate) {
      try {
        const dateValue = typeof existingRequest.dueDate === 'string'
          ? new Date(existingRequest.dueDate)
          : existingRequest.dueDate;
        if (!isNaN(dateValue.getTime()) && isValid(dateValue)) {
          setDueDate(dateValue);
        } else {
          console.warn('[Edit Mode] Invalid date value:', existingRequest.dueDate);
          setDueDate(null);
        }
      } catch (e) {
        console.error('[Edit Mode] Error parsing due date:', e);
        setDueDate(null);
      }
    } else {
      setDueDate(null);
    }

    // Set photos and AI suggestions
    setUploadedImages(existingRequest.photoUrls || []);
    setAiSuggestions(existingRequest.aiSuggestedFixes || '');
    setFormBlockFilter(existingRequest.blockId || 'all');

    // Mark as initialized
    initializedRef.current = requestId;

    console.log('[Edit Mode] Form fields populated successfully:', {
      title: existingRequest.title || '(empty)',
      description: existingRequest.description ? `${existingRequest.description.substring(0, 30)}...` : '(empty)',
      propertyId: existingRequest.propertyId || '(none)',
      blockId: existingRequest.blockId || '(none)',
      priority: priorityValue,
      dueDate: existingRequest.dueDate || '(none)',
      photoCount: existingRequest.photoUrls?.length || 0,
      hasAiSuggestions: !!existingRequest.aiSuggestedFixes,
    });
  }, [existingRequest, isEditMode, requestId]);

  // Auto-populate from inspection context - use ref to track initialization per inspection
  const inspectionInitializedRef = useRef<string | null>(null);

  useEffect(() => {
    // Only initialize from inspection context if not in edit mode
    if (isEditMode) {
      return;
    }

    // Reset initialization if inspectionId changed
    const currentInspectionId = params?.inspectionId || 'new';
    if (inspectionInitializedRef.current !== currentInspectionId) {
      inspectionInitializedRef.current = null;
    }

    // Skip if already initialized for this inspection
    if (inspectionInitializedRef.current === currentInspectionId) {
      return;
    }

    let hasChanges = false;

    // Pre-fill property and block from inspection context
    if (params?.propertyId && !propertyId) {
      setPropertyId(params.propertyId);
      hasChanges = true;
    }

    // Set block filter if blockId is provided
    if (params?.blockId && !blockId) {
      setBlockId(params.blockId);
      setFormBlockFilter(params.blockId);
      hasChanges = true;
    }

    // Pre-fill title, description, and photos from field context
    if (params?.fieldLabel) {
      const sectionInfo = params.sectionTitle ? ` in ${params.sectionTitle}` : '';
      setTitle(`Maintenance: ${params.fieldLabel}${sectionInfo}`);
      setDescription(`Maintenance request created from inspection field: ${params.fieldLabel}${sectionInfo}`);
      setPriority('high');
      if (params.photos && params.photos.length > 0) {
        setUploadedImages(params.photos);
      }
      hasChanges = true;
    }

    // Mark as initialized if we made any changes
    if (hasChanges) {
      inspectionInitializedRef.current = currentInspectionId;
    }
  }, [params, isEditMode, propertyId, blockId]);

  // Reset dueDate when switching requests
  useEffect(() => {
    if (requestId) {
      setDueDate(null);
    }
  }, [requestId]);

  // Photo upload function
  const uploadPhoto = async (uri: string): Promise<string> => {
    try {
      // Get upload URL
      const response = await fetch(`${getAPI_URL()}/api/objects/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadURL } = await response.json();

      // Read file as base64
      const fileData = await fetch(uri);
      const blob = await fileData.blob();

      // Upload to S3
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        headers: {
          'Content-Type': blob.type || 'image/jpeg',
        },
        body: blob,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload photo');
      }

      // Extract object path from upload URL
      let objectPath = uploadURL;
      if (objectPath.includes('?objectId=')) {
        const objectId = new URL(uploadURL).searchParams.get('objectId');
        if (objectId) {
          objectPath = `/objects/${objectId}`;
        }
      } else if (objectPath.includes('/objects/')) {
        const match = objectPath.match(/\/objects\/[^?]+/);
        if (match) {
          objectPath = match[0];
        }
      }

      // Set ACL
      const absoluteUrl = objectPath.startsWith('http')
        ? objectPath
        : `${getAPI_URL()}${objectPath}`;

      await fetch(`${getAPI_URL()}/api/objects/set-acl`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrl: absoluteUrl }),
      });

      return objectPath;
    } catch (error: any) {
      console.error('Photo upload error:', error);
      throw new Error(error?.message || 'Failed to upload photo');
    }
  };

  // Handle photo selection
  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera roll permissions to upload photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as any,
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      // Upload all selected photos
      const uploadPromises = result.assets.map(asset => uploadPhoto(asset.uri));
      const uploadedPaths = await Promise.all(uploadPromises);
      setUploadedImages(prev => [...prev, ...uploadedPaths]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to pick images');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera permissions to take photos');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images' as any,
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const uploadedPath = await uploadPhoto(result.assets[0].uri);
      setUploadedImages(prev => [...prev, uploadedPath]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to take photo');
    }
  };

  // AI Analysis mutation
  const analyzeMutation = useMutation({
    mutationFn: async ({ imageUrl, description }: { imageUrl: string; description: string }) => {
      setIsAnalyzing(true);
      // Use longer timeout for AI analysis (2 minutes)
      return apiRequestJson<{ suggestedFixes: string }>(
        'POST',
        '/api/maintenance/analyze-image',
        {
          imageUrl,
          issueDescription: description,
        },
        { timeout: 120000 } // 2 minutes timeout
      );
    },
    onSuccess: (data) => {
      setIsAnalyzing(false);
      setAiSuggestions(data.suggestedFixes);
      if (isTenant) {
        setCurrentStep('suggestions');
      }
      Alert.alert('AI Analysis Complete', 'Review the suggested fixes below');
    },
    onError: (error: any) => {
      setIsAnalyzing(false);
      Alert.alert('Analysis Failed', error.message || 'Failed to analyze image. Please try again.');
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => maintenanceService.createMaintenanceRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance'] });
      Alert.alert('Success', 'Maintenance request created successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to create maintenance request');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: any) => maintenanceService.updateMaintenanceRequest(requestId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance'] });
      Alert.alert('Success', 'Maintenance request updated successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to update maintenance request');
    },
  });

  // Handle image step (for tenants)
  const handleImageStep = async () => {
    if (uploadedImages.length === 0) {
      Alert.alert('Image Required', 'Please upload at least one image of the issue');
      return;
    }

    try {
      await analyzeMutation.mutateAsync({
        imageUrl: uploadedImages[0],
        description: description || title,
      });
    } catch (error) {
      // Error is already handled in mutation's onError
    }
  };

  // Handle form submission
  const handleSubmit = () => {
    // For tenants, require images and show AI suggestions first
    if (isTenant && !isEditMode && currentStep === 'form') {
      setCurrentStep('images');
      return;
    }

    // Validate required fields
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    if (isTenant && !propertyId) {
      Alert.alert('Error', 'Please select a property');
      return;
    }

    // Validate that either property or block is selected (for non-tenants)
    if (!isTenant && !propertyId && !blockId) {
      Alert.alert('Error', 'Either a property or a block must be selected');
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      propertyId: propertyId || undefined,
      blockId: blockId || undefined,
      priority,
      dueDate: dueDate ? dueDate.toISOString() : undefined,
      photoUrls: uploadedImages.length > 0 ? uploadedImages : undefined,
      aiSuggestedFixes: aiSuggestions || undefined,
    };

    if (isEditMode) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  // Show loading spinner while loading existing request data
  if (isLoadingRequest && isEditMode) {
    return <LoadingSpinner />;
  }

  // Show error if request failed to load - but allow retry
  if (requestError && isEditMode) {
    console.error('[Edit Mode] Error loading maintenance request:', requestError);
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 16, 32), backgroundColor: themeColors.card.DEFAULT, borderBottomColor: themeColors.border.light }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.text.primary }]}>Edit Maintenance Request</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: themeColors.text.secondary }]}>
            Failed to load maintenance request.{'\n'}
            {requestError instanceof Error ? requestError.message : 'Please try again.'}
          </Text>
          <View style={styles.errorActions}>
            <Button
              title="Go Back"
              onPress={() => navigation.goBack()}
              variant="outline"
              style={styles.errorButton}
            />
            <Button
              title="Retry"
              onPress={() => {
                queryClient.invalidateQueries({ queryKey: ['/api/maintenance', requestId] });
              }}
              variant="primary"
              style={styles.errorButton}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Tenant multi-step flow
  if (isTenant && !isEditMode) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView
            contentContainerStyle={[
              styles.content,
              {
                paddingTop: spacing[4],
                paddingBottom: Math.max(insets.bottom + 80, 32),
              },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {/* Step 1: Basic Form */}
            {currentStep === 'form' && (
              <Card style={[styles.card, { backgroundColor: themeColors.card.DEFAULT }]}>
                <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Report Maintenance Issue</Text>
                <Input
                  label="What's the issue?"
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g., Leaking faucet"
                />
                <View style={styles.selectContainer}>
                  <Text style={[styles.label, { color: themeColors.text.primary }]}>Which property?</Text>
                  <TouchableOpacity
                    style={[
                      styles.dropdownButton,
                      {
                        borderColor: themeColors.border.light,
                        backgroundColor: themeColors.input,
                      },
                    ]}
                    onPress={() => setShowPropertyPicker(true)}
                  >
                    <Text style={[
                      styles.dropdownText,
                      { color: propertyId ? themeColors.text.primary : themeColors.text.secondary },
                    ]}>
                      {propertyId
                        ? (properties.find(p => p.id === propertyId)?.address ||
                          properties.find(p => p.id === propertyId)?.name ||
                          'Select your property')
                        : 'Select your property'}
                    </Text>
                    <Text style={[styles.dropdownArrow, { color: themeColors.text.secondary }]}>▼</Text>
                  </TouchableOpacity>
                </View>
                <Input
                  label="Details"
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe the issue..."
                  multiline
                  numberOfLines={4}
                  style={styles.textArea}
                />
                <DatePicker
                  label="Due Date (Optional)"
                  value={dueDate}
                  onChange={setDueDate}
                  placeholder="Select due date"
                />
                <Button
                  title="Next: Upload Photos"
                  onPress={handleSubmit}
                  variant="primary"
                  icon={<Upload size={16} color={themeColors.primary.foreground || '#ffffff'} />}
                />
              </Card>
            )}

            {/* Step 2: Image Upload */}
            {currentStep === 'images' && (
              <Card style={[styles.card, { backgroundColor: themeColors.card.DEFAULT }]}>
                <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Upload Photos</Text>
                <Text style={[styles.sectionSubtitle, { color: themeColors.text.secondary }]}>
                  Upload photos of the issue for AI analysis
                </Text>

                <View style={styles.photoActions}>
                  <Button
                    title="Pick from Library"
                    onPress={handlePickPhoto}
                    variant="outline"
                    style={styles.photoButton}
                  />
                  <Button
                    title="Take Photo"
                    onPress={handleTakePhoto}
                    variant="outline"
                    style={styles.photoButton}
                  />
                </View>

                {uploadedImages.length > 0 && (
                  <View style={styles.photosGrid}>
                    {uploadedImages.map((img, idx) => (
                      <View key={idx} style={styles.photoWrapper}>
                        <Image
                          source={{ uri: img.startsWith('http') ? img : `${getAPI_URL()}${img}` }}
                          style={styles.photo as ImageStyle}
                        />
                        <TouchableOpacity
                          style={styles.removePhotoButton}
                          onPress={() => setUploadedImages(prev => prev.filter((_, i) => i !== idx))}
                        >
                          <X size={16} color={themeColors.primary.foreground || '#ffffff'} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={[styles.photoCount, { color: themeColors.text.secondary }]}>
                  {uploadedImages.length} image(s) uploaded
                </Text>

                <View style={styles.stepActions}>
                  <Button
                    title="Back"
                    onPress={() => setCurrentStep('form')}
                    variant="outline"
                    style={styles.stepButton}
                  />
                  <Button
                    title={isAnalyzing ? 'Analyzing...' : 'Get AI Suggestions'}
                    onPress={handleImageStep}
                    disabled={isAnalyzing || uploadedImages.length === 0}
                    variant="primary"
                    icon={isAnalyzing ? <Loader2 size={16} color={themeColors.primary.foreground || '#ffffff'} /> : <Sparkles size={16} color={themeColors.primary.foreground || '#ffffff'} />}
                    style={styles.stepButton}
                  />
                </View>
              </Card>
            )}

            {/* Step 3: AI Suggestions */}
            {currentStep === 'suggestions' && (
              <Card style={[styles.card, { backgroundColor: themeColors.card.DEFAULT }]}>
                <View style={styles.aiHeader}>
                  <Sparkles size={24} color={themeColors.primary.DEFAULT} />
                  <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>AI-Suggested Fixes</Text>
                </View>
                {aiSuggestions ? (
                  <Text style={[styles.aiSuggestions, { color: themeColors.text.primary }]}>{aiSuggestions}</Text>
                ) : (
                  <Text style={[styles.aiSuggestions, { color: themeColors.text.primary }]}>
                    AI Preventative Maintenance is disabled. You can still submit your request.
                  </Text>
                )}

                <View style={styles.stepActions}>
                  <Button
                    title="Back"
                    onPress={() => setCurrentStep('images')}
                    variant="outline"
                    style={styles.stepButton}
                  />
                  <Button
                    title={createMutation.isPending ? 'Submitting...' : 'Submit Request'}
                    onPress={handleSubmit}
                    disabled={createMutation.isPending}
                    variant="primary"
                    style={styles.stepButton}
                  />
                </View>
              </Card>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Block Picker Modal */}
        <Modal
          visible={showBlockPicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowBlockPicker(false)}
        >
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
            <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 16) + 16, backgroundColor: themeColors.card.DEFAULT }]}>
              <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
                <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Select Block</Text>
                <TouchableOpacity onPress={() => setShowBlockPicker(false)}>
                  <X size={24} color={themeColors.text.primary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true}>
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    {
                      backgroundColor: !blockId ? themeColors.primary.light : 'transparent',
                      borderBottomColor: themeColors.border.light,
                    },
                  ]}
                  onPress={() => {
                    setBlockId('');
                    setFormBlockFilter('all');
                    setPropertyId('');
                    setShowBlockPicker(false);
                  }}
                >
                  <Text style={[
                    styles.modalItemText,
                    { color: !blockId ? themeColors.primary.DEFAULT : themeColors.text.primary },
                    !blockId && styles.modalItemTextSelected
                  ]}>
                    None
                  </Text>
                  {!blockId && <Text style={[styles.modalItemCheck, { color: themeColors.primary.DEFAULT }]}>✓</Text>}
                </TouchableOpacity>
                {blocks.map((block) => (
                  <TouchableOpacity
                    key={block.id}
                    style={[
                      styles.modalItem,
                      {
                        backgroundColor: blockId === block.id ? themeColors.primary.light : 'transparent',
                        borderBottomColor: themeColors.border.light,
                      },
                    ]}
                    onPress={() => {
                      setBlockId(block.id);
                      setFormBlockFilter(block.id);
                      setPropertyId('');
                      setShowBlockPicker(false);
                    }}
                  >
                    <Text style={[
                      styles.modalItemText,
                      { color: blockId === block.id ? themeColors.primary.DEFAULT : themeColors.text.primary },
                      blockId === block.id && styles.modalItemTextSelected
                    ]}>
                      {block.name}
                    </Text>
                    {blockId === block.id && <Text style={[styles.modalItemCheck, { color: themeColors.primary.DEFAULT }]}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Property Picker Modal */}
        <Modal
          visible={showPropertyPicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowPropertyPicker(false)}
        >
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
            <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 16) + 16, backgroundColor: themeColors.card.DEFAULT }]}>
              <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
                <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Select Property</Text>
                <TouchableOpacity onPress={() => setShowPropertyPicker(false)}>
                  <X size={24} color={themeColors.text.primary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true}>
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    {
                      backgroundColor: !propertyId ? themeColors.primary.light : 'transparent',
                      borderBottomColor: themeColors.border.light,
                    },
                  ]}
                  onPress={() => {
                    setPropertyId('');
                    setShowPropertyPicker(false);
                  }}
                >
                  <Text style={[
                    styles.modalItemText,
                    { color: !propertyId ? themeColors.primary.DEFAULT : themeColors.text.primary },
                    !propertyId && styles.modalItemTextSelected
                  ]}>
                    {blockId ? 'None (Block-level only)' : 'Select a property'}
                  </Text>
                  {!propertyId && <Text style={[styles.modalItemCheck, { color: themeColors.primary.DEFAULT }]}>✓</Text>}
                </TouchableOpacity>
                {(isTenant ? properties : filteredProperties).map((property) => (
                  <TouchableOpacity
                    key={property.id}
                    style={[
                      styles.modalItem,
                      {
                        backgroundColor: propertyId === property.id ? themeColors.primary.light : 'transparent',
                        borderBottomColor: themeColors.border.light,
                      },
                    ]}
                    onPress={() => {
                      setPropertyId(property.id);
                      setShowPropertyPicker(false);
                    }}
                  >
                    <Text style={[
                      styles.modalItemText,
                      { color: propertyId === property.id ? themeColors.primary.DEFAULT : themeColors.text.primary },
                      propertyId === property.id && styles.modalItemTextSelected
                    ]}>
                      {property.name}{property.address ? ` - ${property.address}` : ''}
                    </Text>
                    {propertyId === property.id && <Text style={[styles.modalItemCheck, { color: themeColors.primary.DEFAULT }]}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // Standard form for non-tenants or edit mode
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: spacing[4],
              paddingBottom: Math.max(insets.bottom + 80, 32),
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={[styles.card, { backgroundColor: themeColors.card.DEFAULT }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
              {isEditMode ? 'Edit Maintenance Request' : 'Create Maintenance Request'}
            </Text>

            <Input
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g., Leaking faucet"
            />

            {/* Block Selection */}
            <View style={styles.selectContainer}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>Block (Optional)</Text>
              <TouchableOpacity
                style={[
                  styles.dropdownButton,
                  {
                    borderColor: themeColors.border.DEFAULT,
                    backgroundColor: themeColors.input,
                  },
                ]}
                onPress={() => setShowBlockPicker(true)}
              >
                <Text style={[
                  styles.dropdownText,
                  { color: blockId ? themeColors.text.primary : themeColors.text.secondary },
                ]}>
                  {blockId ? blocks.find(b => b.id === blockId)?.name || 'Select a block' : 'Select a block...'}
                </Text>
                <Text style={[styles.dropdownArrow, { color: themeColors.text.secondary }]}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* Property Selection */}
            <View style={styles.selectContainer}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Property {blockId ? '(Optional if block selected)' : '(Optional)'}
              </Text>
              <TouchableOpacity
                style={[
                  styles.dropdownButton,
                  {
                    borderColor: themeColors.border.light,
                    backgroundColor: themeColors.input,
                  },
                ]}
                onPress={() => setShowPropertyPicker(true)}
              >
                <Text style={[
                  styles.dropdownText,
                  { color: propertyId ? themeColors.text.primary : themeColors.text.secondary },
                ]}>
                  {propertyId
                    ? (properties.find(p => p.id === propertyId)?.address ||
                      properties.find(p => p.id === propertyId)?.name ||
                      'Select a property')
                    : (blockId ? 'None (Block-level only)' : 'Select a property')}
                </Text>
                <Text style={[styles.dropdownArrow, { color: themeColors.text.secondary }]}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* Priority Selection */}
            <View style={styles.selectContainer}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>Priority</Text>
              <View style={[styles.priorityContainer, { gap: moderateScale(8, 0.3, screenWidth) }]}>
                {(['low', 'medium', 'high'] as const).map((p) => (
                  <Button
                    key={p}
                    title={p.charAt(0).toUpperCase() + p.slice(1)}
                    onPress={() => setPriority(p)}
                    variant={priority === p ? 'primary' : 'outline'}
                    style={[styles.priorityButton, { minWidth: moderateScale(80, 0.3, screenWidth) }]}
                  />
                ))}
              </View>
            </View>

            {/* Due Date */}
            <DatePicker
              label="Due Date (Optional)"
              value={dueDate}
              onChange={setDueDate}
              placeholder="Select due date"
            />

            {/* Description */}
            <Input
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Provide details..."
              multiline
              numberOfLines={4}
              style={styles.textArea}
            />

            {/* Photo Upload Section */}
            <View style={styles.photoSection}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>Photos (Optional)</Text>
              <View style={styles.photoActions}>
                <Button
                  title="Pick from Library"
                  onPress={handlePickPhoto}
                  variant="outline"
                  icon={<Upload size={16} color={themeColors.text.primary} />}
                  style={styles.photoButton}
                />
                <Button
                  title="Take Photo"
                  onPress={handleTakePhoto}
                  variant="outline"
                  icon={<Upload size={16} color={themeColors.text.primary} />}
                  style={styles.photoButton}
                />
              </View>

              {uploadedImages.length > 0 && (
                <View style={styles.photosGrid}>
                  {uploadedImages.map((img, idx) => (
                    <View key={idx} style={styles.photoWrapper}>
                      <Image
                        source={{ uri: img.startsWith('http') ? img : `${getAPI_URL()}${img}` }}
                        style={styles.photo as ImageStyle}
                      />
                      <TouchableOpacity
                        style={styles.removePhotoButton}
                        onPress={() => setUploadedImages(prev => prev.filter((_, i) => i !== idx))}
                      >
                        <X size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* AI Analysis Button */}
              {uploadedImages.length > 0 && !aiSuggestions && (
                <Button
                  title={isAnalyzing ? 'Analyzing...' : 'Get AI Suggestions'}
                  onPress={async () => {
                    try {
                      await analyzeMutation.mutateAsync({
                        imageUrl: uploadedImages[0],
                        description: description || title,
                      });
                    } catch (error) {
                      // Error is already handled in mutation's onError
                    }
                  }}
                  disabled={isAnalyzing}
                  variant="outline"
                  icon={isAnalyzing ? <Loader2 size={16} color={themeColors.text.primary} /> : <Sparkles size={16} color={themeColors.text.primary} />}
                  style={styles.aiButton}
                />
              )}

              {/* AI Suggestions Display */}
              {aiSuggestions && (
                <Card style={[styles.aiCard, { backgroundColor: themeColors.card.DEFAULT, borderColor: themeColors.border.light }]}>
                  <View style={styles.aiHeader}>
                    <Sparkles size={20} color={themeColors.primary.DEFAULT} />
                    <Text style={[styles.aiTitle, { color: themeColors.text.primary }]}>AI-Suggested Fixes</Text>
                  </View>
                  <Text style={[styles.aiSuggestions, { color: themeColors.text.primary }]}>{aiSuggestions}</Text>
                </Card>
              )}
            </View>

            {/* Submit Button */}
            <Button
              title={createMutation.isPending || updateMutation.isPending
                ? (isEditMode ? 'Updating...' : 'Creating...')
                : (isEditMode ? 'Update Request' : 'Create Request')}
              onPress={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              variant="primary"
              loading={createMutation.isPending || updateMutation.isPending}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Block Picker Modal */}
      <Modal
        visible={showBlockPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowBlockPicker(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 16) + 16, backgroundColor: themeColors.card.DEFAULT }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Select Block</Text>
              <TouchableOpacity onPress={() => setShowBlockPicker(false)}>
                <X size={24} color={themeColors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true}>
              <TouchableOpacity
                style={[
                  styles.modalItem,
                  {
                    backgroundColor: !blockId ? themeColors.primary.light : 'transparent',
                    borderBottomColor: themeColors.border.light,
                  },
                ]}
                onPress={() => {
                  setBlockId('');
                  setFormBlockFilter('all');
                  setPropertyId('');
                  setShowBlockPicker(false);
                }}
              >
                <Text style={[
                  styles.modalItemText,
                  { color: !blockId ? themeColors.primary.DEFAULT : themeColors.text.primary },
                  !blockId && styles.modalItemTextSelected
                ]}>
                  None
                </Text>
                {!blockId && <Text style={[styles.modalItemCheck, { color: themeColors.primary.DEFAULT }]}>✓</Text>}
              </TouchableOpacity>
              {blocks.map((block) => (
                <TouchableOpacity
                  key={block.id}
                  style={[
                    styles.modalItem,
                    {
                      backgroundColor: blockId === block.id ? themeColors.primary.light : 'transparent',
                      borderBottomColor: themeColors.border.light,
                    },
                  ]}
                  onPress={() => {
                    setBlockId(block.id);
                    setFormBlockFilter(block.id);
                    setPropertyId('');
                    setShowBlockPicker(false);
                  }}
                >
                  <Text style={[
                    styles.modalItemText,
                    { color: blockId === block.id ? themeColors.primary.DEFAULT : themeColors.text.primary },
                    blockId === block.id && styles.modalItemTextSelected
                  ]}>
                    {block.name}
                  </Text>
                  {blockId === block.id && <Text style={[styles.modalItemCheck, { color: themeColors.primary.DEFAULT }]}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Property Picker Modal */}
      <Modal
        visible={showPropertyPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPropertyPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 16) + 16, backgroundColor: themeColors.card.DEFAULT }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Select Property</Text>
              <TouchableOpacity onPress={() => setShowPropertyPicker(false)}>
                <X size={24} color={themeColors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true}>
              <TouchableOpacity
                style={[
                  styles.modalItem,
                  {
                    backgroundColor: !propertyId ? themeColors.primary.light : 'transparent',
                    borderBottomColor: themeColors.border.light,
                  },
                ]}
                onPress={() => {
                  setPropertyId('');
                  setShowPropertyPicker(false);
                }}
              >
                <Text style={[
                  styles.modalItemText,
                  { color: !propertyId ? themeColors.primary.DEFAULT : themeColors.text.primary },
                  !propertyId && styles.modalItemTextSelected
                ]}>
                  {blockId ? 'None (Block-level only)' : 'Select a property'}
                </Text>
                {!propertyId && <Text style={[styles.modalItemCheck, { color: themeColors.primary.DEFAULT }]}>✓</Text>}
              </TouchableOpacity>
              {filteredProperties.map((property) => (
                <TouchableOpacity
                  key={property.id}
                  style={[
                    styles.modalItem,
                    {
                      backgroundColor: propertyId === property.id ? themeColors.primary.light : 'transparent',
                      borderBottomColor: themeColors.border.light,
                    },
                  ]}
                  onPress={() => {
                    setPropertyId(property.id);
                    setShowPropertyPicker(false);
                  }}
                >
                  <Text style={[
                    styles.modalItemText,
                    { color: propertyId === property.id ? themeColors.primary.DEFAULT : themeColors.text.primary },
                    propertyId === property.id && styles.modalItemTextSelected
                  ]}>
                    {property.name}{property.address ? ` - ${property.address}` : ''}
                  </Text>
                  {propertyId === property.id && <Text style={[styles.modalItemCheck, { color: themeColors.primary.DEFAULT }]}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  errorText: {
    fontSize: typography.fontSize.base,
    textAlign: 'center',
    marginBottom: spacing[4],
    lineHeight: 22,
  },
  errorActions: {
    flexDirection: 'row',
    gap: spacing[3],
    width: '100%',
    maxWidth: 400,
  },
  errorButton: {
    flex: 1,
  },
  backButton: {
    padding: spacing[2],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing[2],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
  },
  card: {
    padding: spacing[4],
    marginBottom: spacing[4],
    ...shadows.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing[4],
  },
  sectionSubtitle: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing[4],
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing[2],
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  selectContainer: {
    marginBottom: 16,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderWidth: 1,
    borderRadius: borderRadius.md,
    minHeight: 48,
  },
  dropdownText: {
    flex: 1,
    fontSize: 14,
  },
  dropdownPlaceholder: {
  },
  dropdownArrow: {
    fontSize: 12,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalBody: {
    padding: 16,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  modalItemSelected: {
    // Colors set dynamically
  },
  modalItemText: {
    flex: 1,
    fontSize: 16,
  },
  modalItemTextSelected: {
    fontWeight: '600',
  },
  modalItemCheck: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  priorityContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // gap set dynamically with screenWidth
  },
  priorityButton: {
    flex: 1,
    // minWidth set dynamically with screenWidth
  },
  photoSection: {
    marginBottom: 16,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  photoButton: {
    flex: 1,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  photoWrapper: {
    position: 'relative',
  },
  photo: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoCount: {
    fontSize: typography.fontSize.xs,
    marginBottom: spacing[2],
    // Color set dynamically in component
  },
  aiButton: {
    marginBottom: 16,
  },
  aiCard: {
    padding: spacing[4],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    marginTop: spacing[3],
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  aiTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  aiSuggestions: {
    fontSize: 14,
    lineHeight: 20,
  },
  stepActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  stepButton: {
    flex: 1,
  },
});
