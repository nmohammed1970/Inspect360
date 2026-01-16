import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Image } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { maintenanceService } from '../../services/maintenance';
import type { MaintenanceStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

type RoutePropType = RouteProp<MaintenanceStackParamList, 'CreateMaintenance'>;

export default function CreateMaintenanceScreen() {
  const route = useRoute<RoutePropType>();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const params = route.params;
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [photos, setPhotos] = useState<string[]>(params?.photos || []);

  // Auto-populate from inspection context
  useEffect(() => {
    if (params?.fieldLabel) {
      setTitle(`Maintenance: ${params.fieldLabel}`);
      setDescription(`Maintenance request created from inspection field: ${params.fieldLabel}`);
      setPriority('high');
    }
  }, [params]);

  const createMutation = useMutation({
    mutationFn: (data: any) => maintenanceService.createMaintenanceRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance'] });
      Alert.alert('Success', 'Maintenance request created successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to create maintenance request');
    },
  });

  const handleSubmit = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      status: 'open',
      photos: photos.length > 0 ? photos : undefined,
      inspectionId: params?.inspectionId,
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card>
        <Input
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="Enter maintenance request title"
        />
        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Enter description (optional)"
          multiline={true}
          numberOfLines={4}
          style={styles.textArea}
        />
        <Text style={styles.label}>Priority</Text>
        <View style={styles.priorityContainer}>
          {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
            <Button
              key={p}
              title={p}
              onPress={() => setPriority(p)}
              variant={priority === p ? 'primary' : 'outline'}
              style={styles.priorityButton}
            />
          ))}
        </View>
        
        {photos.length > 0 && (
          <View style={styles.photosContainer}>
            <Text style={styles.label}>Photos from Inspection</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {photos.map((photo, index) => (
                <Image key={index} source={{ uri: photo }} style={styles.photo} />
              ))}
            </ScrollView>
          </View>
        )}
      </Card>

      <Button
        title="Create Request"
        onPress={handleSubmit}
        loading={!!createMutation.isPending}
      />
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
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  priorityContainer: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  priorityButton: {
    flex: 1,
    minWidth: 80,
  },
  photosContainer: {
    marginTop: 16,
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 8,
  },
});

