import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar } from 'lucide-react-native';
import { format, parse, isValid } from 'date-fns';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import Button from './Button';
import { useResponsive } from '../../hooks/useResponsive';

interface DatePickerProps {
  label?: string;
  value?: Date | string | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
  mode?: 'date' | 'datetime' | 'time';
}

export default function DatePicker({
  label,
  value,
  onChange,
  placeholder = 'Select date',
  required = false,
  disabled = false,
  minimumDate,
  maximumDate,
  mode = 'date',
}: DatePickerProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  const { modalMaxHeight } = useResponsive();
  const [showPicker, setShowPicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date | null>(null);
  
  // Use theme colors, fallback to default colors if theme not available
  // Double-check to ensure activeColors is never undefined
  const activeColors = themeColors || colors;

  // Convert value to Date object safely
  const getDateValue = (): Date | null => {
    if (!value) return null;
    if (value instanceof Date) {
      return isValid(value) ? value : null;
    }
    if (typeof value === 'string') {
      try {
        // Try ISO format first
        const isoDate = new Date(value);
        if (isValid(isoDate)) return isoDate;
        
        // Try YYYY-MM-DD format
        const parsedDate = parse(value, 'yyyy-MM-dd', new Date());
        if (isValid(parsedDate)) return parsedDate;
        
        // Try other common formats
        const fallbackDate = new Date(value);
        return isValid(fallbackDate) ? fallbackDate : null;
      } catch {
        return null;
      }
    }
    return null;
  };

  const dateValue = getDateValue();
  const displayValue = dateValue ? format(dateValue, 'yyyy-MM-dd') : '';

  const handleOpen = () => {
    if (disabled) return;
    setTempDate(dateValue || new Date());
    setShowPicker(true);
  };

  const handleConfirm = () => {
    if (tempDate) {
      onChange(tempDate);
    }
    setShowPicker(false);
  };

  const handleCancel = () => {
    setShowPicker(false);
    setTempDate(null);
  };

  // iOS native date picker component
  const renderIOSDatePicker = () => {
    if (Platform.OS !== 'ios') return null;
    
    // Ensure activeColors is available with fallback
    const currentActiveColors = activeColors || colors;

    // For iOS, we'll use a custom calendar modal since @react-native-community/datetimepicker
    // requires native module setup. We'll create a simple calendar interface.
    return (
      <View style={styles.iosPickerContainer}>
        <View style={[styles.iosPickerHeader, { borderBottomColor: currentActiveColors.border.light }]}>
          <TouchableOpacity onPress={handleCancel} style={styles.iosPickerButton}>
            <Text style={[styles.iosPickerButtonText, { color: currentActiveColors.text.primary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.iosPickerTitle, { color: currentActiveColors.text.primary }]}>Select Date</Text>
          <TouchableOpacity onPress={handleConfirm} style={styles.iosPickerButton}>
            <Text style={[styles.iosPickerButtonText, styles.iosPickerButtonConfirm, { color: currentActiveColors.primary.DEFAULT }]}>Done</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.calendarContainer}>
          {renderCalendar()}
        </View>
      </View>
    );
  };

  // Simple calendar implementation
  const renderCalendar = () => {
    // Ensure activeColors is available in this closure
    const currentActiveColors = activeColors || colors;
    const currentDate = tempDate || new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (number | null)[] = [];
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const handleDayPress = (day: number) => {
      if (day === null) return;
      const newDate = new Date(year, month, day);
      setTempDate(newDate);
    };

    const isSelected = (day: number | null): boolean => {
      if (day === null || !tempDate) return false;
      return (
        tempDate.getDate() === day &&
        tempDate.getMonth() === month &&
        tempDate.getFullYear() === year
      );
    };

    const isToday = (day: number | null): boolean => {
      if (day === null) return false;
      const today = new Date();
      return (
        day === today.getDate() &&
        month === today.getMonth() &&
        year === today.getFullYear()
      );
    };

    const changeMonth = (direction: 'prev' | 'next') => {
      const newDate = new Date(year, month + (direction === 'next' ? 1 : -1), 1);
      setTempDate(newDate);
    };

    return (
      <View style={styles.calendar}>
        {/* Month/Year Header */}
        <View style={styles.calendarHeader}>
          <TouchableOpacity onPress={() => changeMonth('prev')} style={styles.monthNavButton}>
            <Text style={[styles.monthNavText, { color: currentActiveColors.primary.DEFAULT }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.monthYearText, { color: currentActiveColors.text.primary }]}>
            {months[month]} {year}
          </Text>
          <TouchableOpacity onPress={() => changeMonth('next')} style={styles.monthNavButton}>
            <Text style={[styles.monthNavText, { color: currentActiveColors.primary.DEFAULT }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Week Days */}
        <View style={styles.weekDaysRow}>
          {weekDays.map((day) => (
            <View key={day} style={styles.weekDayCell}>
              <Text style={[styles.weekDayText, { color: currentActiveColors.text.secondary }]}>{day}</Text>
            </View>
          ))}
        </View>

        {/* Calendar Grid */}
        <View style={styles.calendarGrid}>
          {days.map((day, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.calendarDay,
                isSelected(day) && { backgroundColor: currentActiveColors.primary.DEFAULT },
                isToday(day) && !isSelected(day) && {
                  backgroundColor: currentActiveColors.primary.light || `${currentActiveColors.primary.DEFAULT}20`,
                  borderWidth: 1,
                  borderColor: currentActiveColors.primary.DEFAULT,
                },
                day === null && styles.calendarDayEmpty,
              ]}
              onPress={() => handleDayPress(day!)}
              disabled={day === null}
            >
              <Text
                style={[
                  styles.calendarDayText,
                  { color: currentActiveColors.text.primary },
                  isSelected(day) && {
                    color: currentActiveColors.primary.foreground,
                    fontWeight: typography.fontWeight.semibold,
                  },
                  isToday(day) && !isSelected(day) && {
                    color: currentActiveColors.primary.DEFAULT,
                    fontWeight: typography.fontWeight.semibold,
                  },
                ]}
              >
                {day || ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  // Android date picker (simpler modal with date input)
  const renderAndroidDatePicker = () => {
    if (Platform.OS !== 'android') return null;
    
    // Ensure activeColors is available with fallback
    const currentActiveColors = activeColors || colors;

    return (
      <View style={styles.androidPickerContainer}>
        <View style={[styles.androidPickerHeader, { borderBottomColor: currentActiveColors.border.light }]}>
          <Text style={[styles.androidPickerTitle, { color: currentActiveColors.text.primary }]}>Select Date</Text>
        </View>
        <View style={styles.calendarContainer}>
          {renderCalendar()}
        </View>
        <View style={[styles.androidPickerActions, { borderTopColor: currentActiveColors.border.light }]}>
          <Button
            title="Cancel"
            onPress={handleCancel}
            variant="outline"
            size="sm"
            style={styles.pickerActionButton}
          />
          <Button
            title="Confirm"
            onPress={handleConfirm}
            variant="default"
            size="sm"
            style={styles.pickerActionButton}
          />
        </View>
      </View>
    );
  };

  // Ensure activeColors is always defined with fallback
  const safeActiveColors = activeColors || colors;

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: safeActiveColors.text.primary }]}>
          {label}
          {required && <Text style={[styles.required, { color: safeActiveColors.destructive.DEFAULT }]}> *</Text>}
        </Text>
      )}
      <TouchableOpacity
        style={[
          styles.inputContainer,
          {
            backgroundColor: safeActiveColors.input,
            borderColor: safeActiveColors.border.DEFAULT,
          },
          disabled && styles.inputDisabled
        ]}
        onPress={handleOpen}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Calendar size={20} color={safeActiveColors.text.secondary} />
        <Text style={[
          styles.inputText,
          { color: displayValue ? safeActiveColors.text.primary : safeActiveColors.text.muted }
        ]}>
          {displayValue || placeholder}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={showPicker}
        transparent
        animationType="slide"
        onRequestClose={handleCancel}
      >
        <SafeAreaView style={styles.modalOverlay} edges={['bottom']}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: safeActiveColors.card.DEFAULT,
                maxHeight: modalMaxHeight(0.85),
                paddingBottom: Math.max(insets.bottom, spacing[2]),
              },
            ]}
          >
            {Platform.OS === 'ios' ? renderIOSDatePicker() : renderAndroidDatePicker()}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[4],
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
  },
  required: {
    // Color set dynamically
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    gap: spacing[2],
    minHeight: 44, // iOS minimum touch target
  },
  inputDisabled: {
    opacity: 0.5,
  },
  inputText: {
    flex: 1,
    fontSize: typography.fontSize.base,
  },
  inputPlaceholder: {
    // Color set dynamically
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    width: '100%',
    ...shadows.lg,
  },
  iosPickerContainer: {
    paddingBottom: spacing[6],
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  iosPickerButton: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  iosPickerButtonText: {
    fontSize: typography.fontSize.base,
  },
  iosPickerButtonConfirm: {
    fontWeight: typography.fontWeight.semibold,
  },
  iosPickerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  androidPickerContainer: {
    paddingBottom: spacing[6],
  },
  androidPickerHeader: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
  },
  androidPickerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  androidPickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    borderTopWidth: 1,
  },
  pickerActionButton: {
    flex: 1,
  },
  calendarContainer: {
    padding: spacing[4],
  },
  calendar: {
    width: '100%',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
    paddingHorizontal: spacing[2],
  },
  monthNavButton: {
    padding: spacing[2],
    minWidth: 44,
    alignItems: 'center',
  },
  monthNavText: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
  },
  monthYearText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  weekDaysRow: {
    flexDirection: 'row',
    marginBottom: spacing[2],
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  weekDayText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    margin: spacing[0.5],
  },
  calendarDayEmpty: {
    opacity: 0,
  },
  calendarDaySelected: {
    // Background set dynamically
  },
  calendarDayToday: {
    // Background and border set dynamically
  },
  calendarDayText: {
    fontSize: typography.fontSize.base,
  },
  calendarDayTextSelected: {
    fontWeight: typography.fontWeight.semibold,
  },
  calendarDayTextToday: {
    fontWeight: typography.fontWeight.semibold,
  },
});

