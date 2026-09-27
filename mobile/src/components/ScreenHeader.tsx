import React, { type ReactNode } from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import UserProfileMenu from './UserProfileMenu';
import { colors, spacing } from '../theme';
import { getFontSize, moderateScale } from '../utils/responsive';

type Props = {
  title: string;
  subtitle?: string;
  /** Optional control on the right (e.g. Add button). Profile avatar stays furthest right. */
  rightSlot?: ReactNode;
  style?: ViewStyle;
  /** When false, skips safe-area top inset (parent already applies it). Default true. */
  includeSafeArea?: boolean;
  showProfile?: boolean;
};

/**
 * Shared ops list header: title + subtitle, optional action, profile avatar (web-portal style).
 */
export default function ScreenHeader({
  title,
  subtitle,
  rightSlot,
  style,
  includeSafeArea = true,
  showProfile = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: includeSafeArea ? insets.top + spacing[2] : spacing[2],
          backgroundColor: themeColors.card.DEFAULT,
          borderBottomColor: themeColors.border.DEFAULT,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: themeColors.text.primary }]} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Text
              style={[styles.subtitle, { color: themeColors.text.secondary }]}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          )}
        </View>
        <View style={styles.actions}>
          {rightSlot}
          {showProfile ? <UserProfileMenu /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: getFontSize(24),
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: getFontSize(13),
    marginTop: 2,
    lineHeight: getFontSize(18),
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingTop: moderateScale(2),
  },
});
