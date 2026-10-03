import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import Input from './ui/Input';
import PhoneInput from './PhoneInput';
import { apiRequestJson } from '../services/api';
import { normalizePhoneForStorage } from '../../../shared/phoneCountryCodes';
import { colors, spacing, borderRadius } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { getFontSize } from '../utils/responsive';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type CreditRequestResult = {
  emailNotified?: boolean;
};

/**
 * Mobile credit purchase request — parity with web RequestCreditsDialog.
 * Submits to /api/credit-requests; admin allocates credits later.
 */
export default function RequestCreditsSheet({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const { formMaxWidth, modalMaxHeight, isSmall } = useResponsive();

  const [units, setUnits] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [message, setMessage] = useState('');
  const [unitsError, setUnitsError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [messageError, setMessageError] = useState('');

  const { data: organization } = useQuery({
    queryKey: ['/api/organizations', user?.organizationId, 'credit-request'],
    enabled: open && !!user?.organizationId,
    queryFn: () =>
      apiRequestJson<{ name?: string }>('GET', `/api/organizations/${user?.organizationId}`),
    retry: false,
  });

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || '';

  useEffect(() => {
    if (open) {
      setContactPhone((user?.phone || '').trim());
    }
  }, [open, user?.phone]);

  const reset = () => {
    setUnits('');
    setContactPhone((user?.phone || '').trim());
    setMessage('');
    setUnitsError('');
    setPhoneError('');
    setMessageError('');
  };

  const submit = useMutation({
    mutationFn: (payload: {
      creditsRequested: number;
      contactPhone: string;
      message: string;
    }) => apiRequestJson<CreditRequestResult>('POST', '/api/credit-requests', payload),
    onSuccess: (body) => {
      Alert.alert(
        'Request submitted',
        body?.emailNotified
          ? 'Your request has been submitted. The administration team has been notified and will allocate credits based on your units.'
          : 'Your request has been submitted. An admin will allocate credits based on your units.',
      );
      reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      Alert.alert(
        'Unable to submit',
        error?.message || 'Unable to submit your purchase request. Please try again.',
      );
    },
  });

  const validateAndSubmit = () => {
    const unitsTrim = units.trim();
    const phoneTrim = contactPhone.trim();
    const messageTrim = message.trim();
    let ok = true;

    if (!/^[0-9]+$/.test(unitsTrim) || Number(unitsTrim) < 1) {
      setUnitsError('Please enter a valid number of properties / units. Minimum is 1.');
      ok = false;
    } else if (Number(unitsTrim) > 100000) {
      setUnitsError('Please enter a valid number of properties / units. Maximum is 100000.');
      ok = false;
    } else {
      setUnitsError('');
    }

    if (!phoneTrim) {
      setPhoneError('Please enter a contact number with country code.');
      ok = false;
    } else if (phoneTrim.length > 50) {
      setPhoneError('Contact number must be 50 characters or fewer.');
      ok = false;
    } else {
      setPhoneError('');
    }

    if (!messageTrim) {
      setMessageError('Please enter a message.');
      ok = false;
    } else if (messageTrim.length > 2000) {
      setMessageError('Message must be 2000 characters or fewer.');
      ok = false;
    } else {
      setMessageError('');
    }

    if (!ok) return;

    submit.mutate({
      creditsRequested: Number(unitsTrim),
      contactPhone: normalizePhoneForStorage(phoneTrim) || phoneTrim,
      message: messageTrim,
    });
  };

  if (!open) return null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!submit.isPending) {
          reset();
          onOpenChange(false);
        }
      }}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.backdrop,
            {
              paddingTop: insets.top + spacing.md,
              paddingBottom: insets.bottom + spacing.lg,
            },
          ]}
        >
          <View
            style={[
              styles.card,
              {
                backgroundColor: themeColors.card?.DEFAULT ?? '#fff',
                maxWidth: formMaxWidth,
                maxHeight: modalMaxHeight(isSmall ? 0.92 : 0.88),
                width: '100%',
              },
            ]}
          >
            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.cardContent}
            >
              <Text style={[styles.title, { color: themeColors.text?.primary }]}>
                Purchase Credits
              </Text>
              <Text style={[styles.body, { color: themeColors.text?.secondary }]}>
                Tell us how many properties / units you manage. This sends a request — an admin
                will allocate credits based on your units. Credits are not added immediately.
              </Text>

              <Input label="Full Name" value={fullName} editable={false} />
              <Input
                label="Organization Name"
                value={organization?.name || ''}
                editable={false}
              />
              <Input label="Email" value={user?.email || ''} editable={false} />
              <PhoneInput
                label="Contact Number"
                value={contactPhone}
                onChange={(v) => {
                  setContactPhone(v);
                  setPhoneError('');
                }}
                error={phoneError}
              />
              <Input
                label="Number of Properties / Units"
                value={units}
                onChangeText={(v) => {
                  setUnits(v);
                  setUnitsError('');
                }}
                keyboardType="number-pad"
                error={unitsError}
                required
              />
              <Input
                label="Message"
                value={message}
                onChangeText={(v) => {
                  setMessage(v);
                  setMessageError('');
                }}
                multiline
                numberOfLines={4}
                error={messageError}
                required
                style={{ minHeight: 88, textAlignVertical: 'top' }}
              />

              <Button
                title="Submit Request"
                onPress={validateAndSubmit}
                loading={submit.isPending}
                disabled={submit.isPending}
              />
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => {
                  if (!submit.isPending) {
                    reset();
                    onOpenChange(false);
                  }
                }}
                disabled={submit.isPending}
              />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  cardContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { fontSize: getFontSize(18), fontWeight: '700' },
  body: { fontSize: getFontSize(14), lineHeight: 20 },
});
