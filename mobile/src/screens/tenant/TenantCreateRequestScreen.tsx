import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, ImagePlus, Sparkles, X } from 'lucide-react-native';
import {
  tenantService,
  uploadTenantObject,
  type CreateTenantMaintenancePayload,
} from '../../services/tenant';
import { useTheme } from '../../contexts/ThemeContext';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { colors, spacing, borderRadius } from '../../theme';
import { getFontSize, getButtonHeight, moderateScale } from '../../utils/responsive';
import type { TenantMaintenanceStackParamList } from '../../navigation/types';
import MaintenanceAiAnalysisView, {
  applyMaintenanceAiNote,
} from '../../components/MaintenanceAiAnalysisView';
import { formatInspectionNote, parseInspectionNote } from '../../../../shared/inspectionNoteSections';

type Props = NativeStackScreenProps<TenantMaintenanceStackParamList, 'TenantCreateRequest'>;

const PRIORITIES: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

type AttachedPhoto = {
  /** Local file:// URI for on-device preview (Image can't auth to /objects/) */
  localUri: string;
  /** Server path used for submit / AI analyze */
  serverPath: string;
};

function toServerPath(path: string): string {
  if (!path) return '';
  if (path.startsWith('/objects/')) return path;
  if (path.startsWith('http') || path.startsWith('file:') || path.startsWith('data:')) return path;
  if (path.startsWith('/')) return path;
  return `/objects/${path}`;
}

export default function TenantCreateRequestScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const prefill = route.params;
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(prefill?.priority ?? 'medium');
  const [photos, setPhotos] = useState<AttachedPhoto[]>(() =>
    (prefill?.photoUrls ?? []).map((serverPath) => ({
      localUri: '',
      serverPath: toServerPath(serverPath),
    })),
  );
  const [aiSuggestedFixes, setAiSuggestedFixes] = useState(prefill?.aiSuggestedFixes ?? '');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const tenancyQuery = useQuery({
    queryKey: ['/api/tenant/tenancy'],
    queryFn: () => tenantService.getTenancy(),
  });

  const hasTenancy = !!tenancyQuery.data?.tenancy?.propertyId || !!tenancyQuery.data?.property?.id;

  const createMutation = useMutation({
    mutationFn: (payload: CreateTenantMaintenancePayload) =>
      tenantService.createMaintenanceRequest(payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tenant/maintenance-requests'] });
      Alert.alert('Request submitted', 'Your maintenance request has been sent to property management.', [
        {
          text: 'OK',
          onPress: () => {
            if (created?.id) {
              navigation.replace('TenantMaintenanceDetail', { requestId: created.id });
            } else {
              navigation.navigate('TenantMaintenanceRequests');
            }
          },
        },
      ]);
    },
    onError: (e: any) => {
      Alert.alert('Error', e?.message || 'Failed to submit request.');
    },
  });

  const pickAndUpload = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo access to attach images.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          allowsMultipleSelection: false,
        });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const path = await uploadTenantObject(asset.uri, asset.mimeType || 'image/jpeg');
      setPhotos((prev) => [
        ...prev,
        { localUri: asset.uri, serverPath: toServerPath(path) },
      ]);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Could not upload image.');
    } finally {
      setUploading(false);
    }
  };

  const analyzeFirstPhoto = async () => {
    if (photos.length === 0) return;
    setAnalyzing(true);
    try {
      const notes = [
        title.trim() ? `Title: ${title.trim()}` : '',
        description.trim() ? `Description: ${description.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      const res = await tenantService.analyzeMaintenanceImage(photos[0].serverPath, notes);
      const applied = applyMaintenanceAiNote(res.suggestedFixes || '', {
        preferExistingDescription: description,
      });
      setAiSuggestedFixes(applied.aiSuggestedFixes);
      if (applied.description) setDescription(applied.description);
      Alert.alert('AI analysis complete', 'Review the description, issues, and recommended actions below.');
    } catch (e: any) {
      Alert.alert('Analysis failed', e?.message || 'Could not analyze image.');
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = () => {
    if (!hasTenancy) {
      Alert.alert('No property linked', 'You need an active tenancy to log a request.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Title required', 'Please enter a short title for the issue.');
      return;
    }
    const photoUrls = photos.map((p) => p.serverPath).filter(Boolean);
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
      aiSuggestedFixes: aiSuggestedFixes.trim() || undefined,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + spacing.sm, borderBottomColor: themeColors.border?.DEFAULT ?? '#e5e5e5' },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
          <ArrowLeft size={moderateScale(22)} color={themeColors.text?.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text?.primary }]}>Log a request</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Input label="Title *" value={title} onChangeText={setTitle} placeholder="e.g. Leaking kitchen tap" />
          <View style={{ height: spacing.md }} />
          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the issue…"
            multiline
            style={{ minHeight: 100, textAlignVertical: 'top' }}
          />
          <Text style={[styles.label, { color: themeColors.text?.secondary, marginTop: spacing.md }]}>Priority</Text>
          <View style={styles.priorityRow}>
            {PRIORITIES.map((p) => {
              const selected = priority === p;
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPriority(p)}
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
                      fontSize: getFontSize(13),
                    }}
                  >
                    {p}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        <Card>
          <Text style={[styles.sectionTitle, { color: themeColors.text?.primary }]}>Photos</Text>
          <View style={styles.photoActions}>
            <Button
              title="Gallery"
              variant="outline"
              size="sm"
              icon={<ImagePlus size={16} color={themeColors.primary?.DEFAULT} />}
              onPress={() => void pickAndUpload(false)}
              disabled={uploading}
            />
            <Button
              title="Camera"
              variant="outline"
              size="sm"
              icon={<Camera size={16} color={themeColors.primary?.DEFAULT} />}
              onPress={() => void pickAndUpload(true)}
              disabled={uploading}
            />
          </View>
          {uploading ? <ActivityIndicator style={{ marginTop: spacing.sm }} color={themeColors.primary?.DEFAULT} /> : null}
          {photos.length > 0 ? (
            <ScrollView horizontal style={{ marginTop: spacing.sm }} showsHorizontalScrollIndicator={false}>
              {photos.map((photo, idx) => {
                const previewUri =
                  photo.localUri ||
                  (photo.serverPath.startsWith('http') || photo.serverPath.startsWith('file:')
                    ? photo.serverPath
                    : '');
                return (
                  <View key={`${photo.serverPath}-${idx}`} style={styles.thumbWrap}>
                    {previewUri ? (
                      <Image source={{ uri: previewUri }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbFallback]}>
                        <Text style={{ fontSize: getFontSize(11), color: '#666' }}>Photo</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.removePhoto}
                      onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <X size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          ) : null}
          {photos.length > 0 ? (
            <Button
              title={analyzing ? 'Analyzing…' : 'Analyze with AI'}
              variant="secondary"
              icon={<Sparkles size={16} color={themeColors.primary?.DEFAULT} />}
              onPress={() => void analyzeFirstPhoto()}
              disabled={analyzing}
              loading={analyzing}
              style={{ marginTop: spacing.md, minHeight: getButtonHeight() }}
            />
          ) : null}
          {aiSuggestedFixes ? (
            <View style={{ marginTop: spacing.sm }}>
              <MaintenanceAiAnalysisView
                note={aiSuggestedFixes}
                description={description}
                onDescriptionChange={(value) => {
                  setDescription(value);
                  const sections = parseInspectionNote(aiSuggestedFixes);
                  setAiSuggestedFixes(
                    formatInspectionNote({
                      ...sections,
                      description: value,
                    }),
                  );
                }}
                isDark={!!theme?.isDark}
              />
            </View>
          ) : null}
        </Card>

        <Button
          title={createMutation.isPending ? 'Submitting…' : 'Submit request'}
          onPress={submit}
          disabled={createMutation.isPending || uploading || !title.trim()}
          loading={createMutation.isPending}
          style={{ minHeight: getButtonHeight() }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: getFontSize(17), fontWeight: '600', flex: 1, textAlign: 'center' },
  label: { fontSize: getFontSize(12), marginBottom: spacing.xs },
  sectionTitle: { fontSize: getFontSize(16), fontWeight: '600', marginBottom: spacing.sm },
  priorityRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  priorityChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  photoActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  thumbWrap: { marginRight: spacing.sm, position: 'relative' },
  thumb: { width: moderateScale(72), height: moderateScale(72), borderRadius: borderRadius.md, backgroundColor: '#e5e5e5' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  removePhoto: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    padding: 2,
  },
});
