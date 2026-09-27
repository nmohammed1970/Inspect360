import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';

interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  value?: string;
  options: SelectOption[];
  placeholder?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  style?: any;
  testID?: string;
}

export default function Select({
  value,
  options,
  placeholder = 'Select...',
  onValueChange,
  disabled = false,
  style,
  testID,
}: SelectProps) {
  const theme = useTheme();
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  const [isOpen, setIsOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { modalMaxHeight } = useResponsive();
  const sheetMaxH = modalMaxHeight(0.7);

  const selectedOption = options.find(opt => opt.value === value);

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue);
    setIsOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        testID={testID}
        style={[
          styles.trigger,
          {
            backgroundColor: disabled ? themeColors.muted : themeColors.background,
            borderColor: themeColors.border?.DEFAULT || colors.border.DEFAULT,
          },
          disabled && styles.disabled,
          style,
        ]}
        onPress={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.triggerText,
            {
              color: selectedOption
                ? themeColors.text.primary
                : themeColors.text.muted,
            },
          ]}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <ChevronDown
          size={20}
          color={themeColors.text.muted}
          style={[styles.chevron, isOpen && styles.chevronOpen]}
        />
      </TouchableOpacity>

      <Modal
        visible={isOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsOpen(false)}
        >
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: themeColors.background,
                borderColor: themeColors.border?.DEFAULT || colors.border.DEFAULT,
                maxHeight: sheetMaxH,
                paddingBottom: Math.max(insets.bottom, spacing[2]),
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>
                {placeholder}
              </Text>
              <TouchableOpacity
                onPress={() => setIsOpen(false)}
                style={styles.closeButton}
              >
                <Text style={[styles.closeButtonText, { color: themeColors.primary.DEFAULT }]}>
                  Done
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={[styles.optionsList, { maxHeight: sheetMaxH - 72 }]} keyboardShouldPersistTaps="handled">
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.option,
                      isSelected && {
                        backgroundColor: themeColors.primary.light || `${themeColors.primary.DEFAULT}15`,
                      },
                    ]}
                    onPress={() => handleSelect(option.value)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        {
                          color: isSelected
                            ? themeColors.primary.DEFAULT
                            : themeColors.text.primary,
                          fontWeight: isSelected ? typography.fontWeight.semibold : typography.fontWeight.normal,
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                    {isSelected && (
                      <Check
                        size={20}
                        color={themeColors.primary.DEFAULT}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderWidth: 1,
    borderRadius: borderRadius.md,
    minHeight: 44,
  },
  disabled: {
    opacity: 0.5,
  },
  triggerText: {
    fontSize: typography.fontSize.base,
    flex: 1,
    minWidth: 0,
  },
  chevron: {
    marginLeft: spacing[2],
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderTopWidth: 1,
    width: '100%',
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  closeButton: {
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
  },
  closeButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  optionsList: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.DEFAULT,
  },
  optionText: {
    fontSize: typography.fontSize.base,
    flex: 1,
    minWidth: 0,
  },
});

