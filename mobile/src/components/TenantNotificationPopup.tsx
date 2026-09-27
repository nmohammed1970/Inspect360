import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, X } from 'lucide-react-native';
import { formatDistanceToNow } from 'date-fns';
import type { AppNotification } from '../services/notifications';
import { useTheme } from '../contexts/ThemeContext';
import { useTenantPortalFlags } from '../hooks/useTenantPortalFlags';
import Button from './ui/Button';
import { colors, spacing, borderRadius, shadows } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { getFontSize, moderateScale } from '../utils/responsive';

type Props = {
  notification: AppNotification;
  onClose: () => void;
  onView: () => void;
};

export default function TenantNotificationPopup({ notification, onClose, onView }: Props) {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const flags = useTenantPortalFlags();
  const insets = useSafeAreaInsets();
  const { formMaxWidth, modalMaxHeight, isSmall, stackDirection } = useResponsive();
  const accent = flags.brandingPrimaryColor || themeColors.primary?.DEFAULT || colors.primary.DEFAULT;
  const actionsDirection = stackDirection(360);

  useEffect(() => {
    const timer = setTimeout(() => onClose(), 10_000);
    return () => clearTimeout(timer);
  }, [onClose, notification.id]);

  let timeAgo = '';
  try {
    timeAgo = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true });
  } catch {
    timeAgo = '';
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + spacing.md,
            paddingBottom: insets.bottom + spacing.md,
          },
        ]}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: themeColors.card?.DEFAULT ?? '#fff',
              borderColor: accent,
              maxWidth: formMaxWidth,
              maxHeight: modalMaxHeight(isSmall ? 0.7 : 0.5),
              width: '100%',
              ...shadows.lg,
            },
          ]}
        >
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.cardContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <View style={[styles.iconWrap, { backgroundColor: `${accent}22` }]}>
                <Bell size={20} color={accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.title, { color: themeColors.text?.primary }]}>
                  {notification.title}
                </Text>
                {timeAgo ? (
                  <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(11), marginTop: 2 }}>
                    {timeAgo}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss">
                <X size={20} color={themeColors.text?.secondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.message, { color: themeColors.text?.secondary }]}>{notification.message}</Text>
            <View style={[styles.actions, { flexDirection: actionsDirection }]}>
              <Button
                title="View details"
                onPress={onView}
                style={{
                  flex: actionsDirection === 'row' ? 1 : undefined,
                  width: actionsDirection === 'column' ? '100%' : undefined,
                }}
              />
              <Button
                title="Dismiss"
                variant="outline"
                onPress={onClose}
                style={{
                  flex: actionsDirection === 'row' ? 1 : undefined,
                  width: actionsDirection === 'column' ? '100%' : undefined,
                }}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: 'transparent',
  },
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    overflow: 'hidden',
  },
  cardContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  iconWrap: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: { fontSize: getFontSize(16), fontWeight: '700' },
  message: { fontSize: getFontSize(14), lineHeight: 20 },
  actions: { flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs, width: '100%' },
});
