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
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { inspectionsService, type InspectionEntry } from '../../services/inspections';
import { propertiesService } from '../../services/properties';
import { authService } from '../../services/auth';
import type { InspectionsStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Input from '../../components/ui/Input';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { FieldWidget } from '../../components/inspections/FieldWidget';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Save, CheckCircle2, Sparkles, Wifi, WifiOff, Check, Cloud, X, AlertCircle } from 'lucide-react-native';
import Badge from '../../components/ui/Badge';
import Progress from '../../components/ui/Progress';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { offlineQueue } from '../../services/offlineQueue';
import Constants from 'expo-constants';
import InspectionQuickActions from '../../components/inspections/InspectionQuickActions';

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

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [entries, setEntries] = useState<Record<string, InspectionEntry>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copyImages, setCopyImages] = useState(false);
  const [copyNotes, setCopyNotes] = useState(false);
  const [copiedImageKeys, setCopiedImageKeys] = useState<Set<string>>(new Set());
  const [copiedNoteKeys, setCopiedNoteKeys] = useState<Set<string>>(new Set());

  // Fetch inspection with template snapshot
  const { data: inspection, isLoading: inspectionLoading, error: inspectionError } = useQuery({
    queryKey: [`/api/inspections/${inspectionId}`],
    queryFn: () => inspectionsService.getInspection(inspectionId),
    retry: 1,
    retryDelay: 1000,
    staleTime: 30000,
  });

  // Fetch property details
  const { data: property } = useQuery({
    queryKey: [`/api/properties/${inspection?.propertyId}`],
    queryFn: () => propertiesService.getProperty(inspection!.propertyId!),
    enabled: !!inspection?.propertyId,
    retry: 1,
    staleTime: 60000,
  });

  // Fetch block details
  const { data: block } = useQuery({
    queryKey: [`/api/blocks/${inspection?.blockId}`],
    queryFn: () => propertiesService.getBlock(inspection!.blockId!),
    enabled: !!inspection?.blockId,
    retry: 1,
    staleTime: 60000,
  });

  // Fetch inspector details
  const { data: inspector } = useQuery({
    queryKey: [`/api/users/${inspection?.assignedToId}`],
    queryFn: () => authService.getUser(inspection!.assignedToId!),
    enabled: !!inspection?.assignedToId,
    retry: 1,
    staleTime: 60000,
  });

  // Fetch tenants
  const { data: tenants = [] } = useQuery({
    queryKey: [`/api/properties/${inspection?.propertyId}/tenants`],
    queryFn: () => propertiesService.getPropertyTenants(inspection!.propertyId!),
    enabled: !!inspection?.propertyId,
    retry: 1,
    staleTime: 60000,
  });

  // Fetch existing entries
  const { data: existingEntries = [], error: entriesError } = useQuery({
    queryKey: [`/api/inspections/${inspectionId}/entries`],
    queryFn: () => inspectionsService.getInspectionEntries(inspectionId),
    enabled: !!inspectionId,
    retry: 1,
    staleTime: 60000, // Increased to 60 seconds to reduce refetching
    refetchOnWindowFocus: false, // Disable refetch on window focus
    refetchOnReconnect: false, // Disable refetch on reconnect
  });

  // Fetch most recent check-in for check-out inspections
  const { data: checkInData } = useQuery({
    queryKey: [`/api/properties/${inspection?.propertyId}/most-recent-checkin`],
    queryFn: () => inspectionsService.getMostRecentCheckIn(inspection!.propertyId!),
    enabled: !!inspection?.propertyId && inspection?.type === 'check_out',
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
      Alert.alert('AI Analysis Complete', 'All inspection fields have been analyzed.');
    }
  }, [aiAnalysisStatus?.status, inspectionId, queryClient]);

  // Load existing entries into state
  // Always update entries when existingEntries changes (to support copy from check-in)
  useEffect(() => {
    if (!existingEntries || existingEntries.length === 0) {
      return;
    }

    const entriesMap: Record<string, InspectionEntry> = {};
    existingEntries.forEach((entry: any) => {
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
            // Preserve any local unsaved changes for valueJson if entry hasn't been copied
            valueJson: serverEntry.valueJson !== undefined ? serverEntry.valueJson : localEntry.valueJson,
            // Always use server photos and notes when they exist (from copy operation)
            photos: serverEntry.photos && serverEntry.photos.length > 0 ? serverEntry.photos : localEntry.photos,
            note: serverEntry.note !== undefined ? serverEntry.note : localEntry.note,
          };
          merged[key] = mergedEntry;
        }
      });
      return merged;
    });
  }, [existingEntries]);

  // Parse template structure (memoized to prevent re-parsing on every render)
  const sections = useMemo(() => {
    if (!inspection?.templateSnapshotJson) {
      if (inspection?.templateId) {
        console.warn('No templateSnapshotJson found, but templateId exists:', inspection.templateId);
      }
      return [];
    }

    let rawTemplateStructure: { sections: TemplateSection[] } | null = null;

    if (typeof inspection.templateSnapshotJson === 'string') {
      try {
        rawTemplateStructure = JSON.parse(inspection.templateSnapshotJson);
      } catch (e) {
        console.error('Failed to parse templateSnapshotJson:', e);
        return [];
      }
    } else {
      rawTemplateStructure = inspection.templateSnapshotJson as { sections: TemplateSection[] };
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
  }, [inspection?.templateSnapshotJson, inspection?.templateId]);

  // Debug logging
  useEffect(() => {
    if (inspection) {
      console.log('Inspection loaded:', {
        id: inspection.id,
        hasTemplateSnapshot: !!inspection.templateSnapshotJson,
        templateId: inspection.templateId,
        sectionsCount: sections.length,
      });
    }
  }, [inspection, sections.length]);

  // Update entry mutation
  const updateEntry = useMutation({
    mutationFn: async (entry: InspectionEntry) => {
      return inspectionsService.saveInspectionEntry({
        ...entry,
        inspectionId,
      });
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
      if (data.modifiedImageKeys?.length) {
        setCopiedImageKeys((prev: Set<string>) => {
          const next = new Set(prev);
          data.modifiedImageKeys!.forEach((k: string) => next.add(k));
          return next;
        });
      }
      if (data.modifiedNoteKeys?.length) {
        setCopiedNoteKeys((prev: Set<string>) => {
          const next = new Set(prev);
          data.modifiedNoteKeys!.forEach((k: string) => next.add(k));
          return next;
        });
      }

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
    if (inspection && inspection.status === 'scheduled' && !(inspection as any).startedAt && !hasAutoStarted) {
      setHasAutoStarted(true);
      updateStatusMutation.mutate({
        status: 'in_progress',
        startedAt: new Date().toISOString(),
      });
    }
  }, [inspection, hasAutoStarted]);

  // Track if copy has been triggered to prevent re-triggering
  const copyTriggeredRef = useRef<{ copyImages: boolean; copyNotes: boolean }>({ copyImages: false, copyNotes: false });

  // Copy from check-in when checkboxes are checked (debounced to prevent rapid firing)
  useEffect(() => {
    if (!checkInData || !checkInData.entries || !inspection || inspection.type !== 'check_out') {
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

  const handleTabsScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isScrolledToEnd = contentOffset.x + layoutMeasurement.width >= contentSize.width - 10;
    setShowRightFade(!isScrolledToEnd);
  };

  // Update fade indicator when sections change
  useEffect(() => {
    // Check if there are more tabs to scroll (approximate)
    setShowRightFade(sections.length > 2); // Show fade if more than 2 tabs (rough estimate)
  }, [sections.length]);

  const handleFieldChange = React.useCallback((sectionRef: string, fieldKey: string, value: any, note?: string, photos?: string[]) => {
    const key = `${sectionRef}-${fieldKey}`;

    setEntries(prev => {
      const existingEntry = prev[key];
      const fieldType = sections.find(s => s.id === sectionRef)?.fields.find(f => f.id === fieldKey || f.key === fieldKey)?.type || 'text';

      const newEntry: InspectionEntry = {
        ...existingEntry,
        inspectionId,
        sectionRef,
        fieldKey,
        fieldType,
        valueJson: value,
        note,
        photos: photos || existingEntry?.photos || [],
      };

      // Auto-save using mutation
      updateEntry.mutate(newEntry);

      return { ...prev, [key]: newEntry };
    });
  }, [inspectionId, sections, updateEntry]);

  const handleComplete = async () => {
    // Check if progress is less than 100%
    const progressPercentage = Math.round(progress);
    const isIncomplete = progressPercentage < 100;

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
            onPress: async () => {
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
            },
          },
        ]
      );
    } else {
      // Complete without confirmation if 100% complete
      try {
        const now = new Date().toISOString();
        await updateStatusMutation.mutateAsync({
          status: 'completed',
          completedDate: now,
          submittedAt: now,
        });
        Alert.alert(
          'Success',
          'Inspection completed successfully!',
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
    }
  };

  const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5005';

  // Handle sync
  const handleSync = async () => {
    if (isSyncing || pendingCount === 0 || !isOnline) return;

    setIsSyncing(true);
    try {
      const result = await offlineQueue.syncQueue();
      if (result.success > 0) {
        Alert.alert('Sync Complete', `${result.success} ${result.success === 1 ? 'entry' : 'entries'} synced successfully`);
        queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}/entries`] });
      }
      if (result.failed > 0) {
        Alert.alert('Sync Issues', `${result.failed} ${result.failed === 1 ? 'entry' : 'entries'} failed to sync`);
      }
      setPendingCount(await offlineQueue.getQueueSize());
    } catch (error: any) {
      Alert.alert('Sync Failed', error.message || 'Unable to sync offline entries');
    } finally {
      setIsSyncing(false);
    }
  };

  // Update pending count (less frequently to reduce re-renders)
  useEffect(() => {
    const updateCount = async () => {
      try {
        const count = await offlineQueue.getQueueSize();
        setPendingCount(prev => {
          // Only update if count actually changed to prevent unnecessary re-renders
          if (prev !== count) {
            return count;
          }
          return prev;
        });
      } catch (error) {
        console.error('Error updating pending count:', error);
      }
    };
    updateCount();
    // Update every 5 seconds instead of 2 to reduce re-renders
    const interval = setInterval(updateCount, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync when coming online (disabled to prevent freezing - user can manually sync)
  // Commented out to prevent automatic syncing that might cause freezing
  // Users can manually trigger sync using the sync button
  /*
  const hasAutoSyncedRef = useRef(false);
  const lastSyncTimeRef = useRef(0);
  
  useEffect(() => {
    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTimeRef.current;
    
    if (isOnline && pendingCount > 0 && !isSyncing && !hasAutoSyncedRef.current && timeSinceLastSync > 30000) {
      hasAutoSyncedRef.current = true;
      lastSyncTimeRef.current = now;
      
      handleSync().finally(() => {
        setTimeout(() => {
          hasAutoSyncedRef.current = false;
        }, 30000);
      });
    } else if (!isOnline) {
      hasAutoSyncedRef.current = false;
    }
  }, [isOnline, pendingCount]);
  */

  if (inspectionLoading) {
    return (
      <View style={styles.container}>
        <LoadingSpinner />
      </View>
    );
  }

  if (inspectionError) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>Failed to load inspection</Text>
        <Text style={styles.errorSubtext}>
          {(inspectionError as any)?.message || 'An error occurred while loading the inspection.'}
        </Text>
        <Button
          title="Go Back"
          onPress={() => navigation.goBack()}
          variant="secondary"
        />
      </View>
    );
  }

  if (!inspection) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>Inspection not found</Text>
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
        <Text style={styles.errorText}>No template found for this inspection</Text>
        <Text style={styles.errorSubtext}>
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
      <View style={styles.container}>
        {/* Fixed Header - Only Back Button and Title */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing[3]) }]}>
          <View style={styles.headerTop}>
            <TouchableOpacity 
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <ChevronLeft size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {property?.name || block?.name || 'Inspection Capture'}
              </Text>
              <Text style={styles.headerSubtitle} numberOfLines={2}>
                {property?.address || block?.address || (inspection.propertyId ? 'Property' : 'Block') + ' Inspection'}
              </Text>
            </View>
          </View>
        </View>

        {/* AI Analysis Progress */}
        {aiAnalysisStatus?.status === 'processing' && (
          <Card style={styles.aiProgressCard}>
            <View style={styles.aiProgressHeader}>
              <View style={styles.aiProgressHeaderLeft}>
                <Sparkles size={16} color={colors.primary.DEFAULT} />
                <Text style={styles.aiProgressTitle}>AI Analysis in Progress</Text>
              </View>
              <Text style={styles.aiProgressCount}>
                {aiAnalysisStatus.progress} / {aiAnalysisStatus.totalFields} fields
              </Text>
            </View>
            <Progress value={(aiAnalysisStatus.progress / (aiAnalysisStatus.totalFields || 1)) * 100} height={8} />
            <Text style={styles.aiProgressDescription}>
              You can continue working while the AI analyzes your inspection photos in the background.
            </Text>
          </Card>
        )}

        {/* AI Analysis Error */}
        {aiAnalysisStatus?.status === 'failed' && aiAnalysisStatus.error && (
          <Card style={styles.aiErrorCard}>
            <View style={styles.aiErrorHeader}>
              <AlertCircle size={16} color={colors.destructive.DEFAULT} />
              <Text style={styles.aiErrorTitle}>AI Analysis Failed</Text>
            </View>
            <Text style={styles.aiErrorMessage}>{aiAnalysisStatus.error}</Text>
          </Card>
        )}

        {/* Copy from Previous Check-In (only for check-out inspections) */}
        {inspection?.type === 'check_out' && (
          <Card style={styles.copyCard}>
            <Text style={styles.copyCardTitle}>Copy from Previous Check-In</Text>
            {checkInData ? (
              <>
                <Text style={styles.copyCardSubtext}>
                  Copy data from the most recent check-in inspection ({checkInData.inspection.scheduledDate ? new Date(checkInData.inspection.scheduledDate).toLocaleDateString() : 'N/A'})
                </Text>
                <View style={styles.copyOptions}>
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setCopyImages(!copyImages)}
                    disabled={!!copyFromCheckIn.isPending}
                  >
                    <View style={[styles.checkbox, copyImages && styles.checkboxChecked]}>
                      {copyImages && <Check size={16} color="#fff" />}
                    </View>
                    <Text style={styles.checkboxLabel}>Copy Images</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setCopyNotes(!copyNotes)}
                    disabled={!!copyFromCheckIn.isPending}
                  >
                    <View style={[styles.checkbox, copyNotes && styles.checkboxChecked]}>
                      {copyNotes && <Check size={16} color="#fff" />}
                    </View>
                    <Text style={styles.checkboxLabel}>Copy Notes</Text>
                  </TouchableOpacity>
                </View>
                {(copyImages || copyNotes) && (
                  <View style={styles.copySuccess}>
                    <CheckCircle2 size={16} color="#34C759" />
                    <Text style={styles.copySuccessText}>
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
              <Text style={styles.copyCardSubtext}>
                No previous check-in inspection found for this property.
              </Text>
            )}
          </Card>
        )}

        {/* Content */}
        <ScrollView 
          style={styles.content} 
          contentContainerStyle={[
            styles.contentContainer,
            { 
              paddingTop: Math.max(insets.top + spacing[4], spacing[8]),
              paddingBottom: Math.max(insets.bottom + 80, spacing[8]) 
            }
          ]}
        >
          {/* Quick Actions Row */}
          <View style={styles.quickActionsRow}>
            {/* Online/Offline Badge */}
            <View style={styles.statusBadge}>
              <Badge variant={isOnline ? 'default' : 'secondary'} size="sm">
                {isOnline ? <Wifi size={12} color={isOnline ? colors.primary.foreground : colors.text.secondary} /> : <WifiOff size={12} color={colors.text.secondary} />}
                <Text style={styles.badgeText}>{isOnline ? 'Online' : 'Offline'}</Text>
              </Badge>
            </View>

            {/* Pending Sync Badge */}
            {pendingCount > 0 && (
              <View style={styles.statusBadge}>
                <Badge variant="outline" size="sm">
                  <Cloud size={12} color={colors.text.secondary} />
                  <Text style={styles.badgeText}>{pendingCount} pending</Text>
                </Badge>
              </View>
            )}

            {/* Manual Sync Button */}
            {isOnline && pendingCount > 0 && (
              <Button
                title={isSyncing ? 'Syncing...' : 'Sync'}
                onPress={handleSync}
                disabled={!!isSyncing}
                variant="outline"
                size="sm"
                style={styles.actionButton}
              />
            )}

            {/* Progress Badge */}
            <View style={styles.statusBadge}>
              <Badge variant="secondary" size="sm">
                <Text style={styles.badgeText}>{completedFields}/{totalFields}</Text>
              </Badge>
            </View>
          </View>

          {/* Main Action Buttons */}
          <View style={styles.mainActionsRow}>
            {/* AI Analysis Button */}
            {aiAnalysisStatus?.status === 'processing' ? (
              <View style={styles.actionButtonContainer}>
                <Badge variant="outline" size="sm" style={styles.aiProgressBadge}>
                  <ActivityIndicator size="small" color={colors.primary.DEFAULT} />
                  <Text style={styles.badgeText}>
                    Analysing ({aiAnalysisStatus.progress}/{aiAnalysisStatus.totalFields})
                  </Text>
                </Badge>
              </View>
            ) : aiAnalysisStatus?.status === 'completed' ? (
              <View style={styles.actionButtonContainer}>
                <Badge variant="default" size="sm" style={styles.aiCompleteBadge}>
                  <CheckCircle2 size={14} color="#fff" />
                  <Text style={[styles.badgeText, { color: '#fff' }]}>AI Complete</Text>
                </Badge>
              </View>
            ) : (
              <View style={styles.actionButtonContainer}>
                <Button
                  title="AI Analyse"
                  onPress={() => startAIAnalysis.mutate()}
                  disabled={!!(startAIAnalysis.isPending || !isOnline)}
                  variant="default"
                  size="sm"
                  icon={<Sparkles size={14} color={colors.primary.foreground} />}
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
                  disabled={!!updateStatusMutation.isPending}
                  variant="default"
                  size="sm"
                  icon={<CheckCircle2 size={14} color={colors.primary.foreground} />}
                  loading={updateStatusMutation.isPending}
                  style={styles.actionButton}
                  textStyle={styles.actionButtonText}
                />
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Progress</Text>
              <Text style={styles.progressPercent}>{Math.round(progress)}%</Text>
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
                      index === currentSectionIndex && styles.tabButtonActive
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.tabButtonText,
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
              {showRightFade && <View style={styles.tabsFadeRight} pointerEvents="none" />}
            </View>
          </View>

          {currentSection && currentSection.fields && (
            <>
              {currentSection.description && (
                <Card style={styles.sectionDescriptionCard}>
                  <Text style={styles.sectionDescription}>{currentSection.description}</Text>
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

                  return (
                    <View key={field.id || field.key || `field-${Math.random()}`} style={styles.fieldContainer}>
                      <FieldWidget
                        field={field}
                        value={entry?.valueJson}
                        note={entry?.note}
                        photos={entry?.photos}
                        inspectionId={inspectionId}
                        entryId={entry?.id}
                        sectionName={currentSection.title}
                        isCheckOut={inspection?.type === 'check_out'}
                        markedForReview={entry?.markedForReview || false}
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
                          inspectionDate: new Date(inspection?.scheduledDate || (inspection as any).startedAt || new Date().toISOString()).toISOString().split('T')[0],
                        }}
                        onChange={(value, note, photos) =>
                          handleFieldChange(currentSection.id, field.id || field.key || '', value, note, photos)
                        }
                        onMarkedForReviewChange={async (marked) => {
                          const key = `${currentSection.id}-${field.id || field.key || ''}`;
                          const existingEntry = entries[key];

                          // Update local state optimistically
                          setEntries(prev => ({
                            ...prev,
                            [key]: {
                              ...prev[key],
                              markedForReview: marked,
                            }
                          }));

                          if (existingEntry?.id) {
                            // Update on server
                            try {
                              await inspectionsService.updateInspectionEntry(existingEntry.id, { markedForReview: marked });
                              queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}/entries`] });
                            } catch (error: any) {
                              Alert.alert('Error', 'Failed to update mark for review');
                              // Revert optimistic update
                              setEntries(prev => ({
                                ...prev,
                                [key]: {
                                  ...prev[key],
                                  markedForReview: !marked,
                                }
                              }));
                            }
                          }
                        }}
                        onLogMaintenance={(fieldLabel, photos) => {
                          // Navigate to maintenance creation with context
                          (navigation as any).navigate('CreateMaintenance', {
                            inspectionId,
                            fieldLabel,
                            photos,
                          } as any);
                        }}
                      />
                    </View>
                  );
                } catch (error) {
                  console.error('Error rendering field:', field, error);
                  return (
                    <Card key={`error-${field.id || field.key || Math.random()}`} style={styles.fieldContainer}>
                      <Text style={styles.errorText}>Error rendering field: {field.label || field.id || field.key}</Text>
                    </Card>
                  );
                }
              })}
            </>
          )}
          {!currentSection && (
            <View style={styles.centerContent}>
              <Text style={styles.errorText}>No section selected</Text>
            </View>
          )}
        </ScrollView>

        {/* Footer Navigation */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
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
              icon={<ChevronLeft size={18} color={colors.text.primary} />}
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
              icon={<ChevronRight size={18} color={colors.text.primary} />}
              style={styles.footerButton}
            />
          </View>
        </View>

        {/* Quick Actions FAB */}
        <InspectionQuickActions
          inspectionId={inspectionId}
          propertyId={inspection?.propertyId}
          blockId={inspection?.blockId}
          onAddAsset={() => {
            // Navigate to add asset screen
            (navigation as any).navigate('AssetDetail', {
              inspectionId,
              propertyId: inspection?.propertyId,
              blockId: inspection?.blockId,
              mode: 'create',
            } as any);
          }}
          onUpdateAsset={() => {
            // Navigate to asset list to select asset to update
            (navigation as any).navigate('AssetInventory', {
              inspectionId,
              propertyId: inspection?.propertyId,
              blockId: inspection?.blockId,
              mode: 'select',
            } as any);
          }}
          onLogMaintenance={() => {
            (navigation as any).navigate('CreateMaintenance', {
              inspectionId,
              propertyId: inspection?.propertyId,
              blockId: inspection?.blockId,
            } as any);
          }}
        />
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.card.DEFAULT,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    paddingBottom: spacing[4],
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
    color: colors.text.primary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing[1],
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
    marginTop: spacing[4],
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
    paddingVertical: spacing[2],
    minHeight: 36,
  },
  actionButtonText: {
    fontSize: typography.fontSize.xs,
  },
  badgeText: {
    fontSize: typography.fontSize.xs,
    marginLeft: spacing[1],
    fontWeight: typography.fontWeight.medium,
  },
  aiProgressBadge: {
    backgroundColor: colors.primary.light,
    borderColor: colors.primary.DEFAULT,
  },
  aiCompleteBadge: {
    backgroundColor: colors.success || '#10B981',
  },
  progressContainer: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.background,
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
    color: colors.text.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressPercent: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary.DEFAULT,
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
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    marginRight: spacing[2],
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.primary.DEFAULT,
    borderColor: colors.primary.DEFAULT,
    ...shadows.xs,
  },
  tabButtonText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.secondary,
  },
  tabButtonTextActive: {
    color: colors.primary.foreground || '#ffffff',
    fontWeight: typography.fontWeight.semibold,
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
    backgroundColor: colors.card.DEFAULT,
    opacity: 0.8,
    pointerEvents: 'none',
    zIndex: 1,
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
    backgroundColor: colors.primary.light || '#E0F7FA',
    borderWidth: 1.5,
    borderColor: colors.primary.DEFAULT + '40',
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    ...shadows.sm,
  },
  sectionDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.sm,
  },
  fieldContainer: {
    marginBottom: spacing[5],
  },
  footer: {
    backgroundColor: colors.card.DEFAULT,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
    ...shadows.lg,
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
  },
  aiProgressCard: {
    padding: spacing[4],
    marginBottom: spacing[4],
    backgroundColor: colors.primary.light || `${colors.primary.DEFAULT}0D`,
    borderWidth: 1,
    borderColor: colors.primary.DEFAULT + '33',
    borderRadius: borderRadius.lg,
  },
  aiProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  aiProgressTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  aiProgressTitleText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  aiProgressCount: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  aiProgressBar: {
    marginBottom: spacing[2],
  },
  aiProgressText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  aiErrorCard: {
    marginBottom: spacing[4],
    backgroundColor: colors.destructive.DEFAULT + '10',
    borderWidth: 1,
    borderColor: colors.destructive.DEFAULT,
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
    color: colors.destructive.DEFAULT,
  },
  aiErrorText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  copyCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#f0f7ff',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
  },
  copyCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  copyCardSubtext: {
    fontSize: 12,
    color: '#666',
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
    borderColor: '#007AFF',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#000',
  },
  copySuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  copySuccessText: {
    fontSize: 12,
    color: '#34C759',
  },
  aiProgressHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  aiProgressDescription: {
    fontSize: typography.fontSize.xs,
    color: colors.text.muted || colors.text.secondary,
    marginTop: spacing[2],
  },
  aiErrorMessage: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing[1],
  },
});
