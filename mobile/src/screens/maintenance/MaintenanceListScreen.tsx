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
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wrench, Plus, Filter, X, Pencil, Clipboard, Calendar, User, Clock, CheckCircle2, AlertCircle, Search } from 'lucide-react-native';
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
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { moderateScale, getFontSize } from '../../utils/responsive';
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
  const theme = useTheme();
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  // Tabs removed - always show requests
  const activeTab = 'requests';
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [filterProperty, setFilterProperty] = useState<string>('all');
  const [filterBlock, setFilterBlock] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showBlockFilter, setShowBlockFilter] = useState(false);
  const [showPropertyFilter, setShowPropertyFilter] = useState(false);
  const [showPriorityFilter, setShowPriorityFilter] = useState(false);
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

    // Filter by priority
    if (filterPriority !== 'all') {
      filtered = filtered.filter(r => r.priority === filterPriority);
    }

    // Tenants should only see their own requests
    if (user?.role === 'tenant') {
      filtered = filtered.filter(r => r.reportedBy === user.id);
    }

    return filtered;
  }, [requests, searchTerm, selectedStatus, filterProperty, filterBlock, filterPriority, properties, user]);

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
        <Text style={[styles.statusBadgeText, { color: '#fff' }]}>{label}</Text>
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
            <Text style={[styles.requestTitle, { color: themeColors.text.primary }]} numberOfLines={2}>{item.title}</Text>
            {(user?.role === 'owner' || user?.role === 'clerk') && (
              <TouchableOpacity
                onPress={() => handleEdit(item)}
                style={styles.editButton}
              >
                <Pencil size={16} color={themeColors.text.secondary} />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.badgeRow}>
            {getPriorityBadge(item.priority)}
            {getStatusBadge(item.status)}
          </View>
        </View>

        <View style={styles.requestMeta}>
          <Text style={[styles.metaText, { color: themeColors.text.secondary }]}>
            {item.property?.name || 'Unknown'}
            {item.property?.address && ` • ${item.property.address}`}
          </Text>
          {item.dueDate ? (
            <Text style={[styles.metaText, { color: themeColors.text.secondary }]}>
              Due {format(new Date(item.dueDate), 'PPP')}
            </Text>
          ) : (
            <Text style={[styles.metaText, { color: themeColors.text.secondary }]}>
              Created {format(new Date(item.createdAt), 'PPP')}
            </Text>
          )}
        </View>

        {item.description && (
          <Text style={[styles.description, { color: themeColors.text.secondary }]} numberOfLines={3}>
            {item.description}
          </Text>
        )}

        <View style={[styles.requestFooter, { borderTopColor: themeColors.border.DEFAULT }]}>
          <View style={styles.reporterInfo}>
            <Text style={[styles.footerText, { color: themeColors.text.secondary }]}>
              Reported by: {item.reportedByUser
                ? `${item.reportedByUser.firstName} ${item.reportedByUser.lastName}`
                : 'Unknown'}
            </Text>
            {item.assignedToUser && (
              <Text style={[styles.footerText, { color: themeColors.text.secondary }]}>
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
                <Clipboard size={16} color={themeColors.text.primary} />
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
      </Card>
    );
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Fixed Header */}
      <View style={[styles.fixedHeader, { 
        paddingTop: Math.max(insets.top + spacing[2], spacing[6]),
        backgroundColor: themeColors.card.DEFAULT,
      }]}>
        <View style={styles.headerContent}>
          <View style={styles.headerText}>
            <Text style={[styles.headerTitle, { color: themeColors.text.primary }]}>Maintenance</Text>
            <Text style={[styles.headerSubtitle, { color: themeColors.text.secondary }]}>Track and manage maintenance requests</Text>
          </View>
          <View style={styles.headerButton}>
            <Button
              title="New Request"
              onPress={() => navigation.navigate('CreateMaintenance')}
              variant="primary"
              size="sm"
            />
          </View>
        </View>
        
        {/* Fixed Search Bar */}
        {activeTab === 'requests' && user?.role !== 'tenant' && (
          <View style={[
            styles.searchContainer,
            {
              borderColor: themeColors.border.DEFAULT,
            }
          ]}>
            <Search size={16} color={themeColors.text.secondary} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: themeColors.text.primary }]}
              placeholder="Search maintenance requests by title, description, property, or status..."
              placeholderTextColor={themeColors.text.secondary}
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
          </View>
        )}
      </View>

      {/* Scrollable Content */}
      {activeTab === 'requests' && user?.role !== 'tenant' && (
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
          <View style={[styles.filtersContainer, { backgroundColor: themeColors.background }]}>
            <Text style={[styles.filterLabel, { color: themeColors.text.primary }]}>Filter by:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  borderColor: themeColors.border.DEFAULT,
                  backgroundColor: selectedStatus !== 'all' ? themeColors.primary.light : themeColors.background,
                },
                selectedStatus !== 'all' && { borderColor: themeColors.primary.DEFAULT }
              ]}
              onPress={() => setShowStatusFilter(true)}
            >
              <Text style={[
                styles.filterChipText,
                { color: selectedStatus !== 'all' ? themeColors.primary.DEFAULT : themeColors.text.secondary }
              ]}>
                Status: {selectedStatus === 'all' ? 'All' : selectedStatus === 'in_progress' ? 'In Progress' : selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1)}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  borderColor: themeColors.border.DEFAULT,
                  backgroundColor: filterBlock !== 'all' ? themeColors.primary.light : themeColors.background,
                },
                filterBlock !== 'all' && { borderColor: themeColors.primary.DEFAULT }
              ]}
              onPress={() => setShowBlockFilter(true)}
            >
              <Text style={[
                styles.filterChipText,
                { color: filterBlock !== 'all' ? themeColors.primary.DEFAULT : themeColors.text.secondary }
              ]}>
                Block: {filterBlock !== 'all' ? blocks.find(b => b.id === filterBlock)?.name || 'All' : 'All'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  borderColor: themeColors.border.DEFAULT,
                  backgroundColor: filterProperty !== 'all' ? themeColors.primary.light : themeColors.background,
                },
                filterProperty !== 'all' && { borderColor: themeColors.primary.DEFAULT }
              ]}
              onPress={() => setShowPropertyFilter(true)}
            >
              <Text style={[
                styles.filterChipText,
                { color: filterProperty !== 'all' ? themeColors.primary.DEFAULT : themeColors.text.secondary }
              ]}>
                Property: {filterProperty !== 'all' ? properties.find(p => p.id === filterProperty)?.name || 'All' : 'All'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  borderColor: themeColors.border.DEFAULT,
                  backgroundColor: filterPriority !== 'all' ? themeColors.primary.light : themeColors.background,
                },
                filterPriority !== 'all' && { borderColor: themeColors.primary.DEFAULT }
              ]}
              onPress={() => setShowPriorityFilter(true)}
            >
              <Text style={[
                styles.filterChipText,
                { color: filterPriority !== 'all' ? themeColors.primary.DEFAULT : themeColors.text.secondary }
              ]}>
                Priority: {filterPriority === 'all' ? 'All' : filterPriority.charAt(0).toUpperCase() + filterPriority.slice(1)}
              </Text>
            </TouchableOpacity>
          </ScrollView>
          </View>
          
          {/* Content List */}
          {filteredRequests.length === 0 ? (
            <EmptyState
              title="No Maintenance Requests"
              message={
                selectedStatus === 'all'
                  ? 'Create your first maintenance request to get started'
                  : `No ${selectedStatus.replace('-', ' ')} requests found`
              }
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

      {/* Content for work orders */}
      {activeTab !== 'requests' && (
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
              data={['all', 'open', 'in_progress', 'completed', 'closed']}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    { 
                      backgroundColor: selectedStatus === item ? themeColors.primary.light : themeColors.card.DEFAULT,
                      borderColor: selectedStatus === item ? themeColors.primary.DEFAULT : 'transparent',
                      borderWidth: selectedStatus === item ? 1 : 0,
                    },
                  ]}
                  onPress={() => {
                    setSelectedStatus(item);
                    setShowStatusFilter(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      { color: selectedStatus === item ? themeColors.primary.DEFAULT : themeColors.text.primary }
                    ]}
                  >
                    {item === 'all' ? 'All' : item === 'in_progress' ? 'In Progress' : item.charAt(0).toUpperCase() + item.slice(1)}
                  </Text>
                  {selectedStatus === item && (
                    <CheckCircle2 size={20} color={themeColors.primary.DEFAULT} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

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
              paddingBottom: Math.max(insets.bottom || 0, spacing[6]) + spacing[4] 
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
              paddingBottom: Math.max(insets.bottom || 0, spacing[6]) + spacing[4] 
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
        onRequestClose={() => setShowWorkOrderModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.card.DEFAULT }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.DEFAULT }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Create Work Order</Text>
              <TouchableOpacity onPress={() => setShowWorkOrderModal(false)}>
                <X size={24} color={themeColors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true}>
              {selectedRequestForWorkOrder && (
                <Text style={[styles.workOrderRequestTitle, { color: themeColors.text.primary }]}>
                  {selectedRequestForWorkOrder.title}
                </Text>
              )}

              <View style={styles.workOrderForm}>
                <Text style={[styles.workOrderFormLabel, { color: themeColors.text.primary }]}>Assign to Team (Optional)</Text>
                <ScrollView style={styles.filterSelectContainer} showsVerticalScrollIndicator={true}>
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

                <Text style={[styles.workOrderFormLabel, { marginTop: 16, color: themeColors.text.primary }]}>Or Assign to Contractor (Optional)</Text>
                <ScrollView style={styles.filterSelectContainer}>
                  <TouchableOpacity
                    style={[
                      styles.filterSelectOption,
                      {
                        backgroundColor: !workOrderContractorId ? themeColors.primary.light : themeColors.card.DEFAULT,
                        borderColor: !workOrderContractorId ? themeColors.primary.DEFAULT : themeColors.border.light,
                      },
                    ]}
                    onPress={() => {
                      setWorkOrderTeamId('');
                      setWorkOrderContractorId('');
                    }}
                  >
                    <Text
                      style={[
                        styles.filterSelectText,
                        {
                          color: !workOrderContractorId ? themeColors.primary.DEFAULT : themeColors.text.primary,
                          fontWeight: !workOrderContractorId ? '600' : '400',
                        },
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
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[4],
    paddingTop: spacing[2],
  },
  filtersContainer: {
    paddingHorizontal: 0,
    paddingVertical: spacing[2],
    borderBottomWidth: 0,
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
  filterChipText: {
    fontSize: typography.fontSize.sm,
  },
  listContent: {
    paddingHorizontal: spacing[2],
    paddingVertical: 0,
  },
  requestCardWrapper: {
    marginBottom: 16,
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
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
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
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 4,
  },
  workOrderButtonText: {
    fontSize: 12,
    fontWeight: '600',
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
  filterSection: {
    marginBottom: 28,
  },
  filterLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: moderateScale(spacing[2], 0.3),
  },
  filterOptionButton: {
    paddingHorizontal: moderateScale(spacing[3], 0.3),
    paddingVertical: moderateScale(spacing[2], 0.3),
    borderRadius: moderateScale(borderRadius.full, 0.2),
    borderWidth: 1,
    marginRight: moderateScale(spacing[2], 0.3),
    minHeight: moderateScale(36, 0.2),
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: moderateScale(90, 0.3),
  },
  filterOptionButtonActive: {
    ...shadows.xs,
  },
  filterOptionText: {
    fontSize: getFontSize(typography.fontSize.xs),
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
  },
  filterOptionTextActive: {
    fontWeight: typography.fontWeight.semibold,
  },
  filterSelectContainer: {
    maxHeight: 200,
  },
  filterSelectOption: {
    paddingHorizontal: moderateScale(spacing[3], 0.3),
    paddingVertical: moderateScale(spacing[3], 0.3),
    borderRadius: moderateScale(borderRadius.full, 0.2),
    borderWidth: 1,
    marginBottom: moderateScale(spacing[2], 0.3),
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: moderateScale(44, 0.2),
  },
  filterSelectOptionActive: {
    // Colors set dynamically
  },
  filterSelectText: {
    fontSize: getFontSize(typography.fontSize.sm),
  },
  filterSelectTextActive: {
    // Color set dynamically
  },
  clearFiltersButton: {
    marginTop: 8,
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
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
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
    paddingBottom: spacing[3],
    marginBottom: spacing[2],
  },
  modalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
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
