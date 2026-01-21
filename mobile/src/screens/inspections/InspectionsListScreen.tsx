import React, { useState, useMemo } from 'react';
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
  Plus,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
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
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';

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

const getStatusBadge = (status: string) => {
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
          style={{ ...styles.statusBadge, borderColor: '#3b82f6', borderWidth: 1 }}
        >
          <Text style={{ color: '#3b82f6', fontSize: 10 }}>Scheduled</Text>
        </Badge>
      );
    case 'draft':
      return (
        <Badge variant="outline" size="sm" style={styles.statusBadge}>
          <Text style={{ color: colors.text.secondary, fontSize: 10 }}>Draft</Text>
        </Badge>
      );
    default:
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
  const [refreshing, setRefreshing] = useState(false);
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

  const { data: inspections = [], isLoading } = useQuery({
    queryKey: ['/api/inspections/my'],
    queryFn: () => inspectionsService.getMyInspections(),
  });

  const { data: blocks = [] } = useQuery({
    queryKey: ['/api/blocks'],
    queryFn: () => apiRequestJson<any[]>('GET', '/api/blocks'),
  });

  const { data: properties = [] } = useQuery({
    queryKey: ['/api/properties'],
    queryFn: () => apiRequestJson<any[]>('GET', '/api/properties'),
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
    let filtered = [...inspections];

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
  }, [inspections, filterBlockId, filterPropertyId, filterStatus, filterOverdue, filterDueSoon, properties]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ['/api/inspections/my'] });
    setRefreshing(false);
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
      <View style={styles.container}>
        <LoadingSpinner />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        { 
          paddingTop: Math.max(insets.top + spacing[4], spacing[8]),
          paddingBottom: Math.max(insets.bottom + 80, spacing[8]), // Tab bar height (60) + safe area + extra padding
        },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {/* Page Header */}
      <View style={styles.pageHeader}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Inspections</Text>
          <Text style={styles.subtitle}>Manage and conduct property inspections</Text>
        </View>
        <Button
          title="New Inspection"
          onPress={() => {
            navigation.navigate('CreateInspection');
          }}
          variant="primary"
          size="sm"
          icon={<Plus size={16} color="#ffffff" />}
        />
      </View>

      {/* Filters - Simplified for mobile */}
      <View style={styles.filters}>
        <Text style={styles.filterLabel}>Filter by:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filterBlockId && styles.filterChipActive]}
            onPress={() => setShowBlockFilter(true)}
          >
            <Text style={[styles.filterChipText, filterBlockId && styles.filterChipTextActive]}>
              Block: {selectedBlock?.name || 'All'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterPropertyId && styles.filterChipActive]}
            onPress={() => setShowPropertyFilter(true)}
          >
            <Text style={[styles.filterChipText, filterPropertyId && styles.filterChipTextActive]}>
              Property: {selectedProperty?.name || 'All'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterStatus && styles.filterChipActive]}
            onPress={() => setShowStatusFilter(true)}
          >
            <Text style={[styles.filterChipText, filterStatus && styles.filterChipTextActive]}>
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
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom || 0, spacing[6]) + spacing[4] }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Block</Text>
              <TouchableOpacity 
                onPress={() => setShowBlockFilter(false)}
                style={styles.modalCloseButton}
                activeOpacity={0.7}
              >
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
      <FlatList
              data={[{ id: '', name: 'All Blocks' }, ...blocks]}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    filterBlockId === item.id && styles.modalItemSelected,
                  ]}
                  onPress={() => handleBlockFilterChange(item.id)}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      filterBlockId === item.id && styles.modalItemTextSelected,
                    ]}
                  >
                    {item.name}
                  </Text>
                  {filterBlockId === item.id && (
                    <CheckCircle2 size={20} color={colors.primary.DEFAULT} />
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
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom || 0, spacing[6]) + spacing[4] }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Property</Text>
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
                    filterPropertyId === item.id && styles.modalItemSelected,
                  ]}
                  onPress={() => {
                    setFilterPropertyId(item.id);
                    setShowPropertyFilter(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      filterPropertyId === item.id && styles.modalItemTextSelected,
                    ]}
                  >
                    {item.name}
                  </Text>
                  {filterPropertyId === item.id && (
                    <CheckCircle2 size={20} color={colors.primary.DEFAULT} />
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
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom || 0, spacing[6]) + spacing[4] }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Status</Text>
              <TouchableOpacity 
                onPress={() => setShowStatusFilter(false)}
                style={styles.modalCloseButton}
                activeOpacity={0.7}
              >
                <Text style={styles.modalClose}>✕</Text>
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
                    filterStatus === item.value && styles.modalItemSelected,
                  ]}
                  onPress={() => {
                    setFilterStatus(item.value);
                    setShowStatusFilter(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      filterStatus === item.value && styles.modalItemTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {filterStatus === item.value && (
                    <CheckCircle2 size={20} color={colors.primary.DEFAULT} />
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
            title={inspections.length === 0 ? 'No inspections yet' : 'No inspections match your filters'}
            message={
              inspections.length === 0
                ? 'Create your first inspection to get started'
                : 'Try adjusting your filters or create a new inspection'
            }
          />
        </Card>
      ) : (
        <View style={styles.inspectionsGrid}>
          {filteredInspections.map((inspection: Inspection) => (
            <Card key={inspection.id} style={styles.inspectionCard} variant="elevated">
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.propertyName}>
                    {inspection.property?.name || inspection.block?.name || 'Unknown Property'}
                  </Text>
                  <View style={styles.badgeRow}>
                    {getStatusBadge(inspection.status)}
                    {getTenantApprovalBadge(inspection)}
                  </View>
                </View>
              </View>

              <View style={styles.cardContent}>
                {/* Address */}
                <View style={styles.infoRow}>
                  <MapPin size={14} color={colors.text.secondary} />
                  <Text style={styles.infoText}>
                    {inspection.property?.address || inspection.block?.address || 'No location'}
                  </Text>
                </View>

                {/* Type */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Type:</Text>
                  {getTypeBadge(inspection.type)}
                </View>

                {/* Date */}
                {inspection.scheduledDate && (
                  <View style={styles.infoRow}>
                    <Calendar size={14} color={colors.text.secondary} />
                    <Text style={styles.infoText}>
                      {format(new Date(inspection.scheduledDate), 'MMM dd, yyyy')}
                    </Text>
                  </View>
                )}

                {/* Inspector */}
                {inspection.clerk && (
                  <View style={styles.infoRow}>
                    <User size={14} color={colors.text.secondary} />
                    <Text style={styles.infoText}>{inspection.clerk.email}</Text>
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
                      icon={<Play size={14} color="#ffffff" />}
                    />
                  )}
                  {inspection.templateSnapshotJson && (
                    <Button
                      title="View Report"
                      onPress={() => navigation.navigate('InspectionReport', { inspectionId: inspection.id })}
                      variant="outline"
                      size="sm"
                      style={styles.actionButton}
                      icon={<FileText size={14} color={colors.text.primary} />}
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
                    style={styles.copyButton}
                    onPress={() => handleCopyClick(inspection)}
                  >
                    <CopyIcon size={16} color={colors.text.secondary} />
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          ))}
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
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Copy Inspection</Text>
            <Text style={styles.modalSubtitle}>
              Create a new inspection based on {inspectionToCopy?.property?.name || inspectionToCopy?.block?.name || 'this inspection'}
            </Text>

            <View style={styles.copyForm}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Inspection Type *</Text>
                <View style={styles.typeButtons}>
                  <TouchableOpacity
                    style={[styles.typeButton, copyType === 'check_in' && styles.typeButtonActive]}
                    onPress={() => setCopyType('check_in')}
                  >
                    <Text style={[styles.typeButtonText, copyType === 'check_in' && styles.typeButtonTextActive]}>
                      Check In
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeButton, copyType === 'check_out' && styles.typeButtonActive]}
                    onPress={() => setCopyType('check_out')}
                  >
                    <Text style={[styles.typeButtonText, copyType === 'check_out' && styles.typeButtonTextActive]}>
                      Check Out
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Scheduled Date *</Text>
                <Input
                  value={copyScheduledDate}
                  onChangeText={setCopyScheduledDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Copy Options</Text>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setCopyImages(!copyImages)}
                >
                  <View style={[styles.checkbox, copyImages && styles.checkboxChecked]}>
                    {copyImages && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabelText}>Copy images from original inspection</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setCopyText(!copyText)}
                >
                  <View style={[styles.checkbox, copyText && styles.checkboxChecked]}>
                    {copyText && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabelText}>Copy notes and conditions from original inspection</Text>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: spacing[4],
    paddingBottom: spacing[8],
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[4],
  },
  headerText: {
    flex: 1,
    marginRight: spacing[2],
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing[1],
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  filters: {
    marginBottom: spacing[4],
  },
  filterLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
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
    borderColor: colors.border.DEFAULT,
    backgroundColor: colors.background,
    marginRight: spacing[2],
  },
  filterChipActive: {
    backgroundColor: colors.primary.light,
    borderColor: colors.primary.DEFAULT,
  },
  filterChipText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  filterChipTextActive: {
    color: colors.primary.DEFAULT,
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
    color: colors.text.primary,
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
    color: colors.text.secondary,
    marginRight: spacing[1],
  },
  infoText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
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
    minWidth: 100,
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
    color: colors.primary.DEFAULT,
    fontWeight: typography.fontWeight.medium,
  },
  copyButton: {
    padding: spacing[2],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
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
    borderBottomColor: colors.border.light,
  },
  modalTitle: {
    fontSize: typography.fontSize.xl || 20,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  modalCloseButton: {
    borderRadius: borderRadius.full,
    backgroundColor: colors.card?.DEFAULT || '#f5f5f5',
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    fontSize: typography.fontSize.xl || 20,
    color: colors.text.secondary,
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
    backgroundColor: colors.card?.DEFAULT || colors.background,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  modalItemSelected: {
    backgroundColor: colors.primary.light,
    borderColor: colors.primary.DEFAULT,
    borderWidth: 2,
  },
  modalItemText: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.medium,
  },
  modalItemTextSelected: {
    color: colors.primary.DEFAULT,
    fontWeight: typography.fontWeight.semibold,
  },
  modalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  modalSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
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
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  typeButtons: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  typeButton: {
    flex: 1,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: colors.primary.DEFAULT,
    borderColor: colors.primary.DEFAULT,
  },
  typeButtonText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium,
  },
  typeButtonTextActive: {
    color: colors.primary.foreground || '#ffffff',
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
    borderColor: colors.border.DEFAULT,
    marginRight: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary.DEFAULT,
    borderColor: colors.primary.DEFAULT,
  },
  checkmark: {
    color: colors.primary.foreground || '#ffffff',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  checkboxLabelText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  modalButton: {
    flex: 1,
  },
});
