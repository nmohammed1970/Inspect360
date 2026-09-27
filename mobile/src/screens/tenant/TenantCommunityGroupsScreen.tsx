import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Plus, Users } from 'lucide-react-native';
import { tenantService, type TenantCommunityGroup } from '../../services/tenant';
import { useTheme } from '../../contexts/ThemeContext';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import EmptyState from '../../components/ui/EmptyState';
import { colors, spacing, borderRadius } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import { getFontSize, moderateScale } from '../../utils/responsive';
import { getAPI_URL } from '../../services/api';
import type { TenantCommunityStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<TenantCommunityStackParamList, 'TenantCommunityGroups'>;

function resolveCoverUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  if (url.startsWith('/')) return `${getAPI_URL()}${url}`;
  return `${getAPI_URL()}/objects/${url}`;
}

export default function TenantCommunityGroupsScreen({ navigation }: Props) {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const { getFontSize, getButtonHeight, moderateScale, stackDirection, modalMaxHeight } = useResponsive();
  const queryClient = useQueryClient();
  const actionsDirection = stackDirection(360);

  const [showCreate, setShowCreate] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [rulesChecked, setRulesChecked] = useState(false);
  const [pendingJoinId, setPendingJoinId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const rulesQuery = useQuery({
    queryKey: ['/api/tenant-portal/community/rules'],
    queryFn: () => tenantService.getCommunityRules(),
  });

  const groupsQuery = useQuery({
    queryKey: ['/api/tenant-portal/community/groups'],
    queryFn: () => tenantService.getCommunityGroups(),
  });

  const requiresRules =
    !!rulesQuery.data && rulesQuery.data.version > 0 && !rulesQuery.data.hasAccepted;

  const acceptRulesMutation = useMutation({
    mutationFn: () => tenantService.acceptCommunityRules(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/tenant-portal/community/rules'] });
      setShowRules(false);
      setRulesChecked(false);
      if (pendingJoinId) {
        joinMutation.mutate(pendingJoinId);
        setPendingJoinId(null);
      }
      Alert.alert('Rules accepted', 'You can now participate in community discussions.');
    },
    onError: (e: any) => Alert.alert('Error', e?.message || 'Failed to accept rules'),
  });

  const joinMutation = useMutation({
    mutationFn: (groupId: string) => tenantService.joinCommunityGroup(groupId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/tenant-portal/community/groups'] });
      Alert.alert('Joined group', 'You are now a member of this group.');
    },
    onError: (e: any) => Alert.alert('Error', e?.message || 'Failed to join group'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      tenantService.createCommunityGroup({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/tenant-portal/community/groups'] });
      setShowCreate(false);
      setNewName('');
      setNewDescription('');
      Alert.alert(
        'Group created',
        'Your group is pending approval from the property manager.',
      );
    },
    onError: (e: any) => Alert.alert('Error', e?.message || 'Failed to create group'),
  });

  const onRefresh = useCallback(() => {
    void rulesQuery.refetch();
    void groupsQuery.refetch();
  }, [rulesQuery, groupsQuery]);

  const groups = groupsQuery.data ?? [];

  const openGroup = (group: TenantCommunityGroup) => {
    navigation.navigate('TenantCommunityThreads', {
      groupId: group.id,
      groupName: group.name,
      isMember: !!group.isMember,
    });
  };

  const handleJoin = (group: TenantCommunityGroup) => {
    if (requiresRules) {
      setPendingJoinId(group.id);
      setShowRules(true);
      return;
    }
    joinMutation.mutate(group.id);
  };

  const handleCreatePress = () => {
    if (requiresRules) {
      setShowRules(true);
      return;
    }
    setShowCreate(true);
  };

  const headerNote = useMemo(() => {
    if (requiresRules) return 'Accept community rules before joining or posting.';
    return 'Groups for your building and neighbours';
  }, [requiresRules]);

  if (rulesQuery.isLoading || groupsQuery.isLoading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <LoadingSpinner />
      </View>
    );
  }

  if (groupsQuery.isError) {
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
          We couldn't load community groups
        </Text>
        <Button title="Try again" onPress={() => void groupsQuery.refetch()} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background, paddingTop: insets.top }}>
      <View style={styles.pageHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.pageTitle, { color: themeColors.text?.primary }]}>Community</Text>
          <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(13) }}>{headerNote}</Text>
        </View>
        <Button
          title="New"
          size="sm"
          icon={<Plus size={14} color="#fff" />}
          onPress={handleCreatePress}
        />
      </View>

      {requiresRules ? (
        <TouchableOpacity
          onPress={() => setShowRules(true)}
          style={[styles.rulesBanner, { borderColor: '#f97316', backgroundColor: '#FFF7ED' }]}
        >
          <AlertTriangle size={18} color="#ea580c" />
          <Text style={{ color: '#9a3412', flex: 1, fontSize: getFontSize(13), fontWeight: '600' }}>
            Community rules require your acceptance
          </Text>
        </TouchableOpacity>
      ) : null}

      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          flexGrow: 1,
          gap: spacing.sm,
        }}
        refreshControl={
          <RefreshControl
            refreshing={groupsQuery.isRefetching || rulesQuery.isRefetching}
            onRefresh={onRefresh}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="No groups yet"
            message="Create a group or wait for your property manager to set one up."
            icon={<Users size={moderateScale(40)} color={themeColors.text?.secondary} />}
          />
        }
        renderItem={({ item }: { item: TenantCommunityGroup }) => {
          const cover = resolveCoverUrl(item.coverImageUrl);
          return (
          <Card>
            {cover ? (
              <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" />
            ) : null}
            <TouchableOpacity onPress={() => openGroup(item)} activeOpacity={0.85}>
              <Text style={[styles.itemTitle, { color: themeColors.text?.primary }]}>{item.name}</Text>
              {item.description ? (
                <Text
                  style={{ color: themeColors.text?.secondary, marginTop: 4, fontSize: getFontSize(13) }}
                  numberOfLines={3}
                >
                  {item.description}
                </Text>
              ) : null}
              <Text
                style={{
                  color: themeColors.text?.secondary,
                  marginTop: spacing.sm,
                  fontSize: getFontSize(12),
                }}
              >
                {item.isMember ? 'Member' : 'Not a member'}
                {item.memberCount != null ? ` · ${item.memberCount} members` : ''}
                {item.postCount != null ? ` · ${item.postCount} posts` : ''}
                {item.status && item.status !== 'active' ? ` · ${item.status}` : ''}
              </Text>
            </TouchableOpacity>
            <View style={[styles.rowActions, { flexDirection: actionsDirection }]}>
              <Button
                title="Open"
                variant="outline"
                size="sm"
                onPress={() => openGroup(item)}
                style={{ flex: actionsDirection === 'row' ? 1 : undefined, width: actionsDirection === 'column' ? '100%' : undefined }}
              />
              {!item.isMember ? (
                <Button
                  title={joinMutation.isPending ? 'Joining…' : 'Join'}
                  size="sm"
                  loading={joinMutation.isPending && joinMutation.variables === item.id}
                  disabled={joinMutation.isPending}
                  onPress={() => handleJoin(item)}
                  style={{ flex: actionsDirection === 'row' ? 1 : undefined, width: actionsDirection === 'column' ? '100%' : undefined }}
                />
              ) : null}
            </View>
          </Card>
          );
        }}
      />

      <Modal visible={showCreate} animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View
          style={[
            styles.modal,
            {
              paddingTop: insets.top + spacing.md,
              paddingBottom: insets.bottom + spacing.md,
              backgroundColor: themeColors.background,
              maxHeight: modalMaxHeight(1),
            },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.md }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.pageTitle, { color: themeColors.text?.primary }]}>Create group</Text>
            <Text style={{ color: themeColors.text?.secondary, marginBottom: spacing.md, fontSize: getFontSize(13) }}>
              New groups may require property manager approval.
            </Text>
            <Input label="Name *" value={newName} onChangeText={setNewName} placeholder="Group name" />
            <View style={{ height: spacing.sm }} />
            <Input
              label="Description"
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="What is this group for?"
              multiline
              style={{ minHeight: 90, textAlignVertical: 'top' }}
            />
            <View style={[styles.rowActions, { flexDirection: actionsDirection }]}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setShowCreate(false)}
                style={{ flex: actionsDirection === 'row' ? 1 : undefined, width: actionsDirection === 'column' ? '100%' : undefined }}
              />
              <Button
                title={createMutation.isPending ? 'Creating…' : 'Create'}
                loading={createMutation.isPending}
                disabled={createMutation.isPending || !newName.trim()}
                onPress={() => createMutation.mutate()}
                style={{
                  flex: actionsDirection === 'row' ? 1 : undefined,
                  width: actionsDirection === 'column' ? '100%' : undefined,
                  minHeight: getButtonHeight(),
                }}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showRules} animationType="slide" onRequestClose={() => setShowRules(false)}>
        <View
          style={[
            styles.modal,
            {
              paddingTop: insets.top + spacing.md,
              paddingBottom: insets.bottom + spacing.md,
              backgroundColor: themeColors.background,
              maxHeight: modalMaxHeight(1),
            },
          ]}
        >
          <Text style={[styles.pageTitle, { color: themeColors.text?.primary }]}>Community rules</Text>
          <ScrollView style={{ flex: 1, marginVertical: spacing.md }} keyboardShouldPersistTaps="handled">
            <Text style={{ color: themeColors.text?.primary, fontSize: getFontSize(14), lineHeight: 22 }}>
              {rulesQuery.data?.rules?.trim() || 'Please follow respectful community guidelines.'}
            </Text>
          </ScrollView>
          <TouchableOpacity
            onPress={() => setRulesChecked((v) => !v)}
            style={styles.checkRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rulesChecked }}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: themeColors.border?.DEFAULT ?? '#ccc',
                  backgroundColor: rulesChecked
                    ? themeColors.primary?.DEFAULT ?? colors.primary.DEFAULT
                    : 'transparent',
                },
              ]}
            />
            <Text style={{ color: themeColors.text?.primary, flex: 1, minWidth: 0, fontSize: getFontSize(13) }}>
              I have read and accept these rules
            </Text>
          </TouchableOpacity>
          <View style={[styles.rowActions, { flexDirection: actionsDirection }]}>
            <Button
              title="Cancel"
              variant="outline"
              onPress={() => {
                setShowRules(false);
                setPendingJoinId(null);
                setRulesChecked(false);
              }}
              style={{ flex: actionsDirection === 'row' ? 1 : undefined, width: actionsDirection === 'column' ? '100%' : undefined }}
            />
            <Button
              title={acceptRulesMutation.isPending ? 'Accepting…' : 'Accept'}
              loading={acceptRulesMutation.isPending}
              disabled={!rulesChecked || acceptRulesMutation.isPending}
              onPress={() => acceptRulesMutation.mutate()}
              style={{ flex: actionsDirection === 'row' ? 1 : undefined, width: actionsDirection === 'column' ? '100%' : undefined }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  pageTitle: { fontSize: getFontSize(24), fontWeight: '700' },
  itemTitle: { fontSize: getFontSize(16), fontWeight: '600' },
  cover: {
    width: '100%',
    height: moderateScale(120),
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    backgroundColor: '#e5e5e5',
  },
  rowActions: { flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md, width: '100%' },
  rulesBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modal: { flex: 1, paddingHorizontal: spacing.md },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, flexShrink: 0 },
});
