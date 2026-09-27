import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  Wrench,
  Users,
  User,
  Banknote,
  FileText,
  AlertTriangle,
  Paperclip,
} from 'lucide-react-native';
import { format } from 'date-fns';
import { maintenanceService } from '../../services/maintenance';
import { WorkOrderCertificateSheet } from '../../components/WorkOrderCertificateSheet';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import DatePicker from '../../components/ui/DatePicker';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { getFontSize, moderateScale } from '../../utils/responsive';
import type { WorkOrdersStackParamList } from '../../navigation/types';

const STATUS_META: Record<string, { label: string; color: string; softBg: string }> = {
  assigned: { label: 'Assigned', color: '#2563EB', softBg: '#DBEAFE' },
  in_progress: { label: 'In Progress', color: '#CA8A04', softBg: '#FEF9C3' },
  waiting_parts: { label: 'Waiting Parts', color: '#EA580C', softBg: '#FFEDD5' },
  completed: { label: 'Completed', color: '#16A34A', softBg: '#DCFCE7' },
  rejected: { label: 'Rejected', color: '#DC2626', softBg: '#FEE2E2' },
};

const PRIORITY_META: Record<string, { label: string; color: string; softBg: string }> = {
  low: { label: 'Low', color: '#4B5563', softBg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#2563EB', softBg: '#DBEAFE' },
  high: { label: 'High', color: '#EA580C', softBg: '#FFEDD5' },
  urgent: { label: 'Urgent', color: '#DC2626', softBg: '#FEE2E2' },
};

const ASSIGNEE_STATUSES = [
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting_parts', label: 'Waiting Parts' },
  { value: 'completed', label: 'Completed' },
] as const;

const OWNER_STATUSES = [
  ...ASSIGNEE_STATUSES,
  { value: 'rejected', label: 'Rejected' },
] as const;

function centsToMajorString(cents?: number | null): string {
  if (cents == null || Number.isNaN(Number(cents))) return '';
  return (Number(cents) / 100).toFixed(2);
}

function parseSlaDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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

export default function WorkOrderDetailScreen() {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const isDark = !!theme?.isDark;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<WorkOrdersStackParamList>>();
  const route = useRoute<RouteProp<WorkOrdersStackParamList, 'WorkOrderDetail'>>();
  const { workOrderId } = route.params;
  const [showCertificates, setShowCertificates] = useState(false);
  const [editing, setEditing] = useState(false);

  const isOwner = user?.role === 'owner';
  const canUpdateStatus = user?.role === 'clerk' || user?.role === 'contractor' || isOwner;
  const isTerminal = (status: string) => status === 'completed' || status === 'rejected';

  const [editTeamId, setEditTeamId] = useState('unassigned');
  const [editAssignedToId, setEditAssignedToId] = useState('');
  const [editStatus, setEditStatus] = useState('assigned');
  const [editCostEstimate, setEditCostEstimate] = useState('');
  const [editSlaDue, setEditSlaDue] = useState<Date | null>(null);
  const [editNotes, setEditNotes] = useState('');

  const query = useQuery({
    queryKey: ['/api/work-orders', workOrderId],
    queryFn: async () => {
      const list = await maintenanceService.getWorkOrders();
      const found = list.find((w) => w.id === workOrderId);
      if (found) return found;
      return maintenanceService.getWorkOrder(workOrderId);
    },
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['/api/teams'],
    queryFn: () => maintenanceService.getTeams(),
    enabled: isOwner,
  });

  const memberTeamId = editTeamId !== 'unassigned' ? editTeamId : '';
  const { data: teamMembers = [], isFetching: isLoadingMembers } = useQuery({
    queryKey: ['/api/teams', memberTeamId, 'members'],
    queryFn: () => maintenanceService.getTeamMembers(memberTeamId),
    enabled: isOwner && !!memberTeamId && editing,
  });

  const { data: workLogs = [], isError: workLogsError } = useQuery({
    queryKey: [`/api/work-orders/${workOrderId}/logs`],
    queryFn: () => maintenanceService.getWorkOrderLogs(workOrderId),
    enabled: isOwner && editing,
  });

  const syncEditForm = useCallback(() => {
    const wo = query.data;
    if (!wo) return;
    setEditTeamId(wo.teamId || wo.team?.id || 'unassigned');
    setEditAssignedToId(wo.assignedToId || '');
    setEditStatus(wo.status);
    setEditCostEstimate(centsToMajorString(wo.costEstimate));
    setEditSlaDue(parseSlaDate(wo.slaDue));
    setEditNotes(wo.notes || '');
  }, [query.data]);

  useEffect(() => {
    if (editing) syncEditForm();
  }, [editing, syncEditForm]);

  useEffect(() => {
    if (!editing) return;
    if (editTeamId === 'unassigned') {
      setEditAssignedToId('');
    }
  }, [editTeamId, editing]);

  const statusMutation = useMutation({
    mutationFn: (status: string) => maintenanceService.updateWorkOrderStatus(workOrderId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders', workOrderId] });
    },
    onError: () => {
      Alert.alert('Error', 'Failed to update work order status');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof maintenanceService.updateWorkOrder>[1]) =>
      maintenanceService.updateWorkOrder(workOrderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders', workOrderId] });
      setEditing(false);
      Alert.alert('Success', 'Work order updated successfully');
    },
    onError: (error: any) => {
      Alert.alert('Error', error?.message || 'Failed to update work order');
    },
  });

  const onRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  const openStatusPicker = () => {
    if (!query.data || isTerminal(query.data.status)) return;
    Alert.alert(
      'Update Status',
      'Select a new status for this work order',
      [
        ...ASSIGNEE_STATUSES.map((s) => ({
          text: s.label,
          onPress: () => statusMutation.mutate(s.value),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const teamOptions = useMemo(
    () => [
      { value: 'unassigned', label: 'Unassigned' },
      ...teams
        .filter((t) => t.isActive !== false)
        .map((t) => ({ value: t.id, label: t.name })),
    ],
    [teams],
  );

  const memberOptions = useMemo(
    () =>
      teamMembers
        .map((member) => {
          const person = member.user || member.contact;
          const value = member.userId || member.contactId;
          if (!person || !value) return null;
          const kind = member.userId ? 'Inspector / Staff' : 'Maintenance Contractor';
          const name = `${person.firstName || ''} ${person.lastName || ''}`.trim();
          const email = person.email ? ` (${person.email})` : '';
          return { value, label: `${name}${email} — ${kind}` };
        })
        .filter((opt): opt is { value: string; label: string } => !!opt),
    [teamMembers],
  );

  const statusOptions = useMemo(
    () => OWNER_STATUSES.map((s) => ({ value: s.value, label: s.label })),
    [],
  );

  const handleSaveEdit = () => {
    if (!query.data) return;

    const costParsed = editCostEstimate.trim() ? parseFloat(editCostEstimate) : NaN;
    const teamId = editTeamId === 'unassigned' ? null : editTeamId || null;

    const payload: Parameters<typeof maintenanceService.updateWorkOrder>[1] = {
      status: editStatus,
      costEstimate: Number.isFinite(costParsed) ? Math.round(costParsed * 100) : null,
      slaDue: editSlaDue
        ? new Date(
            editSlaDue.getFullYear(),
            editSlaDue.getMonth(),
            editSlaDue.getDate(),
            12,
            0,
            0,
          ).toISOString()
        : null,
      notes: editNotes.trim() || null,
      teamId,
    };

    if (teamId && editAssignedToId) {
      const member = teamMembers.find(
        (m) => m.userId === editAssignedToId || m.contactId === editAssignedToId,
      );
      payload.assignedToId =
        member?.userId || member?.contact?.linkedUserId || editAssignedToId;
      payload.contractorId = member?.contactId || null;
    } else if (teamId === null) {
      payload.assignedToId = null;
      payload.contractorId = null;
    }

    updateMutation.mutate(payload);
  };

  if (query.isLoading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <LoadingSpinner />
      </View>
    );
  }

  if (query.isError || !query.data) {
    return (
      <View
        style={[
          styles.centered,
          { padding: spacing[6], paddingTop: insets.top, backgroundColor: themeColors.background },
        ]}
      >
        <Text style={{ color: themeColors.text?.primary, fontWeight: '600', marginBottom: spacing[2] }}>
          Work order not found or access denied
        </Text>
        <Button title="Go back" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  const wo = query.data;
  const status = STATUS_META[wo.status] || STATUS_META.assigned;
  const priority =
    PRIORITY_META[wo.maintenanceRequest.priority] || PRIORITY_META.medium;
  const location = [wo.property?.name, wo.block?.name].filter(Boolean).join(' · ');
  const due = wo.slaDue
    ? new Date(wo.slaDue).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;
  const overdue = isOverdue(wo.slaDue, wo.status);
  const softStatusBg = isDark ? status.color + '33' : status.softBg;
  const softPriorityBg = isDark ? priority.color + '33' : priority.softBg;
  const accentColor = overdue ? '#DC2626' : status.color;
  const iconBubbleBg = isDark ? themeColors.primary.light : '#E0F7FA';
  const softPanelBg = isDark ? themeColors.card.DEFAULT : '#F8FAFC';
  const contractorName = wo.contractor
    ? `${wo.contractor.firstName || ''} ${wo.contractor.lastName || ''}`.trim()
    : '';
  const description = wo.maintenanceRequest.description?.trim() || '';

  const InfoRow = ({
    icon,
    label,
    value,
    valueColor,
    warn,
  }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    valueColor?: string;
    warn?: boolean;
  }) => (
    <View style={[styles.infoRow, { backgroundColor: softPanelBg }]}>
      <View
        style={[
          styles.infoIcon,
          {
            backgroundColor: warn
              ? isDark
                ? '#DC262633'
                : '#FEE2E2'
              : iconBubbleBg,
          },
        ]}
      >
        {icon}
      </View>
      <View style={styles.infoTextCol}>
        <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>{label}</Text>
        <Text
          style={[
            styles.infoValue,
            { color: valueColor || themeColors.text.primary },
            warn && styles.infoValueWarn,
          ]}
          numberOfLines={3}
        >
          {value}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background, paddingTop: insets.top }}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: themeColors.card.DEFAULT,
            borderBottomColor: themeColors.border?.light || themeColors.border.DEFAULT,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backBtn}
        >
          <ArrowLeft size={moderateScale(22)} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text.primary }]} numberOfLines={1}>
          {editing ? 'Edit Work Order' : 'Work Order'}
        </Text>
        <View style={{ width: moderateScale(40) }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing[4],
          paddingBottom: insets.bottom + spacing[8],
          gap: spacing[3],
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={!!query.isRefetching} onRefresh={onRefresh} />
        }
      >
        {/* Hero summary */}
        {!editing && (
          <Card
            style={[
              styles.heroCard,
              Platform.select({
                ios: shadows.sm,
                android: { elevation: 2 },
              }),
            ]}
            variant="elevated"
            padding="none"
          >
            <View style={styles.heroInner}>
              <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
              <View style={styles.heroBody}>
                <View style={styles.heroTop}>
                  <View style={styles.refRow}>
                    <View style={[styles.iconBubble, { backgroundColor: iconBubbleBg }]}>
                      <Wrench size={moderateScale(14)} color={themeColors.primary.DEFAULT} />
                    </View>
                    <Text style={[styles.ref, { color: themeColors.text.secondary }]} numberOfLines={1}>
                      {shortId(wo.id)}
                    </Text>
                  </View>
                  <View style={[styles.chip, { backgroundColor: softStatusBg }]}>
                    <View style={[styles.chipDot, { backgroundColor: status.color }]} />
                    <Text style={[styles.chipText, { color: status.color }]}>{status.label}</Text>
                  </View>
                </View>

                <Text style={[styles.title, { color: themeColors.text.primary }]}>
                  {wo.maintenanceRequest.title}
                </Text>

                <View style={[styles.chip, { backgroundColor: softPriorityBg, alignSelf: 'flex-start' }]}>
                  <Text style={[styles.chipText, { color: priority.color }]}>
                    {priority.label} priority
                  </Text>
                </View>
              </View>
            </View>
          </Card>
        )}

        {/* Location & schedule */}
        {(location || due) && !editing && (
          <Card
            style={[
              styles.sectionCard,
              Platform.select({
                ios: shadows.sm,
                android: { elevation: 1 },
              }),
            ]}
            variant="elevated"
            padding="md"
          >
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
              Location & Schedule
            </Text>
            <View style={styles.infoStack}>
              {!!location && (
                <InfoRow
                  icon={<MapPin size={16} color={themeColors.primary.DEFAULT} />}
                  label="Location"
                  value={location}
                />
              )}
              {!!due && (
                <InfoRow
                  icon={
                    overdue ? (
                      <AlertTriangle size={16} color="#DC2626" />
                    ) : (
                      <Calendar size={16} color={themeColors.primary.DEFAULT} />
                    )
                  }
                  label={overdue ? 'Due date (overdue)' : 'Due date'}
                  value={due}
                  valueColor={overdue ? '#DC2626' : undefined}
                  warn={overdue}
                />
              )}
            </View>
          </Card>
        )}

        {/* Work details */}
        {!editing && (
          <Card
            style={[
              styles.sectionCard,
              Platform.select({
                ios: shadows.sm,
                android: { elevation: 1 },
              }),
            ]}
            variant="elevated"
            padding="md"
          >
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
              Work Details
            </Text>

            <View style={[styles.descriptionBox, { backgroundColor: softPanelBg }]}>
              <View style={styles.descriptionHeader}>
                <FileText size={14} color={themeColors.text.secondary} />
                <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>
                  Description
                </Text>
              </View>
              <Text
                style={[
                  styles.body,
                  {
                    color: description
                      ? themeColors.text.primary
                      : themeColors.text.secondary,
                    fontStyle: description ? 'normal' : 'italic',
                  },
                ]}
              >
                {description || 'No description provided'}
              </Text>
            </View>

            <View style={[styles.infoStack, { marginTop: spacing[3] }]}>
              {wo.team?.name ? (
                <InfoRow
                  icon={<Users size={16} color={themeColors.primary.DEFAULT} />}
                  label="Team"
                  value={wo.team.name}
                />
              ) : null}
              {contractorName ? (
                <InfoRow
                  icon={<User size={16} color={themeColors.primary.DEFAULT} />}
                  label="Contractor"
                  value={
                    wo.contractor?.email
                      ? `${contractorName}\n${wo.contractor.email}`
                      : contractorName
                  }
                />
              ) : null}
              {wo.costEstimate != null ? (
                <InfoRow
                  icon={<Banknote size={16} color={themeColors.primary.DEFAULT} />}
                  label="Estimated cost"
                  value={`£${centsToMajorString(wo.costEstimate)}`}
                />
              ) : null}
              {wo.notes?.trim() ? (
                <InfoRow
                  icon={<FileText size={16} color={themeColors.primary.DEFAULT} />}
                  label="Notes"
                  value={wo.notes.trim()}
                />
              ) : null}
            </View>
          </Card>
        )}

        {editing && isOwner && (
          <Card>
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Assigned To</Text>
            <Select
              value={editTeamId}
              options={teamOptions}
              placeholder="Select a team..."
              onValueChange={(value) => {
                setEditTeamId(value);
                setEditAssignedToId('');
              }}
            />
            {wo.contractor && (
              <Text style={[styles.hint, { color: themeColors.text.secondary }]}>
                Maintenance Contractor: {wo.contractor.firstName} {wo.contractor.lastName}
                {wo.contractor.email ? ` (${wo.contractor.email})` : ''}
              </Text>
            )}

            {editTeamId !== 'unassigned' && (
              <>
                <Text style={[styles.fieldLabel, { color: themeColors.text.primary, marginTop: spacing[4] }]}>
                  Assign to Team Member
                </Text>
                <Select
                  value={editAssignedToId || undefined}
                  placeholder={
                    isLoadingMembers
                      ? 'Loading members...'
                      : memberOptions.length === 0
                        ? 'No members on this team'
                        : 'Select inspector or contractor'
                  }
                  disabled={isLoadingMembers || memberOptions.length === 0}
                  options={memberOptions}
                  onValueChange={setEditAssignedToId}
                />
              </>
            )}

            <Text style={[styles.fieldLabel, { color: themeColors.text.primary, marginTop: spacing[4] }]}>
              Status
            </Text>
            <Select
              value={editStatus}
              options={statusOptions}
              onValueChange={setEditStatus}
            />

            <View style={{ marginTop: spacing[4] }}>
              <Input
                label="Cost Estimate"
                value={editCostEstimate}
                onChangeText={setEditCostEstimate}
                placeholder="Enter cost"
                keyboardType="decimal-pad"
              />
            </View>

            <View style={{ marginTop: spacing[2] }}>
              <DatePicker
                label="SLA Due Date"
                value={editSlaDue}
                onChange={setEditSlaDue}
                placeholder="Select due date"
              />
            </View>

            <View style={{ marginTop: spacing[2] }}>
              <Input
                label="Notes"
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Add notes about this work order..."
                multiline
                numberOfLines={3}
                style={{ minHeight: 72, textAlignVertical: 'top' }}
              />
            </View>

            <View style={[styles.activitySection, { borderTopColor: themeColors.border.DEFAULT }]}>
              <View style={styles.activityHeader}>
                <Clock size={16} color={themeColors.text.primary} />
                <Text style={[styles.sectionTitle, { color: themeColors.text.primary, marginBottom: 0 }]}>
                  Activity Updates
                </Text>
              </View>
              <View style={[styles.activityBox, { backgroundColor: softPanelBg }]}>
                {wo.createdAt ? (
                  <View style={styles.activityRow}>
                    <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.activityTitle, { color: themeColors.text.primary }]}>
                        Work order created
                      </Text>
                      <Text style={[styles.activityMeta, { color: themeColors.text.secondary }]}>
                        {format(new Date(wo.createdAt), "MMM d, yyyy 'at' h:mm a")}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {workLogsError ? (
                  <Text style={[styles.hint, { color: themeColors.text.secondary, textAlign: 'center' }]}>
                    Unable to load activity
                  </Text>
                ) : workLogs.length > 0 ? (
                  workLogs.map((log) => (
                    <View key={log.id} style={styles.activityRow}>
                      <View style={[styles.dot, { backgroundColor: '#3B82F6' }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.activityTitle, { color: themeColors.text.primary }]}>
                          {log.note}
                        </Text>
                        <Text style={[styles.activityMeta, { color: themeColors.text.secondary }]}>
                          {format(new Date(log.createdAt), "MMM d, yyyy 'at' h:mm a")}
                          {log.timeSpentMinutes ? ` - ${log.timeSpentMinutes} min` : ''}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.hint, { color: themeColors.text.secondary, textAlign: 'center' }]}>
                    No activity updates yet
                  </Text>
                )}

                {wo.updatedAt && wo.updatedAt !== wo.createdAt ? (
                  <View style={styles.activityRow}>
                    <View style={[styles.dot, { backgroundColor: '#EAB308' }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.activityTitle, { color: themeColors.text.primary }]}>
                        Last updated
                      </Text>
                      <Text style={[styles.activityMeta, { color: themeColors.text.secondary }]}>
                        {format(new Date(wo.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          </Card>
        )}

        <View style={styles.actions}>
          {isOwner && !editing && (
            <Button title="Edit Work Order" onPress={() => setEditing(true)} />
          )}
          {isOwner && editing && (
            <>
              <Button
                title={updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                onPress={handleSaveEdit}
                disabled={updateMutation.isPending}
              />
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setEditing(false)}
                disabled={updateMutation.isPending}
              />
            </>
          )}
          {!editing && canUpdateStatus && !isTerminal(wo.status) && !isOwner && (
            <Button
              title={statusMutation.isPending ? 'Updating…' : 'Update Status'}
              onPress={openStatusPicker}
              disabled={statusMutation.isPending}
            />
          )}
          <Button
            title="Certificates / Attachments"
            variant="outline"
            onPress={() => setShowCertificates(true)}
            icon={<Paperclip size={16} color={themeColors.primary.DEFAULT} />}
          />
        </View>
      </ScrollView>

      <WorkOrderCertificateSheet
        visible={showCertificates}
        workOrderId={wo.id}
        workOrderTitle={wo.maintenanceRequest.title}
        onClose={() => setShowCertificates(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: moderateScale(40),
    height: moderateScale(40),
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: getFontSize(17),
    fontWeight: '700',
  },
  heroCard: {
    overflow: 'hidden',
    borderRadius: borderRadius.xl,
  },
  heroInner: {
    flexDirection: 'row',
    minHeight: moderateScale(120),
  },
  accentBar: {
    width: 4,
  },
  heroBody: {
    flex: 1,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[2],
  },
  heroTop: {
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
    fontSize: getFontSize(20),
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: getFontSize(26),
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
  sectionCard: {
    borderRadius: borderRadius.xl,
  },
  sectionTitle: {
    fontSize: getFontSize(15),
    fontWeight: '700',
    marginBottom: spacing[3],
    letterSpacing: -0.2,
  },
  fieldLabel: {
    fontSize: getFontSize(13),
    fontWeight: '600',
    marginBottom: spacing[1],
  },
  infoStack: {
    gap: spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: borderRadius.lg,
  },
  infoIcon: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  infoLabel: {
    fontSize: getFontSize(11),
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoValue: {
    fontSize: getFontSize(14),
    fontWeight: '600',
    lineHeight: getFontSize(20),
  },
  infoValueWarn: {
    fontWeight: '700',
  },
  descriptionBox: {
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    gap: spacing[2],
  },
  descriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  body: {
    fontSize: getFontSize(14),
    lineHeight: getFontSize(21),
  },
  hint: {
    fontSize: getFontSize(12),
    marginTop: spacing[1],
    lineHeight: getFontSize(16),
  },
  actions: {
    gap: spacing[2],
    marginTop: spacing[1],
  },
  activitySection: {
    marginTop: spacing[6],
    paddingTop: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  activityBox: {
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    gap: spacing[2],
    maxHeight: 180,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  activityTitle: {
    fontSize: getFontSize(12),
    fontWeight: '600',
  },
  activityMeta: {
    fontSize: getFontSize(11),
    marginTop: 2,
  },
});
