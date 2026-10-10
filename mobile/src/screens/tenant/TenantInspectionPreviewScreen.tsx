import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Modal,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SignatureCanvas from 'react-native-signature-canvas';
import {
  ArrowLeft,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  MapPin,
  PenLine,
  User,
  Wrench,
  X,
} from 'lucide-react-native';
import { inspectionsService } from '../../services/inspections';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { colors, spacing, borderRadius } from '../../theme';
import { getFontSize, getButtonHeight, moderateScale } from '../../utils/responsive';
import { useResponsive } from '../../hooks/useResponsive';
import { useTenantPortalFlags } from '../../hooks/useTenantPortalFlags';
import { getAPI_URL } from '../../services/api';
import type { TenantHomeStackParamList } from '../../navigation/types';
import {
  formatSignerDisplayName,
  isTenantSignatureField,
  parseSignatureValue,
} from '../../../../shared/signature';

type Props = NativeStackScreenProps<TenantHomeStackParamList, 'TenantInspectionPreview'>;

function resolvePhotoUrl(photo: string): string {
  if (!photo) return '';
  if (photo.startsWith('http') || photo.startsWith('data:')) return photo;
  if (photo.startsWith('/')) return `${getAPI_URL()}${photo}`;
  return `${getAPI_URL()}/objects/${photo}`;
}

function formatValue(valueJson: any): React.ReactNode {
  if (valueJson == null || valueJson === '') return null;
  if (typeof valueJson === 'object' && !Array.isArray(valueJson)) {
    return Object.entries(valueJson).map(([key, value]) => (
      <Text key={key} style={{ fontSize: getFontSize(13), marginTop: 2 }}>
        <Text style={{ fontWeight: '600' }}>{key}: </Text>
        {typeof value === 'string' ? value : JSON.stringify(value)}
      </Text>
    ));
  }
  return <Text style={{ fontSize: getFontSize(14) }}>{String(valueJson)}</Text>;
}

export default function TenantInspectionPreviewScreen({ navigation, route }: Props) {
  const { inspectionId } = route.params;
  const { user } = useAuth();
  const { maintenanceEnabled } = useTenantPortalFlags();
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useResponsive();
  const queryClient = useQueryClient();
  const signatureRef = useRef<any>(null);

  const [comments, setComments] = useState('');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [showSignModal, setShowSignModal] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [maintenanceTarget, setMaintenanceTarget] = useState<{
    entryId: string;
    fieldLabel: string;
    sectionTitle: string;
  } | null>(null);
  const [maintTitle, setMaintTitle] = useState('');
  const [maintDescription, setMaintDescription] = useState('');
  const [maintPriority, setMaintPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const inspectionQuery = useQuery({
    queryKey: ['/api/inspections', inspectionId],
    queryFn: () => inspectionsService.getInspection(inspectionId),
  });

  const entriesQuery = useQuery({
    queryKey: ['/api/inspections', inspectionId, 'entries'],
    queryFn: () => inspectionsService.getInspectionEntries(inspectionId),
  });

  const inspection = inspectionQuery.data;
  const entries = entriesQuery.data ?? [];

  useEffect(() => {
    if (inspection?.tenantComments != null) {
      setComments(String(inspection.tenantComments));
    }
  }, [inspection?.id, inspection?.tenantComments]);

  const isPending = inspection?.tenantApprovalStatus === 'pending';
  const isSigned =
    inspection?.tenantApprovalStatus === 'signed' ||
    inspection?.tenantApprovalStatus === 'approved';

  const sections = useMemo(() => {
    const template = inspection?.templateSnapshotJson as { sections?: any[] } | null | undefined;
    return template?.sections || [];
  }, [inspection?.templateSnapshotJson]);

  const entriesBySection = useMemo(() => {
    const acc: Record<string, any[]> = {};
    for (const entry of entries as any[]) {
      const key = entry.sectionRef || 'unknown';
      if (!acc[key]) acc[key] = [];
      acc[key].push(entry);
    }
    return acc;
  }, [entries]);

  const tenantSignatureEntry = useMemo(
    () =>
      (entries as any[]).find(
        (e) =>
          (e.fieldType === 'signature' || e.fieldType === 'Signature') &&
          isTenantSignatureField({ key: e.fieldKey, id: e.fieldKey, label: e.fieldKey }),
      ),
    [entries],
  );
  const existingSignature = parseSignatureValue(tenantSignatureEntry?.valueJson);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/inspections', inspectionId] });
    queryClient.invalidateQueries({ queryKey: ['/api/inspections', inspectionId, 'entries'] });
    queryClient.invalidateQueries({ queryKey: ['/api/tenant/check-ins'] });
  };

  const commentsMutation = useMutation({
    mutationFn: (text: string) => inspectionsService.saveTenantComments(inspectionId, text),
    onSuccess: () => {
      invalidateAll();
      Alert.alert('Comments saved', 'Your comments have been saved.');
    },
    onError: (e: any) => {
      Alert.alert('Error', e?.message || 'Failed to save comments.');
    },
  });

  const signMutation = useMutation({
    mutationFn: (image: string) =>
      inspectionsService.tenantSignInspection(inspectionId, {
        image,
        signedByName: formatSignerDisplayName(user),
        signedAt: new Date().toISOString(),
        comments: comments.trim() || undefined,
      }),
    onSuccess: () => {
      setShowSignModal(false);
      invalidateAll();
      Alert.alert('Inspection signed', 'Thank you. Your signature has been recorded.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (e: any) => {
      Alert.alert('Could not sign', e?.message || 'Failed to sign inspection.');
    },
  });

  const maintenanceMutation = useMutation({
    mutationFn: () =>
      inspectionsService.createQuickMaintenance({
        title: maintTitle.trim(),
        description: maintDescription.trim() || undefined,
        propertyId: inspection?.propertyId || inspection?.property?.id,
        priority: maintPriority,
        inspectionId,
        inspectionEntryId: maintenanceTarget?.entryId,
        source: 'inspection',
      }),
    onSuccess: () => {
      setMaintenanceTarget(null);
      setMaintTitle('');
      setMaintDescription('');
      setMaintPriority('medium');
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/maintenance-requests'] });
      Alert.alert('Request logged', 'A maintenance request was created for this field.');
    },
    onError: (e: any) => {
      Alert.alert('Error', e?.message || 'Failed to create maintenance request.');
    },
  });

  const loading = inspectionQuery.isLoading || entriesQuery.isLoading;

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: themeColors.background, paddingTop: insets.top }]}>
        <LoadingSpinner />
      </View>
    );
  }

  if (inspectionQuery.isError || !inspection) {
    return (
      <View
        style={[
          styles.centered,
          { backgroundColor: themeColors.background, padding: spacing.lg, paddingTop: insets.top },
        ]}
      >
        <Text style={{ color: themeColors.text?.primary, fontWeight: '600', marginBottom: spacing.sm }}>
          We couldn't load this inspection
        </Text>
        <Button title="Try again" onPress={() => void inspectionQuery.refetch()} />
        <Button
          title="Go back"
          variant="outline"
          onPress={() => navigation.goBack()}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    );
  }

  const typeLabel =
    inspection.type === 'check_out' ? 'Check-Out' : inspection.type === 'check_in' ? 'Check-In' : inspection.type;

  const renderEntryCard = (
    entry: any,
    field: any,
    sectionTitle: string,
  ) => {
    const label = field?.label || entry.fieldLabel || entry.fieldKey || 'Field';
    const description = field?.description;
    const fieldType = field?.type || entry.fieldType;
    const sig = fieldType === 'signature' ? parseSignatureValue(entry.valueJson) : null;
    const photos: string[] = Array.isArray(entry.photos) ? entry.photos : [];

    return (
      <Card key={entry.id || `${entry.sectionRef}-${entry.fieldKey}`}>
        <View style={styles.entryHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.fieldLabel, { color: themeColors.text?.primary }]}>{label}</Text>
            {description ? (
              <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12), marginTop: 2 }}>
                {description}
              </Text>
            ) : null}
          </View>
          {maintenanceEnabled && isPending ? (
            <Button
              title="Log"
              variant="outline"
              size="sm"
              icon={<Wrench size={14} color={themeColors.primary?.DEFAULT} />}
              onPress={() => {
                setMaintenanceTarget({
                  entryId: entry.id,
                  fieldLabel: label,
                  sectionTitle,
                });
                setMaintTitle(label);
                setMaintDescription('');
              }}
            />
          ) : null}
        </View>

        {sig?.image ? (
          <View style={[styles.valueBox, { backgroundColor: themeColors.muted?.DEFAULT ?? '#f5f5f5' }]}>
            <Text style={styles.valueLabel}>Signature</Text>
            <Image source={{ uri: resolvePhotoUrl(sig.image) }} style={styles.sigImage} resizeMode="contain" />
          </View>
        ) : entry.valueJson != null && entry.valueJson !== '' ? (
          <View style={[styles.valueBox, { backgroundColor: themeColors.muted?.DEFAULT ?? '#f5f5f5' }]}>
            <Text style={styles.valueLabel}>Value</Text>
            <View style={{ marginTop: 4 }}>{formatValue(entry.valueJson)}</View>
          </View>
        ) : null}

        {entry.note ? (
          <View style={[styles.valueBox, { backgroundColor: themeColors.muted?.DEFAULT ?? '#f5f5f5', marginTop: spacing.sm }]}>
            <Text style={styles.valueLabel}>Inspector notes</Text>
            <Text style={{ marginTop: 4, fontSize: getFontSize(13), color: themeColors.text?.primary }}>
              {entry.note}
            </Text>
          </View>
        ) : null}

        {photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
            {photos.map((photo, idx) => {
              const uri = resolvePhotoUrl(photo);
              return (
                <TouchableOpacity key={`${uri}-${idx}`} onPress={() => setPreviewUri(uri)}>
                  <Image source={{ uri }} style={styles.thumb} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}
      </Card>
    );
  };

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
          {typeLabel} review
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
            refreshing={inspectionQuery.isRefetching || entriesQuery.isRefetching}
            onRefresh={() => {
              void inspectionQuery.refetch();
              void entriesQuery.refetch();
            }}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.badgeRow}>
          {isSigned ? (
            <View style={[styles.badge, { backgroundColor: '#22c55e' }]}>
              <Text style={styles.badgeText}>Signed</Text>
            </View>
          ) : null}
          {isPending ? (
            <View style={[styles.badge, { backgroundColor: '#FFF7ED', borderColor: '#f97316', borderWidth: 1 }]}>
              <Text style={[styles.badgeText, { color: '#ea580c' }]}>Signature required</Text>
            </View>
          ) : null}
        </View>

        <Card>
          <Text style={[styles.cardTitle, { color: themeColors.text?.primary }]}>Inspection details</Text>
          {inspection.property ? (
            <View style={{ marginTop: spacing.sm }}>
              <View style={styles.metaRow}>
                <Building2 size={16} color={themeColors.text?.secondary} />
                <Text style={{ color: themeColors.text?.primary, fontWeight: '600', flex: 1 }}>
                  {inspection.property.name}
                </Text>
              </View>
              {inspection.property.address ? (
                <View style={[styles.metaRow, { marginTop: 4 }]}>
                  <MapPin size={16} color={themeColors.text?.secondary} />
                  <Text style={{ color: themeColors.text?.secondary, flex: 1, fontSize: getFontSize(13) }}>
                    {inspection.property.address}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {inspection.clerk ? (
            <View style={[styles.metaRow, { marginTop: spacing.sm }]}>
              <User size={16} color={themeColors.text?.secondary} />
              <Text style={{ color: themeColors.text?.primary }}>
                {[inspection.clerk.firstName, inspection.clerk.lastName].filter(Boolean).join(' ') ||
                  inspection.clerk.email}
              </Text>
            </View>
          ) : null}
          {inspection.completedDate ? (
            <View style={[styles.metaRow, { marginTop: spacing.sm }]}>
              <Calendar size={16} color={themeColors.text?.secondary} />
              <Text style={{ color: themeColors.text?.primary }}>
                {new Date(inspection.completedDate).toLocaleString()}
              </Text>
            </View>
          ) : null}
        </Card>

        <Text style={[styles.sectionHeading, { color: themeColors.text?.primary }]}>Inspection entries</Text>
        <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12), marginTop: -spacing.sm }}>
          Fields are read-only.{maintenanceEnabled ? ' You can log maintenance if something needs attention.' : ''}
        </Text>

        {sections.length > 0
          ? sections.map((section: any) => {
              const sectionEntries = entriesBySection[section.id] || [];
              if (sectionEntries.length === 0) return null;
              const cards = sectionEntries
                .map((entry: any) => {
                  const field = section.fields?.find(
                    (f: any) => f.id === entry.fieldKey || f.key === entry.fieldKey,
                  );
                  if (!field) return null;
                  if (field.type === 'signature' && isTenantSignatureField(field)) return null;
                  return renderEntryCard(entry, field, section.title || 'Section');
                })
                .filter(Boolean);
              if (cards.length === 0) return null;
              const sectionId = String(section.id);
              const collapsed = !!collapsedSections[sectionId];
              return (
                <View key={sectionId} style={{ gap: spacing.sm }}>
                  <TouchableOpacity
                    onPress={() => toggleSection(sectionId)}
                    style={styles.sectionToggle}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !collapsed }}
                    accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${section.title || 'section'}`}
                  >
                    <Text
                      style={[
                        styles.sectionTitle,
                        { color: themeColors.primary?.DEFAULT ?? colors.primary.DEFAULT, flex: 1 },
                      ]}
                      numberOfLines={2}
                    >
                      {section.title}
                    </Text>
                    <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12), marginRight: 6 }}>
                      {cards.length}
                    </Text>
                    {collapsed ? (
                      <ChevronDown size={20} color={themeColors.text?.secondary} />
                    ) : (
                      <ChevronUp size={20} color={themeColors.text?.secondary} />
                    )}
                  </TouchableOpacity>
                  {!collapsed ? cards : null}
                </View>
              );
            })
          : // Fallback if template snapshot missing
            (entries as any[])
              .filter(
                (e) =>
                  !(
                    (e.fieldType === 'signature' || e.fieldType === 'Signature') &&
                    isTenantSignatureField({ key: e.fieldKey, id: e.fieldKey, label: e.fieldKey })
                  ),
              )
              .map((entry) =>
                renderEntryCard(entry, { label: entry.fieldLabel || entry.fieldKey, type: entry.fieldType }, 'Entries'),
              )}

        <Card>
          <Text style={[styles.cardTitle, { color: themeColors.text?.primary }]}>Your comments</Text>
          <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12), marginBottom: spacing.sm }}>
            Optional comments about this inspection. You can save them before signing.
          </Text>
          <Input
            value={comments}
            onChangeText={setComments}
            placeholder="Add comments…"
            multiline
            editable={isPending}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
          {isPending ? (
            <Button
              title={commentsMutation.isPending ? 'Saving…' : 'Save comments'}
              variant="outline"
              loading={commentsMutation.isPending}
              disabled={commentsMutation.isPending}
              onPress={() => commentsMutation.mutate(comments)}
              style={{ marginTop: spacing.md, minHeight: getButtonHeight() }}
            />
          ) : null}
        </Card>

        <Card>
          <Text style={[styles.cardTitle, { color: themeColors.text?.primary }]}>Your signature</Text>
          {isSigned ? (
            <View style={{ marginTop: spacing.sm }}>
              <Text style={{ color: '#16a34a', fontWeight: '600', marginBottom: spacing.sm }}>
                You have signed this inspection
                {inspection.tenantApprovedAt
                  ? ` · ${new Date(inspection.tenantApprovedAt).toLocaleString()}`
                  : ''}
              </Text>
              {existingSignature?.image ? (
                <Image
                  source={{ uri: resolvePhotoUrl(existingSignature.image) }}
                  style={styles.existingSig}
                  resizeMode="contain"
                />
              ) : null}
            </View>
          ) : isPending ? (
            <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
              <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(13) }}>
                Review the inspection above, then draw your signature to confirm.
              </Text>
              <Button
                title="Sign inspection"
                icon={<PenLine size={16} color="#fff" />}
                onPress={() => setShowSignModal(true)}
                style={{ minHeight: getButtonHeight() }}
              />
            </View>
          ) : (
            <Text style={{ color: themeColors.text?.secondary, marginTop: spacing.sm }}>
              This inspection is not awaiting your signature.
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
      <Modal visible={showSignModal} animationType="slide" onRequestClose={() => !signMutation.isPending && setShowSignModal(false)}>
        <View
          style={[
            styles.signModal,
            { paddingTop: insets.top + spacing.md, backgroundColor: themeColors.background },
          ]}
        >
          <Text style={[styles.cardTitle, { color: themeColors.text?.primary }]}>Sign inspection</Text>
          <Text style={{ color: themeColors.text?.secondary, marginBottom: spacing.md, fontSize: getFontSize(13) }}>
            Draw your signature, then confirm. The inspection is only marked signed after the server confirms.
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
              disabled={signMutation.isPending}
              onPress={() => setShowSignModal(false)}
              style={{ flex: 1 }}
            />
            <Button
              title="Clear"
              variant="secondary"
              disabled={signMutation.isPending}
              onPress={() => signatureRef.current?.clearSignature?.()}
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
          {signMutation.isPending ? (
            <ActivityIndicator color={themeColors.primary?.DEFAULT} style={{ marginBottom: spacing.md }} />
          ) : null}
        </View>
      </Modal>

      {/* Quick maintenance */}
      <Modal
        visible={maintenanceEnabled && !!maintenanceTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setMaintenanceTarget(null)}
      >
        <View style={styles.disputeBackdrop}>
          <View
            style={[
              styles.disputeSheet,
              {
                backgroundColor: themeColors.card?.DEFAULT ?? '#fff',
                paddingBottom: insets.bottom + spacing.md,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: themeColors.text?.primary }]}>Log maintenance</Text>
            <Text style={{ color: themeColors.text?.secondary, marginVertical: spacing.sm, fontSize: getFontSize(13) }}>
              {maintenanceTarget?.sectionTitle} · {maintenanceTarget?.fieldLabel}
            </Text>
            <Input label="Title *" value={maintTitle} onChangeText={setMaintTitle} />
            <View style={{ height: spacing.sm }} />
            <Input
              label="Description"
              value={maintDescription}
              onChangeText={setMaintDescription}
              multiline
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
            <Text style={{ color: themeColors.text?.secondary, marginTop: spacing.md, marginBottom: spacing.xs, fontSize: getFontSize(12) }}>
              Priority
            </Text>
            <View style={styles.priorityRow}>
              {(['low', 'medium', 'high', 'urgent'] as const).map((p) => {
                const selected = maintPriority === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setMaintPriority(p)}
                    style={[
                      styles.priorityChip,
                      {
                        backgroundColor: selected
                          ? themeColors.primary?.DEFAULT ?? colors.primary.DEFAULT
                          : themeColors.muted?.DEFAULT ?? '#f5f5f5',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: selected ? '#fff' : themeColors.text?.primary,
                        fontWeight: '600',
                        textTransform: 'capitalize',
                        fontSize: getFontSize(12),
                      }}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={[styles.signActions, { marginTop: spacing.md }]}>
              <Button title="Cancel" variant="outline" onPress={() => setMaintenanceTarget(null)} style={{ flex: 1 }} />
              <Button
                title={maintenanceMutation.isPending ? 'Submitting…' : 'Submit'}
                loading={maintenanceMutation.isPending}
                disabled={maintenanceMutation.isPending || !maintTitle.trim()}
                style={{ flex: 1 }}
                onPress={() => {
                  if (!maintTitle.trim()) {
                    Alert.alert('Title required', 'Please enter a title for the request.');
                    return;
                  }
                  maintenanceMutation.mutate();
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
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: { borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: getFontSize(12) },
  cardTitle: { fontSize: getFontSize(17), fontWeight: '700' },
  sectionHeading: { fontSize: getFontSize(16), fontWeight: '700' },
  sectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sectionTitle: { fontSize: getFontSize(15), fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  entryHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  fieldLabel: { fontSize: getFontSize(15), fontWeight: '600' },
  valueBox: { borderRadius: borderRadius.md, padding: spacing.sm },
  valueLabel: { fontSize: getFontSize(11), color: '#737373', fontWeight: '600' },
  sigImage: { height: 64, width: '100%', marginTop: 4, backgroundColor: '#fff', borderRadius: 4 },
  thumb: {
    width: moderateScale(88),
    height: moderateScale(88),
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    backgroundColor: '#e5e5e5',
  },
  existingSig: {
    width: '100%',
    height: 100,
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
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
  disputeBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  disputeSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  priorityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  priorityChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full },
});
