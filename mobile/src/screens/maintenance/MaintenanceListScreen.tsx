import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  ScrollView,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Wrench,
  Plus,
  X,
  Pencil,
  Clipboard,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  MapPin,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { maintenanceService, type MaintenanceRequestWithDetails, type WorkOrder } from '../../services/maintenance';
import { propertiesService } from '../../services/properties';
import { authService } from '../../services/auth';
import type { MaintenanceStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import ScreenHeader from '../../components/ScreenHeader';
import FilterBar from '../../components/FilterBar';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import DatePicker from '../../components/ui/DatePicker';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { moderateScale, getFontSize } from '../../utils/responsive';
import { useResponsive } from '../../hooks/useResponsive';
import { format, formatDistanceToNow } from 'date-fns';
import { getTeamRoleDisplayLabel } from '../../constants/roleLabels';
import { WorkOrderCertificateSheet } from '../../components/WorkOrderCertificateSheet';

type NavigationProp = StackNavigationProp<MaintenanceStackParamList, 'MaintenanceList'>;

const STATUS_META: Record<string, { label: string; color: string; softBg: string }> = {
  open: { label: 'Open', color: '#CA8A04', softBg: '#FEF9C3' },
  in_progress: { label: 'In Progress', color: '#2563EB', softBg: '#DBEAFE' },
  completed: { label: 'Completed', color: '#16A34A', softBg: '#DCFCE7' },
  closed: { label: 'Closed', color: '#6B7280', softBg: '#F3F4F6' },
};

const PRIORITY_META: Record<string, { label: string; color: string; softBg: string }> = {
  low: { label: 'Low', color: '#4B5563', softBg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#2563EB', softBg: '#DBEAFE' },
  high: { label: 'High', color: '#EA580C', softBg: '#FFEDD5' },
  urgent: { label: 'Urgent', color: '#DC2626', softBg: '#FEE2E2' },
};

const statusColors: Record<string, string> = {
  open: STATUS_META.open.color,
  in_progress: STATUS_META.in_progress.color,
  completed: STATUS_META.completed.color,
  closed: STATUS_META.closed.color,
};

const priorityColors: Record<string, string> = {
  low: PRIORITY_META.low.color,
  medium: PRIORITY_META.medium.color,
  high: PRIORITY_META.high.color,
  urgent: PRIORITY_META.urgent.color,
};

const workOrderStatusColors: Record<string, string> = {
  assigned: '#007AFF',
  in_progress: '#fbbf24',
  waiting_parts: '#fbbf24',
  completed: '#34C759',
  rejected: '#FF3B30',
};

function isRequestOverdue(dueDate?: string | null, status?: string): boolean {
  if (!dueDate || status === 'completed' || status === 'closed') return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

export default function MaintenanceListScreen() {
  const theme = useTheme();
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  const isDark = !!theme?.isDark;
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const { stackDirection, modalMaxHeight } = useResponsive();
  const headerDir = stackDirection(375);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProperty, setFilterProperty] = useState<string>('all');
  const [filterBlock, setFilterBlock] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [showBlockFilter, setShowBlockFilter] = useState(false);
  const [showPropertyFilter, setShowPropertyFilter] = useState(false);
  const [showPriorityFilter, setShowPriorityFilter] = useState(false);
  const [showWorkOrderModal, setShowWorkOrderModal] = useState(false);
  const [selectedRequestForWorkOrder, setSelectedRequestForWorkOrder] = useState<MaintenanceRequestWithDetails | null>(null);
  const [workOrderTeamId, setWorkOrderTeamId] = useState<string>('');
  const [workOrderAssignedToId, setWorkOrderAssignedToId] = useState<string>('');
  const [workOrderSlaDue, setWorkOrderSlaDue] = useState<Date | null>(null);
  const [workOrderCostEstimate, setWorkOrderCostEstimate] = useState<string>('');
  const [certificateWorkOrder, setCertificateWorkOrder] = useState<WorkOrder | null>(null);

  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/maintenance'],
    queryFn: () => maintenanceService.getMaintenanceRequests(),
  });

  const { data: properties = [] } = useQuery({
    queryKey: ['/api/properties'],
    queryFn: () => propertiesService.getProperties(),
  });

  const { data: blocks = [] } = useQuery({
    queryKey: ['/api/blocks'],
    queryFn: () => propertiesService.getBlocks(),
  });

  const { data: clerks = [] } = useQuery({
    queryKey: ['/api/users/clerks'],
    queryFn: async () => {
      // Since we don't have a specific clerks endpoint, we'll fetch all users
      // This is a placeholder - adjust based on your actual API
      return [];
    },
    enabled: user?.role === 'owner' || user?.role === 'clerk' || user?.role === 'contractor',
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['/api/teams'],
    queryFn: () => maintenanceService.getTeams(),
    enabled: user?.role === 'owner',
  });

  const { data: teamMembers = [], isFetching: isLoadingMembers } = useQuery({
    queryKey: ['/api/teams', workOrderTeamId, 'members'],
    queryFn: () => maintenanceService.getTeamMembers(workOrderTeamId),
    enabled: user?.role === 'owner' && !!workOrderTeamId,
  });

  const resetWorkOrderForm = () => {
    setWorkOrderTeamId('');
    setWorkOrderAssignedToId('');
    setWorkOrderSlaDue(null);
    setWorkOrderCostEstimate('');
    setSelectedRequestForWorkOrder(null);
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, assignedTo }: { id: string; status: string; assignedTo?: string }) => {
      return maintenanceService.updateMaintenanceStatus(id, status, assignedTo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance'] });
      Alert.alert('Success', 'Maintenance request updated successfully');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to update maintenance request');
    },
  });

  const createWorkOrderMutation = useMutation({
    mutationFn: async (data: Parameters<typeof maintenanceService.createWorkOrder>[0]) => {
      return maintenanceService.createWorkOrder(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance'] });
      setShowWorkOrderModal(false);
      resetWorkOrderForm();
      Alert.alert('Success', 'Work order created successfully');
    },
    onError: (error: any) => {
      Alert.alert('Error', error?.message || 'Failed to create work order');
    },
  });

  const updateWorkOrderStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return maintenanceService.updateWorkOrderStatus(id, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders'] });
      Alert.alert('Success', 'Work order status updated successfully');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to update work order status');
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Filter requests
  const filteredRequests = useMemo(() => {
    let filtered = requests;

    // Search filter - search by title, description, property name, block name, status
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(r => {
        const title = r.title?.toLowerCase() || '';
        const description = r.description?.toLowerCase() || '';
        const propertyName = r.property?.name?.toLowerCase() || r.property?.address?.toLowerCase() || '';
        const blockName = r.block?.name?.toLowerCase() || '';
        const status = r.status?.toLowerCase() || '';
        const priority = r.priority?.toLowerCase() || '';

        return title.includes(searchLower) ||
          description.includes(searchLower) ||
          propertyName.includes(searchLower) ||
          blockName.includes(searchLower) ||
          status.includes(searchLower) ||
          priority.includes(searchLower);
      });
    }

    // Filter by property
    if (filterProperty !== 'all') {
      filtered = filtered.filter(r => r.propertyId === filterProperty);
    }

    // Filter by block (find properties in block first)
    if (filterBlock !== 'all') {
      const blockPropertyIds = properties.filter(p => p.blockId === filterBlock).map(p => p.id);
      filtered = filtered.filter(r => r.propertyId && blockPropertyIds.includes(r.propertyId));
    }

    // Filter by priority
    if (filterPriority !== 'all') {
      filtered = filtered.filter(r => r.priority === filterPriority);
    }

    // Tenants should only see their own requests
    if (user?.role === 'tenant') {
      filtered = filtered.filter(r => r.reportedBy === user.id);
    }

    return filtered;
  }, [requests, searchTerm, filterProperty, filterBlock, filterPriority, properties, user]);

  const handleEdit = (request: MaintenanceRequestWithDetails) => {
    navigation.navigate('CreateMaintenance', { requestId: request.id });
  };

  const handleCreateWorkOrder = (request: MaintenanceRequestWithDetails) => {
    resetWorkOrderForm();
    setSelectedRequestForWorkOrder(request);
    setShowWorkOrderModal(true);
  };

  const handleSubmitWorkOrder = () => {
    if (!selectedRequestForWorkOrder) return;

    if (!workOrderTeamId) {
      Alert.alert('Select a maintenance team', 'Work orders can only be assigned to people on a Maintenance Team.');
      return;
    }

    if (!workOrderAssignedToId) {
      Alert.alert('Select a team member', 'Choose an inspector or maintenance contractor from the selected team.');
      return;
    }

    const member = teamMembers.find(
      (m) => m.userId === workOrderAssignedToId || m.contactId === workOrderAssignedToId,
    );
    const contractorId = member?.contactId || undefined;
    const resolvedAssignedToId =
      member?.userId || member?.contact?.linkedUserId || workOrderAssignedToId;
    const costParsed = workOrderCostEstimate.trim() ? parseFloat(workOrderCostEstimate) : NaN;

    createWorkOrderMutation.mutate({
      maintenanceRequestId: selectedRequestForWorkOrder.id,
      teamId: workOrderTeamId,
      contractorId,
      assignedToId: resolvedAssignedToId,
      slaDue: workOrderSlaDue
        ? new Date(
            workOrderSlaDue.getFullYear(),
            workOrderSlaDue.getMonth(),
            workOrderSlaDue.getDate(),
            12,
            0,
            0,
          ).toISOString()
        : undefined,
      costEstimate: Number.isFinite(costParsed) ? Math.round(costParsed * 100) : undefined,
      status: 'assigned',
    });
  };

  const getWorkOrderStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={16} color={workOrderStatusColors.completed} />;
      case 'in_progress':
      case 'waiting_parts':
        return <Clock size={16} color={workOrderStatusColors.in_progress} />;
      case 'rejected':
        return <AlertCircle size={16} color={workOrderStatusColors.rejected} />;
      default:
        return <User size={16} color={workOrderStatusColors.assigned} />;
    }
  };

  const formatCurrency = (amount?: number | null) => {
    if (!amount) return 'N/A';
    return `£${(amount / 100).toFixed(2)}`;
  };

  const renderMaintenanceItem = ({ item }: { item: MaintenanceRequestWithDetails }) => {
    const status = STATUS_META[item.status] || STATUS_META.open;
    const priority = PRIORITY_META[item.priority] || PRIORITY_META.medium;
    const softStatusBg = isDark ? status.color + '33' : status.softBg;
    const softPriorityBg = isDark ? priority.color + '33' : priority.softBg;
    const overdue = isRequestOverdue(item.dueDate, item.status);
    const accentColor = overdue ? '#DC2626' : status.color;
    const location = [
      item.property?.name || item.block?.name,
      item.property?.address,
    ]
      .filter(Boolean)
      .join(' · ');
    const reporter = item.reportedByUser
      ? `${item.reportedByUser.firstName} ${item.reportedByUser.lastName}${
          item.reportedByUser.role ? ` (${getTeamRoleDisplayLabel(item.reportedByUser.role)})` : ''
        }`
      : 'Unknown';
    const canEdit =
      user?.role === 'owner' || user?.role === 'clerk' || user?.role === 'contractor';
    const showOwnerActions = user?.role === 'owner' && item.status !== 'completed';

    return (
      <Card
        style={[
          styles.requestCard,
          Platform.select({
            ios: shadows.sm,
            android: { elevation: 2 },
          }),
        ]}
        variant="elevated"
        padding="none"
      >
        <View style={styles.cardInner}>
          <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <View style={styles.refRow}>
                <View
                  style={[
                    styles.iconBubble,
                    { backgroundColor: isDark ? themeColors.primary.light : '#E0F7FA' },
                  ]}
                >
                  <Wrench size={moderateScale(14)} color={themeColors.primary.DEFAULT} />
                </View>
                <View style={[styles.chip, { backgroundColor: softPriorityBg }]}>
                  <Text style={[styles.chipText, { color: priority.color }]}>
                    {priority.label} priority
                  </Text>
                </View>
              </View>

              <View style={styles.cardTopRight}>
                <View style={[styles.chip, { backgroundColor: softStatusBg }]}>
                  <View style={[styles.chipDot, { backgroundColor: status.color }]} />
                  <Text style={[styles.chipText, { color: status.color }]}>{status.label}</Text>
                </View>
                {canEdit ? (
                  <TouchableOpacity
                    onPress={() => handleEdit(item)}
                    style={[
                      styles.editButton,
                      {
                        borderColor: themeColors.border.DEFAULT,
                        backgroundColor: themeColors.background,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Edit request"
                    hitSlop={8}
                  >
                    <Pencil size={moderateScale(14)} color={themeColors.text.secondary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <Text style={[styles.requestTitle, { color: themeColors.text.primary }]} numberOfLines={2}>
              {item.title}
            </Text>

            {!!item.description && (
              <Text
                style={[styles.description, { color: themeColors.text.secondary }]}
                numberOfLines={2}
              >
                {item.description}
              </Text>
            )}

            <View style={styles.metaBlock}>
              {!!location && (
                <View style={styles.metaRow}>
                  <MapPin size={moderateScale(14)} color={themeColors.text.secondary} />
                  <Text
                    style={[styles.metaLine, { color: themeColors.text.secondary }]}
                    numberOfLines={1}
                  >
                    {location}
                  </Text>
                </View>
              )}
              <View style={styles.metaRow}>
                {overdue ? (
                  <AlertTriangle size={moderateScale(14)} color="#DC2626" />
                ) : (
                  <Calendar size={moderateScale(14)} color={themeColors.text.secondary} />
                )}
                <Text
                  style={[
                    styles.metaLine,
                    { color: overdue ? '#DC2626' : themeColors.text.secondary },
                    overdue && styles.metaStrong,
                  ]}
                  numberOfLines={1}
                >
                  {item.dueDate
                    ? overdue
                      ? `Overdue · ${format(new Date(item.dueDate), 'MMM d, yyyy')}`
                      : `Due ${format(new Date(item.dueDate), 'MMM d, yyyy')}`
                    : `Created ${format(new Date(item.createdAt), 'MMM d, yyyy')}`}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <User size={moderateScale(14)} color={themeColors.text.secondary} />
                <Text
                  style={[styles.metaLine, { color: themeColors.text.secondary }]}
                  numberOfLines={1}
                >
                  Reported by {reporter}
                  {item.assignedToUser
                    ? ` · Assigned to ${item.assignedToUser.firstName} ${item.assignedToUser.lastName}`
                    : ''}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.cardFooter,
                { borderTopColor: themeColors.border?.light || themeColors.border.DEFAULT },
              ]}
            >
              {showOwnerActions ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[
                      styles.statusSelect,
                      {
                        borderColor: status.color,
                        backgroundColor: softStatusBg,
                      },
                    ]}
                    onPress={() => {
                      Alert.alert('Update Status', 'Select new status', [
                        {
                          text: 'Open',
                          onPress: () => updateStatusMutation.mutate({ id: item.id, status: 'open' }),
                        },
                        {
                          text: 'In Progress',
                          onPress: () =>
                            updateStatusMutation.mutate({ id: item.id, status: 'in_progress' }),
                        },
                        {
                          text: 'Completed',
                          onPress: () =>
                            updateStatusMutation.mutate({ id: item.id, status: 'completed' }),
                        },
                        {
                          text: 'Closed',
                          onPress: () =>
                            updateStatusMutation.mutate({ id: item.id, status: 'closed' }),
                        },
                        { text: 'Cancel', style: 'cancel' },
                      ]);
                    }}
                  >
                    <Text style={[styles.statusSelectText, { color: status.color }]}>
                      {status.label}
                    </Text>
                    <ChevronRight size={14} color={status.color} />
                  </TouchableOpacity>

                  {!item.assignedTo && clerks.length > 0 && (
                    <TouchableOpacity
                      style={[
                        styles.assignButton,
                        {
                          borderColor: themeColors.border.DEFAULT,
                          backgroundColor: themeColors.background,
                        },
                      ]}
                      onPress={() => {
                        Alert.alert('Assign to Clerk', 'Select a clerk', [
                          ...clerks.map((clerk: any) => ({
                            text: `${clerk.firstName} ${clerk.lastName}`,
                            onPress: () =>
                              updateStatusMutation.mutate({
                                id: item.id,
                                status: 'in_progress',
                                assignedTo: clerk.id,
                              }),
                          })),
                          { text: 'Cancel', style: 'cancel' },
                        ]);
                      }}
                    >
                      <Text
                        style={[styles.assignButtonText, { color: themeColors.text.primary }]}
                      >
                        Assign
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.workOrderButton,
                      {
                        backgroundColor: themeColors.primary.DEFAULT,
                        borderColor: themeColors.primary.DEFAULT,
                      },
                    ]}
                    onPress={() => handleCreateWorkOrder(item)}
                    accessibilityRole="button"
                    accessibilityLabel="Create work order"
                  >
                    <Clipboard size={14} color="#fff" />
                    <Text style={[styles.workOrderButtonText, { color: '#fff' }]}>
                      Create Work Order
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.openCta}>
                  <Text style={[styles.openLabel, { color: themeColors.primary.DEFAULT }]}>
                    {canEdit ? 'Manage' : 'Details'}
                  </Text>
                  <View
                    style={[
                      styles.openArrow,
                      {
                        backgroundColor:
                          themeColors.primary.DEFAULT + (isDark ? '33' : '14'),
                      },
                    ]}
                  >
                    <ChevronRight
                      size={moderateScale(16)}
                      color={themeColors.primary.DEFAULT}
                    />
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
      </Card>
    );
  };

  const renderWorkOrderItem = ({ item }: { item: WorkOrder }) => {
    const statusColor = workOrderStatusColors[item.status] || workOrderStatusColors.assigned;

    return (
      <Card style={styles.workOrderCard}>
        <View style={styles.workOrderHeader}>
          <View style={styles.workOrderTitleRow}>
            {getWorkOrderStatusIcon(item.status)}
            <Text style={[styles.workOrderTitle, { color: themeColors.text.primary }]} numberOfLines={2}>
              {item.maintenanceRequest.title}
            </Text>
            <View style={[styles.workOrderStatusBadge, { backgroundColor: statusColor }]}>
              <Text style={[styles.workOrderStatusText, { color: '#fff' }]}>
                {item.status.replace('_', ' ')}
              </Text>
            </View>
          </View>
          <View style={[styles.priorityBadge, { backgroundColor: priorityColors[item.maintenanceRequest.priority] }]}>
            <Text style={styles.priorityBadgeText}>{item.maintenanceRequest.priority}</Text>
          </View>
        </View>

        {item.maintenanceRequest.description && (
          <Text style={styles.description} numberOfLines={3}>
            {item.maintenanceRequest.description}
          </Text>
        )}

        <View style={styles.workOrderMeta}>
          {item.team && (
            <View style={styles.metaItem}>
              <User size={14} color={themeColors.text.secondary} />
              <Text style={[styles.metaText, { color: themeColors.text.secondary }]}>Team: {item.team.name}</Text>
            </View>
          )}

          {item.contractor && (
            <View style={styles.metaItem}>
              <User size={14} color={themeColors.text.secondary} />
              <Text style={styles.metaText}>
                {item.contractor.firstName} {item.contractor.lastName}
              </Text>
            </View>
          )}

          {item.slaDue && (
            <View style={styles.metaItem}>
              <Calendar size={14} color={themeColors.text.secondary} />
              <Text style={styles.metaText}>
                SLA: {formatDistanceToNow(new Date(item.slaDue), { addSuffix: true })}
              </Text>
            </View>
          )}

          {(item.costEstimate || item.costActual) && (
            <View style={styles.metaItem}>
              <Text style={[styles.metaText, { color: themeColors.text.secondary }]}>
                {item.costActual
                  ? `Actual: ${formatCurrency(item.costActual)}`
                  : `Est: ${formatCurrency(item.costEstimate)}`}
              </Text>
            </View>
          )}

          <View style={styles.metaItem}>
            <Clock size={14} color={themeColors.text.secondary} />
            <Text style={[styles.metaText, { color: themeColors.text.secondary }]}>
              Created {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </Text>
          </View>
        </View>

        {user?.role === 'contractor' && item.status !== 'completed' && item.status !== 'rejected' && (
          <TouchableOpacity
            style={[styles.statusSelect, { borderColor: statusColor, marginTop: 12 }]}
            onPress={() => {
              Alert.alert(
                'Update Status',
                'Select new status',
                [
                  { text: 'Assigned', onPress: () => updateWorkOrderStatusMutation.mutate({ id: item.id, status: 'assigned' }) },
                  { text: 'In Progress', onPress: () => updateWorkOrderStatusMutation.mutate({ id: item.id, status: 'in_progress' }) },
                  { text: 'Waiting Parts', onPress: () => updateWorkOrderStatusMutation.mutate({ id: item.id, status: 'waiting_parts' }) },
                  { text: 'Completed', onPress: () => updateWorkOrderStatusMutation.mutate({ id: item.id, status: 'completed' }) },
                  { text: 'Cancel', style: 'cancel' },
                ]
              );
            }}
          >
            <Text style={[styles.statusSelectText, { color: statusColor }]}>
              Update Status
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.statusSelect, { borderColor: themeColors.primary.DEFAULT, marginTop: 12 }]}
          onPress={() => setCertificateWorkOrder(item)}
        >
          <Text style={[styles.statusSelectText, { color: themeColors.primary.DEFAULT }]}>
            Upload Certificate
          </Text>
        </TouchableOpacity>
      </Card>
    );
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Fixed Header */}
      <View style={[styles.fixedHeader, { backgroundColor: themeColors.card.DEFAULT }]}>
        <ScreenHeader
          title="Maintenance"
          subtitle="Track and manage maintenance requests"
          includeSafeArea
          style={{ borderBottomWidth: 0, paddingBottom: spacing[2] }}
          rightSlot={
            <Button
              title="New Request"
              onPress={() => navigation.navigate('CreateMaintenance')}
              variant="primary"
              size="sm"
            />
          }
        />

        {/* Fixed Search Bar */}
        {user?.role !== 'tenant' && (
          <View
            style={[
              styles.searchContainer,
              {
                borderColor: themeColors.border.light || themeColors.border.DEFAULT,
                backgroundColor: isDark ? themeColors.background : '#F8FAFC',
              },
            ]}
          >
            <Search size={16} color={themeColors.text.secondary} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: themeColors.text.primary }]}
              placeholder="Search requests..."
              placeholderTextColor={themeColors.text.secondary}
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
            {!!searchTerm && (
              <TouchableOpacity
                onPress={() => setSearchTerm('')}
                hitSlop={10}
                accessibilityLabel="Clear search"
              >
                <X size={16} color={themeColors.text.secondary} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Scrollable Content */}
      {user?.role !== 'tenant' && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: Math.max(insets.bottom + 80, 32) }
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Filters */}
          <FilterBar
            style={{ marginBottom: spacing[4] }}
            chips={[
              {
                label: 'Block',
                value:
                  filterBlock !== 'all'
                    ? blocks.find((b) => b.id === filterBlock)?.name || 'All'
                    : 'All',
                active: filterBlock !== 'all',
                onPress: () => setShowBlockFilter(true),
              },
              {
                label: 'Property',
                value:
                  filterProperty !== 'all'
                    ? properties.find((p) => p.id === filterProperty)?.name || 'All'
                    : 'All',
                active: filterProperty !== 'all',
                onPress: () => setShowPropertyFilter(true),
              },
              {
                label: 'Priority',
                value:
                  filterPriority === 'all'
                    ? 'All'
                    : filterPriority.charAt(0).toUpperCase() + filterPriority.slice(1),
                active: filterPriority !== 'all',
                onPress: () => setShowPriorityFilter(true),
              },
            ]}
            onClear={() => {
              setFilterBlock('all');
              setFilterProperty('all');
              setFilterPriority('all');
            }}
          />

          {/* Content List */}
          {filteredRequests.length === 0 ? (
            <EmptyState
              title="No Maintenance Requests"
              message="Create your first maintenance request to get started"
            />
          ) : (
            <View style={styles.listContent}>
              {filteredRequests.map((item) => (
                <View key={item.id} style={styles.requestCardWrapper}>
                  {renderMaintenanceItem({ item })}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

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
              paddingBottom: Math.max(insets.bottom || 0, spacing[6]) + spacing[4],
              maxHeight: modalMaxHeight(0.9),
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
              data={[{ id: 'all', name: 'All Blocks' }, ...blocks]}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    {
                      backgroundColor: filterBlock === item.id ? themeColors.primary.light : themeColors.card.DEFAULT,
                      borderColor: filterBlock === item.id ? themeColors.primary.DEFAULT : 'transparent',
                      borderWidth: filterBlock === item.id ? 1 : 0,
                    },
                  ]}
                  onPress={() => {
                    setFilterBlock(item.id);
                    setShowBlockFilter(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      { color: filterBlock === item.id ? themeColors.primary.DEFAULT : themeColors.text.primary }
                    ]}
                  >
                    {item.name}
                  </Text>
                  {filterBlock === item.id && (
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
              backgroundColor: themeColors.background,
              paddingBottom: Math.max(insets.bottom || 0, spacing[6]) + spacing[4],
              maxHeight: modalMaxHeight(0.9),
            }
          ]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Filter by Property</Text>
              <TouchableOpacity
                onPress={() => setShowPropertyFilter(false)}
                style={[styles.modalCloseButton, { backgroundColor: themeColors.card.DEFAULT }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalClose, { color: themeColors.text.secondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={[{ id: 'all', name: 'All Properties' }, ...properties.filter(p => filterBlock === 'all' || p.blockId === filterBlock)]}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    {
                      backgroundColor: filterProperty === item.id ? themeColors.primary.light : themeColors.card.DEFAULT,
                      borderColor: filterProperty === item.id ? themeColors.primary.DEFAULT : 'transparent',
                      borderWidth: filterProperty === item.id ? 1 : 0,
                    },
                  ]}
                  onPress={() => {
                    setFilterProperty(item.id);
                    setShowPropertyFilter(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      { color: filterProperty === item.id ? themeColors.primary.DEFAULT : themeColors.text.primary }
                    ]}
                  >
                    {item.name}
                  </Text>
                  {filterProperty === item.id && (
                    <CheckCircle2 size={20} color={themeColors.primary.DEFAULT} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Priority Filter Modal */}
      <Modal
        visible={showPriorityFilter}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPriorityFilter(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[
            styles.modalContent,
            {
              backgroundColor: themeColors.background,
              paddingBottom: Math.max(insets.bottom || 0, spacing[6]) + spacing[4],
              maxHeight: modalMaxHeight(0.9),
            }
          ]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Filter by Priority</Text>
              <TouchableOpacity
                onPress={() => setShowPriorityFilter(false)}
                style={[styles.modalCloseButton, { backgroundColor: themeColors.card.DEFAULT }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalClose, { color: themeColors.text.secondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={['all', 'low', 'medium', 'high']}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    {
                      backgroundColor: filterPriority === item ? themeColors.primary.light : themeColors.card.DEFAULT,
                      borderColor: filterPriority === item ? themeColors.primary.DEFAULT : 'transparent',
                      borderWidth: filterPriority === item ? 1 : 0,
                    },
                  ]}
                  onPress={() => {
                    setFilterPriority(item);
                    setShowPriorityFilter(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      { color: filterPriority === item ? themeColors.primary.DEFAULT : themeColors.text.primary }
                    ]}
                  >
                    {item === 'all' ? 'All' : item.charAt(0).toUpperCase() + item.slice(1)}
                  </Text>
                  {filterPriority === item && (
                    <CheckCircle2 size={20} color={themeColors.primary.DEFAULT} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Work Order Creation Modal */}
      <Modal
        visible={showWorkOrderModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowWorkOrderModal(false);
          resetWorkOrderForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.card.DEFAULT, maxHeight: modalMaxHeight(0.9) }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.DEFAULT }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Create Work Order</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowWorkOrderModal(false);
                  resetWorkOrderForm();
                }}
              >
                <X size={24} color={themeColors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
              {selectedRequestForWorkOrder && (
                <Text style={[styles.workOrderRequestTitle, { color: themeColors.text.primary }]}>
                  {selectedRequestForWorkOrder.title}
                </Text>
              )}

              <View style={styles.workOrderForm}>
                {teams.length === 0 ? (
                  <Text style={[styles.workOrderHint, { color: themeColors.text.secondary }]}>
                    No maintenance teams yet. Create a team under Settings → Maintenance Team and add inspectors or maintenance contractors, then assign work orders here.
                  </Text>
                ) : (
                  <>
                    <Text style={[styles.workOrderFormLabel, { color: themeColors.text.primary }]}>
                      Maintenance Team *
                    </Text>
                    <Select
                      value={workOrderTeamId || undefined}
                      placeholder="Select a maintenance team"
                      options={teams.map((team) => ({
                        value: team.id,
                        label: team.email ? `${team.name} (${team.email})` : team.name,
                      }))}
                      onValueChange={(value) => {
                        setWorkOrderTeamId(value);
                        setWorkOrderAssignedToId('');
                      }}
                    />

                    {!!workOrderTeamId && (
                      <>
                        <Text style={[styles.workOrderFormLabel, { marginTop: 16, color: themeColors.text.primary }]}>
                          Assign to Team Member *
                        </Text>
                        <Select
                          value={workOrderAssignedToId || undefined}
                          placeholder={
                            isLoadingMembers
                              ? 'Loading members...'
                              : teamMembers.length === 0
                                ? 'No members on this team'
                                : 'Select inspector or contractor'
                          }
                          disabled={isLoadingMembers || teamMembers.length === 0}
                          options={teamMembers
                            .map((member) => {
                              const person = member.user || member.contact;
                              const value = member.userId || member.contactId;
                              if (!person || !value) return null;
                              const kind = member.userId ? 'Inspector / Staff' : 'Maintenance Contractor';
                              const name = `${person.firstName || ''} ${person.lastName || ''}`.trim();
                              const email = person.email ? ` (${person.email})` : '';
                              return {
                                value,
                                label: `${name}${email} — ${kind}`,
                              };
                            })
                            .filter((opt): opt is { value: string; label: string } => !!opt)}
                          onValueChange={setWorkOrderAssignedToId}
                        />
                        <Text style={[styles.workOrderHint, { color: themeColors.text.secondary }]}>
                          Only people added to this Maintenance Team can be assigned.
                        </Text>
                      </>
                    )}
                  </>
                )}

                <View style={{ marginTop: 16 }}>
                  <DatePicker
                    label="SLA Due Date"
                    value={workOrderSlaDue}
                    onChange={setWorkOrderSlaDue}
                    placeholder="Select due date"
                  />
                </View>

                <Input
                  label="Cost Estimate"
                  value={workOrderCostEstimate}
                  onChangeText={setWorkOrderCostEstimate}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  style={{ marginTop: 8 }}
                />

                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    onPress={() => {
                      setShowWorkOrderModal(false);
                      resetWorkOrderForm();
                    }}
                    variant="outline"
                    style={styles.modalButton}
                  />
                  <Button
                    title={createWorkOrderMutation.isPending ? 'Creating…' : 'Create Work Order'}
                    onPress={handleSubmitWorkOrder}
                    variant="primary"
                    style={styles.modalButton}
                    disabled={createWorkOrderMutation.isPending || teams.length === 0}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <WorkOrderCertificateSheet
        visible={!!certificateWorkOrder}
        workOrderId={certificateWorkOrder?.id || null}
        workOrderTitle={certificateWorkOrder?.maintenanceRequest.title}
        onClose={() => setCertificateWorkOrder(null)}
      />
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
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
    gap: spacing[2],
    width: '100%',
    flexWrap: 'wrap',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing[2],
    flexShrink: 1,
  },
  headerButton: {
    flexShrink: 0,
    alignSelf: 'flex-start',
    maxWidth: '45%',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing[1],
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    paddingTop: spacing[3],
    gap: spacing[3],
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
  listContent: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  requestCardWrapper: {
    marginBottom: spacing[3],
  },
  requestCard: {
    overflow: 'hidden',
    borderRadius: borderRadius.xl,
    marginBottom: 0,
  },
  cardInner: {
    flexDirection: 'row',
    minHeight: moderateScale(140),
  },
  accentBar: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    gap: spacing[2],
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[2],
  },
  cardTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexShrink: 1,
    minWidth: 0,
  },
  iconBubble: {
    width: moderateScale(28),
    height: moderateScale(28),
    borderRadius: moderateScale(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipText: {
    fontSize: getFontSize(11),
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  requestTitle: {
    fontSize: getFontSize(17),
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: getFontSize(22),
  },
  editButton: {
    width: moderateScale(30),
    height: moderateScale(30),
    borderRadius: moderateScale(15),
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaBlock: {
    gap: spacing[1] + 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  metaLine: {
    fontSize: getFontSize(13),
    flex: 1,
    minWidth: 0,
  },
  metaStrong: {
    fontWeight: '600',
  },
  metaText: {
    fontSize: 12,
    marginBottom: 4,
  },
  description: {
    fontSize: getFontSize(13),
    lineHeight: getFontSize(18),
  },
  cardFooter: {
    marginTop: spacing[1],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  openCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing[1],
  },
  openLabel: {
    fontSize: getFontSize(13),
    fontWeight: '700',
  },
  openArrow: {
    width: moderateScale(26),
    height: moderateScale(26),
    borderRadius: moderateScale(13),
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  statusSelectText: {
    fontSize: 12,
    fontWeight: '700',
  },
  assignButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  assignButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  workOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    gap: 4,
  },
  workOrderButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  requestFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
  },
  reporterInfo: {
    marginBottom: 12,
  },
  footerText: {
    fontSize: 12,
    marginBottom: 2,
  },
  workOrderCard: {
    marginBottom: 16,
    padding: 16,
  },
  workOrderHeader: {
    marginBottom: 12,
  },
  workOrderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  workOrderTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  workOrderStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  workOrderStatusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  workOrderMeta: {
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 32,
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  workOrderRequestTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  workOrderForm: {
    marginBottom: 16,
  },
  workOrderFormLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  workOrderHint: {
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    marginBottom: spacing[2],
  },
  modalItemSelected: {
    // borderColor applied dynamically via themeColors
  },
  modalItemText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
});
