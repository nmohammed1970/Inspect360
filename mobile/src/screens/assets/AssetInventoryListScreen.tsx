import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { propertiesService } from '../../services/properties';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';

export default function AssetInventoryListScreen() {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  const { data: properties = [], isLoading: propertiesLoading } = useQuery({
    queryKey: ['/api/properties'],
    queryFn: () => propertiesService.getProperties(),
  });

  const { data: inventory = [], isLoading: inventoryLoading } = useQuery({
    queryKey: [`/api/properties/${selectedPropertyId}/inventory`],
    queryFn: () => propertiesService.getPropertyInventory(selectedPropertyId!),
    enabled: !!selectedPropertyId,
  });

  if (propertiesLoading) {
    return <LoadingSpinner />;
  }

  if (properties.length === 0) {
    return (
      <EmptyState
        title="No Properties"
        message="No properties available to view asset inventory."
      />
    );
  }

  // For now, show a simple list - can be enhanced with property selection
  return (
    <View style={styles.container}>
      <FlatList
        data={properties}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.propertyName}>{item.name}</Text>
            <Text style={styles.propertyAddress}>{item.address}</Text>
            <Text style={styles.placeholder}>
              Asset inventory for this property will be displayed here.
            </Text>
          </Card>
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <EmptyState
            title="No Assets"
            message="No asset inventory available."
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
  propertyName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
    color: '#000',
  },
  propertyAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  placeholder: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
});

