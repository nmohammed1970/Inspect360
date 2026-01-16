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
import { ChevronLeft, ChevronRight, Save, CheckCircle2, Sparkles, Wifi, WifiOff, Check, FileText, Download, Cloud } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Badge from '../../components/ui/Badge';
import Progress from '../../components/ui/Progress';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { offlineQueue } from '../../services/offlineQueue';
import Constants from 'expo-constants';

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
  const { inspectionId } = route.params;
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [entries, setEntries] = useState<Record<string, InspectionEntry>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [copyImages, setCopyImages] = useState(false);
  const [copyNotes, setCopyNotes] = useState(false);

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
    queryKey: [`/api/users/${inspection?.inspectorId}`],
    queryFn: () => authService.getUser(inspection!.inspectorId!),
    enabled: !!inspection?.inspectorId,
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

  // AI Analysis status - only poll if explicitly started
  const { data: aiAnalysisStatus } = useQuery({
    queryKey: [`/api/ai/analyze-inspection/${inspectionId}/status`],
    queryFn: () => inspectionsService.getAIAnalysisStatus(inspectionId),
    enabled: false, // Disabled by default, only enable when analysis is started
    retry: 1,
    refetchInterval: false, // Disable automatic polling
  });

  // Load existing entries into state
  // Load existing entries into state (only when entries data changes)
  const entriesLoadedRef = useRef(false);
  useEffect(() => {
    if (!existingEntries || existingEntries.length === 0) {
      entriesLoadedRef.current = false;
      return;
    }

    // Only load entries once when they first arrive
    if (entriesLoadedRef.current) {
      return;
    }

    entriesLoadedRef.current = true;
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
      // Only merge new entries, don't overwrite existing ones that might have been edited
      const merged = { ...prev };
      Object.keys(entriesMap).forEach(key => {
        // Only set if entry doesn't exist or if it's a new entry from server
        if (!merged[key] || entriesMap[key].id !== merged[key].id) {
          merged[key] = entriesMap[key];
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
    mutationFn: async ({ status, startedAt }: { status: string; startedAt?: string }) => {
      if (startedAt) {
        await inspectionsService.updateInspection(inspectionId, { status, startedAt } as any);
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
        setCopiedImageKeys(prev => {
          const next = new Set(prev);
          data.modifiedImageKeys!.forEach((k: string) => next.add(k));
          return next;
        });
      }
      if (data.modifiedNoteKeys?.length) {
        setCopiedNoteKeys(prev => {
          const next = new Set(prev);
          data.modifiedNoteKeys!.forEach((k: string) => next.add(k));
          return next;
        });
      }

      // Invalidate and refetch entries
      queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}/entries`] });
      setTimeout(async () => {
        await queryClient.refetchQueries({ queryKey: [`/api/inspections/${inspectionId}/entries`] });
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
      // Enable the query and start polling
      queryClient.setQueryData([`/api/ai/analyze-inspection/${inspectionId}/status`], {
        status: 'processing',
        progress: 0,
        totalFields: 0,
        error: null,
      });
      // Manually refetch status every 2 seconds while processing
      const pollInterval = setInterval(async () => {
        try {
          const status = await inspectionsService.getAIAnalysisStatus(inspectionId);
          queryClient.setQueryData([`/api/ai/analyze-inspection/${inspectionId}/status`], status);
          if (status.status !== 'processing') {
            clearInterval(pollInterval);
          }
        } catch (error) {
          clearInterval(pollInterval);
        }
      }, 2000);
      Alert.alert('AI Analysis Started', 'Analysis is running in the background. You can continue working.');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to start AI analysis');
    },
  });

  // Auto-start inspection on first visit (only once)
  const [hasAutoStarted, setHasAutoStarted] = useState(false);
  useEffect(() => {
    if (inspection && inspection.status === 'scheduled' && !inspection.startedAt && !hasAutoStarted) {
      setHasAutoStarted(true);
      updateStatusMutation.mutate({
        status: 'in_progress',
        startedAt: new Date().toISOString(),
      });
    }
  }, [inspection, hasAutoStarted]);

  // Track if copy has been triggered to prevent re-triggering
  const copyImagesTriggeredRef = useRef(false);
  const copyNotesTriggeredRef = useRef(false);

  // Copy images from check-in when checkbox is checked (debounced to prevent rapid firing)
  useEffect(() => {
    if (!checkInData || !checkInData.entries || !inspection || inspection.type !== 'check_out') {
      copyImagesTriggeredRef.current = false;
      return;
    }

    if (copyImages && !copyImagesTriggeredRef.current && !copyFromCheckIn.isPending) {
      copyImagesTriggeredRef.current = true;
      // Use setTimeout to debounce and prevent rapid firing
      const timeoutId = setTimeout(() => {
        copyFromCheckIn.mutate({ copyImages: true, copyNotes: false });
      }, 300);
      return () => clearTimeout(timeoutId);
    } else if (!copyImages) {
      copyImagesTriggeredRef.current = false;
    }
    // Only depend on copyImages to prevent re-triggering when other dependencies change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyImages]);

  // Copy notes from check-in when checkbox is checked (debounced to prevent rapid firing)
  useEffect(() => {
    if (!checkInData || !checkInData.entries || !inspection || inspection.type !== 'check_out') {
      copyNotesTriggeredRef.current = false;
      return;
    }

    if (copyNotes && !copyNotesTriggeredRef.current && !copyFromCheckIn.isPending) {
      copyNotesTriggeredRef.current = true;
      // Use setTimeout to debounce and prevent rapid firing
      const timeoutId = setTimeout(() => {
        copyFromCheckIn.mutate({ copyImages: false, copyNotes: true });
      }, 300);
      return () => clearTimeout(timeoutId);
    } else if (!copyNotes) {
      copyNotesTriggeredRef.current = false;
    }
    // Only depend on copyNotes to prevent re-triggering when other dependencies change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyNotes]);

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

  const handleFieldChange = (sectionRef: string, fieldKey: string, value: any, note?: string, photos?: string[]) => {
    const key = `${sectionRef}-${fieldKey}`;
    const existingEntry = entries[key];
    
    const newEntry: InspectionEntry = {
      ...existingEntry,
      inspectionId,
      sectionRef,
      fieldKey,
      fieldType: currentSection?.fields.find(f => f.id === fieldKey || f.key === fieldKey)?.type || 'text',
      valueJson: value,
      note,
      photos,
    };

    setEntries(prev => ({ ...prev, [key]: newEntry }));
    
    // Auto-save
    updateEntry.mutate(newEntry);
  };

  const handleComplete = async () => {
    try {
      await updateStatusMutation.mutateAsync({ status: 'completed' });
      navigation.navigate('InspectionReview', { inspectionId });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to complete inspection');
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

  // Generate PDF
  const handleGeneratePDF = async () => {
    if (!inspection || !isOnline) {
      Alert.alert('Offline', 'PDF generation requires an internet connection');
      return;
    }

    setIsGeneratingPDF(true);
    try {
      const response = await fetch(`${API_URL}/api/inspections/${inspectionId}/pdf`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Get response as blob
      const blob = await response.blob();
      
      // Convert blob to base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64String = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Save to file system
      const fileName = `${inspection.propertyId ? 'property' : 'block'}_inspection_${inspectionId}_${new Date().toISOString().split('T')[0]}.pdf`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save Inspection PDF',
        });
        Alert.alert('PDF Generated', 'Your inspection report has been saved and is ready to share.');
      } else {
        Alert.alert('PDF Generated', `PDF saved to: ${fileUri}`);
      }
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      Alert.alert('Error', error.message || 'Failed to generate PDF report. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <ChevronLeft size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Inspection Capture</Text>
            <Text style={styles.headerSubtitle}>
              {inspection.propertyId ? 'Property' : 'Block'} Inspection
            </Text>
          </View>
        </View>

        {/* Header Actions Row */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.headerActions}
          contentContainerStyle={styles.headerActionsContent}
        >
          {/* Online/Offline Badge */}
          <Badge variant={isOnline ? 'default' : 'secondary'} size="sm">
            {isOnline ? <Wifi size={14} color={isOnline ? colors.primary.foreground : colors.text.secondary} /> : <WifiOff size={14} color={colors.text.secondary} />}
            <Text style={styles.badgeText}>{isOnline ? 'Online' : 'Offline'}</Text>
          </Badge>

          {/* Pending Sync Badge */}
          {pendingCount > 0 && (
            <Badge variant="outline" size="sm">
              <Cloud size={14} color={colors.text.secondary} />
              <Text style={styles.badgeText}>{pendingCount} pending</Text>
            </Badge>
          )}

          {/* Manual Sync Button */}
          {isOnline && pendingCount > 0 && (
            <Button
              title={isSyncing ? 'Syncing...' : 'Sync'}
              onPress={handleSync}
              disabled={!!isSyncing}
              variant="outline"
              size="sm"
              style={styles.syncButton}
            />
          )}

          {/* Progress Badge */}
          <Badge variant="secondary" size="sm">
            <Text style={styles.badgeText}>{completedFields} / {totalFields} fields</Text>
          </Badge>

          {/* AI Analysis Status */}
          {aiAnalysisStatus?.status === 'processing' ? (
            <Badge variant="outline" size="sm">
              <ActivityIndicator size="small" color={colors.primary.DEFAULT} />
              <Text style={styles.badgeText}>
                Analysing ({aiAnalysisStatus.progress}/{aiAnalysisStatus.totalFields})
              </Text>
            </Badge>
          ) : aiAnalysisStatus?.status === 'completed' ? (
            <Badge variant="default" size="sm" style={styles.aiCompleteBadge}>
              <CheckCircle2 size={14} color="#fff" />
              <Text style={[styles.badgeText, { color: '#fff' }]}>AI Analysis Complete</Text>
            </Badge>
          ) : (
            <Button
              title="AI Analyse"
              onPress={() => startAIAnalysis.mutate()}
              disabled={!!(startAIAnalysis.isPending || !isOnline)}
              variant="default"
              size="sm"
              icon={<Sparkles size={16} color={colors.primary.foreground} />}
              style={styles.aiButton}
            />
          )}

          {/* Generate PDF Button */}
          <Button
            title="PDF"
            onPress={handleGeneratePDF}
            disabled={!!(isGeneratingPDF || !isOnline)}
            variant="outline"
            size="sm"
            icon={<FileText size={16} color={colors.text.primary} />}
            loading={isGeneratingPDF}
            style={styles.pdfButton}
          />

          {/* Complete Inspection Button */}
          <Button
            title="Complete"
            onPress={handleComplete}
            disabled={!!(updateStatusMutation.isPending || progress < 100)}
            variant="default"
            size="sm"
            icon={<CheckCircle2 size={16} color={colors.primary.foreground} />}
            loading={updateStatusMutation.isPending}
            style={styles.completeButton}
          />
        </ScrollView>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Progress</Text>
            <Text style={styles.progressPercent}>{Math.round(progress)}%</Text>
          </View>
          <Progress value={progress} height={8} />
        </View>

        {/* Section Tabs */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.tabsContainer}
          contentContainerStyle={styles.tabsContent}
        >
          {sections.map((section, index) => (
            <Button
              key={section.id}
              title={section.title}
              onPress={() => setCurrentSectionIndex(index)}
              variant={index === currentSectionIndex ? 'default' : 'outline'}
              size="sm"
              style={styles.tabButton}
            />
          ))}
        </ScrollView>
      </View>

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
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {currentSection && currentSection.fields && (
          <>
            {currentSection.description && (
              <Text style={styles.sectionDescription}>{currentSection.description}</Text>
            )}
            
            {currentSection.fields.map((field) => {
              if (!field || !field.id && !field.key) {
                console.warn('Invalid field found:', field);
                return null;
              }
              
              try {
                const key = `${currentSection.id}-${field.id || field.key}`;
                const entry = entries[key];
                
                return (
                <FieldWidget
                  key={field.id || field.key || `field-${Math.random()}`}
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
                    inspectionDate: inspection?.scheduledDate 
                      ? new Date(inspection.scheduledDate).toISOString().split('T')[0]
                      : new Date().toISOString().split('T')[0],
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
                    navigation.navigate('CreateMaintenance', {
                      inspectionId,
                      fieldLabel,
                      photos,
                    } as any);
                  }}
                />
                );
              } catch (error) {
                console.error('Error rendering field:', field, error);
                return (
                  <Card key={`error-${field.id || field.key || Math.random()}`}>
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
      <View style={styles.footer}>
        <View style={styles.footerActions}>
          <Button
            title="Previous"
            onPress={() => {
              const newIndex = Math.max(0, currentSectionIndex - 1);
              setCurrentSectionIndex(newIndex);
            }}
            disabled={!!(currentSectionIndex === 0 || sections.length === 0)}
            variant="outline"
            icon={<ChevronLeft size={16} color={colors.text.primary} />}
          />
          
          <Button
            title="Next"
            onPress={() => {
              const newIndex = Math.min(sections.length - 1, currentSectionIndex + 1);
              setCurrentSectionIndex(newIndex);
            }}
            disabled={!!(currentSectionIndex >= sections.length - 1 || sections.length === 0)}
            variant="outline"
            icon={<ChevronRight size={16} color={colors.text.primary} />}
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
          navigation.navigate('AssetDetail', { 
            inspectionId,
            propertyId: inspection?.propertyId,
            blockId: inspection?.blockId,
            mode: 'create',
          } as any);
        }}
        onUpdateAsset={() => {
          // Navigate to asset list to select asset to update
          navigation.navigate('AssetInventory', {
            inspectionId,
            propertyId: inspection?.propertyId,
            blockId: inspection?.blockId,
            mode: 'select',
          } as any);
        }}
        onLogMaintenance={() => {
          navigation.navigate('CreateMaintenance', {
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
    borderBottomColor: colors.border.DEFAULT,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: spacing[3],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing[3],
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing[1],
  },
  headerActions: {
    marginBottom: spacing[2],
  },
  headerActionsContent: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
    alignItems: 'center',
  },
  badgeText: {
    fontSize: typography.fontSize.xs,
    marginLeft: spacing[1],
  },
  syncButton: {
    marginLeft: spacing[1],
  },
  aiButton: {
    marginLeft: spacing[1],
  },
  aiCompleteBadge: {
    backgroundColor: colors.success,
  },
  pdfButton: {
    marginLeft: spacing[1],
  },
  completeButton: {
    marginLeft: spacing[1],
  },
  progressContainer: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[2],
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  progressLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.secondary,
  },
  progressPercent: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  tabsContainer: {
    maxHeight: 50,
  },
  tabsContent: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  tabButton: {
    marginRight: spacing[2],
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing[4],
  },
  sectionDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing[4],
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.sm,
  },
  footer: {
    backgroundColor: colors.card.DEFAULT,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
    padding: spacing[4],
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[2],
  },
  aiProgressCard: {
    marginBottom: spacing[4],
    backgroundColor: colors.primary.light,
    borderWidth: 1,
    borderColor: colors.primary.DEFAULT,
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
});
