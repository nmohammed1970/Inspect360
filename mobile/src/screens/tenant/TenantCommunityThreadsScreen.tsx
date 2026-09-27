import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Modal,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Lock, MessageSquare, Pin, Plus } from 'lucide-react-native';
import { tenantService, type TenantCommunityThread } from '../../services/tenant';
import { useTheme } from '../../contexts/ThemeContext';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import EmptyState from '../../components/ui/EmptyState';
import { colors, spacing } from '../../theme';
import { getFontSize, getButtonHeight, moderateScale } from '../../utils/responsive';
import type { TenantCommunityStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<TenantCommunityStackParamList, 'TenantCommunityThreads'>;

export default function TenantCommunityThreadsScreen({ navigation, route }: Props) {
  const { groupId, groupName, isMember } = route.params;
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const rulesQuery = useQuery({
    queryKey: ['/api/tenant-portal/community/rules'],
    queryFn: () => tenantService.getCommunityRules(),
  });

  const threadsQuery = useQuery({
    queryKey: ['/api/tenant-portal/community/groups', groupId, 'threads'],
    queryFn: () => tenantService.getCommunityThreads(groupId),
  });

  const groupsQuery = useQuery({
    queryKey: ['/api/tenant-portal/community/groups'],
    queryFn: () => tenantService.getCommunityGroups(),
  });

  const group = groupsQuery.data?.find((g) => g.id === groupId);
  const member = group?.isMember ?? isMember;
  const requiresRules =
    !!rulesQuery.data && rulesQuery.data.version > 0 && !rulesQuery.data.hasAccepted;

  const joinMutation = useMutation({
    mutationFn: () => tenantService.joinCommunityGroup(groupId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/tenant-portal/community/groups'] });
      Alert.alert('Joined group', 'You can now start and reply to threads.');
    },
    onError: (e: any) => Alert.alert('Error', e?.message || 'Failed to join group'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      tenantService.createCommunityThread(groupId, {
        title: title.trim(),
        content: content.trim(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['/api/tenant-portal/community/groups', groupId, 'threads'],
      });
      setShowCreate(false);
      setTitle('');
      setContent('');
      Alert.alert('Thread created');
    },
    onError: (e: any) => Alert.alert('Error', e?.message || 'Failed to create thread'),
  });

  const onRefresh = useCallback(() => {
    void threadsQuery.refetch();
    void groupsQuery.refetch();
  }, [threadsQuery, groupsQuery]);

  if (threadsQuery.isLoading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <LoadingSpinner />
      </View>
    );
  }

  const threads = threadsQuery.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background, paddingTop: insets.top }}>
      <View style={styles.pageHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button">
          <ArrowLeft size={moderateScale(22)} color={themeColors.text?.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.pageTitle, { color: themeColors.text?.primary }]} numberOfLines={1}>
            {groupName}
          </Text>
          <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12) }}>
            {member ? 'Member' : 'Not a member'} · {threads.length} threads
          </Text>
        </View>
        {member && !requiresRules ? (
          <Button
            title="New"
            size="sm"
            icon={<Plus size={14} color="#fff" />}
            onPress={() => setShowCreate(true)}
          />
        ) : null}
      </View>

      {!member ? (
        <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
          <Button
            title={joinMutation.isPending ? 'Joining…' : 'Join group to participate'}
            loading={joinMutation.isPending}
            disabled={joinMutation.isPending || requiresRules}
            onPress={() => {
              if (requiresRules) {
                Alert.alert('Rules required', 'Accept community rules from the Community tab first.');
                return;
              }
              joinMutation.mutate();
            }}
            style={{ minHeight: getButtonHeight() }}
          />
        </View>
      ) : null}

      <FlatList
        data={threads}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          flexGrow: 1,
          gap: spacing.sm,
        }}
        refreshControl={
          <RefreshControl refreshing={threadsQuery.isRefetching} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            title="No threads yet"
            message={member ? 'Start the first discussion.' : 'Join the group to see and start threads.'}
            icon={<MessageSquare size={moderateScale(40)} color={themeColors.text?.secondary} />}
          />
        }
        renderItem={({ item }: { item: TenantCommunityThread }) => (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
              navigation.navigate('TenantCommunityThread', {
                threadId: item.id,
                groupName,
              })
            }
          >
            <Card>
              <View style={styles.threadTitleRow}>
                {item.isPinned ? <Pin size={14} color={themeColors.primary?.DEFAULT} /> : null}
                {item.isLocked ? <Lock size={14} color={themeColors.text?.secondary} /> : null}
                <Text
                  style={[styles.itemTitle, { color: themeColors.text?.primary, flex: 1 }]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
              </View>
              <Text
                style={{ color: themeColors.text?.secondary, marginTop: 4, fontSize: getFontSize(13) }}
                numberOfLines={2}
              >
                {item.content}
              </Text>
              <Text
                style={{
                  color: themeColors.text?.secondary,
                  marginTop: spacing.sm,
                  fontSize: getFontSize(12),
                }}
              >
                {item.creatorName}
                {item.replyCount != null ? ` · ${item.replyCount} replies` : ''}
                {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleDateString()}` : ''}
              </Text>
            </Card>
          </TouchableOpacity>
        )}
      />

      <Modal visible={showCreate} animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View
          style={[
            styles.modal,
            {
              paddingTop: insets.top + spacing.md,
              paddingBottom: insets.bottom + spacing.md,
              backgroundColor: themeColors.background,
            },
          ]}
        >
          <Text style={[styles.pageTitle, { color: themeColors.text?.primary }]}>New thread</Text>
          <Input label="Title *" value={title} onChangeText={setTitle} placeholder="Thread title" />
          <View style={{ height: spacing.sm }} />
          <Input
            label="Content *"
            value={content}
            onChangeText={setContent}
            placeholder="What would you like to discuss?"
            multiline
            style={{ minHeight: 120, textAlignVertical: 'top' }}
          />
          <View style={styles.rowActions}>
            <Button title="Cancel" variant="outline" onPress={() => setShowCreate(false)} style={{ flex: 1 }} />
            <Button
              title={createMutation.isPending ? 'Posting…' : 'Create'}
              loading={createMutation.isPending}
              disabled={createMutation.isPending || !title.trim() || !content.trim()}
              onPress={() => createMutation.mutate()}
              style={{ flex: 1 }}
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
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  pageTitle: { fontSize: getFontSize(20), fontWeight: '700' },
  itemTitle: { fontSize: getFontSize(16), fontWeight: '600' },
  threadTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modal: { flex: 1, paddingHorizontal: spacing.md },
});
