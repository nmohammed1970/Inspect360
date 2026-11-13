import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntitlement } from '../hooks/useEntitlement';
import { useAuth, isTenantRole } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import {
  subscribeEntitlementLock,
  type EntitlementLockCode,
} from '../services/entitlementLock';
import { colors, spacing, borderRadius } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { getFontSize } from '../utils/responsive';

const COPY: Record<EntitlementLockCode, { title: string; body: string }> = {
  TRIAL_EXPIRED: {
    title: 'Your trial has ended',
    body: 'Access to Inspections, Maintenance, Work Orders, and other modules is locked. Open Pricing in the web app to subscribe or buy credits.',
  },
  CREDITS_EXPIRED: {
    title: 'Your credits have expired',
    body: 'Access to Inspections, Maintenance, Work Orders, and other modules is locked. Open Pricing in the web app to top up or upgrade.',
  },
};

type Props = {
  forceOpen?: boolean;
  onDismissForce?: () => void;
};

function pricingUrl(): string {
  const base = (process.env.EXPO_PUBLIC_WEB_URL || process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
  if (base) return `${base}/pricing`;
  return 'https://portal.inspect360.ai/pricing';
}

/**
 * Ops (owner / clerk / contractor) entitlement lock — mirrors web EntitlementLockHost.
 */
export default function OpsEntitlementLockHost({ forceOpen, onDismissForce }: Props) {
  const { user, isAuthenticated } = useAuth();
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const { formMaxWidth, modalMaxHeight, isSmall } = useResponsive();
  const { locked, code: entitlementCode } = useEntitlement();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<EntitlementLockCode>('TRIAL_EXPIRED');

  const isOpsUser =
    isAuthenticated && !!user && !isTenantRole(user.role);

  useEffect(() => {
    return subscribeEntitlementLock((next) => {
      if (!isOpsUser) return;
      setCode(next);
      setOpen(true);
    });
  }, [isOpsUser]);

  useEffect(() => {
    if (locked && isOpsUser) {
      setCode(entitlementCode);
      setOpen(true);
    } else if (!locked) {
      setOpen(false);
    }
  }, [locked, isOpsUser, entitlementCode]);

  useEffect(() => {
    if (forceOpen) {
      setCode(entitlementCode);
      setOpen(true);
    }
  }, [forceOpen, entitlementCode]);

  if (!isOpsUser) return null;
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
            <Text style={[styles.title, { color: themeColors.text?.primary }]}>
              {copy.title}
            </Text>
            <Text style={[styles.body, { color: themeColors.text?.secondary }]}>
              {copy.body}
            </Text>
            <Button
              title="Open pricing"
              onPress={() => {
                Linking.openURL(pricingUrl()).catch(() => undefined);
              }}
            />
            <Button
              title="Got it"
              variant="outline"
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
  title: {
    fontSize: getFontSize(18),
    fontWeight: '700',
  },
  body: {
    fontSize: getFontSize(14),
    lineHeight: 20,
  },
});
