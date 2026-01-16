import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { inspectionsService } from '../../services/inspections';
import type { Inspection } from '../../types';
import type { InspectionsStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';

type NavigationProp = StackNavigationProp<InspectionsStackParamList, 'InspectionsList'>;

const statusColors: Record<string, string> = {
  scheduled: '#007AFF',
  in_progress: '#FF9500',
  completed: '#34C759',
  reviewed: '#34C759',
};

const statusLabels: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  reviewed: 'Reviewed',
};

export default function InspectionsListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: inspections = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/inspections/my'],
    queryFn: async () => {
      return inspectionsService.getMyInspections();
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleInspectionPress = (inspection: Inspection) => {
    if (inspection.status === 'scheduled' || inspection.status === 'in_progress') {
      navigation.navigate('InspectionCapture', { inspectionId: inspection.id });
    } else {
      navigation.navigate('InspectionReview', { inspectionId: inspection.id });
    }
  };

  const renderInspectionItem = ({ item }: { item: Inspection }) => {
    const statusColor = statusColors[item.status] || '#666';
    const statusLabel = statusLabels[item.status] || item.status;

    return (
      <TouchableOpacity onPress={() => handleInspectionPress(item)}>
        <Card>
          <View style={styles.inspectionHeader}>
            <Text style={styles.inspectionTitle}>
              {item.type || 'Inspection'}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
          </View>
          {item.scheduledDate && (
            <Text style={styles.dateText}>
              Scheduled: {new Date(item.scheduledDate).toLocaleDateString()}
            </Text>
          )}
          <Text style={styles.dateText}>
            Created: {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </Card>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={inspections}
        renderItem={renderInspectionItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            title="No Inspections"
            message="You don't have any assigned inspections yet."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 16,
  },
  inspectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inspectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
});

