import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  Platform,
} from 'react-native';
import SignatureCanvas from 'react-native-signature-canvas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { createSignatureValue, parseSignatureValue } from '../../../../shared/signature';
import { maintenanceService } from '../../services/maintenance';
import {
  WorkOrderCompletionChecklistPanel,
  useMobileWorkOrderCompletionChecklist,
} from '../../components/workOrders/WorkOrderCompletionChecklistPanel';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, spacing, borderRadius } from '../../theme';
import { getFontSize, moderateScale } from '../../utils/responsive';
import type { WorkOrdersStackParamList } from '../../navigation/types';

export default function WorkOrderCompleteScreen() {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<WorkOrdersStackParamList>>();
  const route = useRoute<RouteProp<WorkOrdersStackParamList, 'WorkOrderComplete'>>();
  const { workOrderId } = route.params;

  const sigRef = useRef<any>(null);
  const pendingCompleteRef = useRef(false);
  const [signerName, setSignerName] = useState('');
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const woQuery = useQuery({
    queryKey: ['/api/work-orders', workOrderId],
    queryFn: async () => {
      const list = await maintenanceService.getWorkOrders();
      const found = list.find((w) => w.id === workOrderId);
      if (found) return found;
      return maintenanceService.getWorkOrder(workOrderId);
    },
  });

  const { data: checklist } = useMobileWorkOrderCompletionChecklist(workOrderId);
  const requiredIncomplete = checklist?.progress?.requiredIncomplete ?? 0;
  const hasChecklist = !!checklist?.snapshot?.items?.length;
  const checklistOk = !hasChecklist || requiredIncomplete === 0;

  useEffect(() => {
    const parsed = parseSignatureValue(woQuery.data?.customerSignatureJson);
    if (parsed?.image) {
      setSignatureImage(parsed.image);
      if (parsed.signedByName) setSignerName(parsed.signedByName);
    }
  }, [woQuery.data?.customerSignatureJson]);

  const completeMutation = useMutation({
    mutationFn: async (image: string) => {
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
      pendingCompleteRef.current = false;
      await queryClient.invalidateQueries({ queryKey: ['/api/work-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/work-orders', workOrderId] });
      await queryClient.invalidateQueries({
        queryKey: ['work-order-completion-checklist', workOrderId],
      });
      await queryClient.invalidateQueries({ queryKey: ['/api/maintenance'] });
      Alert.alert('Success', 'Work order completed');
      navigation.goBack();
    },
    onError: (err: any) => {
      pendingCompleteRef.current = false;
      Alert.alert('Cannot complete', err?.message || 'Failed to complete work order');
    },
  });

  const handleSignatureOk = (sig: string) => {
    setScrollEnabled(true);
    setSignatureImage(sig);
    if (pendingCompleteRef.current) {
      pendingCompleteRef.current = false;
      completeMutation.mutate(sig);
    }
  };

  const handleMarkCompleted = () => {
    if (!checklistOk) {
      Alert.alert(
        'Checklist incomplete',
        `${requiredIncomplete} required step${requiredIncomplete === 1 ? ' is' : 's are'} unfinished.`,
      );
      return;
    }
    if (signatureImage) {
      completeMutation.mutate(signatureImage);
      return;
    }
    if (sigRef.current?.readSignature) {
      pendingCompleteRef.current = true;
      sigRef.current.readSignature();
      return;
    }
    Alert.alert('Signature required', 'Please draw and save the customer signature.');
  };

  if (woQuery.isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: themeColors.background, paddingTop: insets.top }]}>
        <LoadingSpinner />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background, paddingTop: insets.top }}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: themeColors.card.DEFAULT,
            borderBottomColor: themeColors.border?.light || themeColors.border.DEFAULT,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backBtn}
        >
          <ArrowLeft size={moderateScale(22)} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text.primary }]} numberOfLines={1}>
          Complete work order
        </Text>
        <View style={{ width: moderateScale(40) }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing[4],
          paddingBottom: insets.bottom + spacing[8],
        }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        scrollEnabled={scrollEnabled}
      >
        <Text style={[styles.body, { color: themeColors.text.secondary }]}>
          Finish required checklist steps and capture the customer signature before marking
          completed.
        </Text>

        {hasChecklist && (
          <View style={{ marginBottom: spacing[3] }}>
            <WorkOrderCompletionChecklistPanel workOrderId={workOrderId} />
          </View>
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
              backgroundColor: themeColors.card.DEFAULT,
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
              onPress={() => {
                setScrollEnabled(true);
                setSignatureImage(null);
                setPadKey((k) => k + 1);
              }}
              style={{ marginTop: spacing[2] }}
            />
          </View>
        ) : (
          <View style={{ marginBottom: spacing[3] }}>
            <View style={styles.sigWrap}>
              <SignatureCanvas
                key={padKey}
                ref={sigRef}
                onOK={handleSignatureOk}
                onBegin={() => setScrollEnabled(false)}
                onEnd={() => setScrollEnabled(true)}
                onEmpty={() => {
                  pendingCompleteRef.current = false;
                  setScrollEnabled(true);
                  Alert.alert('Draw a signature first');
                }}
                descriptionText=""
                clearText="Clear"
                confirmText=""
                webStyle={`
                  .m-signature-pad { box-shadow: none; border: 1px solid #e5e5e5; }
                  .m-signature-pad--footer { display: none; }
                `}
                style={{ height: 200, width: '100%' }}
              />
            </View>
            <Text style={[styles.hint, { color: themeColors.text.secondary }]}>
              Draw the signature, then tap Save signature.
            </Text>
            <Button
              title="Save signature"
              variant="outline"
              onPress={() => {
                if (sigRef.current?.readSignature) {
                  pendingCompleteRef.current = false;
                  sigRef.current.readSignature();
                }
              }}
              style={{ marginTop: spacing[2] }}
            />
          </View>
        )}

        <Button
          title={completeMutation.isPending ? 'Completing…' : 'Mark completed'}
          onPress={handleMarkCompleted}
          disabled={!checklistOk || completeMutation.isPending}
          variant="default"
          size="md"
          style={{ marginTop: spacing[2] }}
        />
        <Button
          title="Cancel"
          onPress={() => navigation.goBack()}
          variant="ghost"
          size="md"
          style={{ marginTop: spacing[2] }}
          disabled={completeMutation.isPending}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  backBtn: {
    width: moderateScale(40),
    height: moderateScale(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: getFontSize(17),
    fontWeight: '600',
  },
  body: {
    fontSize: getFontSize(14),
    lineHeight: 20,
    marginBottom: spacing[4],
  },
  warn: {
    color: '#b45309',
    fontWeight: '600',
    marginBottom: spacing[3],
  },
  label: {
    fontSize: getFontSize(14),
    fontWeight: '500',
    marginBottom: 6,
    marginTop: spacing[2],
  },
  hint: {
    fontSize: getFontSize(13),
    marginTop: spacing[2],
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: spacing[2],
  },
  sigWrap: {
    height: 220,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  sigPreview: {
    width: '100%',
    height: 140,
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
});
