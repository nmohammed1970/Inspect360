import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, ImagePlus, MessageSquare, Plus, Send } from 'lucide-react-native';
import {
  tenantService,
  uploadTenantObject,
  type TenantMaintenanceChat,
  type TenantMaintenanceChatMessage,
} from '../../services/tenant';
import { useTheme } from '../../contexts/ThemeContext';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import ChatMarkdown from '../../components/ui/ChatMarkdown';
import { colors, spacing, borderRadius } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import { getFontSize, moderateScale } from '../../utils/responsive';
import { getAPI_URL } from '../../services/api';
import type { TenantMaintenanceStackParamList } from '../../navigation/types';

type ListProps = NativeStackScreenProps<TenantMaintenanceStackParamList, 'TenantAiMaintenanceHelp'>;
type ChatProps = NativeStackScreenProps<TenantMaintenanceStackParamList, 'TenantAiMaintenanceChat'>;

function resolveUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  if (path.startsWith('/')) return `${getAPI_URL()}${path}`;
  return `${getAPI_URL()}/objects/${path}`;
}

export function TenantAiMaintenanceHelpScreen({ navigation }: ListProps) {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const { getFontSize, getButtonHeight, moderateScale } = useResponsive();

  const query = useQuery({
    queryKey: ['/api/tenant/maintenance-chats'],
    queryFn: () => tenantService.getMaintenanceChats(),
  });

  if (query.isLoading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <LoadingSpinner />
      </View>
    );
  }

  if (query.isError) {
    return (
      <View style={[styles.centered, { padding: spacing.lg, paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <Text style={{ color: themeColors.text?.primary, fontWeight: '600', marginBottom: spacing.sm, textAlign: 'center' }}>
          We couldn't load AI chats
        </Text>
        <Button title="Try again" onPress={() => void query.refetch()} />
      </View>
    );
  }

  const chats = query.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background, paddingTop: insets.top }}>
      <View style={styles.pageHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backInline}>
          <ArrowLeft size={moderateScale(20)} color={themeColors.text?.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.pageTitle, { color: themeColors.text?.primary }]}>AI Maintenance Help</Text>
          <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(13) }}>
            Describe an issue and get suggested next steps
          </Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
        <Button
          title="New conversation"
          icon={<Plus size={16} color="#fff" />}
          onPress={() => navigation.navigate('TenantAiMaintenanceChat', {})}
          style={{ minHeight: getButtonHeight() }}
        />
      </View>

      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          flexGrow: 1,
          gap: spacing.sm,
        }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        ListEmptyComponent={
          <EmptyState
            title="No conversations yet"
            message="Start a new chat to get AI help with a maintenance issue."
            icon={<MessageSquare size={moderateScale(40)} color={themeColors.text?.secondary} />}
          />
        }
        renderItem={({ item }: { item: TenantMaintenanceChat }) => (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('TenantAiMaintenanceChat', { chatId: item.id })}
          >
            <Card>
              <Text style={[styles.itemTitle, { color: themeColors.text?.primary }]} numberOfLines={2}>
                {item.title || 'Maintenance chat'}
              </Text>
              <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12), marginTop: 4 }}>
                {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                {item.maintenanceRequestId ? ' · Request created' : ''}
              </Text>
            </Card>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

export function TenantAiMaintenanceChatScreen({ navigation, route }: ChatProps) {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const { getFontSize, moderateScale } = useResponsive();
  const queryClient = useQueryClient();
  const [chatId, setChatId] = useState<string | undefined>(route.params?.chatId);
  const [messageInput, setMessageInput] = useState('');
  const [pendingImage, setPendingImage] = useState<{ localUri: string; serverPath: string } | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);
  const listRef = useRef<FlatList>(null);

  const chatQuery = useQuery({
    queryKey: ['/api/tenant/maintenance-chats', chatId],
    queryFn: () => tenantService.getMaintenanceChat(chatId!),
    enabled: !!chatId,
  });

  const messages: TenantMaintenanceChatMessage[] = chatQuery.data?.messages ?? [];

  useEffect(() => {
    if (messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: (data: { chatId?: string; message: string; imageUrl?: string }) =>
      tenantService.sendMaintenanceChatMessage(data),
    onSuccess: (res) => {
      if (res.chatId && res.chatId !== chatId) {
        setChatId(res.chatId);
      }
      setMessageInput('');
      setPendingImage(null);
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/maintenance-chats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/maintenance-requests'] });
      if (res.chatId) {
        queryClient.invalidateQueries({ queryKey: ['/api/tenant/maintenance-chats', res.chatId] });
      }
    },
    onError: (e: any) => {
      Alert.alert('Error', e?.message || 'Failed to send message.');
    },
  });

  const createFromChatMutation = useMutation({
    mutationFn: (id: string) => tenantService.createMaintenanceRequestFromChat(id),
    onSuccess: (req) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/maintenance-chats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/maintenance-requests'] });
      if (chatId) {
        queryClient.invalidateQueries({ queryKey: ['/api/tenant/maintenance-chats', chatId] });
      }
      Alert.alert('Maintenance request created', 'Your request has been submitted to the property manager.', [
        {
          text: 'View request',
          onPress: () => {
            if (req?.id) {
              navigation.navigate('TenantMaintenanceDetail', { requestId: req.id });
            } else {
              navigation.navigate('TenantMaintenanceRequests');
            }
          },
        },
        { text: 'OK', style: 'cancel' },
      ]);
    },
    onError: (e: any) => {
      Alert.alert('Could not create request', e?.message || 'Please try again or log a request manually.');
    },
  });

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      const path = await uploadTenantObject(asset.uri, asset.mimeType || 'image/jpeg');
      setPendingImage({ localUri: asset.uri, serverPath: path });
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Could not upload image.');
    } finally {
      setUploading(false);
    }
  };

  const send = () => {
    const text = messageInput.trim();
    if (!text && !pendingImage) return;
    sendMutation.mutate({
      chatId,
      message: text || 'Please look at this photo.',
      imageUrl: pendingImage?.serverPath || undefined,
    });
  };

  const canCreateRequest = !!chatId && !!chatQuery.data && !chatQuery.data.maintenanceRequestId && messages.length > 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: themeColors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 8) : 0}
    >
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + spacing.sm, borderBottomColor: themeColors.border?.DEFAULT ?? '#e5e5e5' },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
          <ArrowLeft size={moderateScale(22)} color={themeColors.text?.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text?.primary }]} numberOfLines={1}>
          {chatQuery.data?.title || 'New conversation'}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {!chatId && messages.length === 0 ? (
        <View style={{ flex: 1, padding: spacing.lg, justifyContent: 'center' }}>
          <EmptyState
            title="Ask about a maintenance issue"
            message="Type a message or attach a photo. The AI will suggest steps you can try."
            icon={<MessageSquare size={moderateScale(40)} color={themeColors.text?.secondary} />}
          />
        </View>
      ) : chatQuery.isLoading && chatId ? (
        <View style={styles.centered}>
          <LoadingSpinner />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.md, gap: spacing.sm }}
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            return (
              <View
                style={[
                  styles.bubble,
                  {
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    backgroundColor: isUser
                      ? themeColors.primary?.DEFAULT ?? colors.primary.DEFAULT
                      : themeColors.muted?.DEFAULT ?? '#f5f5f5',
                    maxWidth: '88%',
                  },
                ]}
              >
                {item.imageUrl ? (
                  <Image source={{ uri: resolveUrl(item.imageUrl) }} style={styles.chatImage} />
                ) : null}
                {!!item.content && (
                  isUser ? (
                    <Text
                      style={{
                        color: '#fff',
                        fontSize: getFontSize(14),
                        lineHeight: getFontSize(20),
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
                  )
                )}
                {item.aiSuggestedFixes ? (
                  <View style={{ marginTop: 6 }}>
                    <Text
                      style={{
                        color: themeColors.text?.secondary,
                        fontSize: getFontSize(12),
                        fontWeight: '600',
                        marginBottom: 4,
                      }}
                    >
                      Suggested fixes:
                    </Text>
                    <ChatMarkdown
                      content={item.aiSuggestedFixes}
                      color={themeColors.text?.secondary ?? '#666'}
                      fontSize={getFontSize(12)}
                    />
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}

      {canCreateRequest ? (
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
          <Button
            title={
              createFromChatMutation.isPending
                ? 'Creating…'
                : 'Issue not resolved — create maintenance request'
            }
            variant="outline"
            onPress={() => {
              Alert.alert(
                'Create maintenance request?',
                'This will submit a request to your property manager based on this conversation.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Create',
                    onPress: () => chatId && createFromChatMutation.mutate(chatId),
                  },
                ],
              );
            }}
            disabled={createFromChatMutation.isPending}
            loading={createFromChatMutation.isPending}
          />
        </View>
      ) : null}

      {chatQuery.data?.maintenanceRequestId ? (
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
          <Button
            title="View linked request"
            variant="secondary"
            onPress={() =>
              navigation.navigate('TenantMaintenanceDetail', {
                requestId: chatQuery.data!.maintenanceRequestId!,
              })
            }
          />
        </View>
      ) : null}

      <View
        style={[
          styles.composer,
          {
            paddingBottom: Math.max(insets.bottom, spacing.sm),
            borderTopColor: themeColors.border?.DEFAULT ?? '#e5e5e5',
            backgroundColor: themeColors.card?.DEFAULT ?? '#fff',
          },
        ]}
      >
        {pendingImage ? (
          <View style={styles.pendingImageRow}>
            <Image source={{ uri: pendingImage.localUri }} style={styles.pendingThumb} />
            <TouchableOpacity onPress={() => setPendingImage(null)}>
              <Text style={{ color: themeColors.destructive?.DEFAULT ?? '#ef4444' }}>Remove</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={styles.composerRow}>
          <TouchableOpacity onPress={() => void pickImage()} disabled={uploading || sendMutation.isPending} style={styles.iconBtn}>
            {uploading ? (
              <ActivityIndicator size="small" color={themeColors.primary?.DEFAULT} />
            ) : (
              <ImagePlus size={22} color={themeColors.primary?.DEFAULT ?? colors.primary.DEFAULT} />
            )}
          </TouchableOpacity>
          <TextInput
            style={[
              styles.input,
              {
                color: themeColors.text?.primary,
                backgroundColor: themeColors.muted?.DEFAULT ?? '#f5f5f5',
              },
            ]}
            placeholder="Describe the issue…"
            placeholderTextColor={themeColors.text?.secondary}
            value={messageInput}
            onChangeText={setMessageInput}
            multiline
            editable={!sendMutation.isPending}
          />
          <TouchableOpacity
            onPress={send}
            disabled={sendMutation.isPending || (!messageInput.trim() && !pendingImage)}
            style={[
              styles.sendBtn,
              {
                backgroundColor: themeColors.primary?.DEFAULT ?? colors.primary.DEFAULT,
                opacity: sendMutation.isPending || (!messageInput.trim() && !pendingImage) ? 0.5 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {sendMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backInline: { paddingTop: 4, paddingRight: 4 },
  pageTitle: { fontSize: getFontSize(22), fontWeight: '700' },
  itemTitle: { fontSize: getFontSize(15), fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: getFontSize(16), fontWeight: '600', flex: 1, textAlign: 'center' },
  bubble: { borderRadius: borderRadius.lg, padding: spacing.sm, paddingHorizontal: spacing.md },
  chatImage: {
    width: moderateScale(180),
    height: moderateScale(140),
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
    backgroundColor: '#ddd',
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  composerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  iconBtn: { padding: spacing.sm },
  input: {
    flex: 1,
    minWidth: 120,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : spacing.xs,
    maxHeight: 120,
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
  pendingImageRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  pendingThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#ddd' },
});

export default TenantAiMaintenanceHelpScreen;
