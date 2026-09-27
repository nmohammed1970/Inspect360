import React from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { AlertTriangle, ListChecks } from 'lucide-react-native';
import {
  formatInspectionNote,
  parseInspectionNote,
  type InspectionNoteSections,
} from '../../../shared/inspectionNoteSections';
import { getFontSize, moderateScale } from '../utils/responsive';
import { borderRadius, spacing } from '../theme';

type Props = {
  note: string;
  description: string;
  onDescriptionChange: (value: string) => void;
  hideDescriptionField?: boolean;
  isDark?: boolean;
};

function Panel({
  title,
  body,
  variant,
  isDark,
}: {
  title: string;
  body: string;
  variant: 'maintenance' | 'recommended';
  isDark?: boolean;
}) {
  const isMaint = variant === 'maintenance';
  const bg = isMaint
    ? isDark
      ? 'rgba(127,29,29,0.35)'
      : '#FEF2F2'
    : isDark
      ? 'rgba(19,78,74,0.35)'
      : '#F0FDFA';
  const border = isMaint
    ? isDark
      ? '#7F1D1D'
      : '#FECACA'
    : isDark
      ? '#115E59'
      : '#99F6E4';
  const titleColor = isMaint
    ? isDark
      ? '#FECACA'
      : '#991B1B'
    : isDark
      ? '#99F6E4'
      : '#115E59';
  const bodyColor = isMaint
    ? isDark
      ? '#FEE2E2'
      : '#7F1D1D'
    : isDark
      ? '#CCFBF1'
      : '#134E4A';
  const Icon = isMaint ? AlertTriangle : ListChecks;

  return (
    <View style={[styles.panel, { backgroundColor: bg, borderColor: border }]}>
      <View style={styles.panelHeader}>
        <Icon size={moderateScale(16)} color={titleColor} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>{title}</Text>
      </View>
      <Text style={[styles.panelBody, { color: bodyColor }]}>{body}</Text>
    </View>
  );
}

/** Description field + Maintenance Issues / Recommended Actions after AI analyze. */
export default function MaintenanceAiAnalysisView({
  note,
  description,
  onDescriptionChange,
  hideDescriptionField,
  isDark,
}: Props) {
  const sections: InspectionNoteSections = parseInspectionNote(note);
  if (!sections.maintenanceIssues && !sections.recommendedActions && !sections.description) {
    return null;
  }

  return (
    <View style={styles.wrap} testID="maintenance-ai-analysis">
      {!hideDescriptionField ? (
        <View style={styles.descBlock}>
          <Text style={[styles.label, { color: isDark ? '#a3a3a3' : '#525252' }]}>Description</Text>
          <TextInput
            value={description}
            onChangeText={onDescriptionChange}
            multiline
            textAlignVertical="top"
            style={[
              styles.textarea,
              {
                color: isDark ? '#fafafa' : '#171717',
                backgroundColor: isDark ? '#171717' : '#fff',
                borderColor: isDark ? '#404040' : '#e5e5e5',
              },
            ]}
          />
        </View>
      ) : null}

      {sections.maintenanceIssues ? (
        <Panel
          title="Maintenance Issues"
          body={sections.maintenanceIssues}
          variant="maintenance"
          isDark={isDark}
        />
      ) : null}

      {sections.recommendedActions ? (
        <Panel
          title="Recommended Actions"
          body={sections.recommendedActions}
          variant="recommended"
          isDark={isDark}
        />
      ) : null}
    </View>
  );
}

export function applyMaintenanceAiNote(
  note: string,
  opts?: { preferExistingDescription?: string },
): { sections: InspectionNoteSections; description: string; aiSuggestedFixes: string } {
  const sections = parseInspectionNote(note);
  const description =
    sections.description.trim() || (opts?.preferExistingDescription || '').trim() || '';
  const aiSuggestedFixes = formatInspectionNote({
    description,
    maintenanceIssues: sections.maintenanceIssues,
    recommendedActions: sections.recommendedActions,
  });
  return { sections, description, aiSuggestedFixes };
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  descBlock: { gap: spacing.xs },
  label: { fontSize: getFontSize(13), fontWeight: '600' },
  textarea: {
    minHeight: moderateScale(96),
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: getFontSize(14),
    lineHeight: getFontSize(20),
  },
  panel: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 },
  panelTitle: { fontSize: getFontSize(14), fontWeight: '700' },
  panelBody: { fontSize: getFontSize(13), lineHeight: getFontSize(19) },
});
