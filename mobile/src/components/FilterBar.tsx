import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Filter, ChevronDown } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { colors, spacing, borderRadius, shadows } from '../theme';
import { getFontSize, moderateScale } from '../utils/responsive';

export type FilterBarChip = {
  /** Category label shown above the value (e.g. Status) */
  label: string;
  /** Current selected value shown to the user */
  value: string;
  /** Whether this chip counts as an active filter */
  active: boolean;
  onPress: () => void;
};

type Props = {
  chips: FilterBarChip[];
  onClear?: () => void;
  title?: string;
  style?: object;
};

/**
 * Shared filter strip used across list screens (Maintenance, Inspections, Assets).
 */
export default function FilterBar({ chips, onClear, title = 'Filters', style }: Props) {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const isDark = !!theme?.isDark;
  const activeCount = chips.filter((c) => c.active).length;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: themeColors.card.DEFAULT,
          borderColor: themeColors.border?.light || themeColors.border.DEFAULT,
        },
        style,
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: isDark
                  ? themeColors.primary.DEFAULT + '22'
                  : '#E0F7FA',
              },
            ]}
          >
            <Filter size={14} color={themeColors.primary.DEFAULT} />
          </View>
          <Text style={[styles.title, { color: themeColors.text.primary }]}>{title}</Text>
          {activeCount > 0 ? (
            <View
              style={[styles.countBadge, { backgroundColor: themeColors.primary.DEFAULT }]}
            >
              <Text style={styles.countText}>{activeCount}</Text>
            </View>
          ) : null}
        </View>
        {activeCount > 0 && onClear ? (
          <TouchableOpacity
            onPress={onClear}
            hitSlop={8}
            style={styles.clearBtn}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Text style={[styles.clearText, { color: themeColors.primary.DEFAULT }]}>
              Clear
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {chips.map((chip) => (
          <TouchableOpacity
            key={chip.label}
            onPress={chip.onPress}
            activeOpacity={0.75}
            style={[
              styles.chip,
              {
                backgroundColor: chip.active
                  ? isDark
                    ? themeColors.primary.DEFAULT + '28'
                    : themeColors.primary.light
                  : isDark
                    ? themeColors.card.DEFAULT
                    : '#FFFFFF',
                borderColor: chip.active
                  ? themeColors.primary.DEFAULT
                  : themeColors.border?.light || themeColors.border.DEFAULT,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${chip.label}: ${chip.value}`}
          >
            <View style={styles.chipContent}>
              <Text
                style={[
                  styles.chipLabel,
                  {
                    color: chip.active
                      ? themeColors.primary.DEFAULT
                      : themeColors.text.secondary,
                  },
                ]}
              >
                {chip.label}
              </Text>
              <Text
                style={[
                  styles.chipValue,
                  {
                    color: chip.active
                      ? themeColors.primary.DEFAULT
                      : themeColors.text.primary,
                  },
                ]}
                numberOfLines={1}
              >
                {chip.value}
              </Text>
            </View>
            <ChevronDown
              size={14}
              color={
                chip.active ? themeColors.primary.DEFAULT : themeColors.text.secondary
              }
            />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    paddingHorizontal: spacing[3],
    gap: spacing[3],
    ...Platform.select({
      ios: shadows.xs,
      android: { elevation: 1 },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  iconWrap: {
    width: moderateScale(28),
    height: moderateScale(28),
    borderRadius: moderateScale(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: getFontSize(14),
    fontWeight: '700',
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  clearBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearText: {
    fontSize: getFontSize(13),
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingRight: spacing[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingLeft: spacing[3],
    paddingRight: spacing[2],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    maxWidth: moderateScale(168),
  },
  chipContent: {
    flexShrink: 1,
    minWidth: 0,
    gap: 1,
  },
  chipLabel: {
    fontSize: getFontSize(10),
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipValue: {
    fontSize: getFontSize(13),
    fontWeight: '700',
  },
});
