import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
  type KeyboardEvent,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bot, MessageCircle, Plus, Send, X } from 'lucide-react-native';
import { tenantService, type TenantChatMessage } from '../services/tenant';
import { useTenantPortalFlags } from '../hooks/useTenantPortalFlags';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import ChatMarkdown from './ui/ChatMarkdown';
import { colors, spacing, borderRadius, shadows } from '../theme';
import { getFontSize, moderateScale } from '../utils/responsive';

/**
 * Tenant portal AI assistant — same `/api/chat/*` surface as web AIChatbot.
 * Not Ivy (operators-only).
 */
export default function TenantAIChatbot() {
  const flags = useTenantPortalFlags();
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList>(null);

  const [open, setOpen] = useState(false);
  const [showConversations, setShowConversations] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const accent = flags.brandingPrimaryColor || themeColors.primary?.DEFAULT || colors.primary.DEFAULT;

  const conversationsQuery = useQuery({
    queryKey: ['/api/chat/conversations'],
    queryFn: () => tenantService.getChatConversations(),
    enabled: open && flags.chatbotEnabled,
  });

  const messagesQuery = useQuery({
    queryKey: conversationId
      ? ['/api/chat/conversations', conversationId, 'messages']
      : ['no-conversation'],
    queryFn: () =>
      conversationId ? tenantService.getChatMessages(conversationId) : Promise.resolve([]),
    enabled: open && !!conversationId,
    retry: false,
  });

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      let convId = conversationId;
      if (!convId) {
        const conv = await tenantService.createChatConversation(text.substring(0, 50));
        convId = conv.id;
        setConversationId(convId);
      }
      await tenantService.sendChatMessage(convId, text);
      return convId;
    },
    onSuccess: (convId) => {
      setMessage('');
      void queryClient.invalidateQueries({
        queryKey: ['/api/chat/conversations', convId, 'messages'],
      });
      void queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] });
    },
    onError: (e: any) => {
      Alert.alert('Message failed', e?.message || 'Failed to send message');
    },
  });

  const messages = messagesQuery.data ?? [];

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length, keyboardHeight]);

  // Android Modal ignores KeyboardAvoidingView height — pad from keyboard events.
  useEffect(() => {
    if (!open) {
      setKeyboardHeight(0);
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    };
    const onHide = () => setKeyboardHeight(0);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [open]);

  if (!flags.chatbotEnabled) return null;

  const handleSend = () => {
    const text = message.trim();
    if (!text || sendMutation.isPending) return;
    sendMutation.mutate(text);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: accent,
            bottom: insets.bottom + moderateScale(72),
            ...shadows.lg,
          },
        ]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Open AI assistant"
      >
        <MessageCircle size={26} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: themeColors.background }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 8) : 0}
        >
          <View
            style={[
              styles.sheet,
              {
                // Keep composer above keyboard on Android (KAV height is unreliable in Modal)
                paddingBottom: Platform.OS === 'android' ? keyboardHeight : 0,
              },
            ]}
          >
            <View
              style={[
                styles.chatHeader,
                {
                  paddingTop: insets.top + spacing.sm,
                  borderBottomColor: themeColors.border?.DEFAULT ?? '#e5e5e5',
                },
              ]}
            >
              <View style={styles.chatHeaderLeft}>
                <Bot size={22} color={accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.chatTitle, { color: themeColors.text?.primary }]}>AI Assistant</Text>
                  <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12) }}>
                    Ask anything about Inspect360
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)} accessibilityLabel="Close">
                <X size={24} color={themeColors.text?.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.toolbar}>
              <Button
                title="History"
                variant="outline"
                size="sm"
                onPress={() => setShowConversations((v) => !v)}
              />
              <Button
                title="New chat"
                size="sm"
                icon={<Plus size={14} color="#fff" />}
                onPress={() => {
                  setConversationId(null);
                  setShowConversations(false);
                }}
              />
            </View>

            {showConversations ? (
              <FlatList
                style={styles.list}
                data={conversationsQuery.data ?? []}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
                ListEmptyComponent={
                  <Text style={{ color: themeColors.text?.secondary, textAlign: 'center', marginTop: spacing.lg }}>
                    No conversations yet
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setConversationId(item.id);
                      setShowConversations(false);
                    }}
                    style={[
                      styles.convItem,
                      {
                        backgroundColor: themeColors.card?.DEFAULT ?? '#fff',
                        borderColor:
                          item.id === conversationId
                            ? accent
                            : themeColors.border?.DEFAULT ?? '#e5e5e5',
                      },
                    ]}
                  >
                    <Text style={{ color: themeColors.text?.primary, fontWeight: '600' }} numberOfLines={1}>
                      {item.title || 'Conversation'}
                    </Text>
                    {item.updatedAt ? (
                      <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(11), marginTop: 2 }}>
                        {new Date(item.updatedAt).toLocaleString()}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                )}
              />
            ) : (
              <FlatList
                ref={listRef}
                style={styles.list}
                data={messages}
                keyExtractor={(item: TenantChatMessage) => item.id}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentContainerStyle={{
                  padding: spacing.md,
                  paddingBottom: spacing.lg,
                  flexGrow: 1,
                  gap: spacing.sm,
                }}
                ListEmptyComponent={
                  <View style={styles.emptyChat}>
                    <Bot size={40} color={themeColors.text?.secondary} />
                    <Text
                      style={{
                        color: themeColors.text?.secondary,
                        textAlign: 'center',
                        marginTop: spacing.sm,
                        fontSize: getFontSize(14),
                      }}
                    >
                      Start a conversation — ask about inspections, maintenance, or your tenancy.
                    </Text>
                  </View>
                }
                renderItem={({ item }: { item: TenantChatMessage }) => {
                  const isUser = item.role === 'user';
                  return (
                    <View
                      style={[
                        styles.bubble,
                        isUser
                          ? { alignSelf: 'flex-end', backgroundColor: accent }
                          : {
                              alignSelf: 'flex-start',
                              backgroundColor: themeColors.muted?.DEFAULT ?? '#f5f5f5',
                            },
                      ]}
                    >
                      {isUser ? (
                        <Text
                          style={{
                            color: '#fff',
                            fontSize: getFontSize(14),
                            lineHeight: 20,
                          }}
                        >
                          {item.content}
                        </Text>
                      ) : (
                        <ChatMarkdown
                          content={item.content}
                          color={themeColors.text?.primary ?? '#111'}
                          fontSize={getFontSize(14)}
                        />
                      )}
                    </View>
                  );
                }}
                ListFooterComponent={
                  sendMutation.isPending || messagesQuery.isLoading ? (
                    <ActivityIndicator color={accent} style={{ marginVertical: spacing.sm }} />
                  ) : null
                }
              />
            )}

            {!showConversations ? (
              <View
                style={[
                  styles.composer,
                  {
                    paddingBottom:
                      keyboardHeight > 0 ? spacing.sm : Math.max(insets.bottom, spacing.sm),
                    borderTopColor: themeColors.border?.DEFAULT ?? '#e5e5e5',
                    backgroundColor: themeColors.card?.DEFAULT ?? '#fff',
                  },
                ]}
              >
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Type a message…"
                  placeholderTextColor={themeColors.text?.secondary}
                  style={[
                    styles.input,
                    {
                      color: themeColors.text?.primary,
                      backgroundColor: themeColors.background,
                      borderColor: themeColors.border?.DEFAULT ?? '#e5e5e5',
                    },
                  ]}
                  multiline
                  editable={!sendMutation.isPending}
                  onSubmitEditing={handleSend}
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  onPress={handleSend}
                  disabled={sendMutation.isPending || !message.trim()}
                  style={[
                    styles.sendBtn,
                    {
                      backgroundColor: accent,
                      opacity: sendMutation.isPending || !message.trim() ? 0.5 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                >
                  <Send size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.md,
    width: moderateScale(56),
    height: moderateScale(56),
    borderRadius: moderateScale(28),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 8,
  },
  sheet: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  chatTitle: { fontSize: getFontSize(17), fontWeight: '700' },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  list: {
    flex: 1,
  },
  convItem: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xl * 2 },
  bubble: {
    maxWidth: '85%',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  composer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minWidth: 120,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : spacing.xs,
    fontSize: getFontSize(15),
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
