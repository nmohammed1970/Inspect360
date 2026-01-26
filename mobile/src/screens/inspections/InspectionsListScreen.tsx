import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { 
  MapPin, 
  Calendar, 
  User, 
  Play, 
  FileText, 
  Copy as CopyIcon,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
} from 'lucide-react-native';
import { format } from 'date-fns';
import { inspectionsService } from '../../services/inspections';
import { apiRequestJson } from '../../services/api';
import { queryClient } from '../../services/queryClient';
import type { InspectionsStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import DatePicker from '../../components/ui/DatePicker';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { moderateScale, getFontSize, getButtonHeight } from '../../utils/responsive';
import { useAuth } from '../../contexts/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { localDatabase } from '../../services/localDatabase';
import { syncManager } from '../../services/syncManager';
import { Cloud, WifiOff } from 'lucide-react-native';

type NavigationProp = StackNavigationProp<InspectionsStackParamList, 'InspectionsList'>;

interface Inspection {
  id: string;
  type: string;
  status: string;
  scheduledDate?: string;
  property?: {
    id: string;
    name: string;
    address?: string;
  };
  block?: {
    id: string;
    name: string;
    address?: string;
  };
  clerk?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  templateSnapshotJson?: any;
  tenantApprovalStatus?: string | null;
  tenantApprovalDeadline?: string | null;
  tenantComments?: string | null;
}

// Helper function to get status badge - defined at module level but only called from component
// Must be extra defensive since it's defined outside component scope
const getStatusBadge = (status: string, themeColors?: any) => {
  // Triple-check: ensure themeColors is always a valid object, fallback to default colors
  let safeThemeColors = colors;
  if (themeColors && typeof themeColors === 'object' && themeColors !== null) {
    safeThemeColors = themeColors;
  }
  
  try {
  switch (status) {
    case 'in_progress':
      return (
        <Badge variant="warning" size="sm" style={styles.statusBadge}>
          In Progress
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="primary" size="sm" style={styles.statusBadge}>
          Completed
        </Badge>
      );
    case 'scheduled':
      return (
        <Badge 
          variant="outline" 
          size="sm" 
            style={{ ...styles.statusBadge, borderColor: (safeThemeColors?.primary?.DEFAULT || colors.primary.DEFAULT), borderWidth: 1 }}
        >
            <Text style={{ color: (safeThemeColors?.primary?.DEFAULT || colors.primary.DEFAULT), fontSize: 10 }}>Scheduled</Text>
        </Badge>
      );
    case 'draft':
      return (
        <Badge variant="outline" size="sm" style={styles.statusBadge}>
            <Text style={{ color: (safeThemeColors?.text?.secondary || colors.text.secondary), fontSize: 10 }}>Draft</Text>
        </Badge>
      );
    default:
        return (
          <Badge variant="outline" size="sm" style={styles.statusBadge}>
            <Text style={{ color: (safeThemeColors?.text?.secondary || colors.text.secondary), fontSize: 10 }}>{status}</Text>
          </Badge>
        );
    }
  } catch (error) {
    // Fallback in case of any errors - return a simple badge
    console.warn('Error in getStatusBadge:', error);
      return (
        <Badge variant="outline" size="sm" style={styles.statusBadge}>
          <Text style={{ color: colors.text.secondary, fontSize: 10 }}>{status}</Text>
        </Badge>
      );
  }
};

const getTypeBadge = (type: string) => {
  const labels: Record<string, string> = {
    check_in: 'Check In',
    check_out: 'Check Out',
    routine: 'Routine',
    maintenance: 'Maintenance',
    esg_sustainability_inspection: 'ESG Sustainability Inspection',
    fire_hazard_assessment: 'Fire Hazard Assessment',
    maintenance_inspection: 'Maintenance Inspection',
    damage: 'Damage',
    emergency: 'Emergency',
    safety_compliance: 'Safety & Compliance',
    compliance_regulatory: 'Compliance / Regulatory',
    pre_purchase: 'Pre-Purchase',
    specialized: 'Specialized',
  };
  return <Badge variant="outline" size="sm">{labels[type] || type}</Badge>;
};

const getTenantApprovalBadge = (inspection: Inspection) => {
  if (inspection.type !== 'check_in') return null;

  const deadline = inspection.tenantApprovalDeadline
    ? new Date(inspection.tenantApprovalDeadline)
    : null;
  const now = new Date();
  const isExpired = deadline && deadline < now;
  const effectiveStatus =
    isExpired && (!inspection.tenantApprovalStatus || inspection.tenantApprovalStatus === 'pending')
      ? 'approved'
      : inspection.tenantApprovalStatus || 'pending';

  let badgeStyle: any = { borderColor: '#fbbf24', borderWidth: 1 }; // Lighter amber-400
  let textColor = '#fbbf24';
  let text = 'Tenant Review Pending';

  if (effectiveStatus === 'approved') {
    badgeStyle = { borderColor: '#22c55e', borderWidth: 1 };
    textColor = '#22c55e';
    text = 'Tenant Approved';
  } else if (effectiveStatus === 'disputed') {
    badgeStyle = { borderColor: '#fbbf24', borderWidth: 1 }; // Lighter amber-400
    textColor = '#fbbf24';
    text = 'Tenant Disputed';
  }

  return (
    <Badge variant="outline" size="sm" style={{ ...styles.tenantBadge, ...badgeStyle }}>
      <Text style={{ color: textColor, fontSize: 10 }}>{text}</Text>
    </Badge>
  );
};

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'draft', label: 'Draft' },
];

export default function InspectionsListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  
  // Get theme colors with fallback - hooks must be called unconditionally
  const theme = useTheme();
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  
  const { isAuthenticated, user } = useAuth();
  const isOnline = useOnlineStatus();
  const [refreshing, setRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBlockId, setFilterBlockId] = useState('');
  const [filterPropertyId, setFilterPropertyId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterDueSoon, setFilterDueSoon] = useState(false);
  
  // Filter modal states
  const [showBlockFilter, setShowBlockFilter] = useState(false);
  const [showPropertyFilter, setShowPropertyFilter] = useState(false);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  
  // Copy inspection modal state
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [inspectionToCopy, setInspectionToCopy] = useState<Inspection | null>(null);
  const [copyType, setCopyType] = useState<'check_in' | 'check_out'>('check_out');
  const [copyScheduledDate, setCopyScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [copyImages, setCopyImages] = useState(true);
  const [copyText, setCopyText] = useState(true);

  // Initialize local DB and load pending count
  React.useEffect(() => {
    const initLocalDB = async () => {
      try {
        await localDatabase.initialize();
        const count = await syncManager.getPendingCount();
        setPendingCount(count);
      } catch (error) {
        console.error('[InspectionsList] Failed to initialize local DB:', error);
      }
    };
    initLocalDB();

    // Refresh pending count periodically
    const interval = setInterval(async () => {
      const count = await syncManager.getPendingCount();
      setPendingCount(count);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Always load from local DB first (both online and offline)
  const { data: localInspections = [], isLoading: isLoadingLocal, refetch: refetchLocal } = useQuery({
    queryKey: ['local-inspections', user?.id],
    queryFn: async () => {
      try {
        await localDatabase.initialize();
        const locals = await localDatabase.getAllInspections(user?.id);
        return locals.map(local => {
          try {
            const templateData = JSON.parse(local.template_snapshot_json);
            const metadata = templateData._metadata || {};
            
            return {
        id: local.id,
        type: local.type,
        status: local.status,
        scheduledDate: local.scheduled_date || undefined,
              property: metadata.property || undefined,
              block: metadata.block || undefined,
              clerk: metadata.clerk || undefined,
              templateSnapshotJson: templateData,
              tenantApprovalStatus: metadata.tenantApprovalStatus || undefined,
              tenantApprovalDeadline: metadata.tenantApprovalDeadline || undefined,
              tenantComments: metadata.tenantComments || undefined,
              createdAt: local.created_at,
              updatedAt: local.updated_at,
            };
          } catch (parseError) {
            console.error('[InspectionsList] Error parsing inspection data:', parseError);
            return {
              id: local.id,
              type: local.type,
              status: local.status,
              scheduledDate: local.scheduled_date || undefined,
              property: undefined,
              block: undefined,
              clerk: undefined,
              templateSnapshotJson: {},
              createdAt: local.created_at,
              updatedAt: local.updated_at,
            };
          }
        });
      } catch (error) {
        console.error('[InspectionsList] Error loading local inspections:', error);
        return [];
      }
    },
    staleTime: 0, // Always refetch to get latest local data
    refetchOnMount: true,
    enabled: !!user?.id, // only load scoped local data once we know the user
  });

  // Fetch from server when online and authenticated
  // Saves ALL inspection types to local DB (check_in, check_out, routine, maintenance, etc.)
  const { data: serverInspections = [], isLoading: isLoadingServer, refetch: refetchServer } = useQuery({
    queryKey: ['/api/inspections/my'],
    queryFn: async () => {
      const inspections = await inspectionsService.getMyInspections();
      
      // Always save ALL inspection types to local DB (both online and offline scenarios)
      // No type filtering - all types are saved for offline access
        try {
          await localDatabase.initialize();
        for (const inspection of inspections) {
            try {
              // Save inspection regardless of type (check_in, check_out, routine, maintenance, etc.)
              await localDatabase.saveInspection(inspection);
            } catch (saveError) {
              console.error('[InspectionsList] Failed to save inspection to local DB:', saveError);
              // Continue with other inspections even if one fails
            }
          }
        // After saving, refetch local inspections to update the UI
        queryClient.invalidateQueries({ queryKey: ['local-inspections'] });
        } catch (error) {
          console.error('[InspectionsList] Failed to initialize or save to local DB:', error);
        }
      
      return inspections;
    },
    enabled: isOnline && isAuthenticated, // Only fetch when online AND authenticated
    staleTime: 30000, // Cache for 30 seconds
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Always use local inspections as the source of truth
  // When online, server data will update local DB, and local query will refetch
  // When offline, only local data is available
  const effectiveInspections = localInspections;
  const isLoading = isOnline ? (isLoadingLocal || isLoadingServer) : isLoadingLocal;

  // Load sync statuses for all inspections
  const [syncStatuses, setSyncStatuses] = React.useState<Record<string, { status: 'synced' | 'pending' | 'conflict'; pendingCount: number }>>({});
  
  React.useEffect(() => {
    const loadSyncStatuses = async () => {
      const statuses: Record<string, { status: 'synced' | 'pending' | 'conflict'; pendingCount: number }> = {};
      for (const inspection of effectiveInspections) {
        try {
          const local = await localDatabase.getInspection(inspection.id);
          if (local) {
            const count = await localDatabase.getPendingEntriesCount(inspection.id);
            statuses[inspection.id] = {
              status: local.sync_status,
              pendingCount: count,
            };
          } else {
            statuses[inspection.id] = { status: 'synced', pendingCount: 0 };
          }
        } catch (error) {
          statuses[inspection.id] = { status: 'synced', pendingCount: 0 };
        }
      }
      setSyncStatuses(statuses);
    };
    if (effectiveInspections.length > 0) {
      loadSyncStatuses();
    }
  }, [effectiveInspections]);

  const { data: blocks = [] } = useQuery({
    queryKey: ['/api/blocks'],
    queryFn: () => apiRequestJson<any[]>('GET', '/api/blocks'),
    enabled: isAuthenticated, // Only fetch when authenticated
  });

  const { data: properties = [] } = useQuery({
    queryKey: ['/api/properties'],
    queryFn: () => apiRequestJson<any[]>('GET', '/api/properties'),
    enabled: isAuthenticated, // Only fetch when authenticated
  });

  const copyInspection = useMutation({
    mutationFn: async (data: { inspectionId: string; type: 'check_in' | 'check_out'; scheduledDate: string; copyImages: boolean; copyText: boolean }) => {
      return apiRequestJson('POST', `/api/inspections/${data.inspectionId}/copy`, {
        type: data.type,
        scheduledDate: data.scheduledDate,
        copyImages: data.copyImages,
        copyText: data.copyText,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inspections/my'] });
      Alert.alert('Success', 'Inspection copied successfully');
      setShowCopyModal(false);
      setInspectionToCopy(null);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to copy inspection');
    },
  });

  // Get selected block/property names for display
  const selectedBlock = blocks.find((b: any) => b.id === filterBlockId);
  const selectedProperty = properties.find((p: any) => p.id === filterPropertyId);
  const selectedStatusLabel = STATUS_OPTIONS.find((s) => s.value === filterStatus)?.label || 'All';

  // Clear property filter when block filter changes (block filter takes precedence)
  const handleBlockFilterChange = (blockId: string) => {
    setFilterBlockId(blockId);
    if (blockId) {
      setFilterPropertyId(''); // Clear property filter when block is selected
    }
    setShowBlockFilter(false);
  };

  // Filter properties by selected block
  const filteredProperties = useMemo(() => {
    if (!filterBlockId) return properties;
    return properties.filter((p: any) => p.blockId === filterBlockId);
  }, [properties, filterBlockId]);

  const filteredInspections = useMemo(() => {
    let filtered = [...effectiveInspections];

    // Search filter - search by property name, block name, type, status
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter((i: Inspection) => {
        const propertyName = i.property?.name?.toLowerCase() || '';
        const blockName = i.block?.name?.toLowerCase() || '';
        const type = i.type?.toLowerCase() || '';
        const status = i.status?.toLowerCase() || '';
        const propertyAddress = i.property?.address?.toLowerCase() || '';
        
        return propertyName.includes(searchLower) ||
               blockName.includes(searchLower) ||
               type.includes(searchLower) ||
               status.includes(searchLower) ||
               propertyAddress.includes(searchLower);
      });
    }

    // Block filter - check both blockId and property's blockId
    if (filterBlockId) {
      filtered = filtered.filter((i: Inspection) => {
        if (i.block?.id === filterBlockId) return true;
        // Also check if property belongs to this block
        const property = properties.find((p: any) => p.id === i.property?.id);
        return property?.blockId === filterBlockId;
      });
    }

    // Property filter
    if (filterPropertyId) {
      filtered = filtered.filter((i: Inspection) => i.property?.id === filterPropertyId);
    }

    // Status filter
    if (filterStatus) {
      filtered = filtered.filter((i: Inspection) => i.status === filterStatus);
    }

    if (filterOverdue) {
      const now = new Date();
      filtered = filtered.filter((i: Inspection) => {
        if (!i.scheduledDate) return false;
        const scheduled = new Date(i.scheduledDate);
        return scheduled < now && i.status !== 'completed';
      });
    }
    if (filterDueSoon) {
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter((i: Inspection) => {
        if (!i.scheduledDate) return false;
        const scheduled = new Date(i.scheduledDate);
        return scheduled >= now && scheduled <= sevenDaysFromNow && i.status !== 'completed';
      });
    }

    return filtered;
  }, [effectiveInspections, searchTerm, filterBlockId, filterPropertyId, filterStatus, filterOverdue, filterDueSoon, properties]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Always refetch local inspections
      await refetchLocal();
    
      // If online, also refetch from server and sync
    if (isOnline) {
      try {
        setIsSyncing(true);
        const result = await syncManager.startSync();
        const count = await syncManager.getPendingCount();
        setPendingCount(count);
        
        if (result.success > 0) {
          // Refresh inspections after successful sync
            await refetchServer();
            await refetchLocal();
          } else {
            // Still refetch server data even if sync had no pending items
            await refetchServer();
        }
        } catch (syncError) {
          console.error('[InspectionsList] Sync error during refresh:', syncError);
          // Still try to refetch server data
          await refetchServer();
      } finally {
        setIsSyncing(false);
      }
    }
    } catch (error) {
      console.error('[InspectionsList] Refresh error:', error);
    } finally {
    setRefreshing(false);
    }
  };

  const handleCopyClick = (inspection: Inspection) => {
    setInspectionToCopy(inspection);
    // Pre-select the opposite type
    const newType = inspection.type === 'check_in' ? 'check_out' : 'check_in';
    setCopyType(newType);
    setCopyScheduledDate(new Date().toISOString().split('T')[0]);
    setCopyImages(true);
    setCopyText(true);
    setShowCopyModal(true);
  };

  const handleCopySubmit = () => {
    if (!inspectionToCopy) return;
    copyInspection.mutate({
      inspectionId: inspectionToCopy.id,
      type: copyType,
      scheduledDate: copyScheduledDate,
      copyImages,
      copyText,
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <LoadingSpinner />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Fixed Header */}
      <View style={[styles.fixedHeader, { 
        paddingTop: Math.max(insets.top + spacing[2], spacing[6]),
        backgroundColor: themeColors.card.DEFAULT,
      }]}>
        <View style={styles.pageHeader}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: themeColors.text.primary }]}>Inspections</Text>
            <Text style={[styles.subtitle, { color: themeColors.text.secondary }]}>Manage and conduct property inspections</Text>
          </View>
        </View>
        
        {/* Fixed Search Bar */}
        <View style={[
          styles.searchContainer,
          {
            borderColor: themeColors.border.DEFAULT,
          }
        ]}>
          <Search size={16} color={themeColors.text.secondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text.primary }]}
            placeholder="Search inspections by property, block, type, or status..."
            placeholderTextColor={themeColors.text.secondary}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
        </View>
      </View>

      {/* Scrollable Content */}
    <ScrollView
        style={styles.scrollView}
      contentContainerStyle={[
        styles.contentContainer,
        { 
          paddingBottom: Math.max(insets.bottom + 80, spacing[8]), // Tab bar height (60) + safe area + extra padding
        },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {/* Offline/Sync Status Banner */}
      {!isOnline && (
          <Card style={{
            ...styles.offlineBanner,
            backgroundColor: themeColors.warning + '15',
            borderColor: themeColors.warning + '40',
          }}>
          <View style={styles.offlineBannerContent}>
              <WifiOff size={16} color={themeColors.warning} />
            <View style={styles.offlineBannerTextContainer}>
                <Text style={[styles.offlineBannerText, { color: themeColors.warning }]}>Working Offline</Text>
                <Text style={[styles.offlineBannerDescription, { color: themeColors.text.secondary }]}>
                You can edit existing inspections (add photos, notes, conditions). Creating new inspections or completing inspections requires internet connection.
              </Text>
              {pendingCount > 0 && (
                  <Text style={[styles.offlineBannerSubtext, { color: themeColors.text.muted }]}>
                  {pendingCount} item{pendingCount !== 1 ? 's' : ''} pending sync
                </Text>
              )}
            </View>
          </View>
        </Card>
      )}

        {/* Auto-sync is handled by useOfflineSync hook - no manual sync button needed */}
        {isOnline && pendingCount > 0 && isSyncing && (
        <Card style={styles.syncBanner}>
          <View style={styles.syncBannerContent}>
              <Cloud size={16} color={themeColors.primary.DEFAULT} />
              <Text style={[styles.syncBannerText, { color: themeColors.text.primary }]}>
                Syncing {pendingCount} item{pendingCount !== 1 ? 's' : ''}...
            </Text>
          </View>
        </Card>
      )}

        {/* Filters */}
      <View style={styles.filters}>
        <Text style={[styles.filterLabel, { color: themeColors.text.primary }]}>Filter by:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterChip, 
              { 
                borderColor: themeColors.border.DEFAULT,
                backgroundColor: filterBlockId ? themeColors.primary.light : themeColors.background 
              },
              filterBlockId && { borderColor: themeColors.primary.DEFAULT }
            ]}
            onPress={() => setShowBlockFilter(true)}
          >
            <Text style={[
              styles.filterChipText, 
              { color: filterBlockId ? themeColors.primary.DEFAULT : themeColors.text.secondary }
            ]}>
              Block: {selectedBlock?.name || 'All'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterChip, 
              { 
                borderColor: themeColors.border.DEFAULT,
                backgroundColor: filterPropertyId ? themeColors.primary.light : themeColors.background 
              },
              filterPropertyId && { borderColor: themeColors.primary.DEFAULT }
            ]}
            onPress={() => setShowPropertyFilter(true)}
          >
            <Text style={[
              styles.filterChipText, 
              { color: filterPropertyId ? themeColors.primary.DEFAULT : themeColors.text.secondary }
            ]}>
              Property: {selectedProperty?.name || 'All'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.filterChip, 
              { 
                borderColor: themeColors.border.DEFAULT,
                backgroundColor: filterStatus ? themeColors.primary.light : themeColors.background 
              },
              filterStatus && { borderColor: themeColors.primary.DEFAULT }
            ]}
            onPress={() => setShowStatusFilter(true)}
          >
            <Text style={[
              styles.filterChipText, 
              { color: filterStatus ? themeColors.primary.DEFAULT : themeColors.text.secondary }
            ]}>
              Status: {selectedStatusLabel}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Block Filter Modal */}
      <Modal
        visible={showBlockFilter}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowBlockFilter(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[
            styles.modalContent, 
            { 
              backgroundColor: themeColors.background,
              paddingBottom: Math.max(insets.bottom || 0, spacing[6]) + spacing[4] 
            }
          ]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Filter by Block</Text>
              <TouchableOpacity 
                onPress={() => setShowBlockFilter(false)}
                style={[styles.modalCloseButton, { backgroundColor: themeColors.card.DEFAULT }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalClose, { color: themeColors.text.secondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
      <FlatList
              data={[{ id: '', name: 'All Blocks' }, ...blocks]}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    { 
                      backgroundColor: filterBlockId === item.id ? themeColors.primary.light : themeColors.card.DEFAULT 
                    },
                    filterBlockId === item.id && styles.modalItemSelected,
                  ]}
                  onPress={() => handleBlockFilterChange(item.id)}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      { color: filterBlockId === item.id ? themeColors.primary.DEFAULT : themeColors.text.primary }
                    ]}
                  >
                    {item.name}
                  </Text>
                  {filterBlockId === item.id && (
                    <CheckCircle2 size={20} color={themeColors.primary.DEFAULT} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Property Filter Modal */}
      <Modal
        visible={showPropertyFilter}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPropertyFilter(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[
            styles.modalContent, 
            { 
              backgroundColor: themeColors.card.DEFAULT,
              paddingBottom: Math.max(insets.bottom || 0, spacing[6]) + spacing[4] 
            }
          ]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Filter by Property</Text>
              <TouchableOpacity 
                onPress={() => setShowPropertyFilter(false)}
                style={styles.modalCloseButton}
                activeOpacity={0.7}
              >
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={[{ id: '', name: 'All Properties' }, ...filteredProperties]}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: spacing[2] }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    { 
                      backgroundColor: filterPropertyId === item.id ? themeColors.primary.light : themeColors.card.DEFAULT 
                    },
                    filterPropertyId === item.id && { borderColor: themeColors.primary.DEFAULT, borderWidth: 2 }
                  ]}
                  onPress={() => {
                    setFilterPropertyId(item.id);
                    setShowPropertyFilter(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      { color: filterPropertyId === item.id ? themeColors.primary.DEFAULT : themeColors.text.primary }
                    ]}
                  >
                    {item.name}
                  </Text>
                  {filterPropertyId === item.id && (
                    <CheckCircle2 size={20} color={themeColors.primary.DEFAULT} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Status Filter Modal */}
      <Modal
        visible={showStatusFilter}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowStatusFilter(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[
            styles.modalContent, 
            { 
              backgroundColor: themeColors.background,
              paddingBottom: Math.max(insets.bottom || 0, spacing[6]) + spacing[4] 
            }
          ]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Filter by Status</Text>
              <TouchableOpacity 
                onPress={() => setShowStatusFilter(false)}
                style={[styles.modalCloseButton, { backgroundColor: themeColors.card.DEFAULT }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalClose, { color: themeColors.text.secondary }]}>✕</Text>
              </TouchableOpacity>
          </View>
            <FlatList
              data={STATUS_OPTIONS}
              keyExtractor={(item) => item.value}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: spacing[2] }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    { 
                      backgroundColor: filterStatus === item.value ? themeColors.primary.light : themeColors.card.DEFAULT,
                      borderColor: filterStatus === item.value ? themeColors.primary.DEFAULT : themeColors.border.light,
                      borderWidth: filterStatus === item.value ? 2 : 1,
                    },
                  ]}
                  onPress={() => {
                    setFilterStatus(item.value);
                    setShowStatusFilter(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      { color: filterStatus === item.value ? themeColors.primary.DEFAULT : themeColors.text.primary }
                    ]}
                  >
                    {item.label}
                  </Text>
                  {filterStatus === item.value && (
                    <CheckCircle2 size={20} color={themeColors.primary.DEFAULT} />
                  )}
                </TouchableOpacity>
        )}
      />
    </View>
        </View>
      </Modal>

      {/* Inspections List */}
      {filteredInspections.length === 0 ? (
        <Card style={styles.emptyCard}>
          <EmptyState
            title={effectiveInspections.length === 0 ? 'No inspections yet' : 'No inspections match your filters'}
            message={
              effectiveInspections.length === 0
                ? 'Create your first inspection to get started'
                : (searchTerm || filterBlockId || filterPropertyId || filterStatus || filterOverdue || filterDueSoon)
                  ? 'Try adjusting your search or filters'
                  : 'Try adjusting your filters'
            }
          />
        </Card>
      ) : (
        <View style={styles.inspectionsGrid}>
          {filteredInspections.map((inspection: Inspection) => {
            const syncStatus = syncStatuses[inspection.id] || { status: 'synced' as const, pendingCount: 0 };
            
            return (
              <Card key={inspection.id} style={styles.inspectionCard} variant="elevated">
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={[styles.propertyName, { color: themeColors.text.primary }]}>
                      {inspection.property?.name || inspection.block?.name || 'Unknown Property'}
                    </Text>
                    <View style={styles.badgeRow}>
                      {getStatusBadge(inspection.status, themeColors)}
                      {getTenantApprovalBadge(inspection)}
                      {syncStatus.status === 'pending' && syncStatus.pendingCount > 0 && (
                        <Badge variant="warning" size="sm" style={styles.statusBadge}>
                          Pending ({syncStatus.pendingCount})
                        </Badge>
                      )}
                      {syncStatus.status === 'conflict' && (
                        <Badge variant="destructive" size="sm" style={styles.statusBadge}>
                          Conflict
                        </Badge>
                      )}
                    </View>
                  </View>
                </View>

              <View style={styles.cardContent}>
                {/* Address */}
                <View style={styles.infoRow}>
                  <MapPin size={14} color={themeColors.text.secondary} />
                  <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
                    {inspection.property?.address || inspection.block?.address || 'No location'}
                  </Text>
                </View>

                {/* Type */}
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>Type:</Text>
                  {getTypeBadge(inspection.type)}
                </View>

                {/* Date */}
                {inspection.scheduledDate && (
                  <View style={styles.infoRow}>
                    <Calendar size={14} color={themeColors.text.secondary} />
                    <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
                      {format(new Date(inspection.scheduledDate), 'MMM dd, yyyy')}
                    </Text>
                  </View>
                )}

                {/* Inspector */}
                {inspection.clerk && (
                  <View style={styles.infoRow}>
                    <User size={14} color={themeColors.text.secondary} />
                    <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>{inspection.clerk.email}</Text>
                  </View>
                )}

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  {inspection.templateSnapshotJson && inspection.status !== 'completed' && (
                    <Button
                      title={inspection.status === 'in_progress' ? 'Continue' : 'Start'}
                      onPress={() => navigation.navigate('InspectionCapture', { inspectionId: inspection.id })}
                      variant="primary"
                      size="sm"
                      style={styles.actionButton}
                      icon={<Play size={14} color={themeColors.primary.foreground} />}
                    />
                  )}
                  {inspection.templateSnapshotJson && (
                    <Button
                      title="View Report"
                      onPress={() => navigation.navigate('InspectionReport', { inspectionId: inspection.id })}
                      variant="outline"
                      size="sm"
                      style={styles.actionButton}
                      icon={<FileText size={14} color={themeColors.text.primary} />}
                    />
                  )}
                  <Button
                    title="View Details"
                    onPress={() => {
                      navigation.navigate('InspectionReview', { inspectionId: inspection.id });
                    }}
                    variant="outline"
                    size="sm"
                    style={styles.actionButton}
                  />
                  <TouchableOpacity
                    style={[styles.copyButton, { borderColor: themeColors.border.DEFAULT }]}
                    onPress={() => handleCopyClick(inspection)}
                  >
                    <CopyIcon size={16} color={themeColors.text.secondary} />
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
            );
          })}
        </View>
      )}

      {/* Copy Inspection Modal */}
      <Modal
        visible={showCopyModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCopyModal(false)}
      >
        <View style={[styles.modalOverlay, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.card.DEFAULT }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Copy Inspection</Text>
            </View>
            <Text style={[styles.modalSubtitle, { color: themeColors.text.secondary }]}>
              Create a new inspection based on {inspectionToCopy?.property?.name || inspectionToCopy?.block?.name || 'this inspection'}
            </Text>

            <View style={styles.copyForm}>
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: themeColors.text.primary }]}>Inspection Type *</Text>
                <View style={styles.typeButtons}>
                  <TouchableOpacity
                    style={[
                      styles.typeButton, 
                      { 
                        borderColor: themeColors.border.DEFAULT,
                        backgroundColor: copyType === 'check_in' ? themeColors.primary.DEFAULT : themeColors.background 
                      }
                    ]}
                    onPress={() => setCopyType('check_in')}
                  >
                    <Text style={[
                      styles.typeButtonText, 
                      { color: copyType === 'check_in' ? themeColors.primary.foreground : themeColors.text.primary }
                    ]}>
                      Check In
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeButton, 
                      { 
                        borderColor: themeColors.border.DEFAULT,
                        backgroundColor: copyType === 'check_out' ? themeColors.primary.DEFAULT : themeColors.background 
                      }
                    ]}
                    onPress={() => setCopyType('check_out')}
                  >
                    <Text style={[
                      styles.typeButtonText, 
                      { color: copyType === 'check_out' ? themeColors.primary.foreground : themeColors.text.primary }
                    ]}>
                      Check Out
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <DatePicker
                  label="Scheduled Date *"
                  value={copyScheduledDate ? new Date(copyScheduledDate) : null}
                  onChange={(date) => setCopyScheduledDate(date ? format(date, 'yyyy-MM-dd') : '')}
                  placeholder="Select date"
                  required
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: themeColors.text.primary }]}>Copy Options</Text>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setCopyImages(!copyImages)}
                >
                  <View style={[
                    styles.checkbox, 
                    { 
                      borderColor: themeColors.border.DEFAULT,
                      backgroundColor: copyImages ? themeColors.primary.DEFAULT : 'transparent' 
                    }
                  ]}>
                    {copyImages && <Text style={[styles.checkmark, { color: themeColors.primary.foreground }]}>✓</Text>}
                  </View>
                  <Text style={[styles.checkboxLabelText, { color: themeColors.text.primary }]}>Copy images from original inspection</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setCopyText(!copyText)}
                >
                  <View style={[
                    styles.checkbox, 
                    { 
                      borderColor: themeColors.border.DEFAULT,
                      backgroundColor: copyText ? themeColors.primary.DEFAULT : 'transparent' 
                    }
                  ]}>
                    {copyText && <Text style={[styles.checkmark, { color: themeColors.primary.foreground }]}>✓</Text>}
                  </View>
                  <Text style={[styles.checkboxLabelText, { color: themeColors.text.primary }]}>Copy notes and conditions from original inspection</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                onPress={() => setShowCopyModal(false)}
                variant="outline"
                style={styles.modalButton}
              />
              <Button
                title={copyInspection.isPending ? 'Copying...' : 'Copy Inspection'}
                onPress={handleCopySubmit}
                disabled={copyInspection.isPending}
                variant="default"
                style={styles.modalButton}
                loading={copyInspection.isPending}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fixedHeader: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    zIndex: 10,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing[4],
    paddingTop: spacing[3],
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
  },
  headerText: {
    flex: 1,
    marginRight: spacing[2],
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing[1],
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
  },
  filters: {
    marginBottom: spacing[4],
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    minHeight: 44,
  },
  searchIcon: {
    marginRight: spacing[2],
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSize.base,
  },
  filterLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
  },
  filterRow: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: spacing[2],
  },
  filterChipActive: {
    // Colors set dynamically
  },
  filterChipText: {
    fontSize: typography.fontSize.sm,
  },
  filterChipTextActive: {
    fontWeight: typography.fontWeight.medium,
  },
  inspectionsGrid: {
    gap: spacing[4],
  },
  inspectionCard: {
    marginBottom: spacing[2],
  },
  emptyCard: {
    padding: spacing[6],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[2],
  },
  cardHeaderLeft: {
    flex: 1,
  },
  propertyName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing[2],
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing[1],
    flexWrap: 'wrap',
  },
  statusBadge: {
    marginRight: spacing[1],
  },
  tenantBadge: {
    marginRight: spacing[1],
  },
  cardContent: {
    gap: spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[1],
  },
  infoLabel: {
    fontSize: typography.fontSize.sm,
    marginRight: spacing[1],
  },
  infoText: {
    fontSize: typography.fontSize.sm,
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[3],
    alignItems: 'center',
  },
  actionButton: {
    flex: 1,
    minWidth: moderateScale(100, 0.3),
  },
  textButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  textButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  copyButton: {
    padding: moderateScale(spacing[2], 0.3),
    borderRadius: moderateScale(borderRadius.md, 0.2),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: moderateScale(44, 0.2),
    minHeight: moderateScale(44, 0.2),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl || 24,
    borderTopRightRadius: borderRadius.xl || 24,
    maxHeight: '85%',
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
    paddingBottom: spacing[4],
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: typography.fontSize.xl || 20,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.3,
  },
  modalCloseButton: {
    borderRadius: borderRadius.full,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    fontSize: typography.fontSize.xl || 20,
    fontWeight: typography.fontWeight.bold,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    marginVertical: spacing[1],
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  modalItemSelected: {
    borderWidth: 2,
  },
  modalItemText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  modalItemTextSelected: {
    fontWeight: typography.fontWeight.semibold,
  },
  modalSubtitle: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing[4],
  },
  copyForm: {
    gap: spacing[4],
  },
  formGroup: {
    marginBottom: spacing[4],
  },
  formLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
  },
  typeButtons: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  typeButton: {
    flex: 1,
    paddingVertical: moderateScale(spacing[3], 0.3),
    paddingHorizontal: moderateScale(spacing[4], 0.3),
    borderRadius: moderateScale(borderRadius.md, 0.2),
    borderWidth: 1,
    alignItems: 'center',
    minHeight: moderateScale(44, 0.2),
  },
  typeButtonActive: {
    // Colors set dynamically
  },
  typeButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  typeButtonTextActive: {
    // Color set dynamically
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    marginRight: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    // Colors set dynamically
  },
  checkmark: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  checkboxLabelText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  modalButton: {
    flex: 1,
  },
  offlineBanner: {
    marginBottom: spacing[3],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
  },
  offlineBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    flexWrap: 'wrap',
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
    marginBottom: spacing[3],
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
  },
  syncBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  syncBannerText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    flex: 1,
  },
  syncButton: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.md,
  },
  syncButtonText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
});
