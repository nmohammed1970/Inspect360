import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  FlatList,
  Image,
  TextInput,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  Search,
  Filter,
  X,
  MapPin,
  Calendar,
  Wrench,
  FileText,
  Tag as TagIcon,
  Building2,
  Home,
  CheckCircle2,
} from 'lucide-react-native';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { assetsService, type AssetInventory } from '../../services/assets';
import { propertiesService } from '../../services/properties';
import { apiRequestJson, API_URL } from '../../services/api';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const conditionLabels: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  needs_replacement: 'Needs Replacement',
};

const cleanlinessLabels: Record<string, string> = {
  very_clean: 'Very Clean',
  clean: 'Clean',
  acceptable: 'Acceptable',
  needs_cleaning: 'Needs Cleaning',
  not_applicable: 'Not Applicable',
};

const assetCategories = [
  'HVAC',
  'Appliances',
  'Furniture',
  'Plumbing',
  'Electrical',
  'Flooring',
  'Windows & Doors',
  'Security',
  'Landscaping',
  'Lighting',
  'Kitchen Equipment',
  'Bathroom Fixtures',
  'Other',
];

const normalizePhotoUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  
  // Replace localhost URLs with API_URL for mobile compatibility
  // On mobile devices, localhost refers to the device itself, not the server
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    // Extract the path from the localhost URL
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname + urlObj.search;
      return `${API_URL}${path}`;
    } catch {
      // If URL parsing fails, try to extract path manually
      const match = url.match(/(localhost|127\.0\.0\.1)[:\d]*(\/.*)/);
      if (match && match[2]) {
        return `${API_URL}${match[2]}`;
      }
    }
  }
  
  // If already absolute URL, return as is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // If relative path starting with /, make it absolute
  if (url.startsWith('/')) {
    return `${API_URL}${url}`;
  }
  
  // If it's an object path like /objects/xxx, make it absolute
  if (url.startsWith('objects/')) {
    return `${API_URL}/${url}`;
  }
  
  // Otherwise, assume it's a relative path and prepend API_URL
  return `${API_URL}/${url}`;
};

export default function AssetInventoryListScreen() {
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetInventory | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterCondition, setFilterCondition] = useState<string>('all');
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showConditionPicker, setShowConditionPicker] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);
  const [showBlockPicker, setShowBlockPicker] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<AssetInventory>>({});

  // Fetch assets
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['/api/asset-inventory'],
    queryFn: () => assetsService.getAssetInventory(),
  });

  // Fetch properties
  const { data: properties = [] } = useQuery({
    queryKey: ['/api/properties'],
    queryFn: () => propertiesService.getProperties(),
  });

  // Fetch blocks
  const { data: blocks = [] } = useQuery({
    queryKey: ['/api/blocks'],
    queryFn: () => propertiesService.getBlocks(),
  });

  // Get unique locations
  const locations = useMemo(() => {
    const locs: Array<{ id: string; name: string; type: 'property' | 'block' }> = [];
    properties?.forEach(p => locs.push({ id: p.id, name: p.address || p.name, type: 'property' }));
    blocks?.forEach(b => locs.push({ id: b.id, name: b.name, type: 'block' }));
    return locs;
  }, [properties, blocks]);

  // Filter assets
  const filteredAssets = useMemo(() => {
    if (!assets) return [];

    return assets.filter(asset => {
      const matchesSearch = searchTerm === '' ||
        asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.location?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory = filterCategory === 'all' || asset.category === filterCategory;
      const matchesCondition = filterCondition === 'all' || asset.condition === filterCondition;
      const matchesLocation = filterLocation === 'all' || asset.propertyId === filterLocation || asset.blockId === filterLocation;

      return matchesSearch && matchesCategory && matchesCondition && matchesLocation;
    });
  }, [assets, searchTerm, filterCategory, filterCondition, filterLocation]);

  // Photo upload function
  const uploadPhoto = async (uri: string): Promise<string> => {
    try {
      const response = await fetch(`${API_URL}/api/objects/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadURL } = await response.json();
      const fileData = await fetch(uri);
      const blob = await fileData.blob();

      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        headers: {
          'Content-Type': blob.type || 'image/jpeg',
        },
        body: blob,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload photo');
      }

      let objectPath = uploadURL;
      if (objectPath.includes('?objectId=')) {
        const objectId = new URL(uploadURL).searchParams.get('objectId');
        if (objectId) {
          objectPath = `/objects/${objectId}`;
        }
      } else if (objectPath.includes('/objects/')) {
        const match = objectPath.match(/\/objects\/[^?]+/);
        if (match) {
          objectPath = match[0];
        }
      }

      const absoluteUrl = objectPath.startsWith('http') ? objectPath : `${API_URL}${objectPath}`;

      await fetch(`${API_URL}/api/objects/set-acl`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrl: absoluteUrl }),
      });

      return objectPath;
    } catch (error: any) {
      console.error('Photo upload error:', error);
      throw new Error(error?.message || 'Failed to upload photo');
    }
  };

  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera roll permissions');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as any,
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const uploadPromises = result.assets.map(asset => uploadPhoto(asset.uri));
      const uploadedPaths = await Promise.all(uploadPromises);
      setUploadedPhotos(prev => [...prev, ...uploadedPaths]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to pick images');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera permissions');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images' as any,
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const uploadedPath = await uploadPhoto(result.assets[0].uri);
      setUploadedPhotos(prev => [...prev, uploadedPath]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to take photo');
    }
  };

  // Create/Update mutations
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<AssetInventory>) => {
      if (editingAsset) {
        return assetsService.updateAssetInventory({ ...data, id: editingAsset.id });
      } else {
        return assetsService.createAssetInventory({
          ...data,
          organizationId: user?.organizationId || data.organizationId,
        } as any);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/asset-inventory'] });
      Alert.alert('Success', editingAsset ? 'Asset updated successfully' : 'Asset created successfully');
      handleCloseDialog();
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to save asset');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await assetsService.deleteAssetInventory(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/asset-inventory'] });
      Alert.alert('Success', 'Asset deleted successfully');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to delete asset');
    },
  });

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingAsset(null);
    setFormData({});
    setUploadedPhotos([]);
  };

  const handleOpenDialog = (asset?: AssetInventory) => {
    if (asset) {
      setEditingAsset(asset);
      setFormData(asset);
      setUploadedPhotos(asset.photos || []);
    } else {
      setFormData({});
      setUploadedPhotos([]);
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.condition) {
      Alert.alert('Validation Error', 'Asset name and condition are required');
      return;
    }

    const convertDate = (value: any) => {
      if (!value || value === '') return null;
      if (value instanceof Date) return value;
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    const submitData: any = {
      organizationId: user?.organizationId || formData.organizationId,
      name: formData.name,
      category: formData.category || null,
      description: formData.description || null,
      condition: formData.condition,
      cleanliness: formData.cleanliness || null,
      propertyId: formData.propertyId || null,
      blockId: formData.blockId || null,
      location: formData.location || null,
      datePurchased: convertDate(formData.datePurchased),
      purchasePrice: formData.purchasePrice || null,
      expectedLifespanYears: formData.expectedLifespanYears || null,
      depreciationPerYear: formData.depreciationPerYear || null,
      currentValue: formData.currentValue || null,
      supplier: formData.supplier || null,
      supplierContact: formData.supplierContact || null,
      serialNumber: formData.serialNumber || null,
      modelNumber: formData.modelNumber || null,
      warrantyExpiryDate: convertDate(formData.warrantyExpiryDate),
      lastMaintenanceDate: convertDate(formData.lastMaintenanceDate),
      nextMaintenanceDate: convertDate(formData.nextMaintenanceDate),
      maintenanceNotes: formData.maintenanceNotes || null,
      photos: uploadedPhotos.length > 0 ? uploadedPhotos : formData.photos || [],
      documents: formData.documents || [],
    };

    saveMutation.mutate(submitData);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ['/api/asset-inventory'] });
    setRefreshing(false);
  };

  const handleDelete = (asset: AssetInventory) => {
    Alert.alert(
      'Delete Asset',
      'Are you sure you want to delete this asset?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(asset.id),
        },
      ]
    );
  };

  const selectedCategoryLabel = filterCategory === 'all' ? 'All Categories' : filterCategory;
  const selectedConditionLabel = filterCondition === 'all' ? 'All Conditions' : conditionLabels[filterCondition] || filterCondition;
  const selectedLocationLabel = filterLocation === 'all' ? 'All Locations' : (() => {
    const loc = locations.find(l => l.id === filterLocation);
    return loc ? `${loc.type === 'property' ? '🏠' : '🏢'} ${loc.name}` : 'All Locations';
  })();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.contentContainer,
          {
            paddingTop: Math.max(insets.top + spacing[4], spacing[8]),
            paddingBottom: Math.max(insets.bottom + 80, spacing[8]),
          },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Asset Inventory</Text>
            <Text style={styles.subtitle}>Manage physical assets and equipment</Text>
          </View>
          <Button
            title="Add Asset"
            onPress={() => handleOpenDialog()}
            variant="primary"
            size="sm"
            icon={<Plus size={16} color="#ffffff" />}
          />
        </View>

        {/* Filters */}
        <View style={styles.filters}>
          <View style={styles.searchContainer}>
            <Search size={16} color={colors.text.secondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search assets by name, description, or location..."
              placeholderTextColor={colors.text.secondary}
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterChip, filterCategory !== 'all' && styles.filterChipActive]}
              onPress={() => setShowCategoryPicker(true)}
            >
              <Text style={[styles.filterChipText, filterCategory !== 'all' && styles.filterChipTextActive]}>
                Category: {selectedCategoryLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, filterCondition !== 'all' && styles.filterChipActive]}
              onPress={() => setShowConditionPicker(true)}
            >
              <Text style={[styles.filterChipText, filterCondition !== 'all' && styles.filterChipTextActive]}>
                Condition: {selectedConditionLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterChip, filterLocation !== 'all' && styles.filterChipActive]}
              onPress={() => setShowLocationPicker(true)}
            >
              <Text style={[styles.filterChipText, filterLocation !== 'all' && styles.filterChipTextActive]}>
                Location: {selectedLocationLabel}
              </Text>
            </TouchableOpacity>
            {(filterCategory !== 'all' || filterCondition !== 'all' || filterLocation !== 'all') && (
              <TouchableOpacity
                style={styles.filterChip}
                onPress={() => {
                  setFilterCategory('all');
                  setFilterCondition('all');
                  setFilterLocation('all');
                }}
              >
                <X size={14} color={colors.text.secondary} />
                <Text style={styles.filterChipText}>Clear</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* Assets Grid */}
        {filteredAssets.length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <Package size={48} color={colors.text.secondary} />
              <Text style={styles.emptyTitle}>
                {searchTerm || filterCategory !== 'all' || filterCondition !== 'all' || filterLocation !== 'all'
                  ? 'No Assets Found'
                  : 'No Assets Yet'}
              </Text>
              <Text style={styles.emptyMessage}>
                {searchTerm || filterCategory !== 'all' || filterCondition !== 'all' || filterLocation !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Get started by adding your first asset'}
            </Text>
              {!searchTerm && filterCategory === 'all' && filterCondition === 'all' && filterLocation === 'all' && (
                <Button
                  title="Add Your First Asset"
                  onPress={() => handleOpenDialog()}
                  variant="primary"
                  size="md"
                  style={styles.emptyButton}
                />
              )}
            </View>
          </Card>
        ) : (
          <View style={styles.assetsGrid}>
            {filteredAssets.map((asset) => (
              <Card key={asset.id} style={styles.assetCard}>
                <View style={styles.assetHeader}>
                  <View style={styles.assetHeaderContent}>
                    <Text style={styles.assetName} numberOfLines={1}>
                      {asset.name}
                    </Text>
                    <View style={styles.assetBadges}>
                      {asset.category && (
                        <Badge variant="outline" size="sm" style={styles.categoryBadge}>
                          <TagIcon size={12} color={colors.text.secondary} />
                          <Text style={styles.badgeText}>{asset.category}</Text>
                        </Badge>
                      )}
                      <Badge
                        variant={
                          asset.condition === 'excellent'
                            ? 'primary'
                            : asset.condition === 'good'
                            ? 'secondary'
                            : asset.condition === 'fair'
                            ? 'outline'
                            : 'destructive'
                        }
                        size="sm"
                      >
                        {conditionLabels[asset.condition] || asset.condition}
                      </Badge>
                    </View>
                  </View>
                  <View style={styles.assetActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleOpenDialog(asset)}
                    >
                      <Edit2 size={18} color={colors.primary.DEFAULT} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleDelete(asset)}
                    >
                      <Trash2 size={18} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                </View>

                {(() => {
                  // Check if asset has photos
                  if (!asset.photos || asset.photos.length === 0) {
                    return (
                      <View style={styles.assetPhotoContainer}>
                        <View style={styles.photoPlaceholder}>
                          <Package size={48} color={colors.text.muted} />
                          <Text style={styles.photoPlaceholderText}>No Image</Text>
                        </View>
                      </View>
                    );
                  }

                  // Normalize the first photo URL
                  const firstPhoto = normalizePhotoUrl(asset.photos[0]);
                  if (!firstPhoto) {
                    console.log('Asset photo URL is null after normalization:', asset.photos[0]);
                    return (
                      <View style={styles.assetPhotoContainer}>
                        <View style={styles.photoPlaceholder}>
                          <Package size={48} color={colors.text.muted} />
                          <Text style={styles.photoPlaceholderText}>Invalid Image URL</Text>
                        </View>
                      </View>
                    );
                  }

                  // Add cache busting to ensure fresh images
                  const photoUrlWithCache = firstPhoto.includes('?') 
                    ? `${firstPhoto}&_t=${Date.now()}` 
                    : `${firstPhoto}?_t=${Date.now()}`;
                  
                  return (
                    <View style={styles.assetPhotoContainer}>
                      <Image 
                        source={{ uri: photoUrlWithCache }} 
                        style={styles.assetPhoto}
                        resizeMode="cover"
                        onError={(error) => {
                          console.error('Error loading asset image:', photoUrlWithCache, error);
                        }}
                        onLoad={() => {
                          console.log('Asset image loaded successfully:', photoUrlWithCache);
                        }}
                      />
                      {asset.photos.length > 1 && (
                        <View style={styles.photoCountBadge}>
                          <Badge variant="primary" size="sm">
                            +{asset.photos.length - 1}
                          </Badge>
                        </View>
                      )}
                    </View>
                  );
                })()}

                <View style={styles.assetDetails}>
                  {asset.location && (
                    <View style={styles.assetDetailRow}>
                      <MapPin size={14} color={colors.text.secondary} />
                      <Text style={styles.assetDetailText} numberOfLines={1}>
                        {asset.location}
                      </Text>
                    </View>
                  )}

                  {asset.purchasePrice && (
                    <View style={styles.assetDetailRow}>
                      <Text style={styles.assetDetailText}>
                        Purchase: £{parseFloat(asset.purchasePrice.toString()).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  )}

                  {asset.datePurchased && (
                    <View style={styles.assetDetailRow}>
                      <Calendar size={14} color={colors.text.secondary} />
                      <Text style={styles.assetDetailText}>
                        Purchased: {format(new Date(asset.datePurchased), 'MMM d, yyyy')}
                      </Text>
                    </View>
                  )}

                  {asset.lastMaintenanceDate && (
                    <View style={styles.assetDetailRow}>
                      <Wrench size={14} color={colors.text.secondary} />
                      <Text style={styles.assetDetailText}>
                        Last Maintained: {format(new Date(asset.lastMaintenanceDate), 'MMM d, yyyy')}
                      </Text>
                    </View>
                  )}

                  {asset.description && (
                    <View style={styles.assetDetailRow}>
                      <FileText size={14} color={colors.text.secondary} />
                      <Text style={styles.assetDetailText} numberOfLines={2}>
                        {asset.description}
                      </Text>
                    </View>
                  )}

                  {asset.cleanliness && asset.cleanliness in cleanlinessLabels && (
                    <View style={styles.assetDetailRow}>
                      <Text style={styles.cleanlinessLabel}>Cleanliness:</Text>
                      <Badge variant="secondary" size="sm">
                        {cleanlinessLabels[asset.cleanliness as keyof typeof cleanlinessLabels]}
                      </Badge>
                    </View>
                  )}
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add/Edit Asset Modal */}
      <Modal
        visible={isDialogOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseDialog}
      >
        <View style={[styles.modalContainer, { paddingTop: Math.max(insets.top, spacing[4]) }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingAsset ? 'Edit Asset' : 'Add New Asset'}
            </Text>
            <TouchableOpacity onPress={handleCloseDialog} style={styles.modalCloseButton}>
              <X size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalScrollView}
            contentContainerStyle={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}
          >
            {/* Basic Information */}
            <Card style={styles.formCard}>
              <Text style={styles.sectionTitle}>Basic Information</Text>
              <Input
                label="Asset Name *"
                value={formData.name || ''}
                onChangeText={(value) => setFormData({ ...formData, name: value })}
                placeholder="e.g., Refrigerator - Unit 101"
              />
              <View style={styles.pickerRow}>
                <View style={styles.pickerHalf}>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => setShowCategoryPicker(true)}
                  >
                    <Text style={[styles.dropdownText, !formData.category && styles.dropdownTextPlaceholder]}>
                      {formData.category || 'Category'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.pickerHalf}>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => setShowConditionPicker(true)}
                  >
                    <Text style={[styles.dropdownText, !formData.condition && styles.dropdownTextPlaceholder]}>
                      {formData.condition ? conditionLabels[formData.condition] : 'Condition *'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.pickerRow}>
                <View style={styles.pickerHalf}>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => setShowConditionPicker(true)}
                  >
                    <Text style={[styles.dropdownText, !formData.cleanliness && styles.dropdownTextPlaceholder]}>
                      {formData.cleanliness ? cleanlinessLabels[formData.cleanliness] : 'Cleanliness'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Input
                label="Description"
                value={formData.description || ''}
                onChangeText={(value) => setFormData({ ...formData, description: value })}
                placeholder="Detailed description..."
                multiline
                numberOfLines={3}
              />
            </Card>

            {/* Location & Assignment */}
            <Card style={styles.formCard}>
              <Text style={styles.sectionTitle}>Location & Assignment</Text>
              <View style={styles.pickerRow}>
                <View style={styles.pickerHalf}>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => setShowPropertyPicker(true)}
                  >
                    <Text style={[styles.dropdownText, !formData.propertyId && styles.dropdownTextPlaceholder]}>
                      {formData.propertyId
                        ? properties.find(p => p.id === formData.propertyId)?.address || 'Property'
                        : 'Property'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.pickerHalf}>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => setShowBlockPicker(true)}
                  >
                    <Text style={[styles.dropdownText, !formData.blockId && styles.dropdownTextPlaceholder]}>
                      {formData.blockId
                        ? blocks.find(b => b.id === formData.blockId)?.name || 'Block'
                        : 'Block'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Input
                label="Specific Location"
                value={formData.location || ''}
                onChangeText={(value) => setFormData({ ...formData, location: value })}
                placeholder="e.g., Unit 101 - Kitchen"
              />
            </Card>

            {/* Purchase & Financial */}
            <Card style={styles.formCard}>
              <Text style={styles.sectionTitle}>Purchase & Financial Information</Text>
              <View style={styles.pickerRow}>
                <View style={styles.pickerHalf}>
                  <Input
                    label="Date Purchased"
                    value={formData.datePurchased ? format(new Date(formData.datePurchased), 'yyyy-MM-dd') : ''}
                    onChangeText={(value) => setFormData({ ...formData, datePurchased: value ? new Date(value) as any : undefined })}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View style={styles.pickerHalf}>
                  <Input
                    label="Purchase Price (£)"
                    value={formData.purchasePrice?.toString() || ''}
                    onChangeText={(value) => setFormData({ ...formData, purchasePrice: value ? parseFloat(value) : null })}
                    placeholder="0.00"
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <View style={styles.pickerRow}>
                <View style={styles.pickerHalf}>
                  <Input
                    label="Expected Lifespan (years)"
                    value={formData.expectedLifespanYears?.toString() || ''}
                    onChangeText={(value) => setFormData({ ...formData, expectedLifespanYears: value ? parseInt(value) : null })}
                    placeholder="10"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.pickerHalf}>
                  <Input
                    label="Depreciation per Year (£)"
                    value={formData.depreciationPerYear?.toString() || ''}
                    onChangeText={(value) => setFormData({ ...formData, depreciationPerYear: value ? parseFloat(value) : null })}
                    placeholder="0.00"
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </Card>

            {/* Supplier & Product */}
            <Card style={styles.formCard}>
              <Text style={styles.sectionTitle}>Supplier & Product Information</Text>
              <View style={styles.pickerRow}>
                <View style={styles.pickerHalf}>
                  <Input
                    label="Supplier"
                    value={formData.supplier || ''}
                    onChangeText={(value) => setFormData({ ...formData, supplier: value })}
                    placeholder="e.g., Home Depot"
                  />
                </View>
                <View style={styles.pickerHalf}>
                  <Input
                    label="Supplier Contact"
                    value={formData.supplierContact || ''}
                    onChangeText={(value) => setFormData({ ...formData, supplierContact: value })}
                    placeholder="Phone or email"
                  />
                </View>
              </View>
              <View style={styles.pickerRow}>
                <View style={styles.pickerHalf}>
                  <Input
                    label="Serial Number"
                    value={formData.serialNumber || ''}
                    onChangeText={(value) => setFormData({ ...formData, serialNumber: value })}
                    placeholder="SN-123456"
                  />
                </View>
                <View style={styles.pickerHalf}>
                  <Input
                    label="Model Number"
                    value={formData.modelNumber || ''}
                    onChangeText={(value) => setFormData({ ...formData, modelNumber: value })}
                    placeholder="Model-XYZ"
                  />
                </View>
              </View>
              <Input
                label="Warranty Expiry Date"
                value={formData.warrantyExpiryDate ? format(new Date(formData.warrantyExpiryDate), 'yyyy-MM-dd') : ''}
                onChangeText={(value) => setFormData({ ...formData, warrantyExpiryDate: value ? new Date(value) as any : undefined })}
                placeholder="YYYY-MM-DD"
              />
            </Card>

            {/* Maintenance */}
            <Card style={styles.formCard}>
              <Text style={styles.sectionTitle}>Maintenance Information</Text>
              <View style={styles.pickerRow}>
                <View style={styles.pickerHalf}>
                  <Input
                    label="Last Maintenance Date"
                    value={formData.lastMaintenanceDate ? format(new Date(formData.lastMaintenanceDate), 'yyyy-MM-dd') : ''}
                    onChangeText={(value) => setFormData({ ...formData, lastMaintenanceDate: value ? new Date(value) as any : undefined })}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View style={styles.pickerHalf}>
                  <Input
                    label="Next Maintenance Date"
                    value={formData.nextMaintenanceDate ? format(new Date(formData.nextMaintenanceDate), 'yyyy-MM-dd') : ''}
                    onChangeText={(value) => setFormData({ ...formData, nextMaintenanceDate: value ? new Date(value) as any : undefined })}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>
              <Input
                label="Maintenance Notes"
                value={formData.maintenanceNotes || ''}
                onChangeText={(value) => setFormData({ ...formData, maintenanceNotes: value })}
                placeholder="Maintenance history or requirements..."
                multiline
                numberOfLines={3}
              />
            </Card>

            {/* Photos */}
            <Card style={styles.formCard}>
              <Text style={styles.sectionTitle}>Photos</Text>
              {uploadedPhotos.length > 0 && (
                <View style={styles.photosGrid}>
                  {uploadedPhotos.map((url, index) => {
                    const photoUrl = normalizePhotoUrl(url);
                    return (
                      <View key={index} style={styles.photoWrapper}>
                        {photoUrl && (
                          <Image source={{ uri: photoUrl }} style={styles.photoThumbnail} />
                        )}
                        <TouchableOpacity
                          style={styles.removePhotoButton}
                          onPress={() => setUploadedPhotos(prev => prev.filter((_, i) => i !== index))}
                        >
                          <X size={14} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
              <View style={styles.photoActions}>
                <Button
                  title="Pick from Library"
                  onPress={handlePickPhoto}
                  variant="outline"
                  size="sm"
                  style={styles.photoButton}
                />
                <Button
                  title="Take Photo"
                  onPress={handleTakePhoto}
                  variant="outline"
                  size="sm"
                  style={styles.photoButton}
                />
              </View>
            </Card>

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                onPress={handleCloseDialog}
                variant="outline"
                size="md"
                style={styles.modalButton}
              />
              <Button
                title={editingAsset ? 'Update Asset' : 'Create Asset'}
                onPress={handleSubmit}
                variant="primary"
                size="md"
                style={styles.modalButton}
                disabled={saveMutation.isPending}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Filter Pickers */}
      {/* Category Picker */}
      <Modal visible={showCategoryPicker} transparent animationType="fade" onRequestClose={() => setShowCategoryPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Select Category</Text>
            <FlatList
              data={['all', ...assetCategories]}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    setFilterCategory(item === 'all' ? 'all' : item);
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{item === 'all' ? 'All Categories' : item}</Text>
                  {(filterCategory === item || (item === 'all' && filterCategory === 'all')) && (
                    <CheckCircle2 size={20} color={colors.primary.DEFAULT} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Condition Picker */}
      <Modal visible={showConditionPicker} transparent animationType="fade" onRequestClose={() => setShowConditionPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Select Condition</Text>
            <FlatList
              data={['all', ...Object.keys(conditionLabels)]}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    if (item === 'all') {
                      setFilterCondition('all');
                    } else {
                      // For form, set condition; for filter, set filterCondition
                      if (isDialogOpen) {
                        setFormData({ ...formData, condition: item as any });
                      } else {
                        setFilterCondition(item);
                      }
                    }
                    setShowConditionPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>
                    {item === 'all' ? 'All Conditions' : conditionLabels[item]}
                  </Text>
                  {((isDialogOpen && formData.condition === item) || (!isDialogOpen && (filterCondition === item || (item === 'all' && filterCondition === 'all')))) && (
                    <CheckCircle2 size={20} color={colors.primary.DEFAULT} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Location Picker */}
      <Modal visible={showLocationPicker} transparent animationType="fade" onRequestClose={() => setShowLocationPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Select Location</Text>
            <FlatList
              data={[{ id: 'all', name: 'All Locations', type: 'property' as const }, ...locations]}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    setFilterLocation(item.id === 'all' ? 'all' : item.id);
                    setShowLocationPicker(false);
                  }}
                >
                  {item.type === 'property' ? <Home size={16} color={colors.text.secondary} /> : <Building2 size={16} color={colors.text.secondary} />}
                  <Text style={styles.pickerItemText}>{item.name}</Text>
                  {(filterLocation === item.id || (item.id === 'all' && filterLocation === 'all')) && (
                    <CheckCircle2 size={20} color={colors.primary.DEFAULT} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Property Picker (for form) */}
      <Modal visible={showPropertyPicker} transparent animationType="fade" onRequestClose={() => setShowPropertyPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Select Property</Text>
            <FlatList
              data={[{ id: '', name: 'None' }, ...properties]}
              keyExtractor={(item) => item.id || 'none'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    setFormData({ ...formData, propertyId: item.id || null, blockId: item.id ? undefined : formData.blockId });
                    setShowPropertyPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{item.name || item.address || 'None'}</Text>
                  {formData.propertyId === item.id && <CheckCircle2 size={20} color={colors.primary.DEFAULT} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Block Picker (for form) */}
      <Modal visible={showBlockPicker} transparent animationType="fade" onRequestClose={() => setShowBlockPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Select Block</Text>
            <FlatList
              data={[{ id: '', name: 'None' }, ...blocks]}
              keyExtractor={(item) => item.id || 'none'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    setFormData({ ...formData, blockId: item.id || null, propertyId: item.id ? undefined : formData.propertyId });
                    setShowBlockPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{item.name || 'None'}</Text>
                  {formData.blockId === item.id && <CheckCircle2 size={20} color={colors.primary.DEFAULT} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing[4],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[4],
  },
  headerText: {
    flex: 1,
    marginRight: spacing[2],
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing[1],
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  filters: {
    marginBottom: spacing[4],
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    paddingHorizontal: spacing[3],
    marginBottom: spacing[3],
    ...shadows.sm,
  },
  searchIcon: {
    marginRight: spacing[2],
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1.5],
    backgroundColor: '#fff',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border.light,
    gap: spacing[1.5],
    ...shadows.sm,
  },
  filterChipActive: {
    backgroundColor: colors.primary.DEFAULT + '10',
    borderColor: colors.primary.DEFAULT,
  },
  filterChipText: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  filterChipTextActive: {
    color: colors.primary.DEFAULT,
    fontWeight: typography.fontWeight.semibold,
  },
  assetsGrid: {
    flexDirection: 'column',
    gap: spacing[4],
  },
  assetCard: {
    width: '100%',
    ...shadows.md,
  },
  assetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[2],
  },
  assetHeaderContent: {
    flex: 1,
    marginRight: spacing[2],
  },
  assetName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  assetBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  badgeText: {
    fontSize: typography.fontSize.xs,
  },
  assetActions: {
    flexDirection: 'row',
    gap: spacing[1],
  },
  actionButton: {
    padding: spacing[1],
  },
  assetPhotoContainer: {
    position: 'relative',
    width: '100%',
    height: 200, // Increased height for better visibility
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing[3],
    backgroundColor: colors.border.light,
  },
  assetPhoto: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.border.light,
  },
  photoPlaceholderText: {
    marginTop: spacing[2],
    fontSize: typography.fontSize.sm,
    color: colors.text.muted,
    fontFamily: typography.fontFamily.sans,
  },
  photoCountBadge: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[2],
  },
  assetDetails: {
    gap: spacing[2],
  },
  assetDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  assetDetailText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  cleanlinessLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginRight: spacing[1],
  },
  emptyCard: {
    padding: spacing[8],
  },
  emptyContent: {
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginTop: spacing[4],
    marginBottom: spacing[2],
  },
  emptyMessage: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  emptyButton: {
    marginTop: spacing[2],
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  modalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  modalCloseButton: {
    padding: spacing[1],
  },
  modalScrollView: {
    flex: 1,
  },
  modalContent: {
    padding: spacing[4],
  },
  formCard: {
    marginBottom: spacing[4],
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing[4],
  },
  pickerRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  pickerHalf: {
    flex: 1,
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    backgroundColor: '#fff',
    justifyContent: 'center',
    minHeight: 44,
  },
  dropdownText: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  dropdownTextPlaceholder: {
    color: colors.text.secondary,
  },
  photoActions: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  photoButton: {
    flex: 1,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  photoWrapper: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  photoThumbnail: {
    width: '100%',
    height: '100%',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  modalButton: {
    flex: 1,
  },
  // Picker Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    maxHeight: '70%',
    paddingBottom: spacing[4],
  },
  pickerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    padding: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    gap: spacing[2],
  },
  pickerItemText: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
});
