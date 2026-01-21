import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp, NavigationProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CheckCircle2,
  Trash2,
  Calendar,
  MapPin,
  User,
  Camera,
  Plus,
  Pencil,
  Sparkles,
} from 'lucide-react-native';
import { format } from 'date-fns';
import { inspectionsService } from '../../services/inspections';
import { apiRequestJson, API_URL } from '../../services/api';
import type { InspectionsStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';

type RoutePropType = RouteProp<InspectionsStackParamList, 'InspectionReview'>;
type NavProp = NavigationProp<InspectionsStackParamList>;

export default function InspectionReviewScreen() {
  const route = useRoute<RoutePropType>();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const { inspectionId } = route.params;

  const { data: inspection, isLoading } = useQuery({
    queryKey: [`/api/inspections/${inspectionId}`],
    queryFn: () => inspectionsService.getInspection(inspectionId),
  });

  // Fetch property details if inspection has a propertyId
  const { data: property } = useQuery<any>({
    queryKey: [`/api/properties/${inspection?.propertyId}`],
    queryFn: () => apiRequestJson<any>('GET', `/api/properties/${inspection?.propertyId}`),
    enabled: !!inspection?.propertyId,
  });

  // Fetch block details if inspection has a blockId
  const { data: block } = useQuery<any>({
    queryKey: [`/api/blocks/${inspection?.blockId}`],
    queryFn: () => apiRequestJson<any>('GET', `/api/blocks/${inspection?.blockId}`),
    enabled: !!inspection?.blockId,
  });

  // Fetch clerk details if inspection has a clerkId
  const { data: clerk } = useQuery<any>({
    queryKey: [`/api/users/${inspection?.clerkId}`],
    queryFn: () => apiRequestJson<any>('GET', `/api/users/${inspection?.clerkId}`),
    enabled: !!inspection?.clerkId,
  });

  const completeInspection = useMutation({
    mutationFn: async () => {
      return await apiRequestJson('PATCH', `/api/inspections/${inspectionId}/status`, {
        status: 'completed',
      });
    },
    onSuccess: () => {
      navigation.navigate('InspectionsList');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to update inspection status');
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      draft: { variant: 'outline', label: 'Draft' },
      scheduled: { variant: 'outline', label: 'Scheduled' },
      in_progress: { variant: 'default', label: 'In Progress' },
      completed: { variant: 'default', label: 'Completed' },
    };
    const config = variants[status] || variants.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      check_in: 'Check In',
      check_out: 'Check Out',
      routine: 'Routine',
      maintenance: 'Maintenance',
      esg_sustainability_inspection: 'ESG Sustainability Inspection',
      fire_hazard_assessment: 'Fire Hazard Assessment',
      maintenance_inspection: 'Maintenance Inspection',
      damage: 'Damage',
      emergency: 'Emergency',
      safety_compliance: 'Safety & Compliance',
      compliance_regulatory: 'Compliance / Regulatory',
      pre_purchase: 'Pre-Purchase',
      specialized: 'Specialized',
    };
    return <Badge variant="outline">{labels[type] || type}</Badge>;
  };

  const getPropertyAddress = () => {
    if (property) {
      return property.address || '';
    }
    if (block) {
      return block.address || '';
    }
    return '';
  };

  const getPropertyName = () => {
    return property?.name || block?.name || 'Unknown';
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!inspection) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Inspection not found</Text>
          <Button
            title="Go Back"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  const items = inspection?.items || [];
  const isCompleted = inspection.status === 'completed';

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
        {/* Header Section */}
        <View style={styles.headerSection}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <ArrowLeft size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.pageTitle}>Inspection Details</Text>
            <Text style={styles.pageSubtitle}>{getPropertyName()}</Text>
          </View>
          <View style={styles.headerActions}>
            {inspection.status !== 'completed' && (
              <Button
                title="Mark Complete"
                onPress={() => completeInspection.mutate()}
                disabled={completeInspection.isPending}
                variant="default"
                size="sm"
                icon={<CheckCircle2 size={16} color={colors.primary.foreground} />}
                style={styles.completeButton}
                loading={completeInspection.isPending}
              />
            )}
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => {
                Alert.alert(
                  'Delete Inspection',
                  'This action cannot be undone. This will permanently delete the inspection and all associated data.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { 
                      text: 'Delete', 
                      style: 'destructive',
                      onPress: () => {
                        // TODO: Implement delete functionality
                        Alert.alert('Delete', 'Delete functionality to be implemented');
                      }
                    },
                  ]
                );
              }}
            >
              <Trash2 size={20} color={colors.destructive.DEFAULT} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Two Information Cards */}
        <View style={styles.infoCardsRow}>
          {/* Inspection Information Card */}
          <Card style={styles.infoCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Inspection Information</Text>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => {
                  // TODO: Implement edit functionality
                  Alert.alert('Edit', 'Edit functionality to be implemented');
                }}
              >
                <Pencil size={16} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.cardContent}>
              <View style={styles.cardInfoRow}>
                <Text style={styles.cardLabel}>Status:</Text>
                {getStatusBadge(inspection.status)}
              </View>
              <View style={styles.cardInfoRow}>
                <Text style={styles.cardLabel}>Type:</Text>
                {getTypeBadge(inspection.type)}
              </View>
              <View style={styles.cardInfoRow}>
                <Calendar size={16} color={colors.text.secondary} />
                <Text style={styles.cardValue}>
                  {inspection.scheduledDate
                    ? format(new Date(inspection.scheduledDate), 'MMMM dd, yyyy')
                    : 'Not scheduled'}
                </Text>
              </View>
              {inspection.completedDate && (
                <View style={styles.cardInfoRow}>
                  <CheckCircle2 size={16} color={colors.text.secondary} />
                  <Text style={styles.cardValue}>
                    Completed: {format(new Date(inspection.completedDate), 'MMMM dd, yyyy')}
                  </Text>
                </View>
              )}
            </View>
          </Card>

          {/* Property Card */}
          <Card style={styles.infoCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Property</Text>
            </View>
            <View style={styles.cardContent}>
              <View style={styles.propertySection}>
                <View style={styles.cardInfoRow}>
                  <MapPin size={16} color={colors.text.secondary} />
                  <Text style={styles.propertyName}>{getPropertyName()}</Text>
                </View>
                <Text style={styles.propertyAddress}>{getPropertyAddress()}</Text>
              </View>
              {clerk && (
                <View style={styles.clerkSection}>
                  <View style={styles.cardInfoRow}>
                    <User size={16} color={colors.text.secondary} />
                    <Text style={styles.cardLabel}>Assigned Clerk:</Text>
                  </View>
                  <Text style={styles.clerkEmail}>{clerk.email}</Text>
                </View>
              )}
            </View>
          </Card>
        </View>

        {/* Notes Card (if notes exist) */}
        {inspection.notes && (
          <Card style={styles.notesCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Notes</Text>
            </View>
            <Text style={styles.notesText}>{inspection.notes}</Text>
          </Card>
        )}

        {/* Inspection Items Card */}
        <Card style={styles.itemsCard}>
          <View style={styles.itemsCardHeader}>
            <View style={styles.itemsCardTitleContainer}>
              <Text style={styles.cardTitle}>Inspection Items</Text>
              <Text style={styles.cardDescription}>
                Photos and condition assessments for this inspection
              </Text>
            </View>
            {inspection.status !== 'completed' && (
              <Button
                title="Add Item"
                onPress={() => {
                  // TODO: Implement add item functionality
                  Alert.alert('Add Item', 'Add item functionality to be implemented');
                }}
                variant="default"
                size="sm"
                icon={<Plus size={16} color={colors.primary.foreground} />}
              />
            )}
          </View>

          <View style={styles.itemsContent}>
            {items.length === 0 ? (
              <View style={styles.emptyItemsContainer}>
                <Camera size={48} color={colors.text.muted} />
                <Text style={styles.emptyItemsTitle}>No inspection items yet</Text>
                <Text style={styles.emptyItemsText}>
                  Add inspection items to document the condition of this property
                </Text>
              </View>
            ) : (
              <View style={styles.itemsGrid}>
                {items.map((item: any) => (
                  <Card key={item.id} style={styles.itemCard}>
                    <View style={styles.itemHeader}>
                      <View style={styles.itemTitleContainer}>
                        <Text style={styles.itemTitle}>{item.itemName}</Text>
                        <Text style={styles.itemCategory}>{item.category}</Text>
                      </View>
                      <Badge variant="secondary">
                        {item.conditionRating != null ? `${item.conditionRating}/10` : 'N/A'}
                      </Badge>
                    </View>
                    <View style={styles.itemContent}>
                      {item.photoUrl && (
                        <View style={styles.itemPhotoContainer}>
                          <Image
                            source={{ 
                              uri: item.photoUrl.startsWith('/objects/') 
                                ? `${API_URL}${item.photoUrl}`
                                : `${API_URL}/objects/${item.photoUrl}`
                            }}
                            style={styles.itemPhoto}
                            resizeMode="cover"
                          />
                        </View>
                      )}
                      
                      {item.notes && (
                        <View style={styles.itemNotesContainer}>
                          <Text style={styles.itemNotes}>{item.notes}</Text>
                        </View>
                      )}
                      
                      {item.aiAnalysis && (
                        <View style={styles.itemAiContainer}>
                          <View style={styles.itemAiHeader}>
                            <Sparkles size={16} color={colors.primary.DEFAULT} />
                            <Text style={styles.itemAiTitle}>AI Analysis</Text>
                          </View>
                          <Text style={styles.itemAiText}>{item.aiAnalysis}</Text>
                        </View>
                      )}
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: spacing[4],
  },
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[6],
    gap: spacing[3],
  },
  backButton: {
    padding: spacing[1],
  },
  headerTitleContainer: {
    flex: 1,
    minWidth: 0,
  },
  pageTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  pageSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing[1],
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  completeButton: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  deleteButton: {
    padding: spacing[2],
  },
  infoCardsRow: {
    flexDirection: 'column', // Stack vertically on mobile
    gap: spacing[4],
    marginBottom: spacing[4],
  },
  infoCard: {
    width: '100%',
    padding: spacing[4],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  cardTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  cardDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing[1],
  },
  editButton: {
    padding: spacing[1],
  },
  cardContent: {
    gap: spacing[4],
  },
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  cardLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  cardValue: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
  },
  propertySection: {
    gap: spacing[1],
  },
  propertyName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  propertyAddress: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginLeft: 24, // Icon width + gap
  },
  clerkSection: {
    marginTop: spacing[3],
    gap: spacing[1],
  },
  clerkEmail: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    marginLeft: 24, // Icon width + gap
  },
  notesCard: {
    padding: spacing[4],
    marginBottom: spacing[4],
  },
  notesText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.sm,
  },
  itemsCard: {
    padding: spacing[4],
    marginBottom: spacing[4],
  },
  itemsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[4],
    gap: spacing[3],
  },
  itemsCardTitleContainer: {
    flex: 1,
  },
  itemsContent: {
    gap: spacing[4],
  },
  emptyItemsContainer: {
    alignItems: 'center',
    paddingVertical: spacing[8],
  },
  emptyItemsTitle: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginTop: spacing[4],
    marginBottom: spacing[2],
  },
  emptyItemsText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  itemsGrid: {
    gap: spacing[4],
  },
  itemCard: {
    padding: spacing[4],
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
    gap: spacing[2],
  },
  itemTitleContainer: {
    flex: 1,
  },
  itemTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  itemCategory: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: spacing[1],
  },
  itemContent: {
    gap: spacing[3],
  },
  itemPhotoContainer: {
    aspectRatio: 16 / 9,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  itemPhoto: {
    width: '100%',
    height: '100%',
  },
  itemNotesContainer: {
    padding: spacing[3],
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  itemNotes: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.sm,
  },
  itemAiContainer: {
    padding: spacing[3],
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  itemAiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  itemAiTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  itemAiText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.sm,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  errorText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing[4],
  },
});