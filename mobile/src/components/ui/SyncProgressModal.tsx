import React from 'react';
import { View, Text, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { Cloud, CheckCircle2, XCircle } from 'lucide-react-native';
import Card from './Card';
import Button from './Button';
import Progress from './Progress';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { SyncProgress } from '../../services/offline/syncService';

interface SyncProgressModalProps {
  visible: boolean;
  progress: SyncProgress | null;
  onClose: () => void;
}

export default function SyncProgressModal({ visible, progress, onClose }: SyncProgressModalProps) {
  const theme = useTheme();
  const themeColors = (theme && theme.colors) ? theme.colors : colors;

  if (!progress) {
    return null;
  }

  const progressPercent = progress.total > 0 
    ? (progress.completed / progress.total) * 100 
    : 0;
  const isComplete = progress.completed + progress.failed >= progress.total;
  const hasErrors = progress.failed > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Card style={[styles.modal, { backgroundColor: themeColors.card.DEFAULT }]}>
          <View style={styles.header}>
            {isComplete ? (
              hasErrors ? (
                <XCircle size={24} color={themeColors.destructive.DEFAULT} />
              ) : (
                <CheckCircle2 size={24} color={themeColors.success || '#22c55e'} />
              )
            ) : (
              <Cloud size={24} color={themeColors.primary.DEFAULT} />
            )}
            <Text style={[styles.title, { color: themeColors.text.primary }]}>
              {isComplete 
                ? hasErrors 
                  ? 'Sync Completed with Errors' 
                  : 'Sync Completed'
                : 'Syncing...'}
            </Text>
          </View>

          {progress.currentOperation && (
            <Text style={[styles.operation, { color: themeColors.text.secondary }]}>
              {progress.currentOperation}
            </Text>
          )}

          <View style={styles.progressContainer}>
            <Progress value={progressPercent} height={8} />
            <View style={styles.stats}>
              <Text style={[styles.statText, { color: themeColors.text.secondary }]}>
                {progress.completed} completed
              </Text>
              {progress.failed > 0 && (
                <Text style={[styles.statText, { color: themeColors.destructive.DEFAULT }]}>
                  {progress.failed} failed
                </Text>
              )}
              <Text style={[styles.statText, { color: themeColors.text.secondary }]}>
                {progress.total} total
              </Text>
            </View>
          </View>

          {isComplete && (
            <Button
              title="Close"
              onPress={onClose}
              variant="default"
              style={styles.closeButton}
            />
          )}
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    padding: spacing[4],
    borderRadius: borderRadius.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  operation: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing[3],
  },
  progressContainer: {
    marginBottom: spacing[4],
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[2],
  },
  statText: {
    fontSize: typography.fontSize.xs,
  },
  closeButton: {
    marginTop: spacing[2],
  },
});

