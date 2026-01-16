import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, Text } from 'react-native';
import { Plus, Package, Wrench, X } from 'lucide-react-native';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import Button from '../ui/Button';

interface InspectionQuickActionsProps {
  inspectionId: string;
  propertyId?: string;
  blockId?: string;
  onAddAsset?: () => void;
  onUpdateAsset?: () => void;
  onLogMaintenance?: () => void;
}

export default function InspectionQuickActions({
  inspectionId,
  propertyId,
  blockId,
  onAddAsset,
  onUpdateAsset,
  onLogMaintenance,
}: InspectionQuickActionsProps) {
  const [showMenu, setShowMenu] = useState(false);

  const actions = [
    {
      id: 'add-asset',
      label: 'Add Asset',
      icon: <Plus size={20} color={colors.primary.foreground} />,
      onPress: () => {
        setShowMenu(false);
        onAddAsset?.();
      },
    },
    {
      id: 'update-asset',
      label: 'Update Asset',
      icon: <Package size={20} color={colors.primary.foreground} />,
      onPress: () => {
        setShowMenu(false);
        onUpdateAsset?.();
      },
    },
    {
      id: 'log-maintenance',
      label: 'Log Maintenance',
      icon: <Wrench size={20} color={colors.primary.foreground} />,
      onPress: () => {
        setShowMenu(false);
        onLogMaintenance?.();
      },
    },
  ];

  return (
    <>
      {/* FAB Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowMenu(true)}
        activeOpacity={0.8}
      >
        <Plus size={24} color={colors.primary.foreground} />
      </TouchableOpacity>

      {/* Action Menu Modal */}
      <Modal
        visible={!!showMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Quick Actions</Text>
              <TouchableOpacity
                onPress={() => setShowMenu(false)}
                style={styles.closeButton}
              >
                <X size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.menuActions}>
              {actions.map((action) => (
                <TouchableOpacity
                  key={action.id}
                  style={styles.menuAction}
                  onPress={action.onPress}
                >
                  <View style={styles.menuActionIcon}>{action.icon}</View>
                  <Text style={styles.menuActionText}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: spacing[6],
    right: spacing[4],
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary.DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
    zIndex: 1000,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: colors.card.DEFAULT,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing[4],
    paddingBottom: spacing[8],
    ...shadows.lg,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  closeButton: {
    padding: spacing[1],
  },
  menuActions: {
    gap: spacing[2],
  },
  menuAction: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: borderRadius.md,
    backgroundColor: colors.secondary.DEFAULT,
  },
  menuActionIcon: {
    marginRight: spacing[3],
  },
  menuActionText: {
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: '500',
  },
});

