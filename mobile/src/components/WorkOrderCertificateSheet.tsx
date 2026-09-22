import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Network from 'expo-network';
import { X, Upload, FileText, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { spacing } from '../theme/spacing';
import { colors as baseColors } from '../theme';
import { maintenanceService, type WorkOrderCertificate } from '../services/maintenance';
import { getAPI_URL } from '../services/api';
import { DEFAULT_COMPLIANCE_DOC_TYPES } from '../../../shared/complianceDocTypes';

type Props = {
  visible: boolean;
  workOrderId: string | null;
  workOrderTitle?: string;
  onClose: () => void;
};

function toYmd(value?: string | null): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

async function uploadCertificateFile(uri: string, mimeType: string, fileName: string): Promise<string> {
  const uploadUrlResponse = await fetch(`${getAPI_URL()}/api/objects/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!uploadUrlResponse.ok) throw new Error('Failed to get upload URL');
  const { uploadURL } = await uploadUrlResponse.json();

  const fileResponse = await fetch(uri);
  const blob = await fileResponse.blob();
  const put = await fetch(uploadURL, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': mimeType || blob.type || 'application/octet-stream' },
  });
  if (!put.ok) throw new Error('Failed to upload file');

  let objectPath = uploadURL as string;
  if (objectPath.includes('?objectId=')) {
    const objectId = new URL(uploadURL).searchParams.get('objectId');
    if (objectId) objectPath = `/objects/${objectId}`;
  } else if (objectPath.includes('/objects/')) {
    const match = objectPath.match(/\/objects\/[^?]+/);
    if (match) objectPath = match[0];
  }

  const absoluteUrl = objectPath.startsWith('http')
    ? objectPath
    : `${getAPI_URL()}${objectPath.startsWith('/') ? objectPath : `/${objectPath}`}`;

  const acl = await fetch(`${getAPI_URL()}/api/objects/set-acl`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoUrl: absoluteUrl }),
  });
  if (!acl.ok) throw new Error('Failed to finalize upload');
  const data = await acl.json().catch(() => ({}));
  return (data.objectPath as string) || objectPath;
}

export function WorkOrderCertificateSheet({ visible, workOrderId, workOrderTitle, onClose }: Props) {
  const theme = useTheme();
  const themeColors = theme?.colors || baseColors;
  const primary =
    (themeColors as any).primary?.DEFAULT || (themeColors as any).primary || '#00CED1';
  const textPrimary =
    (themeColors as any).text?.primary || (themeColors as any).foreground || '#0a0a0a';
  const textSecondary =
    (themeColors as any).text?.secondary || (themeColors as any).muted?.foreground || '#737373';
  const border =
    (themeColors as any).border?.DEFAULT || (themeColors as any).border || '#e5e5e5';
  const cardBg = (themeColors as any).card?.DEFAULT || (themeColors as any).card || '#ffffff';
  const background = (themeColors as any).background || '#ffffff';

  const [certs, setCerts] = useState<WorkOrderCertificate[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualType, setManualType] = useState('');
  const [manualExpiry, setManualExpiry] = useState('');

  const active = certs[0] || null;

  const refresh = async () => {
    if (!workOrderId) return;
    setLoading(true);
    try {
      const list = await maintenanceService.listWorkOrderCertificates(workOrderId);
      setCerts(list);
      const first = list[0];
      if (first) {
        setManualType(first.certificateType || '');
        setManualExpiry(toYmd(first.expiryDate));
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load certificates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && workOrderId) {
      setCerts([]);
      setManualType('');
      setManualExpiry('');
      refresh();
    }
  }, [visible, workOrderId]);

  const ensureOnline = async (): Promise<boolean> => {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected || state.isInternetReachable === false) {
      Alert.alert(
        'Offline',
        'Adding a certificate to Compliance requires an internet connection.',
      );
      return false;
    }
    return true;
  };

  const runUploadAndAnalyse = async (uri: string, mimeType: string, fileName: string) => {
    if (!workOrderId) return;
    if (!(await ensureOnline())) return;
    setBusy(true);
    try {
      const documentUrl = await uploadCertificateFile(uri, mimeType, fileName);
      const created = await maintenanceService.createWorkOrderCertificate(workOrderId, {
        documentUrl,
        fileName,
        mimeType,
      });
      await maintenanceService.analyseWorkOrderCertificate(workOrderId, created.id);
      await refresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Certificate upload failed');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const mime = asset.mimeType || 'application/pdf';
      await runUploadAndAnalyse(asset.uri, mime, asset.name || 'certificate.pdf');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not pick document');
    }
  };

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Photo library access is required.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const mime = asset.mimeType || 'image/jpeg';
      const name = asset.fileName || `certificate-${Date.now()}.jpg`;
      await runUploadAndAnalyse(asset.uri, mime, name);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not pick photo');
    }
  };

  const confirm = async () => {
    if (!workOrderId || !active) return;
    if (!manualType.trim() || !manualExpiry.trim()) {
      Alert.alert('Missing details', 'Certificate type and expiry date are required.');
      return;
    }
    const today = new Date();
    const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`;
    if (manualExpiry.trim() < todayYmd) {
      Alert.alert('Invalid expiry', 'Expiry date cannot be in the past.');
      return;
    }
    if (!(await ensureOnline())) return;
    setBusy(true);
    try {
      await maintenanceService.confirmWorkOrderCertificate(workOrderId, active.id, {
        certificateType: manualType.trim(),
        expiryDate: manualExpiry.trim(),
      });
      await refresh();
      Alert.alert('Done', 'Certificate added to Compliance.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to add to Compliance');
    } finally {
      setBusy(false);
    }
  };

  const pickType = () => {
    const types = [...DEFAULT_COMPLIANCE_DOC_TYPES, 'Other'];
    Alert.alert('Certificate Type', 'Select a type', [
      ...types.map((t) => ({ text: t, onPress: () => setManualType(t) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const showConfirm =
    active &&
    (active.extractionStatus === 'ready_to_confirm' ||
      active.extractionStatus === 'needs_info' ||
      active.extractionStatus === 'failed');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: background }]}>
        <View style={[styles.header, { borderBottomColor: border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: textPrimary }]}>Certificate</Text>
            {workOrderTitle ? (
              <Text style={[styles.subtitle, { color: textSecondary }]} numberOfLines={2}>
                {workOrderTitle}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <X size={22} color={textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={[styles.help, { color: textSecondary }]}>
            Upload a PDF or photo of the certificate. We will try to read the type and expiry — you
            confirm before it is added to Compliance. Internet required.
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: primary }]}
              onPress={pickDocument}
              disabled={busy}
            >
              <Upload size={16} color="#fff" />
              <Text style={styles.btnText}>{busy ? 'Working…' : 'Choose File'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnOutline, { borderColor: primary }]}
              onPress={pickPhoto}
              disabled={busy}
            >
              <Text style={[styles.btnOutlineText, { color: primary }]}>Choose Photo</Text>
            </TouchableOpacity>
          </View>

          {loading ? <ActivityIndicator style={{ marginTop: 16 }} color={primary} /> : null}

          {active ? (
            <View style={[styles.card, { borderColor: border, backgroundColor: cardBg }]}>
              <View style={styles.row}>
                <FileText size={18} color={textPrimary} />
                <Text style={[styles.fileName, { color: textPrimary }]} numberOfLines={2}>
                  {active.fileName || 'Certificate'}
                </Text>
              </View>
              <Text style={[styles.status, { color: textSecondary }]}>
                Status: {active.extractionStatus.replace(/_/g, ' ')}
              </Text>

              {active.extractionStatus === 'added_to_compliance' ? (
                <View style={styles.okRow}>
                  <CheckCircle2 size={18} color="#16a34a" />
                  <Text style={{ color: '#16a34a', flex: 1 }}>
                    Added to Compliance
                    {active.certificateType ? ` — ${active.certificateType}` : ''}
                    {active.expiryDate ? ` · ${toYmd(active.expiryDate)}` : ''}
                  </Text>
                </View>
              ) : null}

              {showConfirm ? (
                <View style={{ gap: 10, marginTop: 12 }}>
                  <View style={styles.warnRow}>
                    <AlertTriangle size={16} color="#b45309" />
                    <Text style={{ color: '#b45309', flex: 1, fontSize: 13 }}>
                      {active.processingError ||
                        'Confirm or enter certificate type and expiry date.'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.fieldBtn, { borderColor: border }]}
                    onPress={pickType}
                  >
                    <Text style={{ color: textPrimary }}>Type: {manualType || 'Select…'}</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.fieldInput, { borderColor: border, color: textPrimary }]}
                    placeholder="Expiry YYYY-MM-DD"
                    placeholderTextColor={textSecondary}
                    value={manualExpiry}
                    onChangeText={setManualExpiry}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: primary, opacity: busy ? 0.6 : 1 }]}
                    onPress={confirm}
                    disabled={busy}
                  >
                    <Text style={styles.btnText}>Confirm & Add to Compliance</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[10],
    paddingBottom: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4 },
  body: { padding: spacing[4], gap: 12 },
  help: { fontSize: 13, lineHeight: 18 },
  actions: { gap: 8 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: { color: '#fff', fontWeight: '600' },
  btnOutline: {
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnOutlineText: { fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fileName: { flex: 1, fontWeight: '600' },
  status: { fontSize: 13, textTransform: 'capitalize' },
  okRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  warnRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  fieldBtn: { borderWidth: 1, borderRadius: 8, padding: 12 },
  fieldInput: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14 },
});
