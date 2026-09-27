import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { maintenanceService } from '../../services/maintenance';
import type { MaintenanceStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { colors, spacing } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';

type RoutePropType = RouteProp<MaintenanceStackParamList, 'MaintenanceDetail'>;

export default function MaintenanceDetailScreen() {
  const route = useRoute<RoutePropType>();
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const { getResponsivePadding } = useResponsive();
  const contentPad = getResponsivePadding(16);
  const theme = useTheme();
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  const { requestId } = route.params;

  const { data: request, isLoading } = useQuery({
    queryKey: [`/api/maintenance/${requestId}`],
    queryFn: () => maintenanceService.getMaintenanceRequest(requestId),
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!request) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <Text style={{ color: themeColors.text.primary }}>Maintenance request not found</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: contentPad,
            paddingTop: spacing[4],
            paddingBottom: Math.max(insets.bottom + 80, spacing[8]),
          },
        ]}
      >
        <Card>
          <Text style={[styles.title, { color: themeColors.text.primary, minWidth: 0 }]}>{request.title}</Text>
          <View style={styles.badgeContainer}>
            <View style={[styles.badge, { backgroundColor: themeColors.warning + '40' }]}>
              <Text style={[styles.badgeText, { color: themeColors.warning }]}>{request.status}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: themeColors.destructive.DEFAULT + '40' }]}>
              <Text style={[styles.badgeText, { color: themeColors.destructive.DEFAULT }]}>{request.priority}</Text>
            </View>
          </View>
        </Card>

        {request.description && (
          <Card>
            <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Description</Text>
            <Text style={[styles.description, { color: themeColors.text.secondary }]}>{request.description}</Text>
          </Card>
        )}

        <Card>
          <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Details</Text>
          <Text style={[styles.label, { color: themeColors.text.secondary }]}>
            Created: {new Date(request.createdAt).toLocaleString()}
          </Text>
          {request.updatedAt && (
            <Text style={[styles.label, { color: themeColors.text.secondary }]}>
              Updated: {new Date(request.updatedAt).toLocaleString()}
            </Text>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: spacing[3],
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    flexShrink: 1,
  },
  badgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
  label: {
    fontSize: 14,
    marginBottom: 4,
  },
});
