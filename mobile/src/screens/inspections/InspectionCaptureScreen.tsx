import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, useNavigation, CommonActions } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { inspectionsService, type InspectionEntry } from '../../services/inspections';
import { inspectionsOffline } from '../../services/offline/inspectionsOffline';
import { propertiesService } from '../../services/properties';
import { authService } from '../../services/auth';
import { getAPI_URL } from '../../services/api';
import { getSyncStats } from '../../services/offline/database';
import { triggerSync } from '../../services/offline/backgroundSync';
import type { InspectionsStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { FieldWidget } from '../../components/inspections/FieldWidget';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, CheckCircle2, Sparkles, Wifi, WifiOff, Check, Cloud, AlertCircle } from 'lucide-react-native';
import Badge from '../../components/ui/Badge';
import Progress from '../../components/ui/Progress';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { moderateScale, getFontSize, getButtonHeight } from '../../utils/responsive';

type RoutePropType = RouteProp<InspectionsStackParamList, 'InspectionCapture'>;
type NavigationProp = StackNavigationProp<InspectionsStackParamList, 'InspectionCapture'>;

interface TemplateSection {
  id: string;
  title: string;
  description?: string;
  repeatable?: boolean;
  fields: TemplateField[];
}

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

export default function InspectionCaptureScreen() {
  const route = useRoute<RoutePropType>();
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const { inspectionId } = route.params;
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const theme = useTheme();
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [entries, setEntries] = useState<Record<string, InspectionEntry>>({});
  const [copyImages, setCopyImages] = useState(false);
  const [copyNotes, setCopyNotes] = useState(false);
  const [syncStats, setSyncStats] = useState({ pendingEntries: 0, pendingImages: 0, queuedOperations: 0 });

  // Load sync stats periodically
  useEffect(() => {
    const loadSyncStats = async () => {
      const stats = await getSyncStats();
      setSyncStats({
        pendingEntries: stats.pendingEntries,
        pendingImages: stats.pendingImages,
        queuedOperations: stats.queuedOperations,
      });
    };
    loadSyncStats();
    const interval = setInterval(loadSyncStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch inspection with template snapshot (works offline)
  const { data: inspection, isLoading: inspectionLoading, error: inspectionError } = useQuery({
    queryKey: [`/api/inspections/${inspectionId}`],
    queryFn: () => inspectionsOffline.getInspection(inspectionId, isOnline),
    enabled: !!inspectionId,
    retry: 1,
    retryDelay: 1000,
    staleTime: 30000,
  });

  const effectiveInspection = inspection;

  // Check if inspection is deleted
  const isDeleted = (inspectionError as any)?.isDeleted ||
    (inspectionError as any)?.status === 404 ||
    (inspectionError as any)?.message?.includes('deleted');

  // Fetch property details (only when online and inspection exists)
  const { data: property } = useQuery({
    queryKey: [`/api/properties/${effectiveInspection?.propertyId}`],
    queryFn: () => {
      if (!effectiveInspection?.propertyId) throw new Error('Property ID not available');
      return propertiesService.getProperty(effectiveInspection.propertyId);
    },
    enabled: !!effectiveInspection?.propertyId && isOnline,
    retry: 1,
    staleTime: 60000,
  });

  // Fetch block details (only when online and inspection exists)
  const { data: block } = useQuery({
    queryKey: [`/api/blocks/${effectiveInspection?.blockId}`],
    queryFn: () => {
      if (!effectiveInspection?.blockId) throw new Error('Block ID not available');
      return propertiesService.getBlock(effectiveInspection.blockId);
    },
    enabled: !!effectiveInspection?.blockId && isOnline,
    retry: 1,
    staleTime: 60000,
  });

  // Fetch inspector details (only when online and inspection exists)
  const inspectorId = (effectiveInspection as any)?.clerkId || (effectiveInspection as any)?.inspectorId || (effectiveInspection as any)?.assignedToId;
  const { data: inspector } = useQuery({
    queryKey: [`/api/users/${inspectorId}`],
    queryFn: () => {
      if (!inspectorId) throw new Error('Inspector ID not available');
      return authService.getUser(inspectorId);
    },
    enabled: !!inspectorId && isOnline,
    retry: 1,
    staleTime: 60000,
  });

  // Fetch tenants (only when online and inspection exists)
  const { data: tenants = [] } = useQuery({
    queryKey: [`/api/properties/${effectiveInspection?.propertyId}/tenants`],
    queryFn: () => {
      if (!effectiveInspection?.propertyId) throw new Error('Property ID not available');
      return propertiesService.getPropertyTenants(effectiveInspection.propertyId);
    },
    enabled: !!effectiveInspection?.propertyId && isOnline,
    retry: 1,
    staleTime: 60000,
  });

  // Fetch existing entries (works offline)
  const { data: existingEntries = [], error: entriesError } = useQuery({
    queryKey: [`/api/inspections/${inspectionId}/entries`],
    queryFn: async () => {
      const entries = await inspectionsOffline.getInspectionEntries(inspectionId, isOnline);
      return entries;
    },
    enabled: !!inspectionId,
    retry: 1,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Use server entries directly - no offline functionality
  const effectiveEntries = useMemo(() => {
    return existingEntries || [];
  }, [existingEntries]);

  // Fetch most recent check-in for check-out inspections (only when online)
  const { data: checkInData } = useQuery({
    queryKey: [`/api/properties/${effectiveInspection?.propertyId}/most-recent-checkin`],
    queryFn: () => {
      if (!effectiveInspection?.propertyId) throw new Error('Property ID not available');
      return inspectionsService.getMostRecentCheckIn(effectiveInspection.propertyId);
    },
    enabled: !!effectiveInspection?.propertyId && effectiveInspection?.type === 'check_out' && isOnline,
    retry: false,
  });

  // AI Analysis status polling (same as web version)
  const { data: aiAnalysisStatus } = useQuery({
    queryKey: [`/api/ai/analyze-inspection/${inspectionId}/status`],
    queryFn: () => inspectionsService.getAIAnalysisStatus(inspectionId),
    enabled: !!inspectionId,
    retry: 1,
    refetchInterval: (query) => {
      // Poll every 2 seconds while processing (same as web version)
      const status = query.state.data?.status;
      return status === 'processing' ? 2000 : false;
    },
  });

  // Refetch entries when AI analysis completes
  useEffect(() => {
    if (aiAnalysisStatus?.status === 'completed') {
      queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}/entries`] });
      queryClient.refetchQueries({ queryKey: [`/api/inspections/${inspectionId}/entries`] });
      // Alert removed - user can see AI Complete button status instead
    }
  }, [aiAnalysisStatus?.status, inspectionId]); // Removed queryClient from dependencies - it's stable from useQueryClient()

  // Load existing entries into state
  // Always update entries when existingEntries changes (to support copy from check-in)
  useEffect(() => {
    const entriesToUse = effectiveEntries;
    if (!entriesToUse || entriesToUse.length === 0) {
      return;
    }

    const entriesMap: Record<string, InspectionEntry> = {};
    entriesToUse.forEach((entry: any) => {
      const key = `${entry.sectionRef}-${entry.fieldKey}`;
      entriesMap[key] = {
        id: entry.id,
        inspectionId: entry.inspectionId,
        sectionRef: entry.sectionRef,
        fieldKey: entry.fieldKey,
        fieldType: entry.fieldType,
        valueJson: entry.valueJson,
        note: entry.note || undefined,
        photos: entry.photos || [],
        maintenanceFlag: entry.maintenanceFlag,
        markedForReview: entry.markedForReview,
      };
    });

    setEntries(prev => {
      // Merge entries from server, prioritizing server data for photos and notes when copying
      const merged = { ...prev };
      Object.keys(entriesMap).forEach(key => {
        const serverEntry = entriesMap[key];
        const localEntry = merged[key];

        // Always update if entry doesn't exist
        if (!localEntry) {
          merged[key] = serverEntry;
        } else {
          // Update entry with server data (especially important after copy from check-in)
          // Merge photos and notes from server to ensure copied data is shown
          const mergedEntry: InspectionEntry = {
            ...localEntry,
            ...serverEntry,
            // CRITICAL: Always use server ID if available (for PATCH vs POST detection)
            id: serverEntry.id || localEntry.id,
            // Use server data as source of truth
            valueJson: serverEntry.valueJson !== undefined ? serverEntry.valueJson : localEntry.valueJson,
            // Merge photos: combine both arrays, but prioritize server photos
            photos: serverEntry.photos && serverEntry.photos.length > 0 
              ? serverEntry.photos 
              : Array.from(new Set([...(localEntry.photos || []), ...(serverEntry.photos || [])])),
            note: serverEntry.note !== undefined ? serverEntry.note : localEntry.note,
          };
          merged[key] = mergedEntry;
        }
      });
      return merged;
    });
  }, [effectiveEntries]);

  // Parse template structure (memoized to prevent re-parsing on every render)
  const sections = useMemo(() => {
    const inspectionToUse = effectiveInspection;
    if (!inspectionToUse?.templateSnapshotJson) {
      if (inspectionToUse?.templateId) {
        console.warn('No templateSnapshotJson found, but templateId exists:', inspectionToUse.templateId);
      }
      return [];
    }

    let rawTemplateStructure: { sections: TemplateSection[] } | null = null;

    if (typeof inspectionToUse.templateSnapshotJson === 'string') {
      try {
        rawTemplateStructure = JSON.parse(inspectionToUse.templateSnapshotJson);
      } catch (e) {
        console.error('Failed to parse templateSnapshotJson:', e);
        return [];
      }
    } else {
      rawTemplateStructure = inspectionToUse.templateSnapshotJson as { sections: TemplateSection[] };
    }

    if (!rawTemplateStructure?.sections) {
      return [];
    }

    return rawTemplateStructure.sections.map(section => ({
      ...section,
      fields: (section.fields || []).map((field: any) => {
        // Ensure boolean properties are actual booleans, not strings
        const parsedField = {
          ...field,
          id: field.id || field.key,
          key: field.key || field.id,
        };

        // Convert string booleans to actual booleans
        if (typeof parsedField.required === 'string') {
          parsedField.required = parsedField.required.toLowerCase() === 'true';
        } else {
          parsedField.required = !!parsedField.required;
        }

        if (typeof parsedField.includeCondition === 'string') {
          parsedField.includeCondition = parsedField.includeCondition.toLowerCase() === 'true';
        } else {
          parsedField.includeCondition = !!parsedField.includeCondition;
        }

        if (typeof parsedField.includeCleanliness === 'string') {
          parsedField.includeCleanliness = parsedField.includeCleanliness.toLowerCase() === 'true';
        } else {
          parsedField.includeCleanliness = !!parsedField.includeCleanliness;
        }

        return parsedField;
      }),
    }));
  }, [effectiveInspection?.templateSnapshotJson, effectiveInspection?.templateId]);

  // Debug logging
  useEffect(() => {
    const inspectionToUse = effectiveInspection;
    if (inspectionToUse) {
      console.log('Inspection loaded:', {
        id: inspectionToUse.id,
        hasTemplateSnapshot: !!inspectionToUse.templateSnapshotJson,
        templateId: inspectionToUse.templateId,
        sectionsCount: sections.length,
        isOnline,
      });
    }
  }, [effectiveInspection, sections.length, isOnline]);

  // Update entry mutation with offline support
  const updateEntry = useMutation({
    mutationFn: async (entry: InspectionEntry) => {
      // Use entry.id if provided, otherwise use sectionRef-fieldKey format
      // This ensures consistency with how entries are keyed in the state
      const entryId = entry.id || `${entry.sectionRef}-${entry.fieldKey}`;
      const entryWithId = { ...entry, id: entryId };

      console.log(`[InspectionCapture] Saving entry ${entryId} (online: ${isOnline})`);
      
      try {
        // Use offline layer to save entry
        const entryData: InspectionEntry = {
          id: entryWithId.id,
          inspectionId: entryWithId.inspectionId || inspectionId,
          sectionRef: entryWithId.sectionRef,
          fieldKey: entryWithId.fieldKey,
          fieldType: entryWithId.fieldType,
          valueJson: entryWithId.valueJson,
          note: entryWithId.note,
          photos: entryWithId.photos, // Keep all photos (local and server URLs)
          maintenanceFlag: entryWithId.maintenanceFlag,
          markedForReview: entryWithId.markedForReview,
        };

        // Validate required fields
        if (!entryData.inspectionId) {
          throw new Error(`Entry ${entryId} is missing inspectionId`);
        }
        if (!entryData.sectionRef) {
          throw new Error(`Entry ${entryId} is missing sectionRef`);
        }
        if (!entryData.fieldKey) {
          throw new Error(`Entry ${entryId} is missing fieldKey`);
        }

        // Determine if it's a new entry or an update
        const existingEntry = entries[entryId];
        const key = `${entryData.sectionRef}-${entryData.fieldKey}`;
        const hasServerId = existingEntry?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingEntry.id);

        let result: InspectionEntry;
        if (hasServerId && existingEntry.id) {
          // Update existing entry
          result = await inspectionsOffline.updateInspectionEntry(existingEntry.id, entryData, isOnline);
        } else {
          // Create new entry
          result = await inspectionsOffline.saveInspectionEntry(entryData, isOnline);
        }

        // Update local state
        setEntries(prev => ({
          ...prev,
          [key]: result,
        }));

        // Refresh sync stats
        const stats = await getSyncStats();
        setSyncStats({
          pendingEntries: stats.pendingEntries,
          pendingImages: stats.pendingImages,
          queuedOperations: stats.queuedOperations,
        });

        return result;
      } catch (error: any) {
        console.error('[InspectionCapture] Failed to save entry:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}/entries`] });
      queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}`] });
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to save field');
    },
  });

  // Update inspection status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ status, startedAt, completedDate, submittedAt }: {
      status: string;
      startedAt?: string;
      completedDate?: string;
      submittedAt?: string;
    }) => {
      const updates: any = { status };
      if (startedAt) {
        updates.startedAt = startedAt;
      }
      if (completedDate) {
        updates.completedDate = completedDate;
      }
      if (submittedAt) {
        updates.submittedAt = submittedAt;
      }
      if (startedAt || completedDate || submittedAt) {
        await inspectionsService.updateInspection(inspectionId, updates);
      } else {
        await inspectionsService.updateInspectionStatus(inspectionId, status);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/inspections/my'] });
    },
  });

  // Copy from check-in mutation
  const copyFromCheckIn = useMutation({
    mutationFn: async (data: { copyImages: boolean; copyNotes: boolean }) => {
      return inspectionsService.copyFromCheckIn(inspectionId, data.copyImages, data.copyNotes);
    },
    onSuccess: async (data) => {
      // Invalidate and refetch entries to get updated data with copied photos/notes
      queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}/entries`] });

      // Wait a bit for the server to finish processing, then refetch
      setTimeout(async () => {
        const result = await queryClient.refetchQueries({
          queryKey: [`/api/inspections/${inspectionId}/entries`]
        });
        console.log('[Copy] Refetched entries result:', result);
        // Force reload by invalidating again to ensure UI updates
        queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}/entries`] });
      }, 500);

      Alert.alert('Success', 'Data copied from previous check-in');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to copy data');
    },
  });

  // Start AI analysis mutation
  const startAIAnalysis = useMutation({
    mutationFn: () => inspectionsService.startAIAnalysis(inspectionId),
    onSuccess: () => {
      // Invalidate status query to start polling (refetchInterval will handle polling)
      queryClient.invalidateQueries({ queryKey: [`/api/ai/analyze-inspection/${inspectionId}/status`] });
      Alert.alert('AI Analysis Started', 'Analysis is running in the background. You can continue working.');
    },
    onError: (error: any) => {
      Alert.alert('Failed to start AI analysis', error.message || 'Please try again');
    },
  });

  // Auto-start inspection on first visit (only once)
  const [hasAutoStarted, setHasAutoStarted] = useState(false);
  useEffect(() => {
    if (effectiveInspection && effectiveInspection.status === 'scheduled' && !(effectiveInspection as any).startedAt && !hasAutoStarted && isOnline) {
      setHasAutoStarted(true);
      updateStatusMutation.mutate({
        status: 'in_progress',
        startedAt: new Date().toISOString(),
      });
    }
  }, [effectiveInspection, hasAutoStarted, isOnline, updateStatusMutation]);

  // Track if copy has been triggered to prevent re-triggering
  const copyTriggeredRef = useRef<{ copyImages: boolean; copyNotes: boolean }>({ copyImages: false, copyNotes: false });

  // Copy from check-in when checkboxes are checked (debounced to prevent rapid firing)
  useEffect(() => {
    if (!checkInData || !checkInData.entries || !effectiveInspection || effectiveInspection.type !== 'check_out') {
      copyTriggeredRef.current = { copyImages: false, copyNotes: false };
      return;
    }

    // Check if either checkbox is checked and hasn't been triggered yet
    const shouldCopyImages = copyImages && !copyTriggeredRef.current.copyImages;
    const shouldCopyNotes = copyNotes && !copyTriggeredRef.current.copyNotes;

    // If both are checked at the same time, copy both in one call
    if ((shouldCopyImages || shouldCopyNotes) && !copyFromCheckIn.isPending) {
      if (shouldCopyImages) copyTriggeredRef.current.copyImages = true;
      if (shouldCopyNotes) copyTriggeredRef.current.copyNotes = true;

      // Use setTimeout to debounce and prevent rapid firing
      const timeoutId = setTimeout(() => {
        // Copy both if both are checked, otherwise copy individually
        copyFromCheckIn.mutate({
          copyImages: copyImages,
          copyNotes: copyNotes
        });
      }, 300);
      return () => clearTimeout(timeoutId);
    } else if (!copyImages && !copyNotes) {
      // Reset when both are unchecked
      copyTriggeredRef.current = { copyImages: false, copyNotes: false };
    } else if (!copyImages) {
      copyTriggeredRef.current.copyImages = false;
    } else if (!copyNotes) {
      copyTriggeredRef.current.copyNotes = false;
    }
    // Only depend on copyImages and copyNotes to prevent re-triggering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyImages, copyNotes]);

  // Calculate progress (memoized to prevent recalculation on every render)
  const { totalFields, completedFields, progress } = useMemo(() => {
    const total = sections.reduce((acc, section) => acc + section.fields.length, 0);
    const completed = Object.values(entries).filter(entry => {
      const hasValue = entry.valueJson !== null && entry.valueJson !== undefined;
      const hasPhotos = entry.photos && entry.photos.length > 0;
      return hasValue || hasPhotos;
    }).length;
    const prog = total > 0 ? (completed / total) * 100 : 0;
    return { totalFields: total, completedFields: completed, progress: prog };
  }, [sections, entries]);

  const currentSection = sections[currentSectionIndex] || null;

  // Safety check: ensure currentSectionIndex is valid (only when sections change)
  useEffect(() => {
    if (sections.length > 0 && currentSectionIndex >= sections.length) {
      setCurrentSectionIndex(0);
    }
  }, [sections.length]); // Only depend on sections.length to prevent infinite loop

  // Track tab scroll position for fade indicator
  const [showRightFade, setShowRightFade] = useState(sections.length > 0);
  const tabsScrollViewRef = useRef<ScrollView>(null);

  const handleTabsScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isScrolledToEnd = contentOffset.x + layoutMeasurement.width >= contentSize.width - 10;
    setShowRightFade(!isScrolledToEnd);
  };

  // Update fade indicator when sections change
  useEffect(() => {
    // Check if there are more tabs to scroll (approximate)
    setShowRightFade(sections.length > 2); // Show fade if more than 2 tabs (rough estimate)
  }, [sections.length]);

  const handleFieldChange = React.useCallback(async (
    sectionRef: string,
    fieldKey: string,
    value: any,
    note?: string,
    photos?: string[],
    markedForReview?: boolean
  ) => {
    // Prevent changes if inspection is completed
    if (effectiveInspection?.status === 'completed') {
      Alert.alert(
        'Inspection Completed',
        'This inspection has been completed. You cannot make changes.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Prevent changes if inspection is deleted
    if (isDeleted) {
      Alert.alert(
        'Inspection Deleted',
        'You cannot make changes to a deleted inspection.',
        [{ text: 'OK' }]
      );
      return;
    }

    const key = `${sectionRef}-${fieldKey}`;
    const existingEntry = entries[key];
    const fieldType = sections.find(s => s.id === sectionRef)?.fields.find(f => f.id === fieldKey || f.key === fieldKey)?.type || 'text';

    // CRITICAL FIX: Use the entry key (sectionRef-fieldKey) as the entry ID
    // This ensures photos uploaded before entry creation can be associated correctly
    // If entry doesn't exist, use the key as ID; if it exists, use its ID
    const entryId = existingEntry?.id || key; // key is `${sectionRef}-${fieldKey}`

    const newEntry: InspectionEntry = {
      ...existingEntry,
      id: entryId, // Always use the key format for consistency
      inspectionId,
      sectionRef,
      fieldKey,
      fieldType,
      valueJson: value !== undefined ? value : existingEntry?.valueJson,
      note: note !== undefined ? note : existingEntry?.note,
      photos: photos !== undefined ? photos : (existingEntry?.photos || []),
      markedForReview: markedForReview !== undefined ? markedForReview : (existingEntry?.markedForReview || false),
      maintenanceFlag: existingEntry?.maintenanceFlag || false,
    };
    
    // No offline functionality - photos are stored on server only

    // Update local state immediately for snappy UI
    setEntries(prev => ({ ...prev, [key]: newEntry }));

    // Auto-save mutation
    updateEntry.mutate(newEntry);
  }, [inspectionId, sections, updateEntry, effectiveInspection, isDeleted]);

  const handleComplete = async () => {
    // Check if progress is less than 100%
    const progressPercentage = Math.round(progress);
    const isIncomplete = progressPercentage < 100;

    const completeInspection = async () => {
      if (!isOnline) {
        Alert.alert(
          'Offline',
          'Cannot complete inspection while offline. Please connect to the internet and sync your changes first.',
          [{ text: 'OK' }]
        );
        return;
      }

      try {
        const now = new Date().toISOString();

        await updateStatusMutation.mutateAsync({
          status: 'completed',
          completedDate: now,
          submittedAt: now,
        });

        Alert.alert(
          'Success',
          'Inspection marked as completed.',
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.navigate('InspectionReview', { inspectionId });
              },
            },
          ]
        );
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to complete inspection');
      }
    };

    if (isIncomplete) {
      // Show confirmation dialog for incomplete inspections
      Alert.alert(
        'Complete Inspection?',
        `This inspection is only ${progressPercentage}% complete. ${totalFields - completedFields} field(s) are still missing. Do you want to mark it as complete anyway?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Complete Anyway',
            style: 'default',
            onPress: completeInspection,
          },
        ]
      );
    } else {
      // Complete without confirmation if 100% complete
      completeInspection();
    }
  };

  // getAPI_URL() is imported from services/api.ts (uses EXPO_PUBLIC_API_URL from .env)

  // No offline functionality - app requires server connection

  if (inspectionError && isOnline && !inspection) {
    const error = inspectionError as any;
    const isDeleted = error.status === 404 || error.isDeleted || error.message?.includes('deleted');

    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={[styles.errorText, { color: themeColors.text.primary }]}>
          {isDeleted ? 'Inspection Deleted' : 'Failed to load inspection'}
        </Text>
        <Text style={[styles.errorSubtext, { color: themeColors.text.secondary }]}>
          {isDeleted
            ? 'This inspection has been deleted. Your local changes cannot be synced.'
            : error.message || 'An error occurred while loading the inspection.'}
        </Text>
        <Button
          title="Go Back"
          onPress={() => navigation.goBack()}
          variant="secondary"
        />
      </View>
    );
  }

  // If no inspection (neither server nor local), show error
  if (!effectiveInspection) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={[styles.errorText, { color: themeColors.text.primary }]}>Inspection not found</Text>
        <Text style={[styles.errorSubtext, { color: themeColors.text.secondary }]}>
          {isOnline
            ? 'This inspection could not be found. It may have been deleted.'
            : 'This inspection is not available offline. Please connect to the internet to load it.'}
        </Text>
        <Button
          title="Go Back"
          onPress={() => navigation.goBack()}
          variant="secondary"
        />
      </View>
    );
  }

  if (!sections.length) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={[styles.errorText, { color: themeColors.text.primary }]}>No template found for this inspection</Text>
        <Text style={[styles.errorSubtext, { color: themeColors.text.secondary }]}>
          This inspection doesn't have a template assigned. Please contact your administrator.
        </Text>
        <Button
          title="Go Back"
          onPress={() => navigation.goBack()}
          variant="secondary"
        />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        {/* Conflict resolution is now automatic - always keeps server version */}

        {/* Fixed Header - Only Back Button and Title */}
        <View style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor: themeColors.card.DEFAULT,
            borderBottomColor: themeColors.border.light,
          },
        ]}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <ChevronLeft size={24} color={themeColors.text.primary} />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={[styles.headerTitle, { color: themeColors.text.primary }]} numberOfLines={1}>
                {property?.name || block?.name || 'Inspection Capture'}
              </Text>
              <Text style={[styles.headerSubtitle, { color: themeColors.text.secondary }]} numberOfLines={2}>
                {property?.address || block?.address || (effectiveInspection?.propertyId ? 'Property' : 'Block') + ' Inspection'}
              </Text>
            </View>
          </View>
        </View>

        {/* Offline/Sync Status Banner */}
        {!isOnline && (
          <Card style={[
            styles.offlineBanner,
            {
              backgroundColor: `${themeColors.warning}15`,
              borderColor: `${themeColors.warning}40`,
            }
          ]}>
            <View style={styles.offlineBannerContent}>
              <WifiOff size={16} color={themeColors.warning} />
              <View style={styles.offlineBannerTextContainer}>
                <Text style={[styles.offlineBannerText, { color: themeColors.warning }]}>Working Offline</Text>
                <Text style={[styles.offlineBannerDescription, { color: themeColors.text.secondary }]}>
                  You can add photos, notes, and conditions. Completing this inspection requires internet connection.
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Deleted Inspection Warning */}
        {isDeleted && (
          <Card style={[
            styles.deletedBanner,
            {
              backgroundColor: `${themeColors.destructive.DEFAULT}15`,
              borderColor: `${themeColors.destructive.DEFAULT}40`,
            }
          ]}>
            <View style={styles.deletedBannerContent}>
              <AlertCircle size={16} color={themeColors.destructive.DEFAULT} />
              <View style={styles.deletedBannerTextContainer}>
                <Text style={[styles.deletedBannerText, { color: themeColors.destructive.DEFAULT }]}>Inspection Deleted</Text>
                <Text style={[styles.deletedBannerDescription, { color: themeColors.text.secondary }]}>
                  This inspection has been deleted. Your local changes cannot be synced. You can view your local data but cannot make changes.
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Completed Inspection Warning */}
        {!isDeleted && effectiveInspection?.status === 'completed' && (
          <Card style={[
            styles.completedBanner,
            {
              backgroundColor: `${themeColors.success || '#10B981'}15`,
              borderColor: `${themeColors.success || '#10B981'}40`,
            }
          ]}>
            <View style={styles.completedBannerContent}>
              <CheckCircle2 size={16} color={themeColors.success || '#10B981'} />
              <View style={styles.completedBannerTextContainer}>
                <Text style={[styles.completedBannerText, { color: themeColors.success || '#10B981' }]}>Inspection Completed</Text>
                <Text style={[styles.completedBannerDescription, { color: themeColors.text.secondary }]}>
                  This inspection has been completed. You can view details but cannot make changes.
                </Text>
              </View>
            </View>
          </Card>
        )}


        {/* AI Analysis Progress */}
        {aiAnalysisStatus?.status === 'processing' && (
          <Card style={[
            styles.aiProgressCard,
            {
              backgroundColor: themeColors.primary.light || `${themeColors.primary.DEFAULT}0D`,
              borderColor: `${themeColors.primary.DEFAULT}33`,
            }
          ]}>
            <View style={styles.aiProgressHeader}>
              <View style={styles.aiProgressHeaderLeft}>
                <Sparkles size={16} color={themeColors.primary.DEFAULT} />
                <Text style={[styles.aiProgressTitleText, { color: themeColors.text.primary }]}>AI Analysis in Progress</Text>
              </View>
              <Text style={[styles.aiProgressCount, { color: themeColors.text.primary }]}>
                {aiAnalysisStatus.progress} / {aiAnalysisStatus.totalFields}
              </Text>
            </View>
            <Progress value={(aiAnalysisStatus.progress / (aiAnalysisStatus.totalFields || 1)) * 100} height={8} />
            <Text style={[styles.aiProgressDescription, { color: themeColors.text.secondary }]}>
              You can continue working while the AI analyzes your inspection photos in the background.
            </Text>
          </Card>
        )}

        {/* AI Analysis Error */}
        {aiAnalysisStatus?.status === 'failed' && aiAnalysisStatus.error && (
          <Card style={[
            styles.aiErrorCard,
            {
              backgroundColor: `${themeColors.destructive.DEFAULT}10`,
              borderColor: themeColors.destructive.DEFAULT,
            }
          ]}>
            <View style={styles.aiErrorHeader}>
              <AlertCircle size={16} color={themeColors.destructive.DEFAULT} />
              <Text style={[styles.aiErrorTitle, { color: themeColors.destructive.DEFAULT }]}>AI Analysis Failed</Text>
            </View>
            <Text style={[styles.aiErrorMessage, { color: themeColors.text.secondary }]}>{aiAnalysisStatus.error}</Text>
          </Card>
        )}

        {/* Copy from Previous Check-In (only for check-out inspections) */}
        {effectiveInspection?.type === 'check_out' && (
          <Card style={[
            styles.copyCard,
            {
              backgroundColor: themeColors.primary.light || `${themeColors.primary.DEFAULT}15`,
              borderColor: themeColors.primary.DEFAULT,
            }
          ]}>
            <Text style={[styles.copyCardTitle, { color: themeColors.text.primary }]}>Copy from Previous Check-In</Text>
            {checkInData ? (
              <>
                <Text style={[styles.copyCardSubtext, { color: themeColors.text.secondary }]}>
                  Copy data from the most recent check-in inspection ({checkInData.inspection.scheduledDate ? new Date(checkInData.inspection.scheduledDate).toLocaleDateString() : 'N/A'})
                </Text>
                <View style={styles.copyOptions}>
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setCopyImages(!copyImages)}
                    disabled={!!copyFromCheckIn.isPending}
                  >
                    <View style={[
                      styles.checkbox,
                      { borderColor: themeColors.primary.DEFAULT },
                      copyImages && { backgroundColor: themeColors.primary.DEFAULT }
                    ]}>
                      {copyImages && <Check size={16} color={themeColors.primary.foreground || '#fff'} />}
                    </View>
                    <Text style={[styles.checkboxLabel, { color: themeColors.text.primary }]}>Copy Images</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setCopyNotes(!copyNotes)}
                    disabled={!!copyFromCheckIn.isPending}
                  >
                    <View style={[
                      styles.checkbox,
                      { borderColor: themeColors.primary.DEFAULT },
                      copyNotes && { backgroundColor: themeColors.primary.DEFAULT }
                    ]}>
                      {copyNotes && <Check size={16} color={themeColors.primary.foreground || '#fff'} />}
                    </View>
                    <Text style={[styles.checkboxLabel, { color: themeColors.text.primary }]}>Copy Notes</Text>
                  </TouchableOpacity>
                </View>
                {(copyImages || copyNotes) && (
                  <View style={styles.copySuccess}>
                    <CheckCircle2 size={16} color={themeColors.success || '#34C759'} />
                    <Text style={[styles.copySuccessText, { color: themeColors.success || themeColors.primary.DEFAULT }]}>
                      {copyImages && copyNotes
                        ? 'Images and notes copied from check-in inspection'
                        : copyImages
                          ? 'Images copied from check-in inspection'
                          : 'Notes copied from check-in inspection'}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <Text style={[styles.copyCardSubtext, { color: themeColors.text.secondary }]}>
                No previous check-in inspection found for this property.
              </Text>
            )}
          </Card>
        )}

        {/* Content */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
          <ScrollView
            style={styles.content}
            contentContainerStyle={[
              styles.contentContainer,
              {
                paddingTop: spacing[4],
                paddingBottom: Math.max(insets.bottom + 80, spacing[8])
              }
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {/* Quick Actions Row */}
            <View style={styles.quickActionsRow}>
              {/* Online/Offline Badge */}
              <View style={styles.statusBadge}>
                <Badge variant={isOnline ? 'default' : 'secondary'} size="sm">
                  {isOnline ? <Wifi size={12} color={isOnline ? themeColors.primary.foreground : themeColors.text.primary} /> : <WifiOff size={12} color={themeColors.text.primary} />}
                  <Text style={[styles.badgeText, { color: isOnline ? (themeColors.primary.foreground || '#ffffff') : themeColors.text.primary }]}>{isOnline ? 'Online' : 'Offline'}</Text>
                </Badge>
              </View>

              {/* Sync Status Badge */}
              {(syncStats.pendingEntries > 0 || syncStats.pendingImages > 0) && (
                <TouchableOpacity
                  style={styles.statusBadge}
                  onPress={async () => {
                    if (isOnline) {
                      try {
                        await triggerSync();
                        const stats = await getSyncStats();
                        setSyncStats({
                          pendingEntries: stats.pendingEntries,
                          pendingImages: stats.pendingImages,
                          queuedOperations: stats.queuedOperations,
                        });
                      } catch (error: any) {
                        Alert.alert('Sync Error', error.message || 'Failed to sync');
                      }
                    }
                  }}
                >
                  <Badge variant="warning" size="sm">
                    <Cloud size={12} color={themeColors.warning} />
                    <Text style={[styles.badgeText, { color: themeColors.warning }]}>
                      {syncStats.pendingEntries + syncStats.pendingImages} pending
                    </Text>
                  </Badge>
                </TouchableOpacity>
              )}


              {/* Progress Badge */}
              <View style={styles.statusBadge}>
                <Badge variant="secondary" size="sm">
                  <Text style={[styles.badgeText, { color: themeColors.text.primary }]}>{completedFields}/{totalFields}</Text>
                </Badge>
              </View>
            </View>

            {/* Main Action Buttons */}
            <View style={styles.mainActionsRow}>
              {/* AI Analysis Button */}
              {aiAnalysisStatus?.status === 'processing' ? (
                <View style={styles.actionButtonContainer}>
                  <Badge variant="outline" size="sm" style={[
                    styles.aiProgressBadge,
                    {
                      backgroundColor: themeColors.primary.light,
                      borderColor: themeColors.primary.DEFAULT,
                    }
                  ]}>
                    <ActivityIndicator size="small" color={themeColors.primary.DEFAULT} />
                    <Text style={[styles.badgeText, { color: themeColors.text.primary }]}>
                      Analyzing ({aiAnalysisStatus.progress}/{aiAnalysisStatus.totalFields})
                    </Text>
                  </Badge>
                </View>
              ) : aiAnalysisStatus?.status === 'completed' ? (
                <View style={styles.actionButtonContainer}>
                  <Button
                    title="AI Complete"
                    onPress={() => { }}
                    disabled={true}
                    variant="default"
                    size="sm"
                    icon={<CheckCircle2 size={14} color="#ffffff" />}
                    style={[
                      styles.actionButton,
                      {
                        backgroundColor: themeColors.success || '#22c55e',
                        borderColor: themeColors.success || '#22c55e',
                      }
                    ]}
                    textStyle={{ color: '#ffffff' }}
                  />
                </View>
              ) : (
                <View style={styles.actionButtonContainer}>
                  <Button
                    title="AI Analyze"
                    onPress={() => startAIAnalysis.mutate()}
                    disabled={!!(startAIAnalysis.isPending || !isOnline)}
                    variant="default"
                    size="sm"
                    icon={<Sparkles size={14} color={themeColors.primary.foreground || '#ffffff'} />}
                    style={styles.actionButton}
                    textStyle={styles.actionButtonText}
                  />
                </View>
              )}

              {/* Complete Inspection Button */}
              <View style={styles.actionButtonContainer}>
                <Button
                  title="Complete"
                  onPress={handleComplete}
                  disabled={!!updateStatusMutation.isPending || !isOnline}
                  variant="default"
                  size="sm"
                  icon={<CheckCircle2 size={14} color={themeColors.primary.foreground} />}
                  loading={updateStatusMutation.isPending}
                  style={styles.actionButton}
                  textStyle={styles.actionButtonText}
                />
              </View>
            </View>

            {/* Progress Bar */}
            <View style={[styles.progressContainer, { backgroundColor: themeColors.card.DEFAULT }]}>
              <View style={styles.progressHeader}>
                <Text style={[styles.progressLabel, { color: themeColors.text.primary }]}>Progress</Text>
                <Text style={[styles.progressPercent, { color: themeColors.primary.DEFAULT }]}>{Math.round(progress)}%</Text>
              </View>
              <Progress value={progress} height={10} style={styles.progressBar} />
            </View>

            {/* Section Tabs */}
            <View style={styles.tabsContainerWrapper}>
              <View style={styles.tabsContainerInner}>
                <ScrollView
                  ref={tabsScrollViewRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.tabsContainer}
                  contentContainerStyle={styles.tabsContent}
                  onScroll={handleTabsScroll}
                  scrollEventThrottle={16}
                  onContentSizeChange={() => {
                    // Check initial scroll position
                    tabsScrollViewRef.current?.scrollTo({ x: 0, animated: false });
                  }}
                >
                  {sections.map((section, index) => (
                    <TouchableOpacity
                      key={section.id}
                      onPress={() => {
                        setCurrentSectionIndex(index);
                        // Scroll the tab into view
                        const tabWidth = 120; // Approximate tab width
                        const scrollPosition = index * (tabWidth + spacing[2]);
                        tabsScrollViewRef.current?.scrollTo({ x: scrollPosition, animated: true });
                      }}
                      style={[
                        styles.tabButton,
                        {
                          backgroundColor: index === currentSectionIndex ? themeColors.primary.DEFAULT : themeColors.card.DEFAULT,
                          borderColor: index === currentSectionIndex ? themeColors.primary.DEFAULT : themeColors.border.DEFAULT,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.tabButtonText,
                          {
                            color: index === currentSectionIndex
                              ? (themeColors.primary.foreground || '#ffffff')
                              : themeColors.text.primary
                          },
                          index === currentSectionIndex && styles.tabButtonTextActive
                        ]}
                        numberOfLines={1}
                      >
                        {section.title}
                      </Text>
                      {index === currentSectionIndex && <View style={styles.tabIndicator} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {/* Right Fade Indicator */}
                {showRightFade && (
                  <View
                    style={[
                      styles.tabsFadeRight,
                      { backgroundColor: themeColors.card.DEFAULT }
                    ]}
                    pointerEvents="none"
                  />
                )}
              </View>
            </View>

            {currentSection && currentSection.fields && (
              <>
                {currentSection.description && (
                  <Card style={[
                    styles.sectionDescriptionCard,
                    {
                      backgroundColor: themeColors.primary.light || `${themeColors.primary.DEFAULT}15`,
                      borderColor: `${themeColors.primary.DEFAULT}40`,
                    }
                  ]}>
                    <Text style={[styles.sectionDescription, { color: themeColors.text.primary }]}>{currentSection.description}</Text>
                  </Card>
                )}

                {currentSection.fields.map((field, fieldIndex) => {
                  if (!field || !field.id && !field.key) {
                    console.warn('Invalid field found:', field);
                    return null;
                  }

                  try {
                    const key = `${currentSection.id}-${field.id || field.key}`;
                    const entry = entries[key];
                    
                    // CRITICAL FIX: Always use the key format (sectionRef-fieldKey) as entryId
                    // This ensures consistency between entries and photos
                    const properEntryId = entry?.id || key;

                    return (
                      <View key={field.id || field.key || `field-${Math.random()}`} style={styles.fieldContainer}>
                        <FieldWidget
                          field={field}
                          value={entry?.valueJson}
                          note={entry?.note}
                          photos={entry?.photos}
                          inspectionId={inspectionId}
                          entryId={properEntryId}
                          sectionName={currentSection.title}
                          isCheckOut={effectiveInspection?.type === 'check_out'}
                          markedForReview={entry?.markedForReview || false}
                          disabled={effectiveInspection?.status === 'completed' || isDeleted}
                          autoContext={{
                            inspectorName: inspector?.fullName || inspector?.username || inspector?.firstName || '',
                            address: property
                              ? [property.address, property.city, property.state, property.postalCode].filter(Boolean).join(', ')
                              : block
                                ? [block.address, block.city, block.state, block.postalCode].filter(Boolean).join(', ')
                                : '',
                            tenantNames: Array.isArray(tenants)
                              ? tenants
                                .filter((t: any) => t.status === 'active')
                                .map((t: any) => t.tenantName || t.name || `${t?.firstName || ''} ${t?.lastName || ''}`)
                                .filter(Boolean)
                                .join(', ')
                              : '',
                            inspectionDate: new Date(effectiveInspection?.scheduledDate || (effectiveInspection as any)?.startedAt || new Date().toISOString()).toISOString().split('T')[0],
                          }}
                          onChange={(value, note, photos) =>
                            handleFieldChange(currentSection.id, field.id || field.key || '', value, note, photos)
                          }
                          onMarkedForReviewChange={(marked) => {
                            handleFieldChange(currentSection.id, field.id || field.key || '', undefined, undefined, undefined, marked);
                          }}
                          onLogMaintenance={(fieldLabel, photos) => {
                            // Navigate to maintenance creation with context from inspection
                            // Navigate from RootStack -> Main -> Maintenance -> CreateMaintenance
                            try {
                              // Get the root navigator (RootStack)
                              const rootNavigator = navigation.getParent()?.getParent();
                              if (rootNavigator) {
                                rootNavigator.dispatch(
                                  CommonActions.navigate({
                                    name: 'Main',
                                    params: {
                                      screen: 'Maintenance',
                                      params: {
                                        screen: 'CreateMaintenance',
                                        params: {
                                          inspectionId,
                                          propertyId: effectiveInspection?.propertyId,
                                          blockId: effectiveInspection?.blockId,
                                          fieldLabel,
                                          photos,
                                          entryId: entry?.id,
                                          sectionTitle: currentSection?.title,
                                        },
                                      },
                                    },
                                  })
                                );
                              } else {
                                // Fallback: try tab navigator directly
                                const tabNavigator = navigation.getParent();
                                if (tabNavigator) {
                                  (tabNavigator as any).navigate('Maintenance', {
                                    screen: 'CreateMaintenance',
                                    params: {
                                      inspectionId,
                                      propertyId: effectiveInspection?.propertyId,
                                      blockId: effectiveInspection?.blockId,
                                      fieldLabel,
                                      photos,
                                      entryId: entry?.id,
                                      sectionTitle: currentSection?.title,
                                    },
                                  });
                                } else {
                                  console.error('[InspectionCapture] Could not find navigator');
                                }
                              }
                            } catch (error) {
                              console.error('[InspectionCapture] Navigation error:', error);
                            }
                          }}
                        />
                      </View>
                    );
                  } catch (error) {
                    console.error('Error rendering field:', field, error);
                    return (
                      <Card key={`error-${field.id || field.key || Math.random()}`} style={styles.fieldContainer}>
                        <Text style={[styles.errorText, { color: themeColors.text.primary }]}>Error rendering field: {field.label || field.id || field.key}</Text>
                      </Card>
                    );
                  }
                })}
              </>
            )}
            {!currentSection && (
              <View style={styles.centerContent}>
                <Text style={[styles.errorText, { color: themeColors.text.primary }]}>No section selected</Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Footer Navigation */}
        <View style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, spacing[3]),
            backgroundColor: themeColors.card.DEFAULT,
            borderTopColor: themeColors.border.light,
          }
        ]}>
          <View style={styles.footerActions}>
            <Button
              title="Previous"
              onPress={() => {
                const newIndex = Math.max(0, currentSectionIndex - 1);
                setCurrentSectionIndex(newIndex);
              }}
              disabled={!!(currentSectionIndex === 0 || sections.length === 0)}
              variant="outline"
              size="md"
              icon={<ChevronLeft size={18} color={themeColors.text.primary} />}
              style={styles.footerButton}
            />

            <Button
              title="Next"
              onPress={() => {
                const newIndex = Math.min(sections.length - 1, currentSectionIndex + 1);
                setCurrentSectionIndex(newIndex);
              }}
              disabled={!!(currentSectionIndex >= sections.length - 1 || sections.length === 0)}
              variant="outline"
              size="md"
              icon={<ChevronRight size={18} color={themeColors.text.primary} />}
              style={styles.footerButton}
            />
          </View>
        </View>

      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    borderBottomWidth: 1,
    paddingBottom: 0,
    ...shadows.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing[3],
  },
  headerTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    marginTop: 2,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.sm,
  },
  backButton: {
    padding: spacing[2],
    marginLeft: -spacing[2],
    borderRadius: borderRadius.md,
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
    marginTop: 0,
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  statusBadge: {
    marginRight: spacing[1],
  },
  mainActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
    gap: spacing[2],
  },
  actionButtonContainer: {
    flex: 1,
    minWidth: 0,
  },
  actionButton: {
    width: '100%',
    paddingVertical: moderateScale(spacing[2], 0.3),
    minHeight: getButtonHeight('sm'),
  },
  actionButtonText: {
    fontSize: getFontSize(typography.fontSize.xs),
  },
  badgeText: {
    fontSize: typography.fontSize.xs,
    marginLeft: spacing[1],
    fontWeight: typography.fontWeight.medium,
    // Color applied dynamically via Badge component
  },
  aiProgressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
  },
  progressContainer: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing[4],
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  progressLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    // Color applied dynamically via themeColors
  },
  progressPercent: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    // Color applied dynamically via themeColors
  },
  progressBar: {
    borderRadius: borderRadius.full,
  },
  tabsContainerWrapper: {
    marginBottom: spacing[5],
    marginTop: spacing[3],
    position: 'relative',
  },
  tabsContainerInner: {
    position: 'relative',
  },
  tabsContainer: {
    maxHeight: 60,
  },
  tabsContent: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    gap: spacing[2],
    alignItems: 'center',
  },
  tabButton: {
    paddingHorizontal: moderateScale(spacing[3], 0.3),
    paddingVertical: moderateScale(spacing[2], 0.3),
    borderRadius: moderateScale(borderRadius.full, 0.2),
    borderWidth: 1,
    marginRight: moderateScale(spacing[2], 0.3),
    minHeight: moderateScale(36, 0.2),
    justifyContent: 'center',
    alignItems: 'center',
    // Colors applied dynamically via themeColors
  },
  tabButtonText: {
    fontSize: getFontSize(typography.fontSize.xs),
    fontWeight: typography.fontWeight.medium,
    // Color applied dynamically via themeColors
  },
  tabButtonTextActive: {
    fontWeight: typography.fontWeight.semibold,
    // Color applied dynamically via themeColors
  },
  tabIndicator: {
    display: 'none',
  },
  tabsFadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 30,
    opacity: 0.8,
    pointerEvents: 'none',
    zIndex: 1,
    // Background color applied dynamically via themeColors
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: spacing[2],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
  },
  sectionDescriptionCard: {
    marginBottom: spacing[5],
    marginTop: spacing[3],
    borderWidth: 1.5,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    ...shadows.sm,
    // Colors applied dynamically via themeColors
  },
  sectionDescription: {
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.sm,
    // Color applied dynamically via themeColors
  },
  fieldContainer: {
    marginBottom: spacing[5],
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
    ...shadows.lg,
    // Colors applied dynamically via themeColors
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[2],
  },
  footerButton: {
    flex: 1,
    minHeight: moderateScale(44, 0.2),
  },
  aiProgressCard: {
    padding: spacing[4],
    marginBottom: spacing[4],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    // Colors applied dynamically via themeColors
  },
  aiProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  aiProgressTitleText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    // Color applied dynamically via themeColors
  },
  aiProgressCount: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    // Color applied dynamically via themeColors
  },
  aiProgressBar: {
    marginBottom: spacing[2],
  },
  aiProgressText: {
    fontSize: typography.fontSize.xs,
    // Color applied dynamically via themeColors
  },
  aiErrorCard: {
    marginBottom: spacing[4],
    borderWidth: 1,
    // Colors applied dynamically via themeColors
  },
  aiErrorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[1],
  },
  aiErrorTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    // Color applied dynamically via themeColors
  },
  aiErrorText: {
    fontSize: typography.fontSize.sm,
    // Color applied dynamically via themeColors
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  syncText: {
    fontSize: getFontSize(16),
    fontWeight: typography.fontWeight.normal,
    textAlign: 'center',
  },
  syncSubtext: {
    fontSize: getFontSize(14),
    fontWeight: typography.fontWeight.normal,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  copyCard: {
    margin: 16,
    padding: 16,
    borderWidth: 1,
    borderRadius: 8,
    // Colors applied dynamically via themeColors
  },
  copyCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  copyCardSubtext: {
    fontSize: 12,
    marginBottom: 12,
  },
  copyOptions: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    // Colors applied dynamically via themeColors
  },
  checkboxChecked: {
    // Background color applied dynamically via themeColors
  },
  checkboxLabel: {
    fontSize: 14,
  },
  copySuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  copySuccessText: {
    fontSize: 12,
    // Color applied dynamically via themeColors
  },
  aiProgressHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  aiProgressDescription: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing[2],
  },
  aiErrorMessage: {
    fontSize: typography.fontSize.sm,
    marginTop: spacing[1],
  },
  offlineBanner: {
    margin: spacing[4],
    marginBottom: spacing[3],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    // Colors applied dynamically via themeColors
  },
  offlineBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  offlineBannerTextContainer: {
    flex: 1,
  },
  offlineBannerText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing[1],
  },
  offlineBannerDescription: {
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.xs,
    marginBottom: spacing[1],
  },
  offlineBannerSubtext: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  syncBanner: {
    margin: spacing[4],
    marginBottom: spacing[3],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    // Colors applied dynamically via themeColors
  },
  syncBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  syncBannerText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    flex: 1,
    // Color applied dynamically via themeColors
  },
  syncButton: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.md,
    // Background color applied dynamically via themeColors
  },
  syncButtonText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    // Color applied dynamically via themeColors
  },
  completedBanner: {
    margin: spacing[4],
    marginBottom: spacing[3],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    // Colors applied dynamically via themeColors
  },
  completedBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  completedBannerTextContainer: {
    flex: 1,
  },
  completedBannerText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing[1],
    // Color applied dynamically via themeColors
  },
  completedBannerDescription: {
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.xs,
    // Color applied dynamically via themeColors
  },
  deletedBanner: {
    margin: spacing[4],
    marginBottom: spacing[3],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    // Colors applied dynamically via themeColors
  },
  deletedBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  deletedBannerTextContainer: {
    flex: 1,
  },
  deletedBannerText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing[1],
    // Color applied dynamically via themeColors
  },
  deletedBannerDescription: {
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.xs,
    // Color applied dynamically via themeColors
  },
});
