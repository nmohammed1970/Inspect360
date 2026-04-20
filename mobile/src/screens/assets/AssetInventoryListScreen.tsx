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
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp, NavigationProp } from '@react-navigation/native';
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
import type { Property, Block } from '../../types';
import { formatPropertyLocationLabel, formatBlockLocationLabel } from '../../utils/locationLabels';
import { apiRequestJson, getAPI_URL } from '../../services/api';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import DatePicker from '../../components/ui/DatePicker';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { moderateScale, getFontSize } from '../../utils/responsive';
import type { AssetsStackParamList } from '../../navigation/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type RoutePropType = RouteProp<AssetsStackParamList, 'AssetInventoryList'>;

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
  const apiBase = getAPI_URL();

  // Replace localhost URLs with API_URL for mobile compatibility
  // On mobile devices, localhost refers to the device itself, not the server
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    // Extract the path from the localhost URL
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname + urlObj.search;
      return `${apiBase}${path}`;
    } catch {
      // If URL parsing fails, try to extract path manually
      const match = url.match(/(localhost|127\.0\.0\.1)[:\d]*(\/.*)/);
      if (match && match[2]) {
        return `${apiBase}${match[2]}`;
      }
    }
  }

  // If already absolute URL, keep it unless it points to a stale host for object files.
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const sourceUrl = new URL(url);
      const currentApiUrl = new URL(apiBase);

      // Rebase object URLs to current API host/IP to handle LAN IP changes.
      if (sourceUrl.pathname.startsWith('/objects/') && sourceUrl.host !== currentApiUrl.host) {
        return `${currentApiUrl.origin}${sourceUrl.pathname}${sourceUrl.search}`;
      }
    } catch {
      // Fall through and return original URL if parsing fails.
    }
    return url;
  }

  // If relative path starting with /, make it absolute
  if (url.startsWith('/')) {
    return `${apiBase}${url}`;
  }

  // If it's an object path like /objects/xxx, make it absolute
  if (url.startsWith('objects/')) {
    return `${apiBase}/${url}`;
  }

  // Otherwise, assume it's a relative path and prepend API_URL
  return `${apiBase}/${url}`;
};

export default function AssetInventoryListScreen() {
  const route = useRoute<RoutePropType>();
  const navigation = useNavigation<NavigationProp<AssetsStackParamList>>();
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const theme = useTheme();
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get route params
  const routeParams = route.params;
  const propertyIdFromRoute = routeParams?.propertyId;
  const blockIdFromRoute = routeParams?.blockId;
  const autoOpen = routeParams?.autoOpen;

  const [refreshing, setRefreshing] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetInventory | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterCondition, setFilterCondition] = useState<string>('all');
  const [filterPropertyBlock, setFilterPropertyBlock] = useState<string>('all');
  const [filterSpecificLocation, setFilterSpecificLocation] = useState<string>('all');
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<AssetInventory>>({});

  // Fetch assets
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['/api/asset-inventory'],
    queryFn: () => assetsService.getAssetInventory(),
    enabled: !!user,
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

  const propertyBlockOptions = useMemo(() => {
    const locs: Array<{ id: string; name: string; type: 'property' | 'block' }> = [];
    properties?.forEach((p) =>
      locs.push({ id: p.id, name: formatPropertyLocationLabel(p), type: 'property' }),
    );
    blocks?.forEach((b) => locs.push({ id: b.id, name: formatBlockLocationLabel(b), type: 'block' }));
    return locs;
  }, [properties, blocks]);

  const specificLocationOptions = useMemo(() => {
    if (!assets?.length) return [];
    const seen = new Set<string>();
    for (const a of assets) {
      const t = a.location?.trim();
      if (t) seen.add(t);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [assets]);

  // Simple dropdowns: native ActionSheet on iOS, Alert on Android (reliable on both)
  const openCategoryPicker = () => {
    const options = isDialogOpen ? assetCategories : ['All Categories', ...assetCategories];
    if (Platform.OS === 'ios' && ActionSheetIOS?.showActionSheetWithOptions) {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', ...options], cancelButtonIndex: 0 },
        (i) => {
          if (i === 0) return;
          const chosen = options[i - 1];
          if (isDialogOpen) setFormData({ ...formData, category: chosen === 'All Categories' ? undefined : chosen });
          else setFilterCategory(chosen === 'All Categories' ? 'all' : chosen);
        }
      );
    } else {
      Alert.alert('Select Category', '', [
        { text: 'Cancel', style: 'cancel' },
        ...options.map((opt) => ({
          text: opt,
          onPress: () => {
            if (isDialogOpen) setFormData({ ...formData, category: opt === 'All Categories' ? undefined : opt });
            else setFilterCategory(opt === 'All Categories' ? 'all' : opt);
          },
        })),
      ]);
    }
  };

  const openConditionPicker = () => {
    const keys = isDialogOpen ? Object.keys(conditionLabels) : ['all', ...Object.keys(conditionLabels)];
    const labels = isDialogOpen ? Object.keys(conditionLabels).map(k => conditionLabels[k]) : ['All Conditions', ...Object.keys(conditionLabels).map(k => conditionLabels[k])];
    if (Platform.OS === 'ios' && ActionSheetIOS?.showActionSheetWithOptions) {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', ...labels], cancelButtonIndex: 0 },
        (i) => {
          if (i === 0) return;
          const key = keys[i - 1];
          if (isDialogOpen) setFormData({ ...formData, condition: key as any });
          else setFilterCondition(key === 'all' ? 'all' : key);
        }
      );
    } else {
      Alert.alert('Select Condition', '', [
        { text: 'Cancel', style: 'cancel' },
        ...labels.map((_, i) => ({
          text: labels[i],
          onPress: () => {
            const key = keys[i];
            if (isDialogOpen) setFormData({ ...formData, condition: key as any });
            else setFilterCondition(key === 'all' ? 'all' : key);
          },
        })),
      ]);
    }
  };

  const openCleanlinessPicker = () => {
    const keys = Object.keys(cleanlinessLabels);
    const labels = keys.map(k => cleanlinessLabels[k]);
    if (Platform.OS === 'ios' && ActionSheetIOS?.showActionSheetWithOptions) {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', ...labels], cancelButtonIndex: 0 },
        (i) => { if (i > 0) setFormData({ ...formData, cleanliness: keys[i - 1] as any }); }
      );
    } else {
      Alert.alert('Select Cleanliness', '', [
        { text: 'Cancel', style: 'cancel' },
        ...labels.map((_, i) => ({ text: labels[i], onPress: () => setFormData({ ...formData, cleanliness: keys[i] as any }) })),
      ]);
    }
  };

  const openPropertyBlockPicker = () => {
    const items = [{ id: 'all', name: 'All properties & blocks', type: 'property' as const }, ...propertyBlockOptions];
    if (Platform.OS === 'ios' && ActionSheetIOS?.showActionSheetWithOptions) {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', ...items.map((i) => i.name)], cancelButtonIndex: 0 },
        (i) => {
          if (i > 0) setFilterPropertyBlock(items[i - 1].id === 'all' ? 'all' : items[i - 1].id);
        },
      );
    } else {
      Alert.alert('Property or block', '', [
        { text: 'Cancel', style: 'cancel' },
        ...items.map((item) => ({
          text: item.name,
          onPress: () => setFilterPropertyBlock(item.id === 'all' ? 'all' : item.id),
        })),
      ]);
    }
  };

  const openSpecificLocationPicker = () => {
    const items = ['all', ...specificLocationOptions];
    const labels = ['All specific locations', ...specificLocationOptions];
    if (Platform.OS === 'ios' && ActionSheetIOS?.showActionSheetWithOptions) {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', ...labels], cancelButtonIndex: 0 },
        (i) => {
          if (i > 0) setFilterSpecificLocation(items[i - 1]);
        },
      );
    } else {
      Alert.alert('Specific location', 'Room or area saved on the asset', [
        { text: 'Cancel', style: 'cancel' },
        ...items.map((value, idx) => ({
          text: labels[idx],
          onPress: () => setFilterSpecificLocation(value),
        })),
      ]);
    }
  };

  const openPropertyPicker = () => {
    const items = [{ id: '', name: 'None', address: '', status: 'active' } as Property, ...properties];
    const names = items.map((p) => (p.id === '' ? 'None' : formatPropertyLocationLabel(p)));
    if (Platform.OS === 'ios' && ActionSheetIOS?.showActionSheetWithOptions) {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', ...names], cancelButtonIndex: 0 },
        (i) => { if (i > 0) setFormData({ ...formData, propertyId: items[i - 1].id || null, blockId: items[i - 1].id ? undefined : formData.blockId }); }
      );
    } else {
      Alert.alert('Select Property', '', [
        { text: 'Cancel', style: 'cancel' },
        ...items.map((p, i) => ({ text: names[i], onPress: () => setFormData({ ...formData, propertyId: p.id || null, blockId: p.id ? undefined : formData.blockId }) })),
      ]);
    }
  };

  const openBlockPicker = () => {
    const items = [{ id: '', name: 'None', address: '' } as Block, ...blocks];
    const names = items.map((b) => (!b.id ? 'None' : formatBlockLocationLabel(b)));
    if (Platform.OS === 'ios' && ActionSheetIOS?.showActionSheetWithOptions) {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', ...names], cancelButtonIndex: 0 },
        (i) => { if (i > 0) setFormData({ ...formData, blockId: items[i - 1].id || null, propertyId: items[i - 1].id ? undefined : formData.propertyId }); }
      );
    } else {
      Alert.alert('Select Block', '', [
        { text: 'Cancel', style: 'cancel' },
        ...items.map((b, i) => ({ text: names[i], onPress: () => setFormData({ ...formData, blockId: b.id || null, propertyId: b.id ? undefined : formData.propertyId }) })),
      ]);
    }
  };

  // Auto-filter by block or property if in route params (only if explicitly provided)
  useEffect(() => {
    if (blockIdFromRoute) {
      setFilterPropertyBlock(blockIdFromRoute);
    } else if (propertyIdFromRoute) {
      setFilterPropertyBlock(propertyIdFromRoute);
    }
  }, [blockIdFromRoute, propertyIdFromRoute]);

  // Auto-open dialog and pre-populate form when navigated from inspection
  useEffect(() => {
    if (autoOpen) {
      // Wait for properties/blocks to load before setting form data
      if ((propertyIdFromRoute && properties.length > 0) || (blockIdFromRoute && blocks.length > 0) || (!propertyIdFromRoute && !blockIdFromRoute)) {
        const initialFormData: Partial<AssetInventory> = {};
        if (propertyIdFromRoute) {
          initialFormData.propertyId = propertyIdFromRoute;
        } else if (blockIdFromRoute) {
          initialFormData.blockId = blockIdFromRoute;
        }
        setFormData(initialFormData);
        setIsDialogOpen(true);

        // Clear route params after opening to prevent re-opening on re-render
        if (navigation) {
          (navigation as any).setParams({ autoOpen: false });
        }
      }
    }
  }, [autoOpen, propertyIdFromRoute, blockIdFromRoute, navigation, properties, blocks]);

  // Filter assets (search includes linked property/block name and address)
  const filteredAssets = useMemo(() => {
    if (!assets || assets.length === 0) return [];

    const q = searchTerm.trim().toLowerCase();

    return assets.filter((asset) => {
      const matchesSearch =
        q === '' ||
        (() => {
          if (asset.name?.toLowerCase().includes(q)) return true;
          if (asset.description?.toLowerCase().includes(q)) return true;
          if (asset.location?.toLowerCase().includes(q)) return true;
          if (asset.propertyId && properties.length) {
            const p = properties.find((x) => x.id === asset.propertyId);
            if (p) {
              if (p.name?.toLowerCase().includes(q)) return true;
              if (p.address?.toLowerCase().includes(q)) return true;
              if (formatPropertyLocationLabel(p).toLowerCase().includes(q)) return true;
            }
          }
          if (asset.blockId && blocks.length) {
            const b = blocks.find((x) => x.id === asset.blockId);
            if (b) {
              if (b.name?.toLowerCase().includes(q)) return true;
              if (b.address?.toLowerCase().includes(q)) return true;
              if (formatBlockLocationLabel(b).toLowerCase().includes(q)) return true;
            }
          }
          return false;
        })();

      const matchesCategory = filterCategory === 'all' || asset.category === filterCategory;
      const matchesCondition = filterCondition === 'all' || asset.condition === filterCondition;
      const matchesPropertyBlock =
        filterPropertyBlock === 'all' ||
        asset.propertyId === filterPropertyBlock ||
        asset.blockId === filterPropertyBlock;
      const matchesSpecificLocation =
        filterSpecificLocation === 'all' ||
        (asset.location?.trim() ?? '') === filterSpecificLocation;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesCondition &&
        matchesPropertyBlock &&
        matchesSpecificLocation
      );
    });
  }, [
    assets,
    searchTerm,
    filterCategory,
    filterCondition,
    filterPropertyBlock,
    filterSpecificLocation,
    properties,
    blocks,
  ]);

  // Photo upload function
  const uploadPhoto = async (uri: string): Promise<string> => {
    try {
      const response = await fetch(`${getAPI_URL()}/api/objects/upload`, {
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

      const absoluteUrl = objectPath.startsWith('http') ? objectPath : `${getAPI_URL()}${objectPath}`;

      await fetch(`${getAPI_URL()}/api/objects/set-acl`, {
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
    // Clear form data but preserve route params for property/block if they exist
    const preservedFormData: Partial<AssetInventory> = {};
    if (propertyIdFromRoute) {
      preservedFormData.propertyId = propertyIdFromRoute;
    } else if (blockIdFromRoute) {
      preservedFormData.blockId = blockIdFromRoute;
    }
    setFormData(preservedFormData);
    setUploadedPhotos([]);
  };

  const handleOpenDialog = (asset?: AssetInventory) => {
    if (asset) {
      setEditingAsset(asset);
      setFormData(asset);
      setUploadedPhotos(asset.photos || []);
    } else {
      // Pre-populate property or block based on route params if available
      const initialFormData: Partial<AssetInventory> = {};
      if (propertyIdFromRoute) {
        initialFormData.propertyId = propertyIdFromRoute;
      } else if (blockIdFromRoute) {
        initialFormData.blockId = blockIdFromRoute;
      }
      setFormData(initialFormData);
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

    // Helper to convert numeric values to strings (schema expects strings for numeric fields)
    const convertNumericToString = (value: string | number | null | undefined): string | null => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      // If it's already a string, return it
      if (typeof value === 'string') {
        return value;
      }
      // If it's a number, convert to string
      if (typeof value === 'number') {
        return String(value);
      }
      return null;
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
      purchasePrice: convertNumericToString(formData.purchasePrice),
      expectedLifespanYears: formData.expectedLifespanYears || null,
      depreciationPerYear: convertNumericToString(formData.depreciationPerYear),
      currentValue: convertNumericToString(formData.currentValue),
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

  const selectedCategoryLabel = filterCategory === 'all' ? 'All' : filterCategory;
  const selectedConditionLabel = filterCondition === 'all' ? 'All' : conditionLabels[filterCondition] || filterCondition;
  const selectedPropertyBlockLabel =
    filterPropertyBlock === 'all'
      ? 'All'
      : (() => {
          const loc = propertyBlockOptions.find((l) => l.id === filterPropertyBlock);
          return loc ? `${loc.type === 'property' ? '🏠' : '🏢'} ${loc.name}` : 'All';
        })();
  const selectedSpecificLocationLabel =
    filterSpecificLocation === 'all' ? 'All' : filterSpecificLocation;

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Fixed Header */}
      <View style={[styles.fixedHeader, {
        paddingTop: insets.top + spacing[2],
        backgroundColor: themeColors.card.DEFAULT,
      }]}>
        <View style={[styles.header, { backgroundColor: themeColors.card.DEFAULT }]}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: themeColors.text.primary }]}>Asset Inventory</Text>
            <Text style={[styles.subtitle, { color: themeColors.text.secondary }]}>Manage physical assets and equipment</Text>
          </View>
          <Button
            title="Add Asset"
            onPress={() => handleOpenDialog()}
            variant="primary"
            size="sm"
            icon={<Plus size={16} color="#ffffff" />}
          />
        </View>

        {/* Fixed Search Bar */}
        <View style={[
          styles.searchContainer,
          {
            borderColor: themeColors.border.DEFAULT,
            backgroundColor: themeColors.background,
          }
        ]}>
          <Search size={16} color={themeColors.text.secondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text.primary }]}
            placeholder="Search by asset, description, location, property, or block..."
            placeholderTextColor={themeColors.text.secondary}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.contentContainer,
          {
            paddingBottom: Math.max(insets.bottom + 80, spacing[8]),
          },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Filters */}
        <View style={styles.filters}>
          <Text style={[styles.filterLabel, { color: themeColors.text.primary }]}>Filter by:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  borderColor: themeColors.border.DEFAULT,
                  backgroundColor: filterCategory !== 'all' ? themeColors.primary.light : themeColors.background,
                },
                filterCategory !== 'all' && { borderColor: themeColors.primary.DEFAULT }
              ]}
              onPress={openCategoryPicker}
            >
              <Text style={[
                styles.filterChipText,
                { color: filterCategory !== 'all' ? themeColors.primary.DEFAULT : themeColors.text.secondary }
              ]}>
                Category: {selectedCategoryLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  borderColor: themeColors.border.DEFAULT,
                  backgroundColor: filterCondition !== 'all' ? themeColors.primary.light : themeColors.background,
                },
                filterCondition !== 'all' && { borderColor: themeColors.primary.DEFAULT }
              ]}
              onPress={openConditionPicker}
            >
              <Text style={[
                styles.filterChipText,
                { color: filterCondition !== 'all' ? themeColors.primary.DEFAULT : themeColors.text.secondary }
              ]}>
                Condition: {selectedConditionLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  borderColor: themeColors.border.DEFAULT,
                  backgroundColor: filterPropertyBlock !== 'all' ? themeColors.primary.light : themeColors.background,
                },
                filterPropertyBlock !== 'all' && { borderColor: themeColors.primary.DEFAULT },
              ]}
              onPress={openPropertyBlockPicker}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: filterPropertyBlock !== 'all' ? themeColors.primary.DEFAULT : themeColors.text.secondary },
                ]}
                numberOfLines={1}
              >
                Property/Block: {selectedPropertyBlockLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  borderColor: themeColors.border.DEFAULT,
                  backgroundColor: filterSpecificLocation !== 'all' ? themeColors.primary.light : themeColors.background,
                },
                filterSpecificLocation !== 'all' && { borderColor: themeColors.primary.DEFAULT },
              ]}
              onPress={openSpecificLocationPicker}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: filterSpecificLocation !== 'all' ? themeColors.primary.DEFAULT : themeColors.text.secondary },
                ]}
                numberOfLines={1}
              >
                Place: {selectedSpecificLocationLabel}
              </Text>
            </TouchableOpacity>
            {(filterCategory !== 'all' || filterCondition !== 'all' || filterPropertyBlock !== 'all' || filterSpecificLocation !== 'all') && (
              <TouchableOpacity
                style={[styles.filterChip, {
                  backgroundColor: themeColors.card.DEFAULT,
                  borderColor: themeColors.border.light,
                }]}
                onPress={() => {
                  setFilterCategory('all');
                  setFilterCondition('all');
                  setFilterPropertyBlock('all');
                  setFilterSpecificLocation('all');
                }}
              >
                <X size={14} color={themeColors.text.secondary} />
                <Text style={[styles.filterChipText, { color: themeColors.text.secondary }]}>Clear</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* Assets Grid */}
        {filteredAssets.length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <Package size={48} color={themeColors.text.secondary} />
              <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>
                {searchTerm || filterCategory !== 'all' || filterCondition !== 'all' || filterPropertyBlock !== 'all' || filterSpecificLocation !== 'all'
                  ? 'No Assets Found'
                  : 'No Assets Yet'}
              </Text>
              <Text style={[styles.emptyMessage, { color: themeColors.text.secondary }]}>
                {searchTerm || filterCategory !== 'all' || filterCondition !== 'all' || filterPropertyBlock !== 'all' || filterSpecificLocation !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Get started by adding your first asset'}
              </Text>
              {!searchTerm && filterCategory === 'all' && filterCondition === 'all' && filterPropertyBlock === 'all' && filterSpecificLocation === 'all' && (
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
                    <Text style={[styles.assetName, { color: themeColors.text.primary }]} numberOfLines={1}>
                      {asset.name}
                    </Text>
                    <View style={styles.assetBadges}>
                      {asset.category && (
                        <Badge variant="outline" size="sm" style={styles.categoryBadge}>
                          <TagIcon size={12} color={themeColors.text.secondary} />
                          <Text style={[styles.badgeText, { color: themeColors.text.secondary }]}>{asset.category}</Text>
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
                      <Edit2 size={18} color={themeColors.primary.DEFAULT} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleDelete(asset)}
                    >
                      <Trash2 size={18} color={themeColors.destructive.DEFAULT} />
                    </TouchableOpacity>
                  </View>
                </View>

                {(() => {
                  // Check if asset has photos
                  if (!asset.photos || asset.photos.length === 0) {
                    return (
                      <View style={styles.assetPhotoContainer}>
                        <View style={styles.photoPlaceholder}>
                          <Package size={48} color={themeColors.text.muted} />
                          <Text style={[styles.photoPlaceholderText, { color: themeColors.text.muted }]}>No Image</Text>
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
                          <Package size={48} color={themeColors.text.muted} />
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
                          // Removed successful image load logging to reduce console noise
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
                  {(asset.propertyId || asset.blockId) && (
                    <View style={styles.assetDetailRow}>
                      {asset.propertyId ? (
                        <Home size={14} color={themeColors.text.secondary} />
                      ) : (
                        <Building2 size={14} color={themeColors.text.secondary} />
                      )}
                      <Text style={[styles.assetDetailText, { color: themeColors.text.secondary }]} numberOfLines={2}>
                        {asset.propertyId
                          ? (() => {
                              const p = properties.find((x) => x.id === asset.propertyId);
                              return p ? formatPropertyLocationLabel(p) : 'Property';
                            })()
                          : (() => {
                              const b = blocks.find((x) => x.id === asset.blockId);
                              return b ? formatBlockLocationLabel(b) : 'Block';
                            })()}
                      </Text>
                    </View>
                  )}

                  {asset.location && (
                    <View style={styles.assetDetailRow}>
                      <MapPin size={14} color={themeColors.text.secondary} />
                      <Text style={[styles.assetDetailText, { color: themeColors.text.secondary }]} numberOfLines={1}>
                        {asset.location}
                      </Text>
                    </View>
                  )}

                  {asset.purchasePrice && (
                    <View style={styles.assetDetailRow}>
                      <Text style={[styles.assetDetailText, { color: themeColors.text.secondary }]}>
                        Purchase: £{parseFloat(asset.purchasePrice.toString()).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  )}

                  {asset.datePurchased && (() => {
                    try {
                      const date = asset.datePurchased instanceof Date
                        ? asset.datePurchased
                        : new Date(asset.datePurchased);
                      if (!isNaN(date.getTime())) {
                        return (
                          <View style={styles.assetDetailRow}>
                            <Calendar size={14} color={themeColors.text.secondary} />
                            <Text style={[styles.assetDetailText, { color: themeColors.text.secondary }]}>
                              Purchased: {format(date, 'MMM d, yyyy')}
                            </Text>
                          </View>
                        );
                      }
                    } catch (e) {
                      // Invalid date, skip rendering
                    }
                    return null;
                  })()}

                  {asset.lastMaintenanceDate && (() => {
                    try {
                      const date = asset.lastMaintenanceDate instanceof Date
                        ? asset.lastMaintenanceDate
                        : new Date(asset.lastMaintenanceDate);
                      if (!isNaN(date.getTime())) {
                        return (
                          <View style={styles.assetDetailRow}>
                            <Wrench size={14} color={themeColors.text.secondary} />
                            <Text style={[styles.assetDetailText, { color: themeColors.text.secondary }]}>
                              Last Maintained: {format(date, 'MMM d, yyyy')}
                            </Text>
                          </View>
                        );
                      }
                    } catch (e) {
                      // Invalid date, skip rendering
                    }
                    return null;
                  })()}

                  {asset.description && (
                    <View style={styles.assetDetailRow}>
                      <FileText size={14} color={themeColors.text.secondary} />
                      <Text style={[styles.assetDetailText, { color: themeColors.text.secondary }]} numberOfLines={2}>
                        {asset.description}
                      </Text>
                    </View>
                  )}

                  {asset.cleanliness && asset.cleanliness in cleanlinessLabels && (
                    <View style={styles.assetDetailRow}>
                      <Text style={[styles.cleanlinessLabel, { color: themeColors.text.secondary }]}>Cleanliness:</Text>
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
        <View style={[styles.modalContainer, { paddingTop: Math.max(insets.top, spacing[4]), backgroundColor: themeColors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>
              {editingAsset ? 'Edit Asset' : 'Add New Asset'}
            </Text>
            <TouchableOpacity onPress={handleCloseDialog} style={styles.modalCloseButton}>
              <X size={24} color={themeColors.text.primary} />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
          >
            <ScrollView
              style={styles.modalScrollView}
              contentContainerStyle={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {/* Basic Information */}
              <Card style={styles.formCard}>
                <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Basic Information</Text>
                <Input
                  label="Asset Name *"
                  value={formData.name || ''}
                  onChangeText={(value) => setFormData({ ...formData, name: value })}
                  placeholder="e.g., Refrigerator - Unit 101"
                />
                <View style={styles.pickerRow}>
                  <View style={styles.pickerHalf}>
                    <TouchableOpacity
                      style={[
                        styles.dropdownButton,
                        {
                          borderColor: themeColors.border.DEFAULT,
                          backgroundColor: themeColors.input,
                        }
                      ]}
                      onPress={openCategoryPicker}
                    >
                      <Text style={[
                        styles.dropdownText,
                        { color: formData.category ? themeColors.text.primary : themeColors.text.muted }
                      ]}>
                        {formData.category || 'Category'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.pickerHalf}>
                    <TouchableOpacity
                      style={[
                        styles.dropdownButton,
                        {
                          borderColor: themeColors.border.DEFAULT,
                          backgroundColor: themeColors.input,
                        }
                      ]}
                      onPress={openConditionPicker}
                    >
                      <Text style={[
                        styles.dropdownText,
                        { color: formData.condition ? themeColors.text.primary : themeColors.text.muted }
                      ]}>
                        {formData.condition ? conditionLabels[formData.condition] : 'Condition *'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.pickerRow}>
                  <View style={styles.pickerHalf}>
                    <TouchableOpacity
                      style={[
                        styles.dropdownButton,
                        {
                          borderColor: themeColors.border.DEFAULT,
                          backgroundColor: themeColors.input,
                        }
                      ]}
                      onPress={openCleanlinessPicker}
                    >
                      <Text style={[
                        styles.dropdownText,
                        { color: formData.cleanliness ? themeColors.text.primary : themeColors.text.muted }
                      ]}>
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
                <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Location & Assignment</Text>
                <View style={styles.pickerRow}>
                  <View style={styles.pickerHalf}>
                    <TouchableOpacity
                      style={[
                        styles.dropdownButton,
                        {
                          borderColor: themeColors.border.DEFAULT,
                          backgroundColor: themeColors.input,
                        }
                      ]}
                      onPress={openPropertyPicker}
                    >
                      <Text style={[
                        styles.dropdownText,
                        { color: formData.propertyId ? themeColors.text.primary : themeColors.text.muted }
                      ]}>
                        {formData.propertyId
                          ? (() => {
                              const p = properties.find((x) => x.id === formData.propertyId);
                              return p ? formatPropertyLocationLabel(p) : 'Property';
                            })()
                          : 'Property'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.pickerHalf}>
                    <TouchableOpacity
                      style={[
                        styles.dropdownButton,
                        {
                          borderColor: themeColors.border.DEFAULT,
                          backgroundColor: themeColors.input,
                        }
                      ]}
                      onPress={openBlockPicker}
                    >
                      <Text style={[
                        styles.dropdownText,
                        { color: formData.blockId ? themeColors.text.primary : themeColors.text.muted }
                      ]}>
                        {formData.blockId
                          ? (() => {
                              const b = blocks.find((x) => x.id === formData.blockId);
                              return b ? formatBlockLocationLabel(b) : 'Block';
                            })()
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
                <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Purchase & Financial Information</Text>
                <View style={styles.pickerRow}>
                  <View style={styles.pickerHalf}>
                    <DatePicker
                      label="Date Purchased"
                      value={formData.datePurchased}
                      onChange={(date) => setFormData({ ...formData, datePurchased: date as any })}
                      placeholder="Select date"
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
                <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Supplier & Product Information</Text>
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
                <DatePicker
                  label="Warranty Expiry Date"
                  value={formData.warrantyExpiryDate}
                  onChange={(date) => setFormData({ ...formData, warrantyExpiryDate: date as any })}
                  placeholder="Select date"
                />
              </Card>

              {/* Maintenance */}
              <Card style={styles.formCard}>
                <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Maintenance Information</Text>
                <View style={styles.pickerRow}>
                  <View style={styles.pickerHalf}>
                    <DatePicker
                      label="Last Maintenance Date"
                      value={formData.lastMaintenanceDate}
                      onChange={(date) => setFormData({ ...formData, lastMaintenanceDate: date as any })}
                      placeholder="Select date"
                    />
                  </View>
                  <View style={styles.pickerHalf}>
                    <DatePicker
                      label="Next Maintenance Date"
                      value={formData.nextMaintenanceDate}
                      onChange={(date) => setFormData({ ...formData, nextMaintenanceDate: date as any })}
                      placeholder="Select date"
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
                <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>Photos</Text>
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
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fixedHeader: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    zIndex: 10,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing[4],
    paddingTop: spacing[3],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
  },
  headerText: {
    flex: 1,
    marginRight: spacing[2],
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing[1],
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
  },
  filters: {
    marginBottom: spacing[4],
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    minHeight: 44,
  },
  searchIcon: {
    marginRight: spacing[2],
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSize.base,
  },
  filterLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  filterChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: spacing[2],
  },
  filterChipActive: {
    // Colors set dynamically
  },
  filterChipText: {
    fontSize: typography.fontSize.sm,
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
  },
  photoPlaceholderText: {
    marginTop: spacing[2],
    fontSize: typography.fontSize.sm,
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
  },
  cleanlinessLabel: {
    fontSize: typography.fontSize.xs,
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
    marginTop: spacing[4],
    marginBottom: spacing[2],
  },
  emptyMessage: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  emptyButton: {
    marginTop: spacing[2],
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
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
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    justifyContent: 'center',
    minHeight: 44,
  },
  dropdownText: {
    fontSize: typography.fontSize.base,
  },
  dropdownTextPlaceholder: {
    // Color set dynamically
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
  pickerOverlayTouchable: {
    flex: 1,
  },
  pickerModal: {
    // backgroundColor applied dynamically via themeColors
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    maxHeight: '70%',
    paddingBottom: spacing[4],
  },
  pickerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    padding: spacing[4],
    borderBottomWidth: 1,
    // color and borderBottomColor applied dynamically via themeColors
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderBottomWidth: 1,
    gap: spacing[2],
    // borderBottomColor applied dynamically via themeColors
  },
  pickerItemText: {
    flex: 1,
    fontSize: typography.fontSize.base,
    // color applied dynamically via themeColors
  },
});
