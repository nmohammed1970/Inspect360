import React from 'react';
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ViewStyle,
  StyleProp,
  ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '../../hooks/useResponsive';
import { spacing } from '../../theme';

export interface FormScreenProps {
  children: React.ReactNode;
  /** Sticky footer (e.g. Save / Cancel) — stays reachable above keyboard when possible */
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Center content with form max width (auth / settings) */
  constrainWidth?: boolean;
  /** Extra top/bottom safe padding (default: bottom only for tab screens) */
  edges?: { top?: boolean; bottom?: boolean };
  keyboardVerticalOffset?: number;
  scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle' | 'children'>;
  /** When false, children render without ScrollView (caller manages scroll) */
  scroll?: boolean;
}

/**
 * Shared keyboard-safe form shell: KAV + ScrollView + optional sticky footer.
 * Use for auth, create forms, profile edits, and modal form bodies.
 */
export default function FormScreen({
  children,
  footer,
  style,
  contentContainerStyle,
  constrainWidth = false,
  edges = { top: false, bottom: true },
  keyboardVerticalOffset,
  scrollProps,
  scroll = true,
}: FormScreenProps) {
  const insets = useSafeAreaInsets();
  const { formMaxWidth, getResponsivePadding } = useResponsive();
  const pad = getResponsivePadding(spacing.md);

  const offset =
    keyboardVerticalOffset !== undefined
      ? keyboardVerticalOffset
      : Platform.OS === 'ios'
        ? Math.max(insets.top, 8)
        : 0;

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      bounces
      {...scrollProps}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingHorizontal: pad,
          paddingTop: edges.top ? insets.top + pad : pad,
          paddingBottom: (footer ? spacing.md : pad) + (edges.bottom ? insets.bottom : 0),
        },
        constrainWidth && styles.constrainCenter,
        contentContainerStyle,
      ]}
    >
      {constrainWidth ? (
        <View style={[styles.constrainInner, { maxWidth: formMaxWidth }]}>{children}</View>
      ) : (
        children
      )}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.flex,
        {
          paddingHorizontal: pad,
          paddingTop: edges.top ? insets.top + pad : pad,
          paddingBottom: edges.bottom ? insets.bottom : 0,
        },
        constrainWidth && styles.constrainCenter,
        contentContainerStyle,
      ]}
    >
      {constrainWidth ? (
        <View style={[styles.constrainInner, styles.flex, { maxWidth: formMaxWidth }]}>
          {children}
        </View>
      ) : (
        children
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={offset}
    >
      {body}
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              paddingHorizontal: pad,
              paddingTop: spacing.sm,
              paddingBottom: Math.max(insets.bottom, spacing.sm) + (edges.bottom ? 0 : 0),
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
  },
  constrainCenter: {
    alignItems: 'center',
  },
  constrainInner: {
    width: '100%',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    backgroundColor: 'transparent',
  },
});
