import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Platform,
  TextInput,
  Modal,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ClipboardList,
  ChevronRight,
  MapPin,
  Calendar,
  AlertTriangle,
  Wrench,
  Search,
  X,
  CheckCircle2,
} from 'lucide-react-native';
import { maintenanceService, type WorkOrder } from '../../services/maintenance';
import { propertiesService } from '../../services/properties';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import ScreenHeader from '../../components/ScreenHeader';
import FilterBar from '../../components/FilterBar';
import { colors, spacing, borderRadius, shadows, typography } from '../../theme';
import { getFontSize, moderateScale } from '../../utils/responsive';
import { useResponsive } from '../../hooks/useResponsive';
import type { WorkOrdersStackParamList } from '../../navigation/types';

const STATUS_META: Record<
  string,
  { label: string; color: string; softBg: string }
> = {
  assigned: { label: 'Assigned', color: '#2563EB', softBg: '#DBEAFE' },
  in_progress: { label: 'In Progress', color: '#CA8A04', softBg: '#FEF9C3' },
  waiting_parts: { label: 'Waiting Parts', color: '#EA580C', softBg: '#FFEDD5' },
  completed: { label: 'Completed', color: '#16A34A', softBg: '#DCFCE7' },
  rejected: { label: 'Rejected', color: '#DC2626', softBg: '#FEE2E2' },
};

const PRIORITY_META: Record<
  string,
  { label: string; color: string; softBg: string }
> = {
  low: { label: 'Low', color: '#4B5563', softBg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#2563EB', softBg: '#DBEAFE' },
  high: { label: 'High', color: '#EA580C', softBg: '#FFEDD5' },
  urgent: { label: 'Urgent', color: '#DC2626', softBg: '#FEE2E2' },
};

function formatDue(slaDue?: string | null): string | null {
  if (!slaDue) return null;
  try {
    return new Date(slaDue).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

function isOverdue(slaDue?: string | null, status?: string): boolean {
  if (!slaDue || status === 'completed' || status === 'rejected') return false;
  const due = new Date(slaDue);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function shortId(id: string): string {
  return `WO-${id.slice(0, 8).toUpperCase()}`;
}

function statusLabel(status: string): string {
  return STATUS_META[status]?.label || status.replace(/_/g, ' ');
}

export default function WorkOrdersListScreen() {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const isDark = !!theme?.isDark;
  const insets = useSafeAreaInsets();
  const { modalMaxHeight } = useResponsive();
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<WorkOrdersStackParamList>>();
  const isAssignee = user?.role === 'clerk' || user?.role === 'contractor';

  const [searchTerm, setSearchTerm] = useState('');
  const [filterProperty, setFilterProperty] = useState<string>('all');
  const [filterBlock, setFilterBlock] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [showBlockFilter, setShowBlockFilter] = useState(false);
  const [showPropertyFilter, setShowPropertyFilter] = useState(false);
  const [showPriorityFilter, setShowPriorityFilter] = useState(false);

  const query = useQuery({
    queryKey: ['/api/work-orders'],
    queryFn: () => maintenanceService.getWorkOrders(),
  });

  const { data: properties = [] } = useQuery({
    queryKey: ['/api/properties'],
    queryFn: () => propertiesService.getProperties(),
  });

  const { data: blocks = [] } = useQuery({
    queryKey: ['/api/blocks'],
    queryFn: () => propertiesService.getBlocks(),
  });

  const onRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  const workOrders = query.data ?? [];

  const openCount = useMemo(
    () =>
      workOrders.filter((w) => w.status !== 'completed' && w.status !== 'rejected').length,
    [workOrders],
  );

  const filteredWorkOrders = useMemo(() => {
    let filtered = workOrders;

    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((w) => {
        const title = (w.maintenanceRequest.title || '').toLowerCase();
        const description = (w.maintenanceRequest.description || '').toLowerCase();
        const propertyName = (w.property?.name || '').toLowerCase();
        const blockName = (w.block?.name || '').toLowerCase();
        const status = (w.status || '').toLowerCase().replace(/_/g, ' ');
        const priority = (w.maintenanceRequest.priority || '').toLowerCase();
        const id = shortId(w.id).toLowerCase();
        return (
          title.includes(searchLower) ||
          description.includes(searchLower) ||
          propertyName.includes(searchLower) ||
          blockName.includes(searchLower) ||
          status.includes(searchLower) ||
          priority.includes(searchLower) ||
          id.includes(searchLower)
        );
      });
    }

    if (filterProperty !== 'all') {
      filtered = filtered.filter(
        (w) =>
          w.property?.id === filterProperty ||
          w.maintenanceRequest.propertyId === filterProperty,
      );
    }

    if (filterBlock !== 'all') {
      const blockPropertyIds = properties
        .filter((p) => p.blockId === filterBlock)
        .map((p) => p.id);
      filtered = filtered.filter(
        (w) =>
          w.block?.id === filterBlock ||
          w.maintenanceRequest.blockId === filterBlock ||
          (!!w.maintenanceRequest.propertyId &&
            blockPropertyIds.includes(w.maintenanceRequest.propertyId)) ||
          (!!w.property?.id && blockPropertyIds.includes(w.property.id)),
      );
    }

    if (filterPriority !== 'all') {
      filtered = filtered.filter(
        (w) => w.maintenanceRequest.priority === filterPriority,
      );
    }

    return filtered;
  }, [workOrders, searchTerm, filterProperty, filterBlock, filterPriority, properties]);

  const hasActiveFilters =
    !!searchTerm.trim() ||
    filterBlock !== 'all' ||
    filterProperty !== 'all' ||
    filterPriority !== 'all';

  if (query.isLoading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <LoadingSpinner />
      </View>
    );
  }

  if (query.isError) {
    return (
      <View
        style={[
          styles.centered,
          { padding: spacing.lg, paddingTop: insets.top, backgroundColor: themeColors.background },
        ]}
      >
        <Text
          style={{
            color: themeColors.text?.primary,
            fontWeight: '600',
            marginBottom: spacing.sm,
            textAlign: 'center',
          }}
        >
          We couldn't load work orders
        </Text>
        <Button title="Try again" onPress={() => void query.refetch()} />
      </View>
    );
  }

  const renderItem = ({ item }: { item: WorkOrder }) => {
    const status = STATUS_META[item.status] || STATUS_META.assigned;
    const priority =
      PRIORITY_META[item.maintenanceRequest.priority] || PRIORITY_META.medium;
    const location = [item.property?.name, item.block?.name].filter(Boolean).join(' · ');
    const due = formatDue(item.slaDue);
    const overdue = isOverdue(item.slaDue, item.status);
    const softStatusBg = isDark ? status.color + '33' : status.softBg;
    const softPriorityBg = isDark ? priority.color + '33' : priority.softBg;
    const accentColor = overdue ? '#DC2626' : status.color;

    return (
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={() => navigation.navigate('WorkOrderDetail', { workOrderId: item.id })}
        accessibilityRole="button"
        accessibilityLabel={`View work order ${item.maintenanceRequest.title}, ${statusLabel(item.status)}`}
        style={styles.cardPressable}
      >
        <Card
          style={[
            styles.card,
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
                  <Text style={[styles.ref, { color: themeColors.text.secondary }]} numberOfLines={1}>
                    {shortId(item.id)}
                  </Text>
                </View>
                <View style={[styles.chip, { backgroundColor: softStatusBg }]}>
                  <View style={[styles.chipDot, { backgroundColor: status.color }]} />
                  <Text style={[styles.chipText, { color: status.color }]}>
                    {status.label}
                  </Text>
                </View>
              </View>

              <Text style={[styles.title, { color: themeColors.text.primary }]} numberOfLines={2}>
                {item.maintenanceRequest.title}
              </Text>

              <View style={styles.metaBlock}>
                {!!location && (
                  <View style={styles.metaRow}>
                    <MapPin size={moderateScale(14)} color={themeColors.text.secondary} />
                    <Text
                      style={[styles.metaText, { color: themeColors.text.secondary }]}
                      numberOfLines={1}
                    >
                      {location}
                    </Text>
                  </View>
                )}
                {due ? (
                  <View style={styles.metaRow}>
                    {overdue ? (
                      <AlertTriangle size={moderateScale(14)} color="#DC2626" />
                    ) : (
                      <Calendar size={moderateScale(14)} color={themeColors.text.secondary} />
                    )}
                    <Text
                      style={[
                        styles.metaText,
                        { color: overdue ? '#DC2626' : themeColors.text.secondary },
                        overdue && styles.metaStrong,
                      ]}
                      numberOfLines={1}
                    >
                      {overdue ? `Overdue · ${due}` : `Due ${due}`}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View
                style={[
                  styles.cardFooter,
                  { borderTopColor: themeColors.border?.light || themeColors.border.DEFAULT },
                ]}
              >
                <View style={[styles.chip, { backgroundColor: softPriorityBg }]}>
                  <Text style={[styles.chipText, { color: priority.color }]}>
                    {priority.label} priority
                  </Text>
                </View>
                <View style={styles.openCta}>
                  <Text style={[styles.openLabel, { color: themeColors.primary.DEFAULT }]}>
                    Open
                  </Text>
                  <View
                    style={[
                      styles.openArrow,
                      { backgroundColor: themeColors.primary.DEFAULT + (isDark ? '33' : '14') },
                    ]}
                  >
                    <ChevronRight size={moderateScale(16)} color={themeColors.primary.DEFAULT} />
                  </View>
                </View>
              </View>
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.fixedHeader, { backgroundColor: themeColors.card.DEFAULT }]}>
        <ScreenHeader
          title="Work Orders"
          subtitle={
            isAssignee
              ? workOrders.length > 0
                ? `${openCount} active · ${workOrders.length} total assigned to you`
                : 'Assigned to you'
              : workOrders.length > 0
                ? `${openCount} active · ${workOrders.length} total`
                : 'Organization work orders'
          }
          includeSafeArea
          style={{ borderBottomWidth: 0, paddingBottom: spacing[2] }}
        />

        <View
          style={[
            styles.searchContainer,
            {
              borderColor: themeColors.border?.light || themeColors.border.DEFAULT,
              backgroundColor: isDark ? themeColors.background : '#F8FAFC',
            },
          ]}
        >
          <Search size={16} color={themeColors.text.secondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text.primary }]}
            placeholder="Search work orders..."
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
      </View>

      <FlatList
        data={filteredWorkOrders}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          filteredWorkOrders.length === 0 && styles.listEmpty,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        refreshControl={
          <RefreshControl refreshing={!!query.isRefetching} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
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
        }
        ListEmptyComponent={
          <EmptyState
            icon={<ClipboardList size={moderateScale(40)} color={themeColors.text.secondary} />}
            title={hasActiveFilters ? 'No Work Orders Found' : 'No Work Orders Assigned'}
            message={
              hasActiveFilters
                ? 'Try adjusting your search or filters'
                : "You currently don't have any Work Orders assigned to you. New assignments will appear here."
            }
          />
        }
      />

      <Modal
        visible={showBlockFilter}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBlockFilter(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: themeColors.background,
                paddingBottom: Math.max(insets.bottom || 0, spacing[6]) + spacing[4],
                maxHeight: modalMaxHeight(0.9),
              },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>
                Filter by Block
              </Text>
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
                      backgroundColor:
                        filterBlock === item.id
                          ? themeColors.primary.light
                          : themeColors.card.DEFAULT,
                      borderColor:
                        filterBlock === item.id ? themeColors.primary.DEFAULT : 'transparent',
                      borderWidth: filterBlock === item.id ? 1 : 0,
                    },
                  ]}
                  onPress={() => {
                    setFilterBlock(item.id);
                    if (item.id !== 'all') setFilterProperty('all');
                    setShowBlockFilter(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      {
                        color:
                          filterBlock === item.id
                            ? themeColors.primary.DEFAULT
                            : themeColors.text.primary,
                      },
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

      <Modal
        visible={showPropertyFilter}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPropertyFilter(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: themeColors.background,
                paddingBottom: Math.max(insets.bottom || 0, spacing[6]) + spacing[4],
                maxHeight: modalMaxHeight(0.9),
              },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>
                Filter by Property
              </Text>
              <TouchableOpacity
                onPress={() => setShowPropertyFilter(false)}
                style={[styles.modalCloseButton, { backgroundColor: themeColors.card.DEFAULT }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalClose, { color: themeColors.text.secondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={[
                { id: 'all', name: 'All Properties' },
                ...properties.filter((p) => filterBlock === 'all' || p.blockId === filterBlock),
              ]}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    {
                      backgroundColor:
                        filterProperty === item.id
                          ? themeColors.primary.light
                          : themeColors.card.DEFAULT,
                      borderColor:
                        filterProperty === item.id
                          ? themeColors.primary.DEFAULT
                          : 'transparent',
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
                      {
                        color:
                          filterProperty === item.id
                            ? themeColors.primary.DEFAULT
                            : themeColors.text.primary,
                      },
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

      <Modal
        visible={showPriorityFilter}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPriorityFilter(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: themeColors.background,
                paddingBottom: Math.max(insets.bottom || 0, spacing[6]) + spacing[4],
                maxHeight: modalMaxHeight(0.9),
              },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>
                Filter by Priority
              </Text>
              <TouchableOpacity
                onPress={() => setShowPriorityFilter(false)}
                style={[styles.modalCloseButton, { backgroundColor: themeColors.card.DEFAULT }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalClose, { color: themeColors.text.secondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={['all', 'low', 'medium', 'high', 'urgent']}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    {
                      backgroundColor:
                        filterPriority === item
                          ? themeColors.primary.light
                          : themeColors.card.DEFAULT,
                      borderColor:
                        filterPriority === item ? themeColors.primary.DEFAULT : 'transparent',
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
                      {
                        color:
                          filterPriority === item
                            ? themeColors.primary.DEFAULT
                            : themeColors.text.primary,
                      },
                    ]}
                  >
                    {item === 'all'
                      ? 'All'
                      : item.charAt(0).toUpperCase() + item.slice(1)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fixedHeader: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    zIndex: 10,
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
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    gap: spacing[3],
  },
  listEmpty: {
    flexGrow: 1,
  },
  cardPressable: {
    marginBottom: spacing[1],
  },
  card: {
    overflow: 'hidden',
    borderRadius: borderRadius.xl,
  },
  cardInner: {
    flexDirection: 'row',
    minHeight: moderateScale(132),
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
  ref: {
    fontSize: getFontSize(12),
    fontWeight: '600',
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  title: {
    fontSize: getFontSize(17),
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: getFontSize(22),
  },
  metaBlock: {
    gap: spacing[1] + 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  metaText: {
    fontSize: getFontSize(13),
    flex: 1,
    minWidth: 0,
  },
  metaStrong: {
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[1],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
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
  openCta: {
    flexDirection: 'row',
    alignItems: 'center',
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
  modalItemText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
});
