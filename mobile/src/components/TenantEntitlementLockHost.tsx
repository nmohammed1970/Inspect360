import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTenantEntitlement } from '../hooks/useTenantEntitlement';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import { colors, spacing, borderRadius } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { getFontSize } from '../utils/responsive';

const COPY: Record<string, { title: string; body: string }> = {
  TRIAL_EXPIRED: {
    title: 'Your trial has ended',
    body: 'Access to Maintenance, Comparisons, Community, and inspection review is locked. Ask your property manager to renew access.',
  },
  CREDITS_EXPIRED: {
    title: 'Your credits have expired',
    body: 'Access to Maintenance, Comparisons, Community, and inspection review is locked. Ask your property manager to renew access.',
  },
};

type Props = {
  /** When true, force the dialog open (e.g. user tapped a locked action). */
  forceOpen?: boolean;
  onDismissForce?: () => void;
};

/**
 * Tenant entitlement lock dialog — parity with web EntitlementLockHost.
 * Locked modules are also hidden from tabs in TenantMainNavigator.
 */
export default function TenantEntitlementLockHost({ forceOpen, onDismissForce }: Props) {
  const { user, isAuthenticated } = useAuth();
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const { formMaxWidth, modalMaxHeight, isSmall } = useResponsive();
  const { locked, code } = useTenantEntitlement();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (locked && isAuthenticated && user?.role === 'tenant') {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [locked, isAuthenticated, user?.role, code]);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  if (!isAuthenticated || user?.role !== 'tenant') return null;
  if (!open && !forceOpen) return null;
  if (!locked && !forceOpen) return null;

  const copy = COPY[code] || COPY.TRIAL_EXPIRED;

  return (
    <Modal
      visible={open || !!forceOpen}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setOpen(false);
        onDismissForce?.();
      }}
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
              maxHeight: modalMaxHeight(isSmall ? 0.85 : 0.75),
              width: '100%',
            },
          ]}
        >
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.cardContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.title, { color: themeColors.text?.primary }]}>{copy.title}</Text>
            <Text style={[styles.body, { color: themeColors.text?.secondary }]}>{copy.body}</Text>
            <Button
              title="OK"
              onPress={() => {
                setOpen(false);
                onDismissForce?.();
              }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
