import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import { colors, spacing } from '../theme';
import { useTheme } from '../contexts/ThemeContext';
import { getFontSize } from '../utils/responsive';
import type { MaintenanceRequestMessage } from '../services/maintenance';

type Props = {
  requestId: string;
  /** 'staff' uses /api/maintenance/:id/messages; 'tenant' uses tenant path */
  mode: 'staff' | 'tenant';
  canPost?: boolean;
};

function authorLabel(m: MaintenanceRequestMessage): string {
  const name = [m.author?.firstName, m.author?.lastName].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (m.author?.role === 'tenant') return 'Tenant';
  if (m.author?.role === 'maintenance_admin') return 'Maintenance admin';
  if (m.author?.role === 'owner') return 'Owner';
  return 'User';
}

export default function MaintenanceRequestDiscussionPanel({
  requestId,
  mode,
  canPost = true,
}: Props) {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const listKey =
    mode === 'staff'
      ? [`/api/maintenance/${requestId}/messages`]
      : [`/api/tenant/maintenance-requests/${requestId}/messages`];

  const { data: messages = [], isLoading } = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      if (mode === 'staff') {
        const { maintenanceService } = await import('../services/maintenance');
        return maintenanceService.getMaintenanceRequestMessages(requestId);
      }
      const { tenantService } = await import('../services/tenant');
      return tenantService.getMaintenanceRequestMessages(requestId);
    },
    refetchInterval: 15_000,
  });

  const postMutation = useMutation({
    mutationFn: async (body: string) => {
      if (mode === 'staff') {
        const { maintenanceService } = await import('../services/maintenance');
        return maintenanceService.postMaintenanceRequestMessage(requestId, body);
      }
      const { tenantService } = await import('../services/tenant');
      return tenantService.postMaintenanceRequestMessage(requestId, body);
    },
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (e: any) => {
      Alert.alert('Error', e?.message || 'Failed to send message');
    },
  });

  return (
    <Card>
      <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Discussion</Text>
      {isLoading ? (
        <Text style={{ color: themeColors.text.secondary, fontSize: getFontSize(13) }}>
          Loading…
        </Text>
      ) : messages.length === 0 ? (
        <Text style={{ color: themeColors.text.secondary, fontSize: getFontSize(13) }}>
          No messages yet.
        </Text>
      ) : (
        <View style={styles.thread}>
          {messages.map((m) => {
            const mine = m.authorUserId === user?.id;
            return (
              <View
                key={m.id}
                style={[styles.bubbleWrap, mine ? styles.mine : styles.theirs]}
              >
                <Text style={[styles.meta, { color: themeColors.text.secondary }]}>
                  {authorLabel(m)}
                  {m.createdAt
                    ? ` · ${new Date(m.createdAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}`
                    : ''}
                </Text>
                <View
                  style={[
                    styles.bubble,
                    {
                      backgroundColor: mine
                        ? themeColors.primary.DEFAULT
                        : themeColors.card?.DEFAULT || '#F3F4F6',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: mine ? '#fff' : themeColors.text.primary,
                      fontSize: getFontSize(14),
                    }}
                  >
                    {m.body}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {canPost ? (
        <View style={{ marginTop: spacing[3], gap: spacing[2] }}>
          <Input
            label="Message"
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a message…"
            multiline
          />
          <Button
            title={postMutation.isPending ? 'Sending…' : 'Send'}
            onPress={() => {
              const body = draft.trim();
              if (!body) return;
              postMutation.mutate(body);
            }}
            disabled={!draft.trim() || postMutation.isPending}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: getFontSize(16),
    fontWeight: '600',
    marginBottom: spacing[2],
  },
  thread: {
    gap: spacing[2],
  },
  bubbleWrap: {
    maxWidth: '92%',
  },
  mine: {
    alignSelf: 'flex-end',
  },
  theirs: {
    alignSelf: 'flex-start',
  },
  meta: {
    fontSize: getFontSize(11),
    marginBottom: 2,
  },
  bubble: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
