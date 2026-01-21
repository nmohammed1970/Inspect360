import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Calendar, User as UserIcon, FileText, Building } from 'lucide-react-native';
import { format } from 'date-fns';
import { inspectionsService } from '../../services/inspections';
import { apiRequestJson } from '../../services/api';
import { queryClient } from '../../services/queryClient';
import type { InspectionsStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { colors, spacing, typography, borderRadius } from '../../theme';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

type NavigationProp = StackNavigationProp<InspectionsStackParamList, 'CreateInspection'>;

interface FormData {
  targetType: 'property' | 'block';
  propertyId: string;
  blockId: string;
  tenantId: string;
  type: string;
  scheduledDate: string;
  templateId: string;
  clerkId: string;
  notes: string;
}

const INSPECTION_TYPES = [
  { value: 'check_in', label: 'Check In' },
  { value: 'check_out', label: 'Check Out' },
  { value: 'routine', label: 'Routine' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'esg_sustainability_inspection', label: 'ESG Sustainability Inspection' },
  { value: 'fire_hazard_assessment', label: 'Fire Hazard Assessment' },
  { value: 'maintenance_inspection', label: 'Maintenance Inspection' },
  { value: 'damage', label: 'Damage' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'safety_compliance', label: 'Safety & Compliance' },
  { value: 'compliance_regulatory', label: 'Compliance / Regulatory' },
  { value: 'pre_purchase', label: 'Pre-Purchase' },
  { value: 'specialized', label: 'Specialized' },
];

export default function CreateInspectionScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const [formData, setFormData] = useState<FormData>({
    targetType: 'property',
    propertyId: '',
    blockId: '',
    tenantId: '',
    type: 'routine',
    scheduledDate: format(new Date(), 'yyyy-MM-dd'),
    templateId: '__none__',
    clerkId: '',
    notes: '',
  });
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [showTenantPicker, setShowTenantPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showClerkPicker, setShowClerkPicker] = useState(false);

  // Fetch properties
  const { data: properties = [] } = useQuery({
    queryKey: ['/api/properties'],
    queryFn: () => apiRequestJson<any[]>('GET', '/api/properties'),
  });

  // Fetch blocks
  const { data: blocks = [] } = useQuery({
    queryKey: ['/api/blocks'],
    queryFn: () => apiRequestJson<any[]>('GET', '/api/blocks'),
  });

  // Fetch clerks (team members)
  const { data: clerks = [] } = useQuery({
    queryKey: ['/api/users/clerks'],
    queryFn: () => apiRequestJson<any[]>('GET', '/api/users/clerks'),
  });

  // Fetch templates based on target type
  const { data: templates = [] } = useQuery({
    queryKey: ['/api/inspection-templates', { scope: formData.targetType, active: true }],
    queryFn: async () => {
      const scope = formData.targetType === 'block' ? 'block' : 'property';
      return apiRequestJson<any[]>('GET', `/api/inspection-templates?scope=${scope}&active=true`);
    },
    enabled: !!formData.targetType && (formData.targetType === 'property' || formData.targetType === 'block'),
  });

  // Fetch tenants for selected property
  const { data: tenants = [] } = useQuery({
    queryKey: ['/api/properties', selectedPropertyId, 'tenants'],
    queryFn: () => apiRequestJson<any[]>('GET', `/api/properties/${selectedPropertyId}/tenants`),
    enabled: !!selectedPropertyId && formData.targetType === 'property',
  });

  // Create inspection mutation
  const createInspection = useMutation({
    mutationFn: (data: FormData) => inspectionsService.createInspection(data),
    onSuccess: (inspection) => {
      queryClient.invalidateQueries({ queryKey: ['/api/inspections/my'] });
      Alert.alert('Success', 'Inspection created successfully', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to create inspection');
    },
  });

  const handleSubmit = () => {
    // Validate required fields
    if (formData.targetType === 'property' && !formData.propertyId) {
      Alert.alert('Validation Error', 'Please select a property');
      return;
    }
    if (formData.targetType === 'block' && !formData.blockId) {
      Alert.alert('Validation Error', 'Please select a block');
      return;
    }
    if (!formData.type) {
      Alert.alert('Validation Error', 'Please select an inspection type');
      return;
    }
    if (!formData.scheduledDate) {
      Alert.alert('Validation Error', 'Please select a scheduled date');
      return;
    }

    // Clean up form data before submitting
    const submitData = {
      ...formData,
      tenantId: formData.tenantId === '__none__' ? '' : formData.tenantId,
      templateId: formData.templateId === '__none__' ? undefined : formData.templateId,
      clerkId: formData.clerkId || undefined,
      notes: formData.notes || undefined,
    };

    createInspection.mutate(submitData);
  };

  const handleTargetTypeChange = (targetType: 'property' | 'block') => {
    setFormData({
      ...formData,
      targetType,
      propertyId: '',
      blockId: '',
      tenantId: '',
    });
    setSelectedPropertyId('');
  };

  const handlePropertyChange = (propertyId: string) => {
    setFormData({
      ...formData,
      propertyId,
      tenantId: '',
    });
    setSelectedPropertyId(propertyId);
    setShowPropertyPicker(false);
  };

  const handleBlockChange = (blockId: string) => {
    setFormData({
      ...formData,
      blockId,
    });
    setShowBlockPicker(false);
  };

  const selectedProperty = properties.find((p: any) => p.id === formData.propertyId);
  const selectedBlock = blocks.find((b: any) => b.id === formData.blockId);
  const selectedType = INSPECTION_TYPES.find(t => t.value === formData.type);
  const selectedTemplate = templates.find((t: any) => t.id === formData.templateId);
  const selectedClerk = clerks.find((c: any) => c.id === formData.clerkId);
  const selectedTenant = tenants.find((t: any) => t.id === formData.tenantId);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top + spacing[2], spacing[6]) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <ChevronLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create New Inspection</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={[
          styles.contentContainer,
          { 
            paddingTop: Math.max(insets.top + spacing[4], spacing[8]),
            paddingBottom: Math.max(insets.bottom + 80, spacing[8]) 
          }
        ]}
      >
        <Card style={styles.card}>
          {/* Inspection Target */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Inspection Target *</Text>
            <View style={styles.targetTypeRow}>
              <TouchableOpacity
                style={[
                  styles.targetTypeButton,
                  formData.targetType === 'property' && styles.targetTypeButtonActive,
                ]}
                onPress={() => handleTargetTypeChange('property')}
              >
                <Text
                  style={[
                    styles.targetTypeText,
                    formData.targetType === 'property' && styles.targetTypeTextActive,
                  ]}
                >
                  Property (Unit)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.targetTypeButton,
                  formData.targetType === 'block' && styles.targetTypeButtonActive,
                ]}
                onPress={() => handleTargetTypeChange('block')}
              >
                <Text
                  style={[
                    styles.targetTypeText,
                    formData.targetType === 'block' && styles.targetTypeTextActive,
                  ]}
                >
                  Block (Building)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Block Selection (if targetType is block) */}
          {formData.targetType === 'block' && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Block *</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowBlockPicker(true)}
              >
                <Building size={16} color={colors.text.secondary} />
                <Text style={[styles.selectButtonText, !formData.blockId && styles.placeholder]}>
                  {selectedBlock?.name || 'Select block'}
                </Text>
              </TouchableOpacity>
              {showBlockPicker && (
                <View style={styles.pickerContainer}>
                  <ScrollView style={styles.pickerScroll}>
                    {blocks.map((block: any) => (
                      <TouchableOpacity
                        key={block.id}
                        style={styles.pickerItem}
                        onPress={() => handleBlockChange(block.id)}
                      >
                        <Text style={styles.pickerItemText}>{block.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Button
                    title="Cancel"
                    onPress={() => setShowBlockPicker(false)}
                    variant="outline"
                    size="sm"
                  />
                </View>
              )}
            </View>
          )}

          {/* Property Selection (if targetType is property) */}
          {formData.targetType === 'property' && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Property *</Text>
              <TouchableOpacity
                style={styles.selectButton}
                onPress={() => setShowPropertyPicker(true)}
              >
                <Building size={16} color={colors.text.secondary} />
                <Text style={[styles.selectButtonText, !formData.propertyId && styles.placeholder]}>
                  {selectedProperty?.name || 'Select property'}
                </Text>
              </TouchableOpacity>
              {showPropertyPicker && (
                <View style={styles.pickerContainer}>
                  <ScrollView style={styles.pickerScroll}>
                    {properties.map((property: any) => (
                      <TouchableOpacity
                        key={property.id}
                        style={styles.pickerItem}
                        onPress={() => handlePropertyChange(property.id)}
                      >
                        <Text style={styles.pickerItemText}>{property.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Button
                    title="Cancel"
                    onPress={() => setShowPropertyPicker(false)}
                    variant="outline"
                    size="sm"
                  />
                </View>
              )}

              {/* Active Tenants Display */}
              {selectedPropertyId && tenants.length > 0 && (
                <View style={styles.tenantsContainer}>
                  <Text style={styles.tenantsTitle}>Active Tenants</Text>
                  {tenants.filter((t: any) => t.assignment?.isActive).length === 0 ? (
                    <Text style={styles.noTenantsText}>No active tenants at this property</Text>
                  ) : (
                    <View style={styles.tenantsList}>
                      {tenants
                        .filter((t: any) => t.assignment?.isActive)
                        .map((tenant: any) => {
                          const firstName = tenant.tenant?.firstName || tenant.firstName || '';
                          const lastName = tenant.tenant?.lastName || tenant.lastName || '';
                          const fullName = `${firstName} ${lastName}`.trim() || 'Unnamed Tenant';
                          const email = tenant.tenant?.email || tenant.email || '';
                          return (
                            <View key={tenant.id} style={styles.tenantItem}>
                              <View style={styles.tenantAvatar}>
                                <Text style={styles.tenantInitials}>
                                  {fullName
                                    .split(' ')
                                    .map(n => n[0])
                                    .join('')
                                    .toUpperCase()
                                    .slice(0, 2)}
                                </Text>
                              </View>
                              <View style={styles.tenantInfo}>
                                <Text style={styles.tenantName}>{fullName}</Text>
                                {email && <Text style={styles.tenantEmail}>{email}</Text>}
                              </View>
                              <View style={styles.activeBadge}>
                                <Text style={styles.activeBadgeText}>Active</Text>
                              </View>
                            </View>
                          );
                        })}
                    </View>
                  )}
                </View>
              )}

              {/* Tenant Selection (optional) */}
              {selectedPropertyId && tenants.length > 0 && (
                <View style={[styles.formGroup, { marginTop: spacing[4] }]}>
                  <Text style={styles.label}>Assign to Tenant (Optional)</Text>
                  <TouchableOpacity
                    style={styles.selectButton}
                    onPress={() => setShowTenantPicker(true)}
                  >
                    <UserIcon size={16} color={colors.text.secondary} />
                    <Text style={[styles.selectButtonText, !formData.tenantId && styles.placeholder]}>
                      {selectedTenant
                        ? `${selectedTenant.firstName || ''} ${selectedTenant.lastName || ''}`.trim()
                        : 'No tenant selected'}
                    </Text>
                  </TouchableOpacity>
                  {showTenantPicker && (
                    <View style={styles.pickerContainer}>
                      <ScrollView style={styles.pickerScroll}>
                        <TouchableOpacity
                          style={styles.pickerItem}
                          onPress={() => {
                            setFormData({ ...formData, tenantId: '__none__' });
                            setShowTenantPicker(false);
                          }}
                        >
                          <Text style={styles.pickerItemText}>No Tenant Selected</Text>
                        </TouchableOpacity>
                        {tenants.map((tenant: any) => (
                          <TouchableOpacity
                            key={tenant.id}
                            style={styles.pickerItem}
                            onPress={() => {
                              setFormData({ ...formData, tenantId: tenant.id });
                              setShowTenantPicker(false);
                            }}
                          >
                            <Text style={styles.pickerItemText}>
                              {tenant.firstName} {tenant.lastName}
                              {tenant.assignment?.isActive && ' (Active)'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      <Button
                        title="Cancel"
                        onPress={() => setShowTenantPicker(false)}
                        variant="outline"
                        size="sm"
                      />
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Inspection Type */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Inspection Type *</Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => setShowTypePicker(true)}
            >
              <FileText size={16} color={colors.text.secondary} />
              <Text style={[styles.selectButtonText, !formData.type && styles.placeholder]}>
                {selectedType?.label || 'Select type'}
              </Text>
            </TouchableOpacity>
            {showTypePicker && (
              <View style={styles.pickerContainer}>
                <ScrollView style={styles.pickerScroll}>
                  {INSPECTION_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      style={styles.pickerItem}
                      onPress={() => {
                        setFormData({ ...formData, type: type.value });
                        setShowTypePicker(false);
                      }}
                    >
                      <Text style={styles.pickerItemText}>{type.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Button
                  title="Cancel"
                  onPress={() => setShowTypePicker(false)}
                  variant="outline"
                  size="sm"
                />
              </View>
            )}
          </View>

          {/* Template Selection */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Template (Optional)</Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => setShowTemplatePicker(true)}
            >
              <FileText size={16} color={colors.text.secondary} />
              <Text style={[styles.selectButtonText, (!formData.templateId || formData.templateId === '__none__') && styles.placeholder]}>
                {selectedTemplate
                  ? `${selectedTemplate.name}${selectedTemplate.version > 1 ? ` (v${selectedTemplate.version})` : ''}`
                  : 'No template'}
              </Text>
            </TouchableOpacity>
            {showTemplatePicker && (
              <View style={styles.pickerContainer}>
                <ScrollView style={styles.pickerScroll}>
                  <TouchableOpacity
                    style={styles.pickerItem}
                    onPress={() => {
                      setFormData({ ...formData, templateId: '__none__' });
                      setShowTemplatePicker(false);
                    }}
                  >
                    <Text style={styles.pickerItemText}>No Template</Text>
                  </TouchableOpacity>
                  {templates.map((template: any) => (
                    <TouchableOpacity
                      key={template.id}
                      style={styles.pickerItem}
                      onPress={() => {
                        setFormData({ ...formData, templateId: template.id });
                        setShowTemplatePicker(false);
                      }}
                    >
                      <Text style={styles.pickerItemText}>
                        {template.name}
                        {template.version > 1 && ` (v${template.version})`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Button
                  title="Cancel"
                  onPress={() => setShowTemplatePicker(false)}
                  variant="outline"
                  size="sm"
                />
              </View>
            )}
          </View>

          {/* Scheduled Date */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Scheduled Date *</Text>
            <View style={styles.dateInputContainer}>
              <Calendar size={16} color={colors.text.secondary} />
              <Input
                value={formData.scheduledDate}
                onChangeText={(text) => setFormData({ ...formData, scheduledDate: text })}
                placeholder="YYYY-MM-DD"
                style={styles.dateInput}
              />
            </View>
          </View>

          {/* Inspector Selection */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Assign to Inspector (Optional)</Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => setShowClerkPicker(true)}
            >
              <UserIcon size={16} color={colors.text.secondary} />
              <Text style={[styles.selectButtonText, !formData.clerkId && styles.placeholder]}>
                {selectedClerk
                  ? `${selectedClerk.firstName || ''} ${selectedClerk.lastName || ''}`.trim()
                  : 'Select team member'}
              </Text>
            </TouchableOpacity>
            {showClerkPicker && (
              <View style={styles.pickerContainer}>
                <ScrollView style={styles.pickerScroll}>
                  {clerks.map((clerk: any) => (
                    <TouchableOpacity
                      key={clerk.id}
                      style={styles.pickerItem}
                      onPress={() => {
                        setFormData({ ...formData, clerkId: clerk.id });
                        setShowClerkPicker(false);
                      }}
                    >
                      <Text style={styles.pickerItemText}>
                        {clerk.firstName} {clerk.lastName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Button
                  title="Cancel"
                  onPress={() => setShowClerkPicker(false)}
                  variant="outline"
                  size="sm"
                />
              </View>
            )}
          </View>

          {/* Notes */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Notes (Optional)</Text>
            <Input
              value={formData.notes}
              onChangeText={(text) => setFormData({ ...formData, notes: text })}
              placeholder="Any additional notes..."
              multiline
              numberOfLines={4}
              style={styles.notesInput}
            />
          </View>

          {/* Submit Button */}
          <View style={styles.actions}>
            <Button
              title="Cancel"
              onPress={() => navigation.goBack()}
              variant="outline"
              size="md"
            />
            <Button
              title={createInspection.isPending ? 'Creating...' : 'Create Inspection'}
              onPress={handleSubmit}
              variant="primary"
              size="md"
              disabled={createInspection.isPending}
              loading={createInspection.isPending}
            />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.card.DEFAULT,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  headerTitle: {
    flex: 1,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing[4],
  },
  card: {
    padding: spacing[4],
  },
  formGroup: {
    marginBottom: spacing[4],
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  targetTypeRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  targetTypeButton: {
    flex: 1,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  targetTypeButtonActive: {
    borderColor: colors.primary.DEFAULT,
    backgroundColor: `${colors.primary.DEFAULT}10`,
  },
  targetTypeText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: typography.fontWeight.medium,
  },
  targetTypeTextActive: {
    color: colors.primary.DEFAULT,
    fontWeight: typography.fontWeight.semibold,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    backgroundColor: colors.background,
  },
  selectButtonText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
  },
  placeholder: {
    color: colors.text.muted,
  },
  pickerContainer: {
    marginTop: spacing[2],
    padding: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    backgroundColor: colors.card.DEFAULT,
    maxHeight: 200,
  },
  pickerScroll: {
    maxHeight: 150,
  },
  pickerItem: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  pickerItemText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
  },
  tenantsContainer: {
    marginTop: spacing[3],
    padding: spacing[3],
    borderRadius: borderRadius.md,
    backgroundColor: colors.muted.DEFAULT,
  },
  tenantsTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  noTenantsText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.muted,
    textAlign: 'center',
    paddingVertical: spacing[2],
  },
  tenantsList: {
    gap: spacing[2],
  },
  tenantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[2],
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
  },
  tenantAvatar: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary.DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tenantInitials: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary.foreground,
  },
  tenantInfo: {
    flex: 1,
  },
  tenantName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  tenantEmail: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  activeBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.sm,
    backgroundColor: colors.secondary.DEFAULT,
  },
  activeBadgeText: {
    fontSize: typography.fontSize.xs,
    color: colors.secondary.foreground,
  },
  notesInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
  },
  dateInput: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
});

