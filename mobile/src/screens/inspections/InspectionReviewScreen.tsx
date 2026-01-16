import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { inspectionsService } from '../../services/inspections';
import type { InspectionsStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

type RoutePropType = RouteProp<InspectionsStackParamList, 'InspectionReview'>;

export default function InspectionReviewScreen() {
  const route = useRoute<RoutePropType>();
  const { inspectionId } = route.params;

  const { data: inspection, isLoading } = useQuery({
    queryKey: [`/api/inspections/${inspectionId}`],
    queryFn: () => inspectionsService.getInspection(inspectionId),
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!inspection) {
    return (
      <View style={styles.container}>
        <Text>Inspection not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.title}>Inspection Review</Text>
        <Text style={styles.label}>Type: {inspection.type}</Text>
        <Text style={styles.label}>Status: {inspection.status}</Text>
        {inspection.scheduledDate && (
          <Text style={styles.label}>
            Scheduled: {new Date(inspection.scheduledDate).toLocaleDateString()}
          </Text>
        )}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Review Details</Text>
        <Text style={styles.placeholder}>
          Review screen with completeness check, AI analysis display,
          and submission flow will be implemented here.
        </Text>
      </Card>
    </ScrollView>
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
    marginBottom: 16,
    color: '#000',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000',
  },
  placeholder: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
});

