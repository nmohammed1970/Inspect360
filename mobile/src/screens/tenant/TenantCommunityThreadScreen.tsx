import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Modal,
  TouchableOpacity,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Flag, Lock, Pin } from 'lucide-react-native';
import { tenantService, type TenantCommunityPost } from '../../services/tenant';
import { useTheme } from '../../contexts/ThemeContext';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { colors, spacing, borderRadius } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import { getFontSize } from '../../utils/responsive';
import type { TenantCommunityStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<TenantCommunityStackParamList, 'TenantCommunityThread'>;

export default function TenantCommunityThreadScreen({ navigation, route }: Props) {
  const { threadId } = route.params;
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const { getFontSize, getButtonHeight, moderateScale, modalMaxHeight, stackDirection } = useResponsive();
  const queryClient = useQueryClient();
  const actionsDirection = stackDirection(360);

  const [reply, setReply] = useState('');
  const [flagTarget, setFlagTarget] = useState<{ type: 'thread' | 'post'; id: string } | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagDetails, setFlagDetails] = useState('');

  const threadQuery = useQuery({
    queryKey: ['/api/tenant-portal/community/threads', threadId],
    queryFn: () => tenantService.getCommunityThread(threadId),
  });

  const replyMutation = useMutation({
    mutationFn: () => tenantService.createCommunityPost(threadId, { content: reply.trim() }),
    onSuccess: async () => {
      setReply('');
      await queryClient.invalidateQueries({
        queryKey: ['/api/tenant-portal/community/threads', threadId],
      });
      Alert.alert('Reply posted');
    },
    onError: (e: any) => Alert.alert('Error', e?.message || 'Failed to post reply'),
  });

  const flagMutation = useMutation({
    mutationFn: () =>
      tenantService.flagCommunityContent({
        threadId: flagTarget?.type === 'thread' ? flagTarget.id : undefined,
        postId: flagTarget?.type === 'post' ? flagTarget.id : undefined,
        reason: flagReason.trim(),
        details: flagDetails.trim() || undefined,
      }),
    onSuccess: () => {
      setFlagTarget(null);
      setFlagReason('');
      setFlagDetails('');
      Alert.alert('Content flagged', 'Thank you for reporting. Moderators will review this.');
    },
    onError: (e: any) => Alert.alert('Error', e?.message || 'Failed to flag content'),
  });

  if (threadQuery.isLoading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <LoadingSpinner />
      </View>
    );
  }

  if (threadQuery.isError || !threadQuery.data) {
    return (
      <View
        style={[
          styles.centered,
          { padding: spacing.lg, paddingTop: insets.top, backgroundColor: themeColors.background },
        ]}
      >
        <Text style={{ color: themeColors.text?.primary, fontWeight: '600', marginBottom: spacing.sm }}>
          We couldn't load this thread
        </Text>
        <Button title="Try again" onPress={() => void threadQuery.refetch()} />
        <Button
          title="Go back"
          variant="outline"
          onPress={() => navigation.goBack()}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    );
  }

  const thread = threadQuery.data;
  const posts: TenantCommunityPost[] = thread.posts ?? [];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: themeColors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 8) : 0}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.sm,
            borderBottomColor: themeColors.border?.DEFAULT ?? '#e5e5e5',
          },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button">
          <ArrowLeft size={moderateScale(22)} color={themeColors.text?.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text?.primary }]} numberOfLines={1}>
          Thread
        </Text>
        <TouchableOpacity
          onPress={() => setFlagTarget({ type: 'thread', id: thread.id })}
          accessibilityRole="button"
          accessibilityLabel="Report thread"
        >
          <Flag size={20} color={themeColors.text?.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.md,
        }}
        refreshControl={
          <RefreshControl refreshing={threadQuery.isRefetching} onRefresh={() => void threadQuery.refetch()} />
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Card>
          <View style={styles.titleRow}>
            {thread.isPinned ? <Pin size={16} color={themeColors.primary?.DEFAULT} /> : null}
            {thread.isLocked ? <Lock size={16} color={themeColors.text?.secondary} /> : null}
            <Text style={[styles.threadTitle, { color: themeColors.text?.primary, flex: 1 }]}>
              {thread.title}
            </Text>
          </View>
          <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12), marginTop: 4 }}>
            Posted by {thread.creatorName}
            {thread.createdAt ? ` · ${new Date(thread.createdAt).toLocaleString()}` : ''}
          </Text>
          <Text
            style={{
              color: themeColors.text?.primary,
              marginTop: spacing.md,
              fontSize: getFontSize(15),
              lineHeight: 22,
            }}
          >
            {thread.content}
          </Text>
          {(thread.attachments?.length ?? 0) > 0 ? (
            <View style={{ marginTop: spacing.sm, gap: 4 }}>
              {thread.attachments!.map((att) => (
                <TouchableOpacity key={att.id} onPress={() => void Linking.openURL(att.fileUrl)}>
                  <Text style={{ color: themeColors.primary?.DEFAULT, fontSize: getFontSize(13) }}>
                    {att.fileName || 'Attachment'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </Card>

        <Text style={[styles.sectionHeading, { color: themeColors.text?.primary }]}>
          {posts.length} {posts.length === 1 ? 'Reply' : 'Replies'}
        </Text>

        {posts.map((post) => (
          <Card key={post.id}>
            <View style={styles.postHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: themeColors.text?.primary, fontWeight: '600' }}>
                  {post.creatorName}
                </Text>
                <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12) }}>
                  {post.createdAt ? new Date(post.createdAt).toLocaleString() : ''}
                  {post.isEdited ? ' (edited)' : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setFlagTarget({ type: 'post', id: post.id })}
                accessibilityLabel="Report post"
              >
                <Flag size={16} color={themeColors.text?.secondary} />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                color: themeColors.text?.primary,
                marginTop: spacing.sm,
                fontSize: getFontSize(14),
                lineHeight: 20,
              }}
            >
              {post.content}
            </Text>
            {(post.attachments?.length ?? 0) > 0 ? (
              <View style={{ marginTop: spacing.sm, gap: 4 }}>
                {post.attachments!.map((att) => (
                  <TouchableOpacity key={att.id} onPress={() => void Linking.openURL(att.fileUrl)}>
                    <Text style={{ color: themeColors.primary?.DEFAULT, fontSize: getFontSize(13) }}>
                      {att.fileName || 'Attachment'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </Card>
        ))}

        {thread.isLocked ? (
          <Card>
            <View style={styles.lockedRow}>
              <Lock size={18} color={themeColors.text?.secondary} />
              <Text style={{ color: themeColors.text?.secondary, flex: 1, minWidth: 0 }}>
                This thread is locked. New replies are not allowed.
              </Text>
            </View>
          </Card>
        ) : (
          <Card>
            <Text style={[styles.sectionHeading, { color: themeColors.text?.primary }]}>Post a reply</Text>
            <Input
              value={reply}
              onChangeText={setReply}
              placeholder="Write your reply…"
              multiline
              style={{ minHeight: 100, textAlignVertical: 'top', marginTop: spacing.sm }}
            />
            <View style={[styles.composerActions, { flexDirection: actionsDirection }]}>
              <Button
                title={replyMutation.isPending ? 'Posting…' : 'Post reply'}
                loading={replyMutation.isPending}
                disabled={replyMutation.isPending || !reply.trim()}
                onPress={() => replyMutation.mutate()}
                style={{ flex: actionsDirection === 'row' ? 1 : undefined, minHeight: getButtonHeight(), width: actionsDirection === 'column' ? '100%' : undefined }}
              />
            </View>
          </Card>
        )}
      </ScrollView>

      <Modal
        visible={!!flagTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setFlagTarget(null)}
      >
        <KeyboardAvoidingView
          style={styles.sheetBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: themeColors.card?.DEFAULT ?? '#fff',
                paddingBottom: insets.bottom + spacing.md,
                maxHeight: modalMaxHeight(0.9),
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.sm }}
            >
              <Text style={[styles.sectionHeading, { color: themeColors.text?.primary }]}>Report content</Text>
              <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(13) }}>
                Help keep the community safe by reporting inappropriate content.
              </Text>
              <Input
                label="Reason *"
                value={flagReason}
                onChangeText={setFlagReason}
                placeholder="e.g. spam, harassment"
              />
              <Input
                label="Details (optional)"
                value={flagDetails}
                onChangeText={setFlagDetails}
                multiline
                style={{ minHeight: 80, textAlignVertical: 'top' }}
              />
              <View style={[styles.rowActions, { flexDirection: actionsDirection }]}>
                <Button
                  title="Cancel"
                  variant="outline"
                  onPress={() => setFlagTarget(null)}
                  style={{ flex: actionsDirection === 'row' ? 1 : undefined, width: actionsDirection === 'column' ? '100%' : undefined }}
                />
                <Button
                  title={flagMutation.isPending ? 'Submitting…' : 'Submit'}
                  variant="destructive"
                  loading={flagMutation.isPending}
                  disabled={flagMutation.isPending || !flagReason.trim()}
                  onPress={() => flagMutation.mutate()}
                  style={{ flex: actionsDirection === 'row' ? 1 : undefined, width: actionsDirection === 'column' ? '100%' : undefined }}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: getFontSize(17), fontWeight: '600', flex: 1, textAlign: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  threadTitle: { fontSize: getFontSize(18), fontWeight: '700' },
  sectionHeading: { fontSize: getFontSize(16), fontWeight: '700' },
  postHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  composerActions: { marginTop: spacing.md, gap: spacing.sm, width: '100%' },
  rowActions: { flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md, width: '100%' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
  },
});
