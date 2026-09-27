import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SignatureCanvas from 'react-native-signature-canvas';
import { ArrowLeft, Download, MessageSquare, PenLine, X } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { tenantService, type TenantComparisonComment } from '../../services/tenant';
import { useTheme } from '../../contexts/ThemeContext';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { colors, spacing, borderRadius } from '../../theme';
import { getFontSize, getButtonHeight, moderateScale } from '../../utils/responsive';
import { useResponsive } from '../../hooks/useResponsive';
import { getAPI_URL } from '../../services/api';
import { formatCurrency } from '../../lib/formatCurrency';
import type { TenantComparisonsStackParamList } from '../../navigation/types';
import type { TenantHomeStackParamList } from '../../navigation/types';

type Props =
  | NativeStackScreenProps<TenantComparisonsStackParamList, 'TenantComparisonPreview'>
  | NativeStackScreenProps<TenantHomeStackParamList, 'TenantComparisonPreview'>;

function resolvePhotoUrl(photo: string): string {
  if (!photo) return '';
  if (photo.startsWith('http') || photo.startsWith('data:')) return photo;
  if (photo.startsWith('/')) return `${getAPI_URL()}${photo}`;
  return `${getAPI_URL()}/objects/${photo}`;
}

function itemPhotos(item: any): { checkIn: string[]; checkOut: string[] } {
  const fromAi = item?.aiComparisonJson || {};
  const checkIn = item.checkInPhotos || fromAi.checkInPhotos || [];
  const checkOut = item.checkOutPhotos || fromAi.checkOutPhotos || [];
  return {
    checkIn: Array.isArray(checkIn) ? checkIn.filter(Boolean) : [],
    checkOut: Array.isArray(checkOut) ? checkOut.filter(Boolean) : [],
  };
}

function itemTitle(item: any, index: number): string {
  return (
    item.sectionRef ||
    item.fieldKey ||
    item.fieldLabel ||
    item.itemRef ||
    item.roomName ||
    item.title ||
    `Item ${index + 1}`
  );
}

function itemSummary(item: any): string {
  if (item.aiSummary) return String(item.aiSummary);
  const ai = item.aiComparisonJson || {};
  if (ai.differences) return String(ai.differences);
  if (ai.damage) return String(ai.damage);
  return '';
}

function formatCost(value: unknown): string | null {
  return formatCurrency(value);
}

function renderPhotoRow(
  label: string,
  photos: string[],
  onPress: (uri: string) => void,
  themeColors: any,
) {
  if (photos.length === 0) return null;
  return (
    <View style={{ marginTop: spacing.sm }}>
      <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(11), fontWeight: '600' }}>
        {label}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
        {photos.map((photo, idx) => {
          const uri = resolvePhotoUrl(photo);
          return (
            <TouchableOpacity key={`${label}-${uri}-${idx}`} onPress={() => onPress(uri)}>
              <Image source={{ uri }} style={styles.thumb} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function TenantComparisonPreviewScreen({ navigation, route }: Props) {
  const { reportId } = route.params;
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useResponsive();
  const queryClient = useQueryClient();
  const signatureRef = useRef<any>(null);

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [showSignModal, setShowSignModal] = useState(false);
  const [disputeItem, setDisputeItem] = useState<any | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [commentText, setCommentText] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  const query = useQuery({
    queryKey: ['/api/tenant/comparison-reports', reportId],
    queryFn: () => tenantService.getComparisonReport(reportId),
  });

  const commentsQuery = useQuery({
    queryKey: ['/api/tenant/comparison-reports', reportId, 'comments'],
    queryFn: () => tenantService.getComparisonComments(reportId),
  });

  const report = query.data;
  const items: any[] = Array.isArray(report?.items)
    ? report.items
    : report?.comparisonItems ?? [];

  const canSign = useMemo(() => {
    if (!report) return false;
    return (
      (report.status === 'awaiting_signatures' || report.status === 'under_review') &&
      !report.tenantSignature
    );
  }, [report]);

  const canComment = useMemo(() => {
    if (!report) return false;
    return (
      report.status !== 'signed' &&
      report.status !== 'filed' &&
      !report.tenantSignature
    );
  }, [report]);

  const canDisputeReport = useMemo(() => {
    if (!report) return false;
    return (
      report.status !== 'signed' &&
      report.status !== 'filed' &&
      !report.tenantSignature
    );
  }, [report]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/tenant/comparison-reports'] });
    queryClient.invalidateQueries({ queryKey: ['/api/tenant/comparison-reports', reportId] });
    queryClient.invalidateQueries({
      queryKey: ['/api/tenant/comparison-reports', reportId, 'comments'],
    });
  };

  const signMutation = useMutation({
    mutationFn: (signature: string) => tenantService.signComparisonReport(reportId, signature),
    onSuccess: () => {
      setShowSignModal(false);
      invalidate();
      Alert.alert('Signed', 'Your electronic signature has been recorded.');
    },
    onError: (e: any) => {
      Alert.alert('Could not sign', e?.message || 'Please try again.');
    },
  });

  const disputeMutation = useMutation({
    mutationFn: ({ itemId, reason }: { itemId: string; reason: string }) =>
      tenantService.disputeComparisonItem(reportId, itemId, reason),
    onSuccess: () => {
      setDisputeItem(null);
      setDisputeReason('');
      invalidate();
      Alert.alert(
        'Dispute submitted',
        'Your dispute has been recorded. Costs may be recalculated based on the review.',
      );
    },
    onError: (e: any) => {
      Alert.alert('Could not submit dispute', e?.message || 'Please try again.');
    },
  });

  const commentMutation = useMutation({
    mutationFn: (content: string) => tenantService.addComparisonComment(reportId, content),
    onSuccess: () => {
      setCommentText('');
      commentsQuery.refetch();
    },
    onError: (e: any) => {
      Alert.alert('Could not add comment', e?.message || 'Please try again.');
    },
  });

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const response = await fetch(`${getAPI_URL()}/api/comparison-reports/${reportId}/pdf`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/pdf' },
      });
      if (!response.ok) throw new Error('Failed to generate PDF');
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let base64 = '';
      let i = 0;
      while (i < uint8Array.length) {
        const a = uint8Array[i++];
        const b = i < uint8Array.length ? uint8Array[i++] : 0;
        const c = i < uint8Array.length ? uint8Array[i++] : 0;
        const bitmap = (a << 16) | (b << 8) | c;
        base64 += chars.charAt((bitmap >> 18) & 63);
        base64 += chars.charAt((bitmap >> 12) & 63);
        base64 += i - 2 < uint8Array.length ? chars.charAt((bitmap >> 6) & 63) : '=';
        base64 += i - 1 < uint8Array.length ? chars.charAt(bitmap & 63) : '=';
      }
      const fileUri = `${FileSystem.documentDirectory}comparison-report-${reportId}.pdf`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: 'base64' as any });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save Comparison PDF',
        });
      } else {
        Alert.alert('PDF saved', 'The report PDF was saved on this device.');
      }
    } catch (e: any) {
      Alert.alert('PDF error', e?.message || 'Failed to download PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  if (query.isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: themeColors.background, paddingTop: insets.top }]}>
        <LoadingSpinner />
      </View>
    );
  }

  if (query.isError || !report) {
    return (
      <View
        style={[
          styles.centered,
          { backgroundColor: themeColors.background, padding: spacing.lg, paddingTop: insets.top },
        ]}
      >
        <Text style={{ color: themeColors.text?.primary, fontWeight: '600', marginBottom: spacing.sm }}>
          We couldn't load this report
        </Text>
        <Button title="Try again" onPress={() => void query.refetch()} />
        <Button
          title="Go back"
          variant="outline"
          onPress={() => navigation.goBack()}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    );
  }

  const propertyTitle = report.property?.name || report.propertyName || 'Comparison report';
  const totalCost = formatCost(report.totalEstimatedCost);
  const comments: TenantComparisonComment[] = commentsQuery.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.sm,
            borderBottomColor: themeColors.border?.DEFAULT ?? '#e5e5e5',
          },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
          <ArrowLeft size={moderateScale(22)} color={themeColors.text?.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text?.primary }]} numberOfLines={1}>
          Comparison report
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.md,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching || commentsQuery.isRefetching}
            onRefresh={() => {
              void query.refetch();
              void commentsQuery.refetch();
            }}
          />
        }
      >
        <Card>
          <Text style={[styles.title, { color: themeColors.text?.primary }]}>{propertyTitle}</Text>
          {report.property?.address ? (
            <Text style={{ color: themeColors.text?.secondary, marginTop: 4, fontSize: getFontSize(13) }}>
              {report.property.address}
            </Text>
          ) : null}
          <Text style={{ color: themeColors.text?.secondary, marginTop: 6, fontSize: getFontSize(13) }}>
            Status: {String(report.status || '—').replace(/_/g, ' ')}
          </Text>
          {totalCost != null ? (
            <Text style={{ color: themeColors.text?.primary, marginTop: 6, fontWeight: '700' }}>
              Your estimated liability: {totalCost}
            </Text>
          ) : null}
          {report.tenantSignature ? (
            <Text style={{ color: themeColors.status?.online ?? '#22c55e', marginTop: 8, fontWeight: '600' }}>
              You have signed this report
            </Text>
          ) : canSign ? (
            <Text style={{ color: '#ea580c', marginTop: 8, fontWeight: '600' }}>Signature required</Text>
          ) : null}
        </Card>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            title={pdfBusy ? 'PDF…' : 'Download PDF'}
            variant="outline"
            icon={<Download size={16} color={themeColors.primary?.DEFAULT} />}
            loading={pdfBusy}
            disabled={pdfBusy}
            onPress={() => void downloadPdf()}
            style={{ flex: 1, minHeight: getButtonHeight() }}
          />
          {canSign ? (
            <Button
              title="Sign"
              icon={<PenLine size={16} color="#fff" />}
              onPress={() => setShowSignModal(true)}
              style={{ flex: 1, minHeight: getButtonHeight() }}
            />
          ) : null}
        </View>

        <Text style={[styles.sectionHeading, { color: themeColors.text?.primary }]}>Items</Text>

        {items.length === 0 ? (
          <Card>
            <Text style={{ color: themeColors.text?.secondary }}>No line items on this report.</Text>
          </Card>
        ) : (
          items.map((item: any, index: number) => {
            const photos = itemPhotos(item);
            const summary = itemSummary(item);
            const estimated = formatCost(item.estimatedCost);
            const depreciation = formatCost(item.depreciation);
            const finalCost = formatCost(item.finalCost);
            const itemCanDispute =
              canDisputeReport &&
              item.status !== 'disputed' &&
              item.status !== 'resolved' &&
              item.status !== 'waived';

            return (
              <Card key={item.id || index}>
                <Text style={[styles.itemTitle, { color: themeColors.text?.primary }]}>
                  {itemTitle(item, index)}
                </Text>
                {item.status ? (
                  <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12), marginTop: 2 }}>
                    Status: {String(item.status).replace(/_/g, ' ')}
                    {item.liabilityDecision ? ` · Liability: ${item.liabilityDecision}` : ''}
                  </Text>
                ) : null}
                {summary ? (
                  <Text
                    style={{
                      color: themeColors.text?.secondary,
                      marginTop: 6,
                      fontSize: getFontSize(13),
                      lineHeight: getFontSize(18),
                    }}
                  >
                    {summary}
                  </Text>
                ) : null}

                <View style={styles.costGrid}>
                  {estimated != null ? (
                    <View style={styles.costCell}>
                      <Text style={styles.costLabel}>Estimated</Text>
                      <Text style={[styles.costValue, { color: themeColors.text?.primary }]}>{estimated}</Text>
                    </View>
                  ) : null}
                  {depreciation != null ? (
                    <View style={styles.costCell}>
                      <Text style={styles.costLabel}>Depreciation</Text>
                      <Text style={[styles.costValue, { color: themeColors.text?.primary }]}>
                        −{depreciation}
                      </Text>
                    </View>
                  ) : null}
                  {finalCost != null ? (
                    <View style={styles.costCell}>
                      <Text style={styles.costLabel}>Your liability</Text>
                      <Text style={[styles.costValue, { color: themeColors.text?.primary, fontWeight: '700' }]}>
                        {finalCost}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {item.status === 'disputed' && item.aiCostCalculationNotes ? (
                  <View
                    style={[
                      styles.notesBox,
                      { backgroundColor: themeColors.muted?.DEFAULT ?? '#f5f5f5', marginTop: spacing.sm },
                    ]}
                  >
                    <Text style={{ fontSize: getFontSize(11), fontWeight: '600', color: '#737373' }}>
                      AI cost notes
                      {item.costCalculationMethod
                        ? ` · ${
                            item.costCalculationMethod === 'depreciation'
                              ? 'Based on Asset Depreciation'
                              : 'Based on Local Market Search'
                          }`
                        : ''}
                    </Text>
                    <Text style={{ marginTop: 4, fontSize: getFontSize(13), color: themeColors.text?.primary }}>
                      {item.aiCostCalculationNotes}
                    </Text>
                  </View>
                ) : null}

                {item.disputeReason ? (
                  <Text style={{ color: '#ea580c', marginTop: 6, fontSize: getFontSize(13) }}>
                    Dispute: {item.disputeReason}
                  </Text>
                ) : null}

                {renderPhotoRow('Check-in photos', photos.checkIn, setPreviewUri, themeColors)}
                {renderPhotoRow('Check-out photos', photos.checkOut, setPreviewUri, themeColors)}

                {itemCanDispute ? (
                  <Button
                    title="Dispute item"
                    variant="outline"
                    size="sm"
                    style={{ marginTop: spacing.md }}
                    onPress={() => {
                      setDisputeItem(item);
                      setDisputeReason('');
                    }}
                  />
                ) : null}
              </Card>
            );
          })
        )}

        {(report.operatorSignature || report.tenantSignature) ? (
          <Card>
            <Text style={[styles.sectionHeading, { color: themeColors.text?.primary }]}>
              Electronic signatures
            </Text>
            {report.operatorSignature ? (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12) }}>Operator</Text>
                {String(report.operatorSignature).startsWith('data:image/') ||
                String(report.operatorSignature).startsWith('http') ||
                String(report.operatorSignature).startsWith('/') ? (
                  <Image
                    source={{ uri: resolvePhotoUrl(String(report.operatorSignature)) }}
                    style={styles.sigImage}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={{ color: themeColors.text?.primary, marginTop: 4 }}>
                    {String(report.operatorSignature)}
                  </Text>
                )}
              </View>
            ) : null}
            {report.tenantSignature ? (
              <View style={{ marginTop: spacing.md }}>
                <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12) }}>Tenant</Text>
                {String(report.tenantSignature).startsWith('data:image/') ||
                String(report.tenantSignature).startsWith('http') ||
                String(report.tenantSignature).startsWith('/') ? (
                  <Image
                    source={{ uri: resolvePhotoUrl(String(report.tenantSignature)) }}
                    style={styles.sigImage}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={{ color: themeColors.text?.primary, marginTop: 4 }}>
                    {String(report.tenantSignature)}
                  </Text>
                )}
              </View>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <View style={styles.commentHeader}>
            <MessageSquare size={18} color={themeColors.primary?.DEFAULT ?? colors.primary.DEFAULT} />
            <Text style={[styles.sectionHeading, { color: themeColors.text?.primary, marginBottom: 0 }]}>
              Comments
            </Text>
          </View>

          {commentsQuery.isLoading ? (
            <ActivityIndicator color={themeColors.primary?.DEFAULT} style={{ marginVertical: spacing.md }} />
          ) : comments.length === 0 ? (
            <Text style={{ color: themeColors.text?.secondary, marginTop: spacing.sm, fontSize: getFontSize(13) }}>
              No comments yet.
            </Text>
          ) : (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {comments.map((c) => (
                <View
                  key={c.id}
                  style={[styles.commentBubble, { backgroundColor: themeColors.muted?.DEFAULT ?? '#f5f5f5' }]}
                >
                  <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(11) }}>
                    {c.authorName || c.authorRole || 'User'}
                    {c.createdAt ? ` · ${new Date(c.createdAt).toLocaleString()}` : ''}
                  </Text>
                  <Text style={{ color: themeColors.text?.primary, marginTop: 2, fontSize: getFontSize(14) }}>
                    {c.content}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {canComment ? (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <Input
                label="Add a comment"
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Write a comment…"
                multiline
                style={{ minHeight: 72, textAlignVertical: 'top' }}
              />
              <Button
                title={commentMutation.isPending ? 'Posting…' : 'Post comment'}
                disabled={!commentText.trim() || commentMutation.isPending}
                loading={commentMutation.isPending}
                onPress={() => {
                  const content = commentText.trim();
                  if (!content) return;
                  commentMutation.mutate(content);
                }}
              />
            </View>
          ) : (
            <Text style={{ color: themeColors.text?.secondary, marginTop: spacing.sm, fontSize: getFontSize(12) }}>
              Comments are closed for this report.
            </Text>
          )}
        </Card>
      </ScrollView>

      {/* Photo preview */}
      <Modal visible={!!previewUri} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={[styles.modalClose, { top: Math.max(insets.top, 12) + 8, right: 16 }]}
            onPress={() => setPreviewUri(null)}
          >
            <X size={28} color="#fff" />
          </TouchableOpacity>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={{ width: winW, height: winH * 0.8 }}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>

      {/* Sign modal */}
      <Modal visible={showSignModal} animationType="slide" onRequestClose={() => setShowSignModal(false)}>
        <View style={[styles.signModal, { paddingTop: insets.top + spacing.md, backgroundColor: themeColors.background }]}>
          <Text style={[styles.title, { color: themeColors.text?.primary, marginBottom: spacing.sm }]}>
            Sign this report
          </Text>
          <Text style={{ color: themeColors.text?.secondary, marginBottom: spacing.md, fontSize: getFontSize(13) }}>
            Draw your signature below, then confirm. The report is only marked signed after the server confirms.
          </Text>
          <View style={styles.signaturePad}>
            <SignatureCanvas
              ref={(ref: any) => {
                signatureRef.current = ref;
              }}
              onOK={(signature: string) => {
                if (!signature) {
                  Alert.alert('Signature required', 'Please draw your signature before confirming.');
                  return;
                }
                signMutation.mutate(signature);
              }}
              onEmpty={() => {
                Alert.alert('Signature required', 'Please draw your signature before confirming.');
              }}
              descriptionText=""
              clearText="Clear"
              confirmText=""
              webStyle={`
                .m-signature-pad { box-shadow: none; border: 1px solid #e5e5e5; border-radius: 8px; }
                .m-signature-pad--footer { display: none; }
                body,html { background-color: #fff; }
              `}
              autoClear={false}
              style={{ flex: 1 }}
            />
          </View>
          <View style={styles.signActions}>
            <Button
              title="Cancel"
              variant="outline"
              onPress={() => setShowSignModal(false)}
              disabled={signMutation.isPending}
              style={{ flex: 1 }}
            />
            <Button
              title="Clear"
              variant="secondary"
              onPress={() => signatureRef.current?.clearSignature?.()}
              disabled={signMutation.isPending}
              style={{ flex: 1 }}
            />
            <Button
              title={signMutation.isPending ? 'Submitting…' : 'Confirm'}
              loading={signMutation.isPending}
              disabled={signMutation.isPending}
              onPress={() => signatureRef.current?.readSignature?.()}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </Modal>

      {/* Dispute modal */}
      <Modal visible={!!disputeItem} transparent animationType="slide" onRequestClose={() => setDisputeItem(null)}>
        <View style={styles.disputeBackdrop}>
          <View style={[styles.disputeSheet, { backgroundColor: themeColors.card?.DEFAULT ?? '#fff', paddingBottom: insets.bottom + spacing.md }]}>
            <Text style={[styles.title, { color: themeColors.text?.primary }]}>Dispute item</Text>
            <Text style={{ color: themeColors.text?.secondary, marginVertical: spacing.sm, fontSize: getFontSize(13) }}>
              {disputeItem ? itemTitle(disputeItem, 0) : ''}
            </Text>
            <Input
              label="Reason *"
              value={disputeReason}
              onChangeText={setDisputeReason}
              placeholder="Explain why you dispute this item…"
              multiline
              style={{ minHeight: 100, textAlignVertical: 'top' }}
            />
            <View style={[styles.signActions, { marginTop: spacing.md }]}>
              <Button title="Cancel" variant="outline" onPress={() => setDisputeItem(null)} style={{ flex: 1 }} />
              <Button
                title={disputeMutation.isPending ? 'Submitting…' : 'Submit dispute'}
                loading={disputeMutation.isPending}
                disabled={disputeMutation.isPending || !disputeReason.trim()}
                style={{ flex: 1 }}
                onPress={() => {
                  if (!disputeItem?.id || !disputeReason.trim()) {
                    Alert.alert('Reason required', 'Please enter a dispute reason.');
                    return;
                  }
                  disputeMutation.mutate({ itemId: disputeItem.id, reason: disputeReason.trim() });
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
  title: { fontSize: getFontSize(18), fontWeight: '700' },
  sectionHeading: { fontSize: getFontSize(16), fontWeight: '700', marginBottom: spacing.xs },
  itemTitle: { fontSize: getFontSize(15), fontWeight: '600' },
  costGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  costCell: { minWidth: '28%', flexGrow: 1 },
  costLabel: { fontSize: getFontSize(11), color: '#737373', fontWeight: '600' },
  costValue: { fontSize: getFontSize(14), marginTop: 2 },
  notesBox: { borderRadius: borderRadius.md, padding: spacing.sm },
  sigImage: {
    width: '100%',
    height: 80,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  thumb: {
    width: moderateScale(88),
    height: moderateScale(88),
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    backgroundColor: '#e5e5e5',
  },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  commentBubble: { borderRadius: borderRadius.md, padding: spacing.sm },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: { position: 'absolute', zIndex: 2, padding: 8 },
  fullImage: { width: '100%' },
  signModal: { flex: 1, paddingHorizontal: spacing.md },
  signaturePad: {
    flex: 1,
    minHeight: 220,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  signActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.md },
  disputeBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  disputeSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
  },
});
