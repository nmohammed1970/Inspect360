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
  TextInput,
  Modal,
  Pressable,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, useNavigation, CommonActions } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { inspectionsService, type InspectionEntry, type InspectionDetail } from '../../services/inspections';
import { inspectionsOffline } from '../../services/offline/inspectionsOffline';
import { propertiesService } from '../../services/properties';
import { authService } from '../../services/auth';
import { apiRequestJson, getAPI_URL } from '../../services/api';
import { getSyncStats } from '../../services/offline/database';
import { triggerSync } from '../../services/offline/backgroundSync';
import type { InspectionsStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useCompanyModules } from '../../hooks/useCompanyModules';
import { FieldWidget } from '../../components/inspections/FieldWidget';
import { InspectionGalleryPanel } from '../../components/inspections/InspectionGalleryPanel';
import {
  CompletionChecklistPanel,
  useMobileCompletionChecklist,
} from '../../components/inspections/CompletionChecklistPanel';
import { COMPLETION_CHECKLIST_INSPECTION_UI_VISIBLE } from '../../../../shared/completionChecklist';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { formatSignerDisplayName } from '../../../../shared/signature';
import { PHOTO_WARN_THRESHOLD, creditsConsumed } from '../../../../shared/billingUnits';
import {
  applyPropertyCountsToTemplateSnapshot,
  findBathroomCountField,
  findBedroomCountField,
  matchSectionToRoomType,
  parseRepeatableCountValue,
  repeatableCountsFromPropertyLayout,
} from '../../../../shared/propertyLayout';
import {
  formatDisplayHeading,
  numberedRoomInstanceTitle,
  parseLegacyRepeatableInstanceNumber,
  repeatableCountsFromPropertyRoomInstances,
} from '../../../../shared/propertyRooms';
import { listRepeatableInstances, matchesSectionScope } from '../../../../shared/inspectionGallery';
import { inspectionGalleryService } from '../../services/inspectionGallery';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronLeft, ChevronRight, CheckCircle2, Sparkles, Wifi, WifiOff, Check, Cloud, AlertCircle, Images, Plus, ClipboardList, Trash2 } from 'lucide-react-native';
import { isGeneralInformationSection } from '../../../../shared/defaultGeneralInformationSection';
import Badge from '../../components/ui/Badge';
import Progress from '../../components/ui/Progress';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';
import FormScreen from '../../components/ui/FormScreen';
import {
  cipCountFieldKey,
  cipExpandedFieldKey,
  cipInstanceLabel,
  expandCipFieldsForCount,
  getCipsForSection,
  isCipRepeatable,
  parseCipCountValue,
  parseCipExpandedFieldKey,
  resolveCipInstanceCount,
  type CustomInspectionPoint,
} from '../../../../shared/templateCustomInspectionPoints';
import {
  computeInspectionCaptureProgress,
  entryLookupKey,
  formatRequiredIncompleteMessage,
  listRequiredIncompleteFields,
} from '../../../../shared/inspectionProgress';
type RoutePropType = RouteProp<InspectionsStackParamList, 'InspectionCapture'>;
type NavigationProp = StackNavigationProp<InspectionsStackParamList, 'InspectionCapture'>;

interface TemplateSection {
  id: string;
  title: string;
  description?: string;
  repeatable?: boolean;
  propertyRoomAuto?: boolean;
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
  custom?: boolean;
  parentFieldId?: string;
}

export default function InspectionCaptureScreen() {
  const route = useRoute<RoutePropType>();
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const { inspectionId } = route.params;
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const { maintenanceEnabled, tenanciesEnabled } = useCompanyModules();
  const { data: completionChecklist } = useMobileCompletionChecklist(inspectionId);
  const hasCompletionChecklist =
    COMPLETION_CHECKLIST_INSPECTION_UI_VISIBLE &&
    !!completionChecklist?.snapshot;
  const checklistProgress = completionChecklist?.progress;
  const checklistIncompleteCount = Math.max(
    0,
    (checklistProgress?.total ?? 0) - (checklistProgress?.completed ?? 0),
  );
  const checklistIsIncomplete =
    COMPLETION_CHECKLIST_INSPECTION_UI_VISIBLE &&
    hasCompletionChecklist &&
    checklistIncompleteCount > 0;
  const checklistRequiredIncomplete =
    checklistProgress?.requiredIncomplete ?? 0;
  const theme = useTheme();
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  const {
    stackDirection,
    getResponsivePadding,
    moderateScale: ms,
    getFontSize,
    getButtonHeight,
  } = useResponsive();
  const actionStack = stackDirection();
  const contentPad = getResponsivePadding(spacing[4]);
  const smBtnHeight = getButtonHeight('sm');
  const mdBtnHeight = getButtonHeight('md');
  const tabFontSize = getFontSize(typography.fontSize.xs);

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [captureMode, setCaptureMode] = useState<'sections' | 'gallery' | 'checklist'>('sections');
  const [sectionGalleryScope, setSectionGalleryScope] = useState<{
    sectionRef: string;
    aliasRefs: string[];
    label: string;
  } | null>(null);
  const [requiredErrorKeys, setRequiredErrorKeys] = useState<Set<string>>(() => new Set());
  const [showChecklistSoftGate, setShowChecklistSoftGate] = useState(false);
  const [entries, setEntries] = useState<Record<string, InspectionEntry>>({});
  const [repeatableCounts, setRepeatableCounts] = useState<Record<string, number>>({}); // Track counts for repeatable sections
  const repeatableCountsInitialized = useRef(false); // Track if we've initialized default counts
  const [copyImages, setCopyImages] = useState(false);
  const [copyNotes, setCopyNotes] = useState(false);
  /** Explicit open/closed overrides for inspection point (CIP) cards. */
  const [inspectionPointOpen, setInspectionPointOpen] = useState<Record<string, boolean>>({});
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
    queryFn: async () => {
      // Always try to load from local DB first, even when online
      // This ensures data is available when going offline
      const localData = await inspectionsOffline.getInspection(inspectionId, isOnline);
      if (!localData && !isOnline) {
        // If offline and no local data, try to get from cache
        const cached = queryClient.getQueryData<InspectionDetail>([`/api/inspections/${inspectionId}`]);
        if (cached) {
          // Save cached data to local DB for offline access
          const { saveInspection } = await import('../../services/offline/database');
          await saveInspection({
            inspectionId: inspectionId,
            data: JSON.stringify(cached),
            syncStatus: 'synced',
            lastSyncedAt: new Date().toISOString(),
            serverUpdatedAt: cached.updatedAt,
            localUpdatedAt: new Date().toISOString(),
            isDeleted: 0,
          });
          return cached;
        }
      }
      return localData;
    },
    enabled: !!inspectionId,
    retry: false, // Don't retry when offline - use local data
    staleTime: Infinity, // Keep data fresh indefinitely when offline
    gcTime: Infinity, // Never garbage collect this data
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false, // Don't refetch on mount if we have cached data
  });

  const effectiveInspection = inspection;

  const { data: galleryListData } = useQuery({
    queryKey: ['gallery', inspectionId],
    queryFn: () => inspectionGalleryService.list(inspectionId),
    enabled: !!inspectionId && isOnline,
    retry: false,
  });
  const galleryImages = galleryListData?.images || [];
  const countSectionGallery = (sectionRef: string, aliasRefs: string[] = []) =>
    galleryImages.filter((img) => matchesSectionScope(img, sectionRef, aliasRefs)).length;

  const propertyRoomCountsSnapshot = effectiveInspection?.propertyRoomCountsSnapshot ?? null;
  const propertyRoomsSnapshot = (
    effectiveInspection as {
      propertyRoomsSnapshot?: {
        rooms?: Array<{
          id: string;
          name: string;
          widthMm?: number | null;
          lengthMm?: number | null;
        }>;
      } | null;
    }
  )?.propertyRoomsSnapshot ?? null;
  const propertyRoomInstances = (
    (effectiveInspection?.templateSnapshotJson as any)?.propertyRoomInstances as
      | Array<{ roomId: string; sectionRef: string; title: string }>
      | undefined
  ) || [];
  const roomsLockedFromProperty =
    !!propertyRoomCountsSnapshot || (propertyRoomsSnapshot?.rooms?.length ?? 0) > 0;

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

  const propertyLayoutCounts = {
    bedroomCount:
      propertyRoomCountsSnapshot?.bedrooms ??
      (typeof (property as any)?.bedrooms === 'number' ? (property as any).bedrooms : undefined),
    bathroomCount:
      propertyRoomCountsSnapshot?.bathrooms ??
      (typeof (property as any)?.bathrooms === 'number' ? (property as any).bathrooms : undefined),
  };

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

  // Prefer first/last name for signer display (never use internal username slug)
  const assignedInspector =
    inspector ||
    (effectiveInspection as any)?.inspector ||
    (effectiveInspection as any)?.clerk ||
    null;
  const resolvedInspectorName = formatSignerDisplayName(assignedInspector);

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
      // Always try to load from local DB first
      const entries = await inspectionsOffline.getInspectionEntries(inspectionId, isOnline);
      if (!entries || entries.length === 0) {
        // If offline and no local entries, try to get from cache
        if (!isOnline) {
          const cached = queryClient.getQueryData<InspectionEntry[]>([`/api/inspections/${inspectionId}/entries`]);
          if (cached && cached.length > 0) {
            // Save cached entries to local DB for offline access
            const { saveInspectionEntry } = await import('../../services/offline/database');
            for (const entry of cached) {
              await saveInspectionEntry({
                entryId: entry.id || `${entry.inspectionId}-${entry.sectionRef}-${entry.fieldKey}`,
                inspectionId: entry.inspectionId,
                sectionRef: entry.sectionRef,
                fieldKey: entry.fieldKey,
                data: JSON.stringify(entry),
                syncStatus: 'synced',
                lastSyncedAt: new Date().toISOString(),
                serverUpdatedAt: (entry as any).updatedAt || new Date().toISOString(),
                localUpdatedAt: new Date().toISOString(),
                isDeleted: 0,
              });
            }
            return cached;
          }
        }
      }
      return entries;
    },
    enabled: !!inspectionId,
    retry: false, // Don't retry when offline - use local data
    staleTime: Infinity, // Keep data fresh indefinitely when offline
    gcTime: Infinity, // Never garbage collect this data
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false, // Don't refetch on mount if we have cached data
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

    const mapped = rawTemplateStructure.sections.map((section: any) => ({
      ...section,
      propertyRoomAuto: !!section.propertyRoomAuto,
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

    const snapshot = effectiveInspection?.propertyRoomCountsSnapshot;
    if (!snapshot) return mapped;

    const applied = applyPropertyCountsToTemplateSnapshot({ sections: mapped }, snapshot);
    return (applied.structure.sections || []) as TemplateSection[];
  }, [
    effectiveInspection?.templateSnapshotJson,
    effectiveInspection?.templateId,
    effectiveInspection?.propertyRoomCountsSnapshot,
  ]);

  const templateSnapshot = effectiveInspection?.templateSnapshotJson as any;

  const sectionCipsFor = React.useCallback(
    (section: TemplateSection | null | undefined) => getCipsForSection(templateSnapshot, section as any),
    [templateSnapshot],
  );

  // Load existing entries into state
  // Always update entries when existingEntries changes (to support copy from check-in)
  useEffect(() => {
    const entriesToUse = effectiveEntries;
    if (!entriesToUse || entriesToUse.length === 0) {
      return;
    }

    const entriesMap: Record<string, InspectionEntry> = {};
    const countsMap: Record<string, number> = {};
    
    // FIRST PASS: Extract repeatable counts from saved count entries
    // This must happen before processing regular entries to ensure counts are available
    entriesToUse.forEach((entry: any) => {
      // Check if this is a repeatable count entry
      if (entry.fieldKey && entry.fieldKey.startsWith('__repeatable_count_')) {
        const sectionId = entry.fieldKey.replace('__repeatable_count_', '');
        countsMap[sectionId] = parseRepeatableCountValue(entry.valueJson, 1);
        // Don't add count entries to entriesMap - they're metadata only
      }
    });
    
    // SECOND PASS: Process regular entries and extract instance counts as fallback
    entriesToUse.forEach((entry: any) => {
      const key = `${entry.sectionRef}-${entry.fieldKey}`;
      
      // Skip count entries (already processed)
      if (entry.fieldKey && entry.fieldKey.startsWith('__repeatable_count_')) {
        return;
      }
      
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
      
      // Legacy only: "Bedrooms/Bedroom 1" → 1. Never treat UUID room ids as counts.
      const legacy = parseLegacyRepeatableInstanceNumber(entry.sectionRef);
      if (legacy) {
        if (!countsMap[legacy.sectionId] || legacy.instanceNum > countsMap[legacy.sectionId]) {
          countsMap[legacy.sectionId] = legacy.instanceNum;
        }
      }
    });
    
    // Set repeatable counts FIRST - this ensures counts are available before entries are processed
    // Property snapshot (if present) always wins over stale __repeatable_count_* rows
    const snapshotCounts = propertyRoomCountsSnapshot
      ? repeatableCountsFromPropertyLayout(
          { sections: (effectiveInspection?.templateSnapshotJson as any)?.sections || [] },
          propertyRoomCountsSnapshot,
        )
      : {};
    // Floor-plan room instances win for those sections (fixes UUID-digit "Dining Room 39")
    const instanceCounts = repeatableCountsFromPropertyRoomInstances(propertyRoomInstances);
    const mergedCounts = { ...countsMap, ...snapshotCounts, ...instanceCounts };
    if (Object.keys(mergedCounts).length > 0) {
      repeatableCountsInitialized.current = true; // Mark as initialized from saved data
      setRepeatableCounts(prev => {
        const merged = { ...prev };
        Object.keys(mergedCounts).forEach(sectionId => {
          merged[sectionId] = mergedCounts[sectionId];
        });
        return merged;
      });
    }

    // THEN set entries - counts are now available so fields will render correctly
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
  }, [
    effectiveEntries,
    sections,
    propertyRoomCountsSnapshot,
    effectiveInspection?.templateSnapshotJson,
    propertyRoomInstances,
  ]);

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

  // Property layout snapshot wins for bedrooms / kitchens / bathrooms / living rooms
  const propertyCountsAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!propertyRoomCountsSnapshot || !sections.length) return;

    const fromProperty = repeatableCountsFromPropertyLayout(
      { sections },
      propertyRoomCountsSnapshot,
    );
    if (!Object.keys(fromProperty).length) return;

    const fingerprint = JSON.stringify(fromProperty);
    setRepeatableCounts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [sectionId, count] of Object.entries(fromProperty)) {
        if (next[sectionId] !== count) {
          next[sectionId] = count;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    repeatableCountsInitialized.current = true;

    if (propertyCountsAppliedRef.current === fingerprint) return;
    propertyCountsAppliedRef.current = fingerprint;

    for (const [sectionId, count] of Object.entries(fromProperty)) {
      updateEntry.mutate({
        inspectionId,
        sectionRef: sectionId,
        fieldKey: `__repeatable_count_${sectionId}`,
        fieldType: 'number',
        valueJson: count,
      });
    }
  }, [propertyRoomCountsSnapshot, sections, inspectionId, updateEntry]);

  // Initialize repeatable sections to 1 by default (only if not already set from entries / property)
  useEffect(() => {
    if (roomsLockedFromProperty) return;
    if (sections.length > 0 && effectiveEntries && effectiveEntries.length === 0 && !repeatableCountsInitialized.current) {
      // Only set defaults if we have no existing entries (new inspection) and haven't initialized yet
      const defaultCounts: Record<string, number> = {};
      sections.forEach(section => {
        if (section.repeatable && !repeatableCounts[section.id]) {
          defaultCounts[section.id] = 1;
        }
      });
      if (Object.keys(defaultCounts).length > 0) {
        repeatableCountsInitialized.current = true;
        setRepeatableCounts(prev => ({ ...prev, ...defaultCounts }));
        // Also save the default counts
        Object.keys(defaultCounts).forEach(sectionId => {
          const countFieldKey = `__repeatable_count_${sectionId}`;
          const countEntry: InspectionEntry = {
            inspectionId,
            sectionRef: sectionId,
            fieldKey: countFieldKey,
            fieldType: 'number',
            valueJson: defaultCounts[sectionId],
          };
          updateEntry.mutate(countEntry);
        });
      }
    }
  }, [sections, effectiveEntries, repeatableCounts, inspectionId, updateEntry, roomsLockedFromProperty]);

  // Update inspection status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ status, startedAt, completedDate, submittedAt, sendToTenantForReview }: {
      status: string;
      startedAt?: string;
      completedDate?: string;
      submittedAt?: string;
      sendToTenantForReview?: boolean;
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
      if (sendToTenantForReview) {
        updates.sendToTenantForReview = true;
      }
      if (startedAt || completedDate || submittedAt || sendToTenantForReview) {
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

  // Progress uses the same field set the UI renders (instances × fields + CIPs).
  // Never count raw entries — orphans / __repeatable_count_* inflate completed > total.
  const { totalFields, completedFields, progress, bySection } = useMemo(
    () =>
      computeInspectionCaptureProgress({
        sections,
        entries,
        repeatableCounts,
        propertyRoomInstances,
        templateStructure: templateSnapshot,
        excludeTenantSignatures: !tenanciesEnabled,
      }),
    [
      sections,
      entries,
      repeatableCounts,
      propertyRoomInstances,
      templateSnapshot,
      tenanciesEnabled,
    ],
  );

  // BILL-08: warn before capture completes when approaching multi-credit threshold
  const totalPhotoCount = useMemo(() => {
    return Object.values(entries).reduce((sum, entry) => {
      const photos = entry.photos;
      return sum + (Array.isArray(photos) ? photos.length : 0);
    }, 0);
  }, [entries]);
  const estimatedCredits = creditsConsumed(totalPhotoCount);
  const showMultiCreditWarning = totalPhotoCount >= PHOTO_WARN_THRESHOLD;

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
  const contentScrollViewRef = useRef<ScrollView>(null);

  const scrollCaptureToTop = () => {
    contentScrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const requestDeleteInstance = (opts: {
    sectionRef: string;
    label: string;
    sectionId: string;
    sectionIndex: number;
  }) => {
    if (effectiveInspection?.status === 'completed') return;
    Alert.alert(
      'Remove this inspection point?',
      `Remove "${formatDisplayHeading(opts.label)}" and its answers. If it is the last point in the section, the section tab is removed too.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const result = await apiRequestJson<{
                  sectionRemoved?: boolean;
                  remainingInstanceCount?: number;
                  removedSectionTitle?: string | null;
                }>('POST', `/api/inspections/${inspectionId}/section-instances/remove`, {
                  sectionRef: opts.sectionRef,
                });
                const deletedRef = opts.sectionRef;
                const deletedSectionId = opts.sectionId;
                const sectionRemoved = !!result?.sectionRemoved;
                const remaining = Number(result?.remainingInstanceCount) || 0;

                setEntries((prev) => {
                  const next = { ...prev };
                  for (const key of Object.keys(next)) {
                    const entry = next[key];
                    const fk = entry.fieldKey || '';
                    if (entry.sectionRef === deletedRef) {
                      delete next[key];
                      continue;
                    }
                    if (
                      sectionRemoved &&
                      (entry.sectionRef === deletedSectionId ||
                        entry.sectionRef.startsWith(`${deletedSectionId}/`) ||
                        fk === `__repeatable_count_${deletedSectionId}`)
                    ) {
                      delete next[key];
                    }
                  }
                  return next;
                });
                setRepeatableCounts((prev) => {
                  const next = { ...prev };
                  if (sectionRemoved) {
                    delete next[deletedSectionId];
                  } else {
                    next[deletedSectionId] = Math.max(1, remaining);
                  }
                  return next;
                });
                if (sectionRemoved) {
                  setCurrentSectionIndex((idx) => {
                    if (idx > opts.sectionIndex) return Math.max(0, idx - 1);
                    if (idx === opts.sectionIndex) {
                      return Math.max(0, Math.min(idx, sections.length - 2));
                    }
                    return idx;
                  });
                }
                await queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}`] });
                await queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}/entries`] });
                await queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}/gallery`] });
              } catch (error: any) {
                Alert.alert(
                  'Could not remove inspection point',
                  error?.message || 'Please try again.',
                );
              }
            })();
          },
        },
      ],
    );
  };

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

  // Handle repeatable count change (also used when user overrides floor-plan counts)
  const handleRepeatableCountChange = React.useCallback((sectionId: string, count: number) => {
    const newCount = Math.max(1, Math.min(50, count)); // Limit between 1 and 50
    const prevCount = repeatableCounts[sectionId] ?? 1;
    
    setRepeatableCounts(prev => ({
      ...prev,
      [sectionId]: newCount,
    }));
    
    // Save repeatable count as a special entry to persist it
    const countFieldKey = `__repeatable_count_${sectionId}`;
    const countEntryKey = `${sectionId}-${countFieldKey}`;
    const countEntry: InspectionEntry = {
      inspectionId,
      sectionRef: sectionId,
      fieldKey: countFieldKey,
      fieldType: 'number',
      valueJson: newCount,
    };
    
    // Update local state
    setEntries(prev => ({
      ...prev,
      [countEntryKey]: countEntry,
    }));
    
    // Save to backend
    updateEntry.mutate(countEntry);
    
    // If count is reduced, remove entries for instances beyond the new count
    if (newCount < prevCount) {
      setEntries(prev => {
        const updated = { ...prev };
        const section = sections.find(s => s.id === sectionId);
        if (section) {
          // Remove entries for instances beyond new count
          for (let i = newCount + 1; i <= prevCount; i++) {
            const instanceName = `${section.title} ${i}`;
            section.fields.forEach(field => {
              const entryKey = `${sectionId}/${instanceName}-${field.id || field.key}`;
              delete updated[entryKey];
            });
          }
        }
        return updated;
      });
    }
  }, [sections, repeatableCounts, inspectionId, updateEntry]);

  // Sync bedroom/bathroom count fields (anywhere in template) → repeatable section instances
  useEffect(() => {
    const syncCountToSection = (
      found: ReturnType<typeof findBedroomCountField>,
      roomType: 'bedrooms' | 'bathrooms',
    ) => {
      if (!found) return;
      const targetSection = sections.find(
        (section) => matchSectionToRoomType(section) === roomType,
      );
      if (!targetSection) return;

      const fieldId = found.field.id || found.field.key;
      if (!fieldId) return;
      const countEntry = entries[`${found.section.id}-${fieldId}`];
      const rawValue =
        typeof countEntry?.valueJson === 'object' && countEntry?.valueJson !== null
          ? (countEntry.valueJson as any).value
          : countEntry?.valueJson;
      const parsedCount = Number(rawValue);
      if (!Number.isFinite(parsedCount) || parsedCount < 1) return;

      const desiredCount = Math.max(1, Math.min(50, Math.floor(parsedCount)));
      const currentCount = repeatableCounts[targetSection.id] ?? 1;
      if (currentCount !== desiredCount) {
        handleRepeatableCountChange(targetSection.id, desiredCount);
      }
    };

    syncCountToSection(findBedroomCountField(sections), 'bedrooms');
    syncCountToSection(findBathroomCountField(sections), 'bathrooms');
  }, [entries, sections, repeatableCounts, handleRepeatableCountChange]);

  const handleFieldChange = React.useCallback(async (
    sectionRef: string,
    fieldKey: string,
    value: any,
    note?: string,
    photos?: string[],
    markedForReview?: boolean,
    instanceIndex?: number,
    options?: { explicitSectionRef?: string; fieldType?: string },
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

    // Same instance refs as gallery destinations.
    const currentSection = sections.find(s => s.id === sectionRef);
    const writeInst =
      instanceIndex !== undefined && currentSection
        ? listRepeatableInstances(
            effectiveInspection?.templateSnapshotJson as any,
            currentSection.id,
            repeatableCounts,
          )[instanceIndex]
        : undefined;
    const finalSectionRef =
      options?.explicitSectionRef ??
      (instanceIndex !== undefined && currentSection
        ? writeInst?.sectionRef ||
          `${sectionRef}/${currentSection.title} ${instanceIndex + 1}`
        : sectionRef);

    const key = `${finalSectionRef}-${fieldKey}`;
    const existingEntry = entries[key];
    const fieldType =
      options?.fieldType ||
      currentSection?.fields.find(f => f.id === fieldKey || f.key === fieldKey)?.type ||
      'text';

    // CRITICAL FIX: Use the entry key (sectionRef-fieldKey) as the entry ID
    // This ensures photos uploaded before entry creation can be associated correctly
    // If entry doesn't exist, use the key as ID; if it exists, use its ID
    const entryId = existingEntry?.id || key; // key is `${sectionRef}-${fieldKey}`

    const newEntry: InspectionEntry = {
      ...existingEntry,
      id: entryId, // Always use the key format for consistency
      inspectionId,
      sectionRef: finalSectionRef,
      fieldKey,
      fieldType,
      valueJson: value !== undefined ? value : existingEntry?.valueJson,
      note: note !== undefined ? note : existingEntry?.note,
      photos: photos !== undefined ? photos : (existingEntry?.photos || []),
      markedForReview: markedForReview !== undefined ? markedForReview : (existingEntry?.markedForReview || false),
      maintenanceFlag: existingEntry?.maintenanceFlag || false,
    };
    
    // No offline functionality - photos are stored on server only

    // Clear required-field highlight once the user edits this field
    setRequiredErrorKeys((prev) => {
      if (!prev.size) return prev;
      const next = new Set(prev);
      let changed = false;
      const refsToClear = [
        finalSectionRef,
        sectionRef,
        ...(writeInst?.aliasRefs || []),
      ].filter(Boolean) as string[];
      for (const ref of refsToClear) {
        if (next.delete(entryLookupKey(ref, fieldKey))) changed = true;
      }
      for (const stored of Array.from(next)) {
        if (stored.endsWith(`-${fieldKey}`)) {
          next.delete(stored);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    // Update local state immediately for snappy UI
    setEntries(prev => ({ ...prev, [key]: newEntry }));

    // Auto-save mutation
    updateEntry.mutate(newEntry);
  }, [inspectionId, sections, updateEntry, effectiveInspection, isDeleted, entries, propertyRoomInstances]);

  const handleCipCountChange = React.useCallback(
    (sectionRef: string, cip: CustomInspectionPoint, count: number) => {
      if (effectiveInspection?.status === 'completed' || isDeleted) return;
      const newCount = Math.max(0, Math.min(50, Math.floor(Number(count) || 0)));
      const countFieldKey = cipCountFieldKey(cip.id);
      const countEntryKey = `${sectionRef}-${countFieldKey}`;
      const prevCount = parseCipCountValue(entries[countEntryKey]?.valueJson);

      const countEntry: InspectionEntry = {
        inspectionId,
        id: entries[countEntryKey]?.id,
        sectionRef,
        fieldKey: countFieldKey,
        fieldType: 'number',
        valueJson: newCount,
      };

      setEntries((prev) => ({ ...prev, [countEntryKey]: countEntry }));
      updateEntry.mutate(countEntry);

      if (newCount < prevCount) {
        setEntries((prev) => {
          const updated = { ...prev };
          for (let i = newCount + 1; i <= prevCount; i++) {
            for (const field of cip.fields || []) {
              const baseId = String(field.id || field.key || '').trim();
              if (!baseId) continue;
              const fk = cipExpandedFieldKey(cip.id, i, baseId);
              delete updated[`${sectionRef}-${fk}`];
            }
          }
          return updated;
        });
      }
    },
    [effectiveInspection?.status, isDeleted, entries, inspectionId, updateEntry],
  );

  const renderCipCountInputs = (sectionRef: string, sectionCips: CustomInspectionPoint[]) => {
    const repeatableCips = sectionCips.filter((cip) => isCipRepeatable(cip));
    if (!repeatableCips.length) return null;
    return (
      <Card style={[styles.fieldContainer, { borderColor: themeColors.border.DEFAULT }]}>
        {repeatableCips.map((cip) => {
          const countFieldKey = cipCountFieldKey(cip.id);
          const countValue = parseCipCountValue(entries[`${sectionRef}-${countFieldKey}`]?.valueJson);
          return (
            <View key={`cip-count-${sectionRef}-${cip.id}`} style={{ marginBottom: spacing[4] }}>
              <Text style={[styles.fieldLabel, { color: themeColors.text.primary }]}>
                {`How many ${cip.label} are there?`}
              </Text>
              <View
                style={{
                  flexDirection: actionStack === 'column' ? 'column' : 'row',
                  alignItems: actionStack === 'column' ? 'stretch' : 'center',
                  flexWrap: 'wrap',
                  gap: spacing[3],
                  marginTop: spacing[2],
                }}
              >
                <TouchableOpacity
                  onPress={() => handleCipCountChange(sectionRef, cip, countValue - 1)}
                  disabled={countValue <= 0}
                  style={[
                    styles.countButton,
                    {
                      backgroundColor: themeColors.primary.DEFAULT,
                      opacity: countValue <= 0 ? 0.5 : 1,
                    },
                  ]}
                >
                  <Text style={{ color: themeColors.primary.foreground || '#ffffff', fontSize: 18, fontWeight: 'bold' }}>-</Text>
                </TouchableOpacity>
                <TextInput
                  style={[
                    styles.countInput,
                    {
                      backgroundColor: themeColors.card.DEFAULT,
                      borderColor: themeColors.border.DEFAULT,
                      color: themeColors.text.primary,
                    },
                  ]}
                  value={String(countValue)}
                  onChangeText={(text) => {
                    const n = parseInt(text, 10);
                    handleCipCountChange(sectionRef, cip, Number.isFinite(n) ? n : 0);
                  }}
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  onPress={() => handleCipCountChange(sectionRef, cip, countValue + 1)}
                  disabled={countValue >= 50}
                  style={[
                    styles.countButton,
                    {
                      backgroundColor: themeColors.primary.DEFAULT,
                      opacity: countValue >= 50 ? 0.5 : 1,
                    },
                  ]}
                >
                  <Text style={{ color: themeColors.primary.foreground || '#ffffff', fontSize: 18, fontWeight: 'bold' }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </Card>
    );
  };

  const isInspectionPointOpen = (key: string, defaultOpen: boolean) =>
    inspectionPointOpen[key] !== undefined ? inspectionPointOpen[key]! : defaultOpen;

  const toggleInspectionPoint = (key: string, defaultOpen: boolean) => {
    setInspectionPointOpen((prev) => {
      const currently = prev[key] !== undefined ? prev[key]! : defaultOpen;
      return { ...prev, [key]: !currently };
    });
  };

  const renderCipInstanceCards = (
    sectionRef: string,
    instanceName: string,
    sectionTitle: string,
    sectionCips: CustomInspectionPoint[],
    pointsDefaultOpen = false,
  ) => {
    if (!sectionCips.length) return null;

    const openMaintenance = (fieldLabel: string, photos: string[] | undefined, pointEntry: any, pointEntryId: string) => {
      try {
        const fieldPhotos = (photos?.length ? photos : pointEntry?.photos || []).filter(Boolean);
        const rootNavigator = navigation.getParent()?.getParent();
        if (rootNavigator) {
          rootNavigator.dispatch(
            CommonActions.navigate('Main', {
              screen: 'Maintenance',
              params: {
                screen: 'CreateMaintenance',
                params: {
                  inspectionId,
                  propertyId: effectiveInspection?.propertyId,
                  blockId: effectiveInspection?.blockId,
                  fieldLabel,
                  photos: fieldPhotos,
                  entryId: pointEntry?.id || pointEntryId,
                  sectionTitle,
                },
              },
            }),
          );
        }
      } catch (error) {
        console.error('[InspectionCapture] Navigation error:', error);
      }
    };

    return (
      <>
        {sectionCips.map((cip) => {
          const count = resolveCipInstanceCount(
            cip,
            entries[`${sectionRef}-${cipCountFieldKey(cip.id)}`]?.valueJson,
          );
          if (count < 1) return null;
          return Array.from({ length: count }, (_, idx) => idx + 1).map((instanceIndex) => {
            const expandedForInstance = expandCipFieldsForCount(cip, count).filter(
              (f) => f.cipInstanceIndex === instanceIndex,
            );
            const pointKey = `cip:${sectionRef}:${cip.id}:${instanceIndex}`;
            const pointOpen = isInspectionPointOpen(pointKey, pointsDefaultOpen);
            const pointTitle = cipInstanceLabel(cip.label, instanceIndex);
            return (
              <View
                key={`cip-card-${sectionRef}-${cip.id}-${instanceIndex}`}
                style={[styles.instanceContainer, { borderColor: themeColors.border.DEFAULT, marginTop: spacing[4] }]}
              >
                <TouchableOpacity
                  onPress={() => toggleInspectionPoint(pointKey, pointsDefaultOpen)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[1] }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: pointOpen }}
                  accessibilityLabel={`${pointOpen ? 'Collapse' : 'Expand'} ${pointTitle}`}
                >
                  {pointOpen ? (
                    <ChevronDown size={18} color={themeColors.text.secondary} />
                  ) : (
                    <ChevronRight size={18} color={themeColors.text.secondary} />
                  )}
                  <Text style={[styles.instanceTitle, { color: themeColors.primary.DEFAULT, flex: 1 }]}>
                    {pointTitle}
                  </Text>
                </TouchableOpacity>
                {pointOpen
                  ? expandedForInstance.map((expanded) => {
                      const parsed = parseCipExpandedFieldKey(expanded.id);
                      const baseField = (cip.fields || []).find(
                        (f) => String(f.id || f.key || '') === parsed?.fieldId,
                      );
                      const fieldForWidget: TemplateField = {
                        ...(baseField as TemplateField),
                        id: expanded.id,
                        key: expanded.id,
                        label: (baseField?.label as string) || expanded.label,
                      };
                      const entryKey = `${sectionRef}-${expanded.id}`;
                      const entry = entries[entryKey];
                      const entryId = entry?.id || entryKey;
                      return (
                        <View key={expanded.id} style={styles.fieldContainer}>
                          <FieldWidget
                            field={fieldForWidget}
                            value={entry?.valueJson}
                            note={entry?.note}
                            photos={entry?.photos}
                            inspectionId={inspectionId}
                            entryId={entryId}
                            sectionRef={sectionRef}
                            sectionName={instanceName}
                            isCheckOut={effectiveInspection?.type === 'check_out'}
                            markedForReview={entry?.markedForReview || false}
                            disabled={effectiveInspection?.status === 'completed' || isDeleted}
                            validationError={isRequiredFieldHighlighted(sectionRef, expanded.id)}
                            autoContext={{
                              inspectorName: resolvedInspectorName,
                              address: property
                                ? [property.address, property.city, property.state, property.postalCode].filter(Boolean).join(', ')
                                : block
                                  ? [block.address, block.city, block.state, block.postalCode].filter(Boolean).join(', ')
                                  : '',
                              tenantNames: '',
                              inspectionDate: new Date(
                                effectiveInspection?.scheduledDate ||
                                  (effectiveInspection as any)?.startedAt ||
                                  new Date().toISOString(),
                              )
                                .toISOString()
                                .split('T')[0],
                              bedroomCount: propertyLayoutCounts.bedroomCount,
                              bathroomCount: propertyLayoutCounts.bathroomCount,
                            }}
                            onChange={(value, note, photos) =>
                              handleFieldChange(currentSection!.id, expanded.id, value, note, photos, undefined, undefined, {
                                explicitSectionRef: sectionRef,
                                fieldType: fieldForWidget.type,
                              })
                            }
                            onMarkedForReviewChange={(marked) =>
                              handleFieldChange(
                                currentSection!.id,
                                expanded.id,
                                undefined,
                                undefined,
                                undefined,
                                marked,
                                undefined,
                                { explicitSectionRef: sectionRef, fieldType: fieldForWidget.type },
                              )
                            }
                            onLogMaintenance={
                              maintenanceEnabled
                                ? (fieldLabel, photos) => openMaintenance(fieldLabel, photos, entry, entryId)
                                : undefined
                            }
                          />
                        </View>
                      );
                    })
                  : null}
              </View>
            );
          });
        })}
      </>
    );
  };

  const getRequiredIncomplete = () =>
    listRequiredIncompleteFields({
      sections,
      entries,
      repeatableCounts,
      propertyRoomInstances,
      templateStructure: templateSnapshot,
      excludeTenantSignatures: !tenanciesEnabled,
    });

  const isRequiredFieldHighlighted = (
    sectionRef: string,
    fieldKey: string,
    aliasRefs: string[] = [],
  ) => {
    if (!requiredErrorKeys.size) return false;
    for (const ref of [sectionRef, ...aliasRefs]) {
      if (requiredErrorKeys.has(entryLookupKey(ref, fieldKey))) return true;
    }
    return false;
  };

  const proceedAfterChecklistGate = () => {
    const missingRequired = getRequiredIncomplete();
    if (missingRequired.length > 0) {
      setRequiredErrorKeys(
        new Set(
          missingRequired.flatMap((f) => [
            f.entryKey,
            ...f.aliasRefs.map((ref) => entryLookupKey(ref, f.fieldKey)),
          ]),
        ),
      );
      const first = missingRequired[0]!;
      const sectionIndex = sections.findIndex((s) => s.id === first.sectionId);
      if (sectionIndex >= 0) {
        setCurrentSectionIndex(sectionIndex);
        setCaptureMode('sections');
      }
      Alert.alert('Required fields missing', formatRequiredIncompleteMessage(missingRequired), [
        { text: 'OK' },
      ]);
      return;
    }
    setRequiredErrorKeys(new Set());

    const progressPercentage = Math.round(progress);
    const isIncomplete = progressPercentage < 100;

    const shouldOfferTenantReview =
      (effectiveInspection?.type === 'check_in' || effectiveInspection?.type === 'check_out') &&
      !!effectiveInspection?.propertyId;

    const completeInspection = async (sendToTenantForReview = false) => {
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
          sendToTenantForReview,
        });

        Alert.alert(
          'Success',
          sendToTenantForReview
            ? 'Inspection completed and sent to the tenant for review.'
            : 'Inspection marked as completed.',
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

    const promptSendToTenant = () => {
      if (!shouldOfferTenantReview) {
        void completeInspection(false);
        return;
      }
      Alert.alert(
        'Send to tenant for review?',
        'The tenant will be notified in their portal. They can view the inspection and sign the Tenant Signature field, but cannot edit other fields.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'No',
            style: 'cancel',
            onPress: () => void completeInspection(false),
          },
          {
            text: 'Yes, send',
            onPress: () => void completeInspection(true),
          },
        ]
      );
    };

    if (isIncomplete) {
      Alert.alert(
        'Complete Inspection?',
        `This inspection is only ${progressPercentage}% complete. ${
          totalFields - completedFields
        } optional field(s) are still missing. Required fields are complete. Mark as complete anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Complete Anyway',
            style: 'default',
            onPress: promptSendToTenant,
          },
        ]
      );
    } else {
      promptSendToTenant();
    }
  };

  const handleComplete = async () => {
    const missingRequired = getRequiredIncomplete();
    if (missingRequired.length > 0) {
      setRequiredErrorKeys(
        new Set(
          missingRequired.flatMap((f) => [
            f.entryKey,
            ...f.aliasRefs.map((ref) => entryLookupKey(ref, f.fieldKey)),
          ]),
        ),
      );
      const first = missingRequired[0]!;
      const sectionIndex = sections.findIndex((s) => s.id === first.sectionId);
      if (sectionIndex >= 0) {
        setCurrentSectionIndex(sectionIndex);
        setCaptureMode('sections');
      }
      Alert.alert('Required fields missing', formatRequiredIncompleteMessage(missingRequired), [
        { text: 'OK' },
      ]);
      return;
    }

    if (COMPLETION_CHECKLIST_INSPECTION_UI_VISIBLE && checklistIsIncomplete) {
      setShowChecklistSoftGate(true);
      return;
    }
    proceedAfterChecklistGate();
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
            zIndex: 1001, // Ensure header stays on top
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

        {/* BILL-08: multi-credit warning at 280 photos */}
        {showMultiCreditWarning && (
          <Card style={[
            styles.offlineBanner,
            {
              backgroundColor: `${themeColors.warning}15`,
              borderColor: `${themeColors.warning}40`,
            }
          ]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
              <AlertCircle size={18} color={themeColors.warning} />
              <Text style={{ flex: 1, color: themeColors.text.primary, fontSize: 13 }}>
                This inspection will use {estimatedCredits} of your monthly credits ({totalPhotoCount} photos).
              </Text>
            </View>
          </Card>
        )}

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

        {/* Content â€” keyboard-safe FormScreen with sticky Prev/Next footer */}
        <FormScreen
          style={{ flex: 1 }}
          edges={{ bottom: true }}
          scrollViewRef={contentScrollViewRef}
          // Gallery uses its own FlatList — nesting it in ScrollView breaks RN windowing.
          scroll={captureMode !== 'gallery'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 8) + 56 : 0}
          contentContainerStyle={[
            styles.contentContainer,
            {
              paddingHorizontal: contentPad,
              paddingTop: contentPad,
              paddingBottom: spacing[4],
              ...(captureMode === 'gallery' ? { flex: 1 } : null),
            },
          ]}
          scrollProps={{
            keyboardDismissMode: 'none',
            style: styles.content,
          }}
          footer={
            captureMode === 'gallery' || captureMode === 'checklist' ? null : (
            <View style={[styles.footerActions, { flexDirection: 'row' }]}>
              <Button
                title="Previous"
                onPress={() => {
                  const newIndex = Math.max(0, currentSectionIndex - 1);
                  setCurrentSectionIndex(newIndex);
                  scrollCaptureToTop();
                }}
                disabled={!!(currentSectionIndex === 0 || sections.length === 0)}
                variant="outline"
                size="md"
                icon={<ChevronLeft size={18} color={themeColors.text.primary} />}
                style={[
                  styles.footerButton,
                  { minHeight: mdBtnHeight },
                ]}
              />
              <Button
                title="Next"
                onPress={() => {
                  const newIndex = Math.min(sections.length - 1, currentSectionIndex + 1);
                  setCurrentSectionIndex(newIndex);
                  scrollCaptureToTop();
                }}
                disabled={!!(currentSectionIndex >= sections.length - 1 || sections.length === 0)}
                variant="outline"
                size="md"
                icon={<ChevronRight size={18} color={themeColors.text.primary} />}
                style={[
                  styles.footerButton,
                  { minHeight: mdBtnHeight },
                ]}
              />
            </View>
            )
          }
        >
            {/* Quick Actions Row */}
            <View style={[styles.quickActionsRow, { paddingHorizontal: 0 }]}>
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

            {/* Main Action Buttons â€” always one row, half / half */}
            <View style={[styles.mainActionsRow, { paddingHorizontal: 0, flexDirection: 'row' }]}>
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
                        minHeight: smBtnHeight,
                        paddingVertical: ms(spacing[2], 0.3),
                      }
                    ]}
                    textStyle={[{ color: '#ffffff' }, { fontSize: tabFontSize }]}
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
                    style={[styles.actionButton, { minHeight: smBtnHeight, paddingVertical: ms(spacing[2], 0.3) }]}
                    textStyle={[styles.actionButtonText, { fontSize: tabFontSize }]}
                  />
                </View>
              )}

              {COMPLETION_CHECKLIST_INSPECTION_UI_VISIBLE && hasCompletionChecklist && (
                <View style={styles.actionButtonContainer}>
                  <Button
                    title="Checklist"
                    onPress={() => setCaptureMode('checklist')}
                    variant="outline"
                    size="sm"
                    icon={
                      <ClipboardList
                        size={14}
                        color={themeColors.text.primary}
                      />
                    }
                    style={[
                      styles.actionButton,
                      { minHeight: smBtnHeight, paddingVertical: ms(spacing[2], 0.3) },
                    ]}
                    textStyle={[styles.actionButtonText, { fontSize: tabFontSize }]}
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
                  style={[styles.actionButton, { minHeight: smBtnHeight, paddingVertical: ms(spacing[2], 0.3) }]}
                  textStyle={[styles.actionButtonText, { fontSize: tabFontSize }]}
                />
              </View>
            </View>

            {/* Progress Bar */}
            <View style={[styles.progressContainer, { backgroundColor: themeColors.card.DEFAULT, marginHorizontal: 0 }]}>
              <View style={styles.progressHeader}>
                <Text style={[styles.progressLabel, { color: themeColors.text.primary }]}>Progress</Text>
                <Text style={[styles.progressPercent, { color: themeColors.primary.DEFAULT }]}>{Math.round(progress)}%</Text>
              </View>
              <Progress value={progress} height={10} style={styles.progressBar} />
            </View>

            {/* Capture mode: Sections | Gallery | Checklist */}
            <View style={{ flexDirection: 'row', gap: spacing[2], marginBottom: spacing[3] }}>
              <TouchableOpacity
                onPress={() => setCaptureMode('sections')}
                style={[
                  styles.tabButton,
                  {
                    flex: 1,
                    backgroundColor: captureMode === 'sections' ? themeColors.primary.DEFAULT : themeColors.card.DEFAULT,
                    borderColor: captureMode === 'sections' ? themeColors.primary.DEFAULT : themeColors.border.DEFAULT,
                    paddingHorizontal: ms(spacing[3], 0.3),
                    paddingVertical: ms(spacing[2], 0.3),
                    alignItems: 'center',
                  },
                ]}
              >
                <Text
                  style={{
                    color: captureMode === 'sections'
                      ? (themeColors.primary.foreground || '#ffffff')
                      : themeColors.text.primary,
                    fontWeight: '600',
                    fontSize: tabFontSize,
                  }}
                >
                  Sections
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCaptureMode('gallery')}
                style={[
                  styles.tabButton,
                  {
                    flex: 1,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: captureMode === 'gallery' ? themeColors.primary.DEFAULT : themeColors.card.DEFAULT,
                    borderColor: captureMode === 'gallery' ? themeColors.primary.DEFAULT : themeColors.border.DEFAULT,
                    paddingHorizontal: ms(spacing[3], 0.3),
                    paddingVertical: ms(spacing[2], 0.3),
                    alignItems: 'center',
                  },
                ]}
              >
                <Images
                  size={14}
                  color={
                    captureMode === 'gallery'
                      ? (themeColors.primary.foreground || '#ffffff')
                      : themeColors.text.primary
                  }
                />
                <Text
                  style={{
                    color: captureMode === 'gallery'
                      ? (themeColors.primary.foreground || '#ffffff')
                      : themeColors.text.primary,
                    fontWeight: '600',
                    fontSize: tabFontSize,
                  }}
                >
                  Gallery
                </Text>
              </TouchableOpacity>
              {COMPLETION_CHECKLIST_INSPECTION_UI_VISIBLE && hasCompletionChecklist && (
                <TouchableOpacity
                  onPress={() => setCaptureMode('checklist')}
                  style={[
                    styles.tabButton,
                    {
                      flex: 1,
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 4,
                      backgroundColor: captureMode === 'checklist' ? themeColors.primary.DEFAULT : themeColors.card.DEFAULT,
                      borderColor: captureMode === 'checklist' ? themeColors.primary.DEFAULT : themeColors.border.DEFAULT,
                      paddingHorizontal: ms(spacing[2], 0.3),
                      paddingVertical: ms(spacing[2], 0.3),
                      alignItems: 'center',
                    },
                  ]}
                  testID="button-capture-checklist-tab"
                >
                  <ClipboardList
                    size={14}
                    color={
                      captureMode === 'checklist'
                        ? (themeColors.primary.foreground || '#ffffff')
                        : themeColors.text.primary
                    }
                  />
                  <Text
                    style={{
                      color: captureMode === 'checklist'
                        ? (themeColors.primary.foreground || '#ffffff')
                        : themeColors.text.primary,
                      fontWeight: '600',
                      fontSize: tabFontSize,
                    }}
                  >
                    Checklist
                  </Text>
                  {checklistIsIncomplete && (
                    <View
                      style={{
                        backgroundColor: themeColors.destructive?.DEFAULT || '#ef4444',
                        borderRadius: 8,
                        minWidth: 16,
                        height: 16,
                        paddingHorizontal: 4,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                        {checklistIncompleteCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {captureMode === 'gallery' && (
              <InspectionGalleryPanel
                inspectionId={inspectionId}
                canEdit={effectiveInspection?.status !== 'completed' && !isDeleted}
                onEntriesChanged={() => {
                  queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}/entries`] });
                  queryClient.invalidateQueries({ queryKey: ['inspection', inspectionId] });
                }}
              />
            )}

            {COMPLETION_CHECKLIST_INSPECTION_UI_VISIBLE &&
              captureMode === 'checklist' &&
              hasCompletionChecklist && (
              <View style={{ display: 'flex' }}>
                <CompletionChecklistPanel
                  inspectionId={inspectionId}
                  readOnly={
                    effectiveInspection?.status === 'completed' ||
                    effectiveInspection?.status === 'reviewed' ||
                    isDeleted
                  }
                />
              </View>
            )}

            {captureMode === 'sections' && (
            <>
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
                  {sections.map((section, index) => {
                    const remaining = bySection[section.id]?.remainingFields ?? 0;
                    const isActive = index === currentSectionIndex;
                    return (
                    <TouchableOpacity
                      key={section.id}
                      onPress={() => {
                        setCurrentSectionIndex(index);
                        scrollCaptureToTop();
                        // Scroll the tab into view
                        const tabWidth = 120; // Approximate tab width
                        const scrollPosition = index * (tabWidth + spacing[2]);
                        tabsScrollViewRef.current?.scrollTo({ x: scrollPosition, animated: true });
                      }}
                      style={[
                        styles.tabButton,
                        {
                          backgroundColor: isActive ? themeColors.primary.DEFAULT : themeColors.card.DEFAULT,
                          borderColor: isActive ? themeColors.primary.DEFAULT : themeColors.border.DEFAULT,
                          paddingHorizontal: ms(spacing[3], 0.3),
                          paddingVertical: ms(spacing[2], 0.3),
                          minHeight: ms(36, 0.2),
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        },
                      ]}
                      activeOpacity={0.7}
                      accessibilityLabel={
                        remaining > 0
                          ? `${formatDisplayHeading(section.title)}, ${remaining} remaining`
                          : formatDisplayHeading(section.title)
                      }
                    >
                      <Text
                        style={[
                          styles.tabButtonText,
                          {
                            color: isActive
                              ? (themeColors.primary.foreground || '#ffffff')
                              : themeColors.text.primary,
                            fontSize: tabFontSize,
                          },
                          isActive && styles.tabButtonTextActive
                        ]}
                        numberOfLines={1}
                      >
                        {formatDisplayHeading(section.title)}
                      </Text>
                      {remaining > 0 && (
                        <View
                          style={{
                            minWidth: 20,
                            height: 20,
                            borderRadius: 10,
                            paddingHorizontal: 5,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isActive ? '#fbbf24' : '#fef3c7',
                            borderWidth: isActive ? 0 : 1,
                            borderColor: '#fcd34d',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '700',
                              color: isActive ? '#78350f' : '#92400e',
                            }}
                          >
                            {remaining > 99 ? '99+' : String(remaining)}
                          </Text>
                        </View>
                      )}
                      {isActive && <View style={styles.tabIndicator} />}
                    </TouchableOpacity>
                    );
                  })}
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
                {!currentSection.repeatable && (() => {
                  const sectionGalleryCount = countSectionGallery(currentSection.id);
                  const brand = themeColors.primary.DEFAULT;
                  const brandDark = themeColors.primary.dark || brand;
                  return (
                  <TouchableOpacity
                    onPress={() =>
                      setSectionGalleryScope({
                        sectionRef: currentSection.id,
                        aliasRefs: [],
                        label: formatDisplayHeading(currentSection.title),
                      })
                    }
                    activeOpacity={0.85}
                    style={{
                      alignSelf: 'flex-start',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: spacing[3],
                      paddingLeft: 6,
                      paddingRight: 10,
                      paddingVertical: 6,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: `${brand}55`,
                      backgroundColor: themeColors.primary.light || `${brand}12`,
                    }}
                    accessibilityLabel={
                      sectionGalleryCount === 0
                        ? 'Open section gallery'
                        : `Open section gallery, ${sectionGalleryCount} photos`
                    }
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: brand,
                      }}
                    >
                      <Images size={14} color="#ffffff" />
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        color: brandDark,
                        fontWeight: '700',
                        letterSpacing: 0.2,
                      }}
                    >
                      Section Gallery
                    </Text>
                    <View
                      style={{
                        minWidth: 22,
                        height: 20,
                        paddingHorizontal: 6,
                        borderRadius: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor:
                          sectionGalleryCount > 0 ? brand : themeColors.card.DEFAULT,
                        borderWidth: sectionGalleryCount > 0 ? 0 : 1,
                        borderColor: `${brand}40`,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '700',
                          color:
                            sectionGalleryCount > 0 ? '#ffffff' : themeColors.text.secondary,
                        }}
                      >
                        {sectionGalleryCount > 99 ? '99+' : String(sectionGalleryCount)}
                      </Text>
                    </View>
                    <ChevronRight size={14} color={brandDark} />
                  </TouchableOpacity>
                  );
                })()}
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

                {/* Repeatable section count input (hidden when locked from property) */}
                {currentSection.repeatable && !roomsLockedFromProperty && (
                  <Card style={[styles.fieldContainer, { backgroundColor: themeColors.muted?.DEFAULT || themeColors.card.DEFAULT }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[2] }}>
                    <Text style={[styles.fieldLabel, { color: themeColors.text.primary }]}>
                        {`How many ${currentSection.title.toLowerCase()}?`}
                    </Text>
                    </View>
                    <View style={{ flexDirection: actionStack === 'column' ? 'column' : 'row', alignItems: actionStack === 'column' ? 'stretch' : 'center', flexWrap: 'wrap', gap: spacing[3], marginTop: spacing[2] }}>
                      <TouchableOpacity
                        onPress={() => {
                          const currentCount = repeatableCounts[currentSection.id] ?? 1;
                          handleRepeatableCountChange(currentSection.id, currentCount - 1);
                        }}
                        disabled={(repeatableCounts[currentSection.id] ?? 1) <= 1}
                        style={[
                          styles.countButton,
                          {
                            backgroundColor: themeColors.primary.DEFAULT,
                            opacity: (repeatableCounts[currentSection.id] ?? 1) <= 1 ? 0.5 : 1,
                          }
                        ]}
                      >
                        <Text style={{ color: themeColors.primary.foreground || '#ffffff', fontSize: 18, fontWeight: 'bold' }}>-</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={[
                          styles.countInput,
                          {
                            backgroundColor: themeColors.card.DEFAULT,
                            borderColor: themeColors.border.DEFAULT,
                            color: themeColors.text.primary,
                          }
                        ]}
                        value={String(repeatableCounts[currentSection.id] ?? 1)}
                        onChangeText={(text) => {
                          const count = parseInt(text, 10) || 1;
                          handleRepeatableCountChange(currentSection.id, count);
                        }}
                        keyboardType="number-pad"
                        placeholder="1"
                      />
                      <TouchableOpacity
                        onPress={() => {
                          const currentCount = repeatableCounts[currentSection.id] ?? 1;
                          handleRepeatableCountChange(currentSection.id, currentCount + 1);
                        }}
                        disabled={(repeatableCounts[currentSection.id] ?? 1) >= 50}
                        style={[
                          styles.countButton,
                          {
                            backgroundColor: themeColors.primary.DEFAULT,
                            opacity: (repeatableCounts[currentSection.id] ?? 1) >= 50 ? 0.5 : 1,
                          }
                        ]}
                      >
                        <Text style={{ color: themeColors.primary.foreground || '#ffffff', fontSize: 18, fontWeight: 'bold' }}>+</Text>
                      </TouchableOpacity>
                      <Text style={[styles.countHint, { color: themeColors.text.muted }]}>
                        {(repeatableCounts[currentSection.id] ?? 1) > 0 
                          ? `${repeatableCounts[currentSection.id] ?? 1} ${currentSection.title.toLowerCase()} will be created`
                          : "Enter the number of items to inspect"}
                      </Text>
                    </View>
                  </Card>
                )}

                {/* Render fields - for repeatable sections, render for each instance */}
                {currentSection.repeatable && (repeatableCounts[currentSection.id] ?? 1) > 0 ? (
                  // Prefer stable property-room sectionRefs (same as portal) so gallery assignments match
                  (() => {
                    const repeatableInstances = listRepeatableInstances(
                      effectiveInspection?.templateSnapshotJson as any,
                      currentSection.id,
                      repeatableCounts,
                    );
                    const instanceCount = Math.max(
                      1,
                      repeatableInstances.length || (repeatableCounts[currentSection.id] ?? 1),
                    );
                    return Array.from({ length: instanceCount }).map((_, instanceIndex) => {
                    const inst = repeatableInstances[instanceIndex];
                    const roomInst = propertyRoomInstances.find(
                      (r) => r.sectionRef === inst?.sectionRef,
                    );
                    const snapRoom = propertyRoomsSnapshot?.rooms?.find(
                      (r) => r.id === roomInst?.roomId,
                    );
                    const instanceName =
                      inst?.sectionLabel ||
                      numberedRoomInstanceTitle(
                        roomInst?.title,
                        currentSection.title,
                        instanceIndex,
                      );
                    const dimLabel =
                      snapRoom?.widthMm && snapRoom?.lengthMm
                        ? ` · ${(snapRoom.widthMm / 1000).toFixed(2)} m × ${(snapRoom.lengthMm / 1000).toFixed(2)} m`
                        : '';
                    const sectionRef =
                      inst?.sectionRef ||
                      `${currentSection.id}/${currentSection.title} ${instanceIndex + 1}`;
                    const aliasRefs = inst?.aliasRefs || [];
                    const canDeleteInstance =
                      effectiveInspection?.status !== 'completed' && !isDeleted;
                    const roomShellKey = `room:${sectionRef}`;
                    const roomShellOpen = isInspectionPointOpen(roomShellKey, instanceIndex === 0);
                    return (
                      <View key={roomInst?.roomId || `instance-${instanceIndex}`} style={[styles.instanceContainer, { borderColor: themeColors.border.DEFAULT, backgroundColor: themeColors.card.DEFAULT }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <TouchableOpacity
                            onPress={() => toggleInspectionPoint(roomShellKey, instanceIndex === 0)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flex: 1 }}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: roomShellOpen }}
                            accessibilityLabel={`${roomShellOpen ? 'Collapse' : 'Expand'} ${instanceName}`}
                          >
                            {roomShellOpen ? (
                              <ChevronDown size={18} color={themeColors.text.secondary} />
                            ) : (
                              <ChevronRight size={18} color={themeColors.text.secondary} />
                            )}
                            <Text style={[styles.instanceTitle, { color: themeColors.primary.DEFAULT, flex: 1 }]}>
                              {instanceName}
                              {!!dimLabel && (
                                <Text style={{ color: themeColors.text.muted, fontWeight: '400', fontSize: typography.fontSize.sm }}>
                                  {dimLabel}
                                </Text>
                              )}
                            </Text>
                          </TouchableOpacity>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {(() => {
                              const instanceGalleryCount = countSectionGallery(sectionRef, aliasRefs);
                              const brand = themeColors.primary.DEFAULT;
                              const brandDark = themeColors.primary.dark || brand;
                              return (
                            <TouchableOpacity
                              onPress={() =>
                                setSectionGalleryScope({
                                  sectionRef,
                                  aliasRefs,
                                  label: instanceName,
                                })
                              }
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              activeOpacity={0.85}
                              accessibilityLabel={
                                instanceGalleryCount === 0
                                  ? `Open section gallery for ${instanceName}`
                                  : `Open section gallery for ${instanceName}, ${instanceGalleryCount} photos`
                              }
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                paddingLeft: 4,
                                paddingRight: 8,
                                paddingVertical: 4,
                                borderRadius: 8,
                                borderWidth: 1.5,
                                borderColor: `${brand}55`,
                                backgroundColor: themeColors.primary.light || `${brand}12`,
                              }}
                            >
                              <View
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 6,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: brand,
                                }}
                              >
                                <Images size={12} color="#ffffff" />
                              </View>
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: brandDark,
                                  fontWeight: '700',
                                }}
                              >
                                Gallery
                              </Text>
                              <View
                                style={{
                                  minWidth: 18,
                                  height: 18,
                                  paddingHorizontal: 4,
                                  borderRadius: 9,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor:
                                    instanceGalleryCount > 0 ? brand : themeColors.card.DEFAULT,
                                  borderWidth: instanceGalleryCount > 0 ? 0 : 1,
                                  borderColor: `${brand}40`,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 9,
                                    fontWeight: '700',
                                    color:
                                      instanceGalleryCount > 0
                                        ? '#ffffff'
                                        : themeColors.text.secondary,
                                  }}
                                >
                                  {instanceGalleryCount > 99
                                    ? '99+'
                                    : String(instanceGalleryCount)}
                                </Text>
                              </View>
                            </TouchableOpacity>
                              );
                            })()}
                            {canDeleteInstance && (
                              <TouchableOpacity
                                onPress={() =>
                                  requestDeleteInstance({
                                    sectionRef,
                                    label: instanceName,
                                    sectionId: currentSection.id,
                                    sectionIndex: currentSectionIndex,
                                  })
                                }
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityLabel={`Remove ${instanceName}`}
                                style={{ padding: 4 }}
                              >
                                <Trash2 size={18} color="#dc2626" />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                        {roomShellOpen ? (
                        <>
                        {(() => {
                          const sectionCips = sectionCipsFor(currentSection);
                          return sectionCips.length
                            ? renderCipCountInputs(sectionRef, sectionCips)
                            : null;
                        })()}
                        {currentSection.fields.map((field) => {
                          if (!field || !field.id && !field.key) {
                            console.warn('Invalid field found:', field);
                            return null;
                          }

                          try {
                            const fieldId = field.id || field.key || '';
                            const entryCandidates = [
                              sectionRef,
                              ...aliasRefs,
                              `${currentSection.id}/${currentSection.title} ${instanceIndex + 1}`,
                              roomInst?.sectionRef,
                            ].filter(Boolean) as string[];
                            const entry =
                              entryCandidates
                                .map((ref) => entries[`${ref}-${fieldId}`])
                                .find((e) => e && Array.isArray(e.photos) && e.photos.length > 0) ||
                              entryCandidates.map((ref) => entries[`${ref}-${fieldId}`]).find(Boolean);
                            const key = `${sectionRef}-${fieldId}`;
                            const properEntryId = entry?.id || key;

                            return (
                              <View key={`${instanceIndex}-${field.id || field.key || `field-${Math.random()}`}`} style={styles.fieldContainer}>
                                <FieldWidget
                                  field={field}
                                  value={entry?.valueJson}
                                  note={entry?.note}
                                  photos={entry?.photos}
                                  inspectionId={inspectionId}
                                  entryId={properEntryId}
                                  sectionRef={sectionRef}
                                  galleryAliasRefs={aliasRefs}
                                  sectionName={instanceName}
                                  isCheckOut={effectiveInspection?.type === 'check_out'}
                                  markedForReview={entry?.markedForReview || false}
                                  disabled={effectiveInspection?.status === 'completed' || isDeleted}
                                  validationError={isRequiredFieldHighlighted(
                                    sectionRef,
                                    fieldId,
                                    aliasRefs,
                                  )}
                                  autoContext={{
                                    inspectorName: resolvedInspectorName,
                                    address: property
                                      ? [property.address, property.city, property.state, property.postalCode].filter(Boolean).join(', ')
                                      : block
                                        ? [block.address, block.city, block.state, block.postalCode].filter(Boolean).join(', ')
                                        : '',
                                    tenantNames: Array.isArray(tenants) && tenants.length > 0
                                      ? (() => {
                                          const tenantNames = tenants
                                            .map((t: any) => {
                                              return t.tenantName || t.name || t.tenant?.name || t.tenant?.fullName || 
                                                     (t.firstName && t.lastName ? `${t.firstName} ${t.lastName}` : 
                                                     t.firstName || t.lastName || "");
                                            })
                                            .filter(Boolean);
                                          
                                          if (tenantNames.length > 0) {
                                            return tenantNames.join(", ");
                                          }
                                          
                                          const hasAnyTenant = tenants.some((t: any) => 
                                            t.tenantName || t.name || t.tenant || t.firstName || t.lastName
                                          );
                                          
                                          if (hasAnyTenant) {
                                            return "Tenant assigned";
                                          }
                                          
                                          return "";
                                        })()
                                      : '',
                                    inspectionDate: new Date(effectiveInspection?.scheduledDate || (effectiveInspection as any)?.startedAt || new Date().toISOString()).toISOString().split('T')[0],
                                    bedroomCount: propertyLayoutCounts.bedroomCount,
                                    bathroomCount: propertyLayoutCounts.bathroomCount,
                                  }}
                                  onChange={(value, note, photos) =>
                                    handleFieldChange(currentSection.id, field.id || field.key || '', value, note, photos, undefined, instanceIndex)
                                  }
                                  onMarkedForReviewChange={(marked) => {
                                    handleFieldChange(currentSection.id, field.id || field.key || '', undefined, undefined, undefined, marked, instanceIndex);
                                  }}
                                  onLogMaintenance={
                                    maintenanceEnabled
                                      ? (fieldLabel, photos) => {
                                    try {
                                      const fieldPhotos = (photos?.length ? photos : entry?.photos || []).filter(Boolean);
                                      const rootNavigator = navigation.getParent()?.getParent();
                                      if (rootNavigator) {
                                        rootNavigator.dispatch(
                                          CommonActions.navigate('Main', {
                                              screen: 'Maintenance',
                                              params: {
                                                screen: 'CreateMaintenance',
                                                params: {
                                                  inspectionId,
                                                  propertyId: effectiveInspection?.propertyId,
                                                  blockId: effectiveInspection?.blockId,
                                                  fieldLabel,
                                                photos: fieldPhotos,
                                                entryId: entry?.id || properEntryId,
                                                  sectionTitle: instanceName,
                                              },
                                            },
                                          })
                                        );
                                      }
                                    } catch (error) {
                                      console.error('[InspectionCapture] Navigation error:', error);
                                    }
                                  }
                                      : undefined
                                  }
                                />
                              </View>
                            );
                          } catch (error) {
                            console.error(`[InspectionCapture] Error rendering field ${field.id || field.key}:`, error);
                            return (
                              <View key={`${instanceIndex}-${field.id || field.key || `field-error-${Math.random()}`}`} style={styles.fieldContainer}>
                                <Text style={{ color: 'red' }}>Error rendering field: {field.label || field.id || field.key}</Text>
                              </View>
                            );
                          }
                        })}
                        {(() => {
                          const sectionCips = sectionCipsFor(currentSection);
                          return sectionCips.length
                            ? renderCipInstanceCards(
                                sectionRef,
                                instanceName,
                                currentSection.title,
                                sectionCips,
                                isGeneralInformationSection(currentSection),
                              )
                            : null;
                        })()}
                        </>
                        ) : null}
                      </View>
                    );
                    });
                  })()
                ) : !currentSection.repeatable ? (
                  <>
                  {(() => {
                    const sectionCips = sectionCipsFor(currentSection);
                    return sectionCips.length
                      ? renderCipCountInputs(currentSection.id, sectionCips)
                      : null;
                  })()}
                  {currentSection.fields.map((field, fieldIndex) => {
                    if (!field || !field.id && !field.key) {
                      console.warn('Invalid field found:', field);
                      return null;
                    }

                    try {
                      const getTenantNames = () => {
                        if (!Array.isArray(tenants) || tenants.length === 0) return '';
                                    const tenantNames = tenants
                                      .map((t: any) => {
                                        return t.tenantName || t.name || t.tenant?.name || t.tenant?.fullName || 
                                               (t.firstName && t.lastName ? `${t.firstName} ${t.lastName}` : 
                                   t.firstName || t.lastName || '');
                                      })
                                      .filter(Boolean);
                        if (tenantNames.length > 0) return tenantNames.join(', ');
                                    const hasAnyTenant = tenants.some((t: any) => 
                                      t.tenantName || t.name || t.tenant || t.firstName || t.lastName
                                    );
                        return hasAnyTenant ? 'Tenant assigned' : '';
                      };

                      const navigateToMaintenance = (
                        fieldLabel: string,
                        photos: string[] | undefined,
                        pointEntry: any,
                        pointEntryId: string,
                      ) => {
                        try {
                          const fieldPhotos = (photos?.length ? photos : pointEntry?.photos || []).filter(Boolean);
                                const rootNavigator = navigation.getParent()?.getParent();
                                if (rootNavigator) {
                                  rootNavigator.dispatch(
                              CommonActions.navigate('Main', {
                                        screen: 'Maintenance',
                                        params: {
                                          screen: 'CreateMaintenance',
                                          params: {
                                            inspectionId,
                                            propertyId: effectiveInspection?.propertyId,
                                            blockId: effectiveInspection?.blockId,
                                            fieldLabel,
                                    photos: fieldPhotos,
                                    entryId: pointEntry?.id || pointEntryId,
                                            sectionTitle: currentSection?.title,
                                        },
                                      },
                                    })
                                  );
                                } else {
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
                                  entryId: pointEntry?.id || pointEntryId,
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
                      };

                      const entryKey = `${currentSection.id}-${field.id || field.key}`;
                      const entry = entries[entryKey];
                      const entryId = entry?.id || entryKey;

                      return (
                        <View key={field.id || field.key || `field-${fieldIndex}`} style={styles.fieldContainer}>
                          <FieldWidget
                            field={field}
                            value={entry?.valueJson}
                            note={entry?.note}
                            photos={entry?.photos}
                            inspectionId={inspectionId}
                            entryId={entryId}
                            sectionRef={currentSection.id}
                            galleryAliasRefs={[]}
                            sectionName={currentSection.title}
                            isCheckOut={effectiveInspection?.type === 'check_out'}
                            markedForReview={entry?.markedForReview || false}
                            disabled={
                              effectiveInspection?.status === 'completed' ||
                              isDeleted
                            }
                            validationError={isRequiredFieldHighlighted(
                              currentSection.id,
                              field.id || field.key || '',
                            )}
                            autoContext={{
                              inspectorName: resolvedInspectorName,
                              address: property
                                ? [property.address, property.city, property.state, property.postalCode].filter(Boolean).join(', ')
                                : block
                                  ? [block.address, block.city, block.state, block.postalCode].filter(Boolean).join(', ')
                                  : '',
                              tenantNames: getTenantNames(),
                              inspectionDate: new Date(effectiveInspection?.scheduledDate || (effectiveInspection as any)?.startedAt || new Date().toISOString()).toISOString().split('T')[0],
                              bedroomCount: propertyLayoutCounts.bedroomCount,
                              bathroomCount: propertyLayoutCounts.bathroomCount,
                            }}
                            onChange={(value, note, photos) =>
                              handleFieldChange(currentSection.id, field.id || field.key || '', value, note, photos)
                            }
                            onMarkedForReviewChange={(marked) => {
                              handleFieldChange(currentSection.id, field.id || field.key || '', undefined, undefined, undefined, marked);
                            }}
                            onLogMaintenance={
                              maintenanceEnabled
                                ? (fieldLabel, photos) =>
                                    navigateToMaintenance(fieldLabel, photos, entry, entryId)
                                : undefined
                            }
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
                  {(() => {
                    const sectionCips = sectionCipsFor(currentSection);
                    return sectionCips.length
                      ? renderCipInstanceCards(
                          currentSection.id,
                          currentSection.title,
                          currentSection.title,
                          sectionCips,
                          isGeneralInformationSection(currentSection),
                        )
                      : null;
                  })()}
                  </>
                ) : null}
              </>
            )}
            {!currentSection && (
              <View style={styles.centerContent}>
                <Text style={[styles.errorText, { color: themeColors.text.primary }]}>No section selected</Text>
              </View>
            )}
            </>
            )}
        </FormScreen>

        <Modal
          visible={!!sectionGalleryScope}
          animationType="slide"
          onRequestClose={() => setSectionGalleryScope(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: themeColors.background?.DEFAULT || themeColors.card.DEFAULT,
              paddingTop: Math.max(insets.top, spacing[3]),
              paddingBottom: Math.max(insets.bottom, spacing[3]),
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: spacing[4],
                marginBottom: spacing[2],
              }}
            >
              <Text
                style={{
                  fontSize: typography.fontSize.lg,
                  fontWeight: '700',
                  color: themeColors.text.primary,
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {sectionGalleryScope
                  ? `Section Gallery — ${sectionGalleryScope.label}`
                  : 'Section Gallery'}
              </Text>
              <TouchableOpacity
                onPress={() => setSectionGalleryScope(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Close Section Gallery"
              >
                <Text style={{ color: themeColors.primary.DEFAULT, fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
            </View>
            {sectionGalleryScope ? (
              <InspectionGalleryPanel
                inspectionId={inspectionId}
                canEdit={effectiveInspection?.status !== 'completed' && !isDeleted}
                scopeSectionRef={sectionGalleryScope.sectionRef}
                scopeAliasRefs={sectionGalleryScope.aliasRefs}
                scopeLabel={sectionGalleryScope.label}
                onEntriesChanged={() => {
                  queryClient.invalidateQueries({
                    queryKey: [`/api/inspections/${inspectionId}/entries`],
                  });
                  queryClient.invalidateQueries({ queryKey: ['inspection', inspectionId] });
                  queryClient.invalidateQueries({ queryKey: ['gallery', inspectionId] });
                }}
              />
            ) : null}
          </View>
        </Modal>

        <Modal
          visible={COMPLETION_CHECKLIST_INSPECTION_UI_VISIBLE && showChecklistSoftGate}
          transparent
          animationType="slide"
          onRequestClose={() => setShowChecklistSoftGate(false)}
        >
          <Pressable
            style={styles.checklistSoftGateOverlay}
            onPress={() => setShowChecklistSoftGate(false)}
          >
            <Pressable
              style={[
                styles.checklistSoftGateSheet,
                {
                  backgroundColor: themeColors.card.DEFAULT,
                  paddingBottom: Math.max(insets.bottom, spacing[4]),
                },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.checklistSoftGateHandle} />
              <Text style={[styles.checklistSoftGateTitle, { color: themeColors.text.primary }]}>
                Completion checklist unfinished
              </Text>
              <Text style={[styles.checklistSoftGateBody, { color: themeColors.text.secondary }]}>
                {checklistIncompleteCount} checklist step
                {checklistIncompleteCount === 1 ? ' is' : 's are'} still unfinished
                {checklistRequiredIncomplete > 0
                  ? ` (${checklistRequiredIncomplete} required)`
                  : ''}
                . You can finish them now or complete the inspection anyway.
              </Text>
              <Button
                title="Complete checklist"
                onPress={() => {
                  setShowChecklistSoftGate(false);
                  setCaptureMode('checklist');
                }}
                variant="default"
                size="md"
                icon={<ClipboardList size={16} color={themeColors.primary.foreground || '#fff'} />}
                style={{ marginBottom: spacing[2] }}
              />
              <Button
                title="Complete anyway"
                onPress={() => {
                  setShowChecklistSoftGate(false);
                  proceedAfterChecklistGate();
                }}
                variant="outline"
                size="md"
                style={{ marginBottom: spacing[2] }}
              />
              <Button
                title="Cancel"
                onPress={() => setShowChecklistSoftGate(false)}
                variant="ghost"
                size="md"
              />
            </Pressable>
          </Pressable>
        </Modal>

      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  checklistSoftGateOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  checklistSoftGateSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
  checklistSoftGateHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.4)',
    marginBottom: spacing[3],
  },
  checklistSoftGateTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing[2],
  },
  checklistSoftGateBody: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing[4],
  },
  header: {
    borderBottomWidth: 1,
    paddingBottom: 0,
    ...shadows.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: spacing[4],
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
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
    marginBottom: spacing[3],
    marginTop: 0,
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  statusBadge: {
    marginRight: spacing[1],
  },
  mainActionsRow: {
    alignItems: 'stretch',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
    gap: spacing[2],
  },
  actionButtonContainer: {
    flex: 1,
    minWidth: 0,
  },
  actionButton: {
    width: '100%',
  },
  actionButtonText: {
    fontSize: typography.fontSize.xs,
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
    marginBottom: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
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
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: spacing[2],
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    // Colors applied dynamically via themeColors
  },
  tabButtonText: {
    fontSize: typography.fontSize.xs,
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
    marginBottom: spacing[8],
  },
  fieldLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing[2],
  },
  countButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countInput: {
    width: 80,
    height: 40,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    textAlign: 'center',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  countHint: {
    fontSize: typography.fontSize.sm,
    flex: 1,
  },
  instanceContainer: {
    marginBottom: spacing[5],
    padding: spacing[4],
    borderWidth: 2,
    borderRadius: borderRadius.lg,
  },
  instanceTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing[4],
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
    ...shadows.lg,
    // Ensure footer is always visible
    minHeight: 70, // Minimum height to ensure buttons are always visible
    // Colors applied dynamically via themeColors
  },
  footerActions: {
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: spacing[3],
  },
  footerButton: {
    flex: 1,
    minHeight: 44,
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
    fontSize: 16,
    fontWeight: typography.fontWeight.normal,
    textAlign: 'center',
  },
  syncSubtext: {
    fontSize: 14,
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
  removeCustomPointButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: spacing[1],
    marginBottom: spacing[2],
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
  },
  addPointContainer: {
    marginTop: spacing[4],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  addPointButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderWidth: 2,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...shadows.sm,
  },
  addPointButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  addPointHint: {
    marginTop: spacing[2],
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
  },
  addPointModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing[4],
  },
  addPointModalCard: {
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    ...shadows.md,
  },
  kindCard: {
    borderWidth: 2,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
  },
  addPointModalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing[2],
  },
  addPointModalDescription: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing[4],
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.sm,
  },
  addPointModalLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
  },
  addPointModalInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontSize: typography.fontSize.base,
    marginBottom: spacing[4],
  },
  addPointModalActions: {
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'flex-end',
  },
  addPointModalCancel: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  addPointModalConfirm: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
