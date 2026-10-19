import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import SignatureCanvas from 'react-native-signature-canvas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSignatureValue } from '../../../../shared/signature';
import { maintenanceService } from '../../services/maintenance';
import {
  WorkOrderCompletionChecklistPanel,
  useMobileWorkOrderCompletionChecklist,
} from './WorkOrderCompletionChecklistPanel';
import Button from '../ui/Button';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, spacing } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  workOrderId: string | null;
  visible: boolean;
  onClose: () => void;
  onCompleted?: () => void;
  existingSignature?: { image: string; signedByName?: string } | null;
};

export function WorkOrderCompleteModal({
  workOrderId,
  visible,
  onClose,
  onCompleted,
  existingSignature,
}: Props) {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets() || { bottom: 0 };
  const queryClient = useQueryClient();
  const sigRef = useRef<any>(null);
  const [signerName, setSignerName] = useState(existingSignature?.signedByName || '');
  const [signatureImage, setSignatureImage] = useState<string | null>(
    existingSignature?.image || null,
  );

  const { data: checklist } = useMobileWorkOrderCompletionChecklist(
    visible && workOrderId ? workOrderId : undefined,
  );
  const requiredIncomplete = checklist?.progress?.requiredIncomplete ?? 0;
  const hasChecklist = !!checklist?.snapshot?.items?.length;
  const checklistOk = !hasChecklist || requiredIncomplete === 0;

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!workOrderId) throw new Error('Missing work order');
      let image = signatureImage;
      if (!image) {
        throw new Error('Customer signature is required');
      }
      if (requiredIncomplete > 0) {
        throw new Error(
          `${requiredIncomplete} required checklist step${
            requiredIncomplete === 1 ? ' is' : 's are'
          } still unfinished.`,
        );
      }
      const payload = createSignatureValue(image, signerName.trim() || undefined);
      await maintenanceService.saveWorkOrderCustomerSignature(workOrderId, payload);
      await maintenanceService.updateWorkOrderStatus(workOrderId, 'completed');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/work-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/work-orders', workOrderId] });
      Alert.alert('Success', 'Work order completed');
      onClose();
      onCompleted?.();
    },
    onError: (err: any) => {
      Alert.alert('Cannot complete', err?.message || 'Failed to complete work order');
    },
  });

  const handleSignature = (sig: string) => {
    setSignatureImage(sig);
  };

  return (
    <Modal visible={visible && !!workOrderId} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: themeColors.card.DEFAULT,
              paddingBottom: Math.max(insets.bottom, spacing[4]),
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, { color: themeColors.text.primary }]}>
            Complete work order
          </Text>
          <Text style={[styles.body, { color: themeColors.text.secondary }]}>
            Finish required checklist steps and capture the customer signature.
          </Text>

          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            {workOrderId && hasChecklist && (
              <WorkOrderCompletionChecklistPanel workOrderId={workOrderId} />
            )}

            {hasChecklist && requiredIncomplete > 0 && (
              <Text style={styles.warn}>
                {requiredIncomplete} required step
                {requiredIncomplete === 1 ? ' is' : 's are'} unfinished.
              </Text>
            )}

            <Text style={[styles.label, { color: themeColors.text.primary }]}>
              Customer name (optional)
            </Text>
            <TextInput
              value={signerName}
              onChangeText={setSignerName}
              placeholder="Name of person signing"
              placeholderTextColor={themeColors.text.secondary}
              style={[
                styles.input,
                {
                  color: themeColors.text.primary,
                  borderColor: themeColors.border.DEFAULT,
                  backgroundColor: themeColors.background,
                },
              ]}
            />

            <Text style={[styles.label, { color: themeColors.text.primary }]}>
              Customer signature
            </Text>
            {signatureImage ? (
              <View style={{ marginBottom: spacing[3] }}>
                <Image
                  source={{ uri: signatureImage }}
                  style={styles.sigPreview}
                  resizeMode="contain"
                />
                <Button
                  title="Re-sign"
                  variant="outline"
                  size="sm"
                  onPress={() => setSignatureImage(null)}
                  style={{ marginTop: spacing[2] }}
                />
              </View>
            ) : (
              <View style={styles.sigWrap}>
                <SignatureCanvas
                  ref={sigRef}
                  onOK={handleSignature}
                  onEmpty={() => Alert.alert('Draw a signature first')}
                  descriptionText=""
                  clearText="Clear"
                  confirmText="Use signature"
                  webStyle={`.m-signature-pad { box-shadow: none; border: 1px solid #e5e5e5; }
.m-signature-pad--footer { margin-top: 8px; }`}
                  style={{ height: 180, width: '100%' }}
                />
              </View>
            )}
          </ScrollView>

          <Button
            title={completeMutation.isPending ? 'Completing…' : 'Mark completed'}
            onPress={() => {
              if (!signatureImage && sigRef.current?.readSignature) {
                sigRef.current.readSignature();
                // onOK will set image; ask user to tap again, or poll — better force read then mutate in onOK path
              }
              completeMutation.mutate();
            }}
            disabled={!checklistOk || completeMutation.isPending || !signatureImage}
            variant="default"
            size="md"
            style={{ marginTop: spacing[3], marginBottom: spacing[2] }}
          />
          <Button title="Cancel" onPress={onClose} variant="ghost" size="md" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    maxHeight: '92%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.4)',
    marginBottom: spacing[3],
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing[1],
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing[3],
  },
  warn: {
    color: '#b45309',
    fontWeight: '600',
    marginBottom: spacing[2],
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
    marginTop: spacing[2],
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: spacing[2],
  },
  sigWrap: {
    height: 220,
    marginBottom: spacing[2],
    borderRadius: 8,
    overflow: 'hidden',
  },
  sigPreview: {
    width: '100%',
    height: 120,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
});
