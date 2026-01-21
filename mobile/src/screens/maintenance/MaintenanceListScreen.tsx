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
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wrench, Plus, Filter, X, Pencil, Clipboard, Calendar, User, Clock, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { maintenanceService, type MaintenanceRequestWithDetails, type WorkOrder } from '../../services/maintenance';
import { propertiesService } from '../../services/properties';
import { authService } from '../../services/auth';
import type { MaintenanceStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { format, formatDistanceToNow } from 'date-fns';

type NavigationProp = StackNavigationProp<MaintenanceStackParamList, 'MaintenanceList'>;

const statusColors: Record<string, string> = {
  open: '#fbbf24', // Lighter amber-400
  in_progress: '#007AFF',
  completed: '#34C759',
  closed: '#8E8E93',
};

const priorityColors: Record<string, string> = {
  low: '#34C759',
  medium: '#fbbf24', // Lighter amber-400
  high: '#FF3B30',
  urgent: '#FF3B30',
};

const workOrderStatusColors: Record<string, string> = {
  assigned: '#007AFF',
  in_progress: '#fbbf24', // Lighter amber-400
  waiting_parts: '#fbbf24', // Lighter amber-400
  completed: '#34C759',
  rejected: '#FF3B30',
};

export default function MaintenanceListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'requests' | 'work-orders'>('requests');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [filterProperty, setFilterProperty] = useState<string>('all');
  const [filterBlock, setFilterBlock] = useState<string>('all');
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [showWorkOrderModal, setShowWorkOrderModal] = useState(false);
  const [selectedRequestForWorkOrder, setSelectedRequestForWorkOrder] = useState<MaintenanceRequestWithDetails | null>(null);
  const [workOrderTeamId, setWorkOrderTeamId] = useState<string>('');
  const [workOrderContractorId, setWorkOrderContractorId] = useState<string>('');

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
    enabled: user?.role === 'owner' || user?.role === 'clerk',
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['/api/teams'],
    queryFn: async () => {
      // Placeholder for teams endpoint
      return [];
    },
    enabled: (user?.role === 'owner' || user?.role === 'contractor'),
  });

  const { data: contractors = [] } = useQuery({
    queryKey: ['/api/contacts'],
    queryFn: async () => {
      // Placeholder for contractors/contacts endpoint
      return [];
    },
    enabled: (user?.role === 'owner' || user?.role === 'contractor'),
  });

  const { data: workOrders = [], isLoading: workOrdersLoading } = useQuery({
    queryKey: ['/api/work-orders'],
    queryFn: () => maintenanceService.getWorkOrders(),
    enabled: (user?.role === 'owner' || user?.role === 'contractor'),
  });

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
    mutationFn: async (data: any) => {
      return maintenanceService.createWorkOrder(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance'] });
      setShowWorkOrderModal(false);
      setSelectedRequestForWorkOrder(null);
      setWorkOrderTeamId('');
      setWorkOrderContractorId('');
      Alert.alert('Success', 'Work order created successfully');
    },
    onError: () => {
      Alert.alert('Error', 'Failed to create work order');
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

    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(r => r.status === selectedStatus);
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

    // Tenants should only see their own requests
    if (user?.role === 'tenant') {
      filtered = filtered.filter(r => r.reportedBy === user.id);
    }

    return filtered;
  }, [requests, selectedStatus, filterProperty, filterBlock, properties, user]);

  const handleEdit = (request: MaintenanceRequestWithDetails) => {
    navigation.navigate('CreateMaintenance', { requestId: request.id });
  };

  const handleCreateWorkOrder = (request: MaintenanceRequestWithDetails) => {
    setSelectedRequestForWorkOrder(request);
    setShowWorkOrderModal(true);
  };

  const handleSubmitWorkOrder = () => {
    if (!selectedRequestForWorkOrder) return;
    
    if (!workOrderTeamId && !workOrderContractorId) {
      Alert.alert('Error', 'Please select either a team or contractor');
      return;
    }

    createWorkOrderMutation.mutate({
      maintenanceRequestId: selectedRequestForWorkOrder.id,
      teamId: workOrderTeamId || null,
      contractorId: workOrderContractorId || null,
    });
  };

  const getPriorityBadge = (priority: string) => {
    const color = priorityColors[priority] || priorityColors.medium;
    return (
      <View style={[styles.priorityBadge, { backgroundColor: color }]}>
        <Text style={styles.priorityBadgeText}>{priority.charAt(0).toUpperCase() + priority.slice(1)}</Text>
      </View>
    );
  };

  const getStatusBadge = (status: string) => {
    const color = statusColors[status] || statusColors.open;
    const label = status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1);
    return (
      <View style={[styles.statusBadge, { backgroundColor: color }]}>
        <Text style={styles.statusBadgeText}>{label}</Text>
      </View>
    );
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
    const statusColor = statusColors[item.status] || '#666';
    const priorityColor = priorityColors[item.priority] || '#666';

    return (
      <Card style={styles.requestCard}>
        <View style={styles.requestHeader}>
          <View style={styles.requestTitleRow}>
            <Text style={styles.requestTitle} numberOfLines={2}>{item.title}</Text>
            {(user?.role === 'owner' || user?.role === 'clerk') && (
              <TouchableOpacity
                onPress={() => handleEdit(item)}
                style={styles.editButton}
              >
                <Pencil size={16} color={colors.text.secondary} />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.badgeRow}>
            {getPriorityBadge(item.priority)}
            {getStatusBadge(item.status)}
          </View>
        </View>

        <View style={styles.requestMeta}>
          <Text style={styles.metaText}>
            {item.property?.name || 'Unknown'}
            {item.property?.address && ` • ${item.property.address}`}
          </Text>
          {item.dueDate ? (
            <Text style={styles.metaText}>
              Due {format(new Date(item.dueDate), 'PPP')}
            </Text>
          ) : (
            <Text style={styles.metaText}>
              Created {format(new Date(item.createdAt), 'PPP')}
            </Text>
          )}
        </View>

        {item.description && (
          <Text style={styles.description} numberOfLines={3}>
            {item.description}
          </Text>
        )}

        <View style={styles.requestFooter}>
          <View style={styles.reporterInfo}>
            <Text style={styles.footerText}>
              Reported by: {item.reportedByUser
                ? `${item.reportedByUser.firstName} ${item.reportedByUser.lastName}`
                : 'Unknown'}
            </Text>
            {item.assignedToUser && (
              <Text style={styles.footerText}>
                Assigned to: {item.assignedToUser.firstName} {item.assignedToUser.lastName}
              </Text>
            )}
          </View>

          {user?.role === 'owner' && item.status !== 'completed' && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.statusSelect, { borderColor: statusColor }]}
                onPress={() => {
                  Alert.alert(
                    'Update Status',
                    'Select new status',
                    [
                      { text: 'Open', onPress: () => updateStatusMutation.mutate({ id: item.id, status: 'open' }) },
                      { text: 'In Progress', onPress: () => updateStatusMutation.mutate({ id: item.id, status: 'in_progress' }) },
                      { text: 'Completed', onPress: () => updateStatusMutation.mutate({ id: item.id, status: 'completed' }) },
                      { text: 'Closed', onPress: () => updateStatusMutation.mutate({ id: item.id, status: 'closed' }) },
                      { text: 'Cancel', style: 'cancel' },
                    ]
                  );
                }}
              >
                <Text style={[styles.statusSelectText, { color: statusColor }]}>
                  {item.status === 'in_progress' ? 'In Progress' : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </Text>
              </TouchableOpacity>

              {!item.assignedTo && clerks.length > 0 && (
                <TouchableOpacity
                  style={styles.assignButton}
                  onPress={() => {
                    Alert.alert(
                      'Assign to Clerk',
                      'Select a clerk',
                      clerks.map(clerk => ({
                        text: `${clerk.firstName} ${clerk.lastName}`,
                        onPress: () => updateStatusMutation.mutate({
                          id: item.id,
                          status: 'in_progress',
                          assignedTo: clerk.id,
                        }),
                      })).concat([{ text: 'Cancel', style: 'cancel' }])
                    );
                  }}
                >
                  <Text style={styles.assignButtonText}>Assign</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.workOrderButton}
                onPress={() => handleCreateWorkOrder(item)}
              >
                <Clipboard size={16} color={colors.text.primary} />
                <Text style={styles.workOrderButtonText}>Work Order</Text>
              </TouchableOpacity>
            </View>
          )}
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
            <Text style={styles.workOrderTitle} numberOfLines={2}>
              {item.maintenanceRequest.title}
            </Text>
            <View style={[styles.workOrderStatusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.workOrderStatusText}>
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
              <User size={14} color={colors.text.secondary} />
              <Text style={styles.metaText}>Team: {item.team.name}</Text>
            </View>
          )}

          {item.contractor && (
            <View style={styles.metaItem}>
              <User size={14} color={colors.text.secondary} />
              <Text style={styles.metaText}>
                {item.contractor.firstName} {item.contractor.lastName}
              </Text>
            </View>
          )}

          {item.slaDue && (
            <View style={styles.metaItem}>
              <Calendar size={14} color={colors.text.secondary} />
              <Text style={styles.metaText}>
                SLA: {formatDistanceToNow(new Date(item.slaDue), { addSuffix: true })}
              </Text>
            </View>
          )}

          {(item.costEstimate || item.costActual) && (
            <View style={styles.metaItem}>
              <Text style={styles.metaText}>
                {item.costActual
                  ? `Actual: ${formatCurrency(item.costActual)}`
                  : `Est: ${formatCurrency(item.costEstimate)}`}
              </Text>
            </View>
          )}

          <View style={styles.metaItem}>
            <Clock size={14} color={colors.text.secondary} />
            <Text style={styles.metaText}>
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
      </Card>
    );
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + spacing[2], spacing[6]) }]}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Maintenance</Text>
          <Button
            title="New Request"
            onPress={() => navigation.navigate('CreateMaintenance')}
            variant="primary"
            size="sm"
          />
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requests' && styles.tabActive]}
          onPress={() => setActiveTab('requests')}
        >
          <Wrench size={16} color={activeTab === 'requests' ? colors.primary.DEFAULT : colors.text.secondary} />
          <Text style={[styles.tabText, activeTab === 'requests' && styles.tabTextActive]}>
            Requests
          </Text>
        </TouchableOpacity>
        {(user?.role === 'owner' || user?.role === 'contractor') && (
          <TouchableOpacity
            style={[styles.tab, activeTab === 'work-orders' && styles.tabActive]}
            onPress={() => setActiveTab('work-orders')}
          >
            <Clipboard size={16} color={activeTab === 'work-orders' ? colors.primary.DEFAULT : colors.text.secondary} />
            <Text style={[styles.tabText, activeTab === 'work-orders' && styles.tabTextActive]}>
              Work Orders
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filters (only for requests tab, hidden for tenants) */}
      {activeTab === 'requests' && user?.role !== 'tenant' && (
        <View style={styles.filtersContainer}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFiltersModal(true)}
          >
            <Filter size={16} color={colors.text.primary} />
            <Text style={styles.filterButtonText}>Filters</Text>
            {(selectedStatus !== 'all' || filterBlock !== 'all' || filterProperty !== 'all') && (
              <View style={styles.filterIndicator} />
            )}
          </TouchableOpacity>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusFilters}>
            {['all', 'open', 'in_progress', 'completed', 'closed'].map((status) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.statusFilterButton,
                  selectedStatus === status && styles.statusFilterButtonActive,
                ]}
                onPress={() => setSelectedStatus(status)}
              >
                <Text
                  style={[
                    styles.statusFilterText,
                    selectedStatus === status && styles.statusFilterTextActive,
                  ]}
                >
                  {status === 'all' ? 'All' : status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Content */}
      {activeTab === 'requests' ? (
        <FlatList
          data={filteredRequests}
          renderItem={renderMaintenanceItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom + 80, 32) }
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <EmptyState
              title="No Maintenance Requests"
              message={
                selectedStatus === 'all'
                  ? 'Create your first maintenance request to get started'
                  : `No ${selectedStatus.replace('-', ' ')} requests found`
              }
            />
          }
        />
      ) : (
        <FlatList
          data={workOrders}
          renderItem={renderWorkOrderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom + 80, 32) }
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <EmptyState
              title="No Work Orders"
              message={
                user?.role === 'contractor'
                  ? "You don't have any assigned work orders yet"
                  : 'Create work orders from maintenance requests'
              }
            />
          }
        />
      )}

      {/* Filters Modal */}
      <Modal
        visible={showFiltersModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFiltersModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setShowFiltersModal(false)}>
                <X size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Status</Text>
                <View style={styles.filterOptions}>
                  {['all', 'open', 'in_progress', 'completed', 'closed'].map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.filterOptionButton,
                        selectedStatus === status && styles.filterOptionButtonActive,
                      ]}
                      onPress={() => setSelectedStatus(status)}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          selectedStatus === status && styles.filterOptionTextActive,
                        ]}
                      >
                        {status === 'all' ? 'All' : status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Block</Text>
                <ScrollView style={styles.filterSelectContainer}>
                  {['all', ...blocks.map(b => b.id)].map((blockId) => {
                    const block = blockId === 'all' ? null : blocks.find(b => b.id === blockId);
                    return (
                      <TouchableOpacity
                        key={blockId}
                        style={[
                          styles.filterSelectOption,
                          filterBlock === blockId && styles.filterSelectOptionActive,
                        ]}
                        onPress={() => setFilterBlock(blockId)}
                      >
                        <Text
                          style={[
                            styles.filterSelectText,
                            filterBlock === blockId && styles.filterSelectTextActive,
                          ]}
                        >
                          {block ? block.name : 'All Blocks'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Property</Text>
                <ScrollView style={styles.filterSelectContainer}>
                  {['all', ...properties.filter(p => filterBlock === 'all' || p.blockId === filterBlock).map(p => p.id)].map((propertyId) => {
                    const property = propertyId === 'all' ? null : properties.find(p => p.id === propertyId);
                    return (
                      <TouchableOpacity
                        key={propertyId}
                        style={[
                          styles.filterSelectOption,
                          filterProperty === propertyId && styles.filterSelectOptionActive,
                        ]}
                        onPress={() => setFilterProperty(propertyId)}
                      >
                        <Text
                          style={[
                            styles.filterSelectText,
                            filterProperty === propertyId && styles.filterSelectTextActive,
                          ]}
                        >
                          {property ? property.name : 'All Properties'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {(selectedStatus !== 'all' || filterBlock !== 'all' || filterProperty !== 'all') && (
                <Button
                  title="Clear All Filters"
                  onPress={() => {
                    setSelectedStatus('all');
                    setFilterBlock('all');
                    setFilterProperty('all');
                  }}
                  variant="outline"
                  style={styles.clearFiltersButton}
                />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Work Order Creation Modal */}
      <Modal
        visible={showWorkOrderModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowWorkOrderModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Work Order</Text>
              <TouchableOpacity onPress={() => setShowWorkOrderModal(false)}>
                <X size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedRequestForWorkOrder && (
                <Text style={styles.workOrderRequestTitle}>
                  {selectedRequestForWorkOrder.title}
                </Text>
              )}

              <View style={styles.workOrderForm}>
                <Text style={styles.workOrderFormLabel}>Assign to Team (Optional)</Text>
                <ScrollView style={styles.filterSelectContainer}>
                  <TouchableOpacity
                    style={[
                      styles.filterSelectOption,
                      !workOrderTeamId && styles.filterSelectOptionActive,
                    ]}
                    onPress={() => {
                      setWorkOrderTeamId('');
                      setWorkOrderContractorId('');
                    }}
                  >
                    <Text
                      style={[
                        styles.filterSelectText,
                        !workOrderTeamId && styles.filterSelectTextActive,
                      ]}
                    >
                      None
                    </Text>
                  </TouchableOpacity>
                  {teams.map((team) => (
                    <TouchableOpacity
                      key={team.id}
                      style={[
                        styles.filterSelectOption,
                        workOrderTeamId === team.id && styles.filterSelectOptionActive,
                      ]}
                      onPress={() => {
                        setWorkOrderTeamId(team.id);
                        setWorkOrderContractorId('');
                      }}
                    >
                      <Text
                        style={[
                          styles.filterSelectText,
                          workOrderTeamId === team.id && styles.filterSelectTextActive,
                        ]}
                      >
                        {team.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={[styles.workOrderFormLabel, { marginTop: 16 }]}>Or Assign to Contractor (Optional)</Text>
                <ScrollView style={styles.filterSelectContainer}>
                  <TouchableOpacity
                    style={[
                      styles.filterSelectOption,
                      !workOrderContractorId && styles.filterSelectOptionActive,
                    ]}
                    onPress={() => {
                      setWorkOrderTeamId('');
                      setWorkOrderContractorId('');
                    }}
                  >
                    <Text
                      style={[
                        styles.filterSelectText,
                        !workOrderContractorId && styles.filterSelectTextActive,
                      ]}
                    >
                      None
                    </Text>
                  </TouchableOpacity>
                  {contractors.map((contractor) => (
                    <TouchableOpacity
                      key={contractor.id}
                      style={[
                        styles.filterSelectOption,
                        workOrderContractorId === contractor.id && styles.filterSelectOptionActive,
                      ]}
                      onPress={() => {
                        setWorkOrderContractorId(contractor.id);
                        setWorkOrderTeamId('');
                      }}
                    >
                      <Text
                        style={[
                          styles.filterSelectText,
                          workOrderContractorId === contractor.id && styles.filterSelectTextActive,
                        ]}
                      >
                        {contractor.firstName} {contractor.lastName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    onPress={() => setShowWorkOrderModal(false)}
                    variant="outline"
                    style={styles.modalButton}
                  />
                  <Button
                    title="Create Work Order"
                    onPress={handleSubmitWorkOrder}
                    variant="primary"
                    style={styles.modalButton}
                    disabled={createWorkOrderMutation.isPending}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingHorizontal: 16,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary.DEFAULT,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginLeft: 6,
  },
  tabTextActive: {
    color: colors.primary.DEFAULT,
  },
  filtersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.light,
    marginRight: 8,
    position: 'relative',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginLeft: 6,
  },
  filterIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary.DEFAULT,
  },
  statusFilters: {
    flex: 1,
  },
  statusFilterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.light,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  statusFilterButtonActive: {
    backgroundColor: colors.primary.DEFAULT,
    borderColor: colors.primary.DEFAULT,
  },
  statusFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  statusFilterTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
  },
  requestCard: {
    marginBottom: 16,
    padding: 16,
  },
  requestHeader: {
    marginBottom: 12,
  },
  requestTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  requestTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    marginRight: 8,
  },
  editButton: {
    padding: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityBadgeText: {
    color: '#fff',
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
  requestMeta: {
    marginBottom: 8,
  },
  metaText: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  requestFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  reporterInfo: {
    marginBottom: 12,
  },
  footerText: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusSelect: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: '#fff',
  },
  statusSelectText: {
    fontSize: 12,
    fontWeight: '600',
  },
  assignButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border.dark,
    backgroundColor: '#fff',
  },
  assignButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
  },
  workOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border.dark,
    backgroundColor: '#fff',
    gap: 4,
  },
  workOrderButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
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
    color: '#000',
  },
  workOrderStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  workOrderStatusText: {
    color: '#fff',
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  modalBody: {
    padding: 16,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterOptionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: '#fff',
    minWidth: 100,
  },
  filterOptionButtonActive: {
    backgroundColor: colors.primary.DEFAULT,
    borderColor: colors.primary.DEFAULT,
  },
  filterOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    textAlign: 'center',
  },
  filterOptionTextActive: {
    color: '#fff',
  },
  filterSelectContainer: {
    maxHeight: 200,
  },
  filterSelectOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  filterSelectOptionActive: {
    backgroundColor: colors.primary.DEFAULT + '20',
    borderColor: colors.primary.DEFAULT,
  },
  filterSelectText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  filterSelectTextActive: {
    color: colors.primary.DEFAULT,
    fontWeight: '600',
  },
  clearFiltersButton: {
    marginTop: 8,
  },
  workOrderRequestTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16,
  },
  workOrderForm: {
    marginBottom: 16,
  },
  workOrderFormLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
  },
});
