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
import { maintenanceService } from '../../services/maintenance';
import type { MaintenanceStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';

type NavigationProp = StackNavigationProp<MaintenanceStackParamList, 'MaintenanceList'>;

const statusColors: Record<string, string> = {
  open: '#FF9500',
  in_progress: '#007AFF',
  completed: '#34C759',
  closed: '#8E8E93',
};

const priorityColors: Record<string, string> = {
  low: '#34C759',
  medium: '#FF9500',
  high: '#FF3B30',
  urgent: '#FF3B30',
};

export default function MaintenanceListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/maintenance'],
    queryFn: () => maintenanceService.getMaintenanceRequests(),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const renderMaintenanceItem = ({ item }: { item: any }) => {
    const statusColor = statusColors[item.status] || '#666';
    const priorityColor = priorityColors[item.priority] || '#666';

    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('MaintenanceDetail', { requestId: item.id })}
      >
        <Card>
          <View style={styles.header}>
            <Text style={styles.title}>{item.title}</Text>
            <View style={[styles.badge, { backgroundColor: statusColor }]}>
              <Text style={styles.badgeText}>{item.status}</Text>
            </View>
          </View>
          {item.description && (
            <Text style={styles.description} numberOfLines={2}>
              {item.description}
            </Text>
          )}
          <View style={styles.footer}>
            <View style={[styles.priorityBadge, { backgroundColor: priorityColor }]}>
              <Text style={styles.priorityText}>{item.priority}</Text>
            </View>
            <Text style={styles.date}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerActions}>
        <Button
          title="Create Request"
          onPress={() => navigation.navigate('CreateMaintenance')}
          variant="primary"
        />
      </View>
      <FlatList
        data={requests}
        renderItem={renderMaintenanceItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            title="No Maintenance Requests"
            message="You don't have any maintenance requests yet."
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
  headerActions: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  listContent: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  date: {
    fontSize: 12,
    color: '#999',
  },
});

