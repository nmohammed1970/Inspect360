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
import { spacing } from '../../theme';

type RoutePropType = RouteProp<MaintenanceStackParamList, 'MaintenanceDetail'>;

export default function MaintenanceDetailScreen() {
  const route = useRoute<RoutePropType>();
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
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
      <View style={styles.container}>
        <Text>Maintenance request not found</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={[
          styles.content,
          { 
            paddingTop: Math.max(insets.top + spacing[4], spacing[8]),
            paddingBottom: Math.max(insets.bottom + 80, spacing[8]) 
          }
        ]}
      >
      <Card>
        <Text style={styles.title}>{request.title}</Text>
        <View style={styles.badgeContainer}>
          <View style={[styles.badge, { backgroundColor: '#fbbf24' }]}> {/* Lighter amber-400 */}
            <Text style={styles.badgeText}>{request.status}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: '#FF3B30' }]}>
            <Text style={styles.badgeText}>{request.priority}</Text>
          </View>
        </View>
      </Card>

      {request.description && (
        <Card>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{request.description}</Text>
        </Card>
      )}

      <Card>
        <Text style={styles.sectionTitle}>Details</Text>
        <Text style={styles.label}>
          Created: {new Date(request.createdAt).toLocaleString()}
        </Text>
        {request.updatedAt && (
          <Text style={styles.label}>
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
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    color: '#000',
  },
  badgeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000',
  },
  description: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
});

