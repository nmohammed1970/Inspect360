import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  FlatList,
  Linking,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Upload, Plus, X, FileText, Trash2, User as UserIcon, Mail, Shield, LogOut, Fingerprint } from 'lucide-react-native';
import { profileService, type UpdateProfileData, type UserDocument } from '../../services/profile';
import { apiRequestJson, getAPI_URL } from '../../services/api';
import { biometricService } from '../../services/biometric';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Moon, Sun, Monitor } from 'lucide-react-native';

const DOCUMENT_TYPES = [
  { value: 'license', label: 'License' },
  { value: 'certification', label: 'Certification' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other', label: 'Other' },
];

export default function ProfileScreen() {
  const { user, logout, storeBiometricCredentials, clearBiometricCredentials, getStoredEmail } = useAuth();
  const isOnline = useOnlineStatus();
  const theme = useTheme();
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  const { themeMode, setThemeMode, isDark } = theme;
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const queryClient = useQueryClient();
  
  // Biometric state
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('');
  const [biometricStatus, setBiometricStatus] = useState<string>('Checking...');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState('');
  const [newQualification, setNewQualification] = useState('');
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [documentName, setDocumentName] = useState('');
  const [documentType, setDocumentType] = useState('other');
  const [pendingDocFileUrl, setPendingDocFileUrl] = useState<string | null>(null);
  const [pendingDocFileExtension, setPendingDocFileExtension] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [biometricPassword, setBiometricPassword] = useState('');

  // Fetch current user profile
  const { data: profile, isLoading } = useQuery({
    queryKey: ['/api/auth/profile'],
    queryFn: async () => {
      const response = await apiRequestJson<any>('GET', '/api/auth/profile');
      return response;
    },
  });

  // Check biometric availability and status
  useEffect(() => {
    const checkBiometric = async () => {
      const available = await biometricService.isBiometricAvailable();
      const enrolled = await biometricService.isBiometricEnrolled();
      setIsBiometricAvailable(available && enrolled);
      
      if (available && enrolled) {
        const type = await biometricService.getBiometricTypeName();
        setBiometricType(type);
        setBiometricStatus(`Available (${type})`);
      } else if (available && !enrolled) {
        setBiometricStatus('Not enrolled - Please set up biometric authentication in device settings');
      } else {
        setBiometricStatus('Not available on this device');
      }
    };
    checkBiometric();
  }, []);

  // Update biometric enabled state from profile
  useEffect(() => {
    if (profile) {
      setBiometricEnabled(profile.biometricEnabled || false);
    }
  }, [profile]);

  // Fetch user documents
  const { data: documents = [], isLoading: documentsLoading } = useQuery<UserDocument[]>({
    queryKey: ['/api/user-documents'],
    queryFn: () => profileService.getUserDocuments(),
  });

  // Initialize form data from profile or user (auth context) - prefer profile, fall back to user
  const initializedRef = React.useRef<string | null>(null);

  useEffect(() => {
    // Prefer profile data (more complete), fall back to user from auth context
    const dataSource = profile || user;

    if (dataSource) {
      // Initialize fields only once when data first becomes available
      // Use a unique identifier to avoid re-initializing (profile ID or user ID)
      const dataId = profile?.id || user?.id || 'default';

      // Only initialize if we haven't initialized with this data yet
      if (initializedRef.current !== dataId) {
        setFirstName(dataSource.firstName || '');
        setLastName(dataSource.lastName || '');
        setPhone(dataSource.phone || '');
        setProfileImageUrl(dataSource.profileImageUrl || null);

        // Skills and qualifications - only from profile (not in user object)
        if (profile) {
          setSkills(profile.skills || []);
          setQualifications(profile.qualifications || []);
        }

        initializedRef.current = dataId;
      } else if (profile && initializedRef.current === user?.id) {
        // If we initialized from user but now have profile, update once
        // This ensures we get the most complete data
        setFirstName(profile.firstName || '');
        setLastName(profile.lastName || '');
        setPhone(profile.phone || '');
        setProfileImageUrl(profile.profileImageUrl || null);
        setSkills(profile.skills || []);
        setQualifications(profile.qualifications || []);
        initializedRef.current = profile.id || 'default';
      }
    }
  }, [profile, user]);

  // Update profile mutation
  const updateMutation = useMutation({
    mutationFn: async (data: UpdateProfileData) => {
      return profileService.updateProfile(data);
    },
    onSuccess: async () => {
      // Invalidate all profile-related queries to refresh everywhere
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/profile'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      await queryClient.refetchQueries({ queryKey: ['/api/auth/profile'] });
      await queryClient.refetchQueries({ queryKey: ['/api/auth/user'] });
      // Also invalidate any user-related queries that might be cached
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey.some(key => typeof key === 'string' && (key.includes('/api/auth') || key.includes('profile') || key.includes('user')))
      });
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to update profile');
    },
  });

  // Upload document mutation
  const createDocumentMutation = useMutation({
    mutationFn: async (data: {
      documentName: string;
      documentType: string;
      fileUrl: string;
      expiryDate?: string;
    }) => {
      return profileService.uploadDocument(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user-documents'] });
      setShowDocumentForm(false);
      setPendingDocFileUrl(null);
      setDocumentName('');
      setDocumentType('other');
      setPendingDocFileExtension(null);
      Alert.alert('Success', 'Document uploaded successfully');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to upload document');
    },
  });

  // Delete document mutation
  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: string) => {
      await profileService.deleteDocument(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user-documents'] });
      Alert.alert('Success', 'Document deleted successfully');
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to delete document');
    },
  });

  const handleSaveProfile = () => {
    const data: UpdateProfileData = {};

    // Only include firstName if it has a non-empty value (schema requires min(1))
    const trimmedFirstName = firstName.trim();
    if (trimmedFirstName && trimmedFirstName.length > 0) {
      data.firstName = trimmedFirstName;
    }

    // Only include lastName if it has a non-empty value (schema requires min(1))
    const trimmedLastName = lastName.trim();
    if (trimmedLastName && trimmedLastName.length > 0) {
      data.lastName = trimmedLastName;
    }

    // Phone is optional
    const trimmedPhone = phone.trim();
    if (trimmedPhone && trimmedPhone.length > 0) {
      data.phone = trimmedPhone;
    }

    // Profile image URL
    if (profileImageUrl) {
      data.profileImageUrl = profileImageUrl;
    }

    // Only include arrays if they have items
    if (skills.length > 0) {
      data.skills = skills;
    }
    if (qualifications.length > 0) {
      data.qualifications = qualifications;
    }

    // Ensure we have at least one field to update
    if (Object.keys(data).length === 0) {
      Alert.alert('No Changes', 'Please make some changes before saving');
      return;
    }

    updateMutation.mutate(data);
  };

  const handleAddSkill = () => {
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      setSkills([...skills, newSkill.trim()]);
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const handleAddQualification = () => {
    if (newQualification.trim() && !qualifications.includes(newQualification.trim())) {
      setQualifications([...qualifications, newQualification.trim()]);
      setNewQualification('');
    }
  };

  const handleRemoveQualification = (qualToRemove: string) => {
    setQualifications(qualifications.filter((q) => q !== qualToRemove));
  };

  const handleUploadPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera roll permissions to upload photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as any,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImageFile(result.assets[0].uri);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to pick image');
    }
  };

  const uploadImageFile = async (uri: string) => {
    try {
      // Get upload URL
      const uploadUrlResponse = await fetch(`${getAPI_URL()}/api/objects/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!uploadUrlResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadURL } = await uploadUrlResponse.json();

      // Convert image to blob
      const response = await fetch(uri);
      const blob = await response.blob();

      // Upload to S3
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': 'image/jpeg',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image');
      }

      // Extract file URL from upload URL
      // The uploadURL format is: /api/objects/upload-direct?objectId=xxx or full URL
      // We need to extract the objectId and construct: /objects/xxx
      let fileUrl: string;

      // Use manual regex extraction (works in React Native)
      const objectIdMatch = uploadURL.match(/[?&]objectId=([^&]+)/);
      if (objectIdMatch && objectIdMatch[1]) {
        fileUrl = `/objects/${objectIdMatch[1]}`;
      } else {
        // Fallback: try to extract from path if objectId not in query
        const pathMatch = uploadURL.match(/\/objects\/([^?&\/]+)/);
        if (pathMatch && pathMatch[1]) {
          fileUrl = `/objects/${pathMatch[1]}`;
        } else {
          console.error('Error extracting file URL from upload URL:', uploadURL);
          throw new Error('Failed to extract file URL from upload response');
        }
      }

      // Update state with the properly formatted URL
      setProfileImageUrl(fileUrl);

      // Auto-save the profile with the new image URL to reflect changes immediately
      // Build data according to schema: only include non-empty fields
      const updateData: UpdateProfileData = {
        profileImageUrl: fileUrl,
      };

      // Only add firstName if it has a non-empty value (schema requires min(1))
      const trimmedFirstName = firstName.trim();
      if (trimmedFirstName && trimmedFirstName.length > 0) {
        updateData.firstName = trimmedFirstName;
      }

      // Only add lastName if it has a non-empty value (schema requires min(1))
      const trimmedLastName = lastName.trim();
      if (trimmedLastName && trimmedLastName.length > 0) {
        updateData.lastName = trimmedLastName;
      }

      // Phone is optional and can be empty
      const trimmedPhone = phone.trim();
      if (trimmedPhone && trimmedPhone.length > 0) {
        updateData.phone = trimmedPhone;
      }

      // Only include arrays if they have items
      if (skills.length > 0) {
        updateData.skills = skills;
      }
      if (qualifications.length > 0) {
        updateData.qualifications = qualifications;
      }

      updateMutation.mutate(updateData, {
        onSuccess: () => {
          Alert.alert('Success', 'Profile photo updated successfully');
        },
        onError: (error: any) => {
          console.error('Profile update error:', error);
          // Don't clear the image URL on error - let user try saving manually
          Alert.alert('Upload Complete', 'Photo uploaded successfully. Please click "Save Changes" to update your profile if it didn\'t save automatically.');
        },
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to upload photo');
    }
  };

  const handleUploadDocument = async () => {
    try {
      // Use document picker for PDF, DOC, DOCX, etc.
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        return;
      }

      if (result.assets && result.assets[0]) {
        const asset = result.assets[0];
        // Extract file extension from the original filename
        let fileExtension = null;
        if (asset.name) {
          const nameParts = asset.name.split('.');
          if (nameParts.length > 1) {
            fileExtension = nameParts[nameParts.length - 1].toLowerCase();
          }
        }
        // If no extension from name, try to determine from MIME type
        if (!fileExtension && asset.mimeType) {
          if (asset.mimeType.includes('pdf')) fileExtension = 'pdf';
          else if (asset.mimeType.includes('msword')) fileExtension = 'doc';
          else if (asset.mimeType.includes('vnd.openxmlformats-officedocument.wordprocessingml')) fileExtension = 'docx';
          else if (asset.mimeType.includes('text')) fileExtension = 'txt';
        }

        setPendingDocFileExtension(fileExtension);
        await uploadDocumentFile(asset.uri, asset.mimeType || 'application/octet-stream');
      }
    } catch (error: any) {
      // Check if user canceled - DocumentPicker throws a specific error type
      if (error?.code === 'DOCUMENT_PICKER_CANCELED' || error?.message?.includes('cancel')) {
        // User canceled, do nothing
        return;
      }
      Alert.alert('Error', error.message || 'Failed to pick document');
    }
  };

  const uploadDocumentFile = async (uri: string, mimeType: string = 'application/octet-stream') => {
    try {
      // Get upload URL
      const uploadUrlResponse = await fetch(`${getAPI_URL()}/api/objects/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!uploadUrlResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadURL } = await uploadUrlResponse.json();

      // Convert file to blob
      const response = await fetch(uri);
      const blob = await response.blob();

      // Upload to S3
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': mimeType,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload document');
      }

      // Extract file URL from upload URL
      // The uploadURL format is: /api/objects/upload-direct?objectId=xxx or full URL
      // We need to extract the objectId and construct: /objects/xxx
      let fileUrl: string;

      // Use manual regex extraction (works in React Native)
      const objectIdMatch = uploadURL.match(/[?&]objectId=([^&]+)/);
      if (objectIdMatch && objectIdMatch[1]) {
        fileUrl = `/objects/${objectIdMatch[1]}`;
      } else {
        // Fallback: try to extract from path if objectId not in query
        const pathMatch = uploadURL.match(/\/objects\/([^?&\/]+)/);
        if (pathMatch && pathMatch[1]) {
          fileUrl = `/objects/${pathMatch[1]}`;
        } else {
          console.error('Error extracting file URL from upload URL:', uploadURL);
          throw new Error('Failed to extract file URL from upload response');
        }
      }

      setPendingDocFileUrl(fileUrl);
      setShowDocumentForm(true);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to upload document');
    }
  };

  const handleSaveDocument = () => {
    if (!documentName.trim()) {
      Alert.alert('Error', 'Please enter a document name');
      return;
    }
    if (!pendingDocFileUrl) {
      Alert.alert('Error', 'No file uploaded');
      return;
    }

    // Ensure document name includes the file extension
    let finalDocumentName = documentName.trim();
    if (pendingDocFileExtension) {
      // Check if extension is already in the name
      const nameLower = finalDocumentName.toLowerCase();
      const extensionLower = pendingDocFileExtension.toLowerCase();
      if (!nameLower.endsWith(`.${extensionLower}`)) {
        finalDocumentName = `${finalDocumentName}.${pendingDocFileExtension}`;
      }
    }

    createDocumentMutation.mutate({
      documentName: finalDocumentName,
      documentType,
      fileUrl: pendingDocFileUrl,
    });
  };

  const handleDeleteDocument = (id: string, name: string) => {
    Alert.alert(
      'Delete Document',
      `Are you sure you want to delete "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteDocumentMutation.mutate(id),
        },
      ]
    );
  };

  const getUserInitials = () => {
    const first = firstName?.[0] || '';
    const last = lastName?.[0] || '';
    return (first + last).toUpperCase() || user?.username?.[0]?.toUpperCase() || 'U';
  };

  const getProfileImageUrl = () => {
    if (!profileImageUrl) return null;
    try {
      // If it's already a full URL, use it directly with cache busting
      if (profileImageUrl.startsWith('http://') || profileImageUrl.startsWith('https://')) {
        const separator = profileImageUrl.includes('?') ? '&' : '?';
        return `${profileImageUrl}${separator}_t=${Date.now()}`;
      }

      // Ensure the URL starts with / for relative paths
      const cleanUrl = profileImageUrl.startsWith('/') ? profileImageUrl : `/${profileImageUrl}`;

      // Construct full URL
      let fullUrl = `${getAPI_URL()}${cleanUrl}`;

      // Remove any double slashes in the URL
      fullUrl = fullUrl.replace(/([^:]\/)\/+/g, '$1');

      // Add cache busting to force refresh
      const separator = fullUrl.includes('?') ? '&' : '?';
      return `${fullUrl}${separator}_t=${Date.now()}`;
    } catch (error) {
      console.error('Error constructing profile image URL:', error);
      return null;
    }
  };

  const getDocumentUrl = (fileUrl: string) => {
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      return fileUrl;
    }
    // Construct full URL for relative paths
    const cleanUrl = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
    return `${getAPI_URL()}${cleanUrl}`;
  };

  const handleViewDocument = async (doc: UserDocument) => {
    try {
      const documentUrl = getDocumentUrl(doc.fileUrl);

      // Download the document with authentication
      const response = await fetch(documentUrl, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to download document: ${response.status} ${response.statusText}`);
      }

      // Get the response as arrayBuffer (React Native compatible)
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Convert to base64 manually (btoa not available in React Native)
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let base64 = '';
      let i = 0;
      while (i < uint8Array.length) {
        const a = uint8Array[i++];
        const b = i < uint8Array.length ? uint8Array[i++] : 0;
        const c = i < uint8Array.length ? uint8Array[i++] : 0;
        const bitmap = (a << 16) | (b << 8) | c;
        base64 += chars.charAt((bitmap >> 18) & 63);
        base64 += chars.charAt((bitmap >> 12) & 63);
        base64 += i - 2 < uint8Array.length ? chars.charAt((bitmap >> 6) & 63) : '=';
        base64 += i - 1 < uint8Array.length ? chars.charAt(bitmap & 63) : '=';
      }

      // Determine file extension from document name (should include extension when saved)
      let extension = 'pdf'; // default fallback
      if (doc.documentName) {
        const nameParts = doc.documentName.split('.');
        if (nameParts.length > 1) {
          const extractedExt = nameParts[nameParts.length - 1].toLowerCase();
          // Validate extension is a known document type
          if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(extractedExt)) {
            extension = extractedExt;
          }
        }
      }

      // Determine MIME type from extension
      let mimeType = 'application/pdf'; // default
      switch (extension) {
        case 'pdf':
          mimeType = 'application/pdf';
          break;
        case 'doc':
          mimeType = 'application/msword';
          break;
        case 'docx':
          mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          break;
        case 'txt':
          mimeType = 'text/plain';
          break;
        case 'xls':
          mimeType = 'application/vnd.ms-excel';
          break;
        case 'xlsx':
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
        case 'ppt':
          mimeType = 'application/vnd.ms-powerpoint';
          break;
        case 'pptx':
          mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
          break;
        default:
          mimeType = 'application/octet-stream';
      }

      // Save to file system
      const fileName = `${doc.documentName.replace(/[^a-zA-Z0-9.-]/g, '_') || 'document'}.${extension}`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: 'base64' as any,
      });

      // Open with system viewer
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: mimeType,
          dialogTitle: `Open ${doc.documentName}`,
        });
      } else {
        // Fallback: try to open with Linking
        const canOpen = await Linking.canOpenURL(fileUri);
        if (canOpen) {
          await Linking.openURL(fileUri);
        } else {
          Alert.alert('Document Downloaded', `Document saved to: ${fileUri}`);
        }
      }
    } catch (error: any) {
      console.error('Error opening document:', error);
      Alert.alert('Error', error.message || 'Failed to open document. Please try again.');
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const displayUser = profile || user;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: themeColors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          style={[styles.container, { backgroundColor: themeColors.background }]}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: spacing[4],
              paddingBottom: Math.max(insets.bottom + 80, spacing[8])
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Page Header */}
          <View style={styles.pageHeader}>
            <View style={styles.headerContent}>
              <UserIcon size={28} color={themeColors.primary.DEFAULT} />
              <View style={styles.headerText}>
                <Text style={[styles.pageTitle, { color: themeColors.text.primary }]}>Profile</Text>
                <Text style={[styles.pageSubtitle, { color: themeColors.text.secondary }]}>Manage your personal information and settings</Text>
              </View>
            </View>
          </View>

          {/* Personal Information */}
          <Card style={styles.card}>
            <View style={[styles.cardHeader, { borderBottomColor: themeColors.border.light }]}>
              <View>
                <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Personal Information</Text>
                <Text style={[styles.cardSubtitle, { color: themeColors.text.secondary }]}>Update your profile details below</Text>
              </View>
            </View>

            <View style={styles.avatarSection}>
              <View style={styles.avatarWrapper}>
                <View style={styles.avatarContainer}>
                  {getProfileImageUrl() ? (
                    <Image
                      source={{ uri: getProfileImageUrl() || '' }}
                      style={styles.avatarImage}
                      key={profileImageUrl} // Force re-render when URL changes
                      onError={(e) => {
                        // Log error but don't clear URL - it might be a temporary network issue
                        // The placeholder will show automatically when getProfileImageUrl returns null
                        // Suppress console errors for unknown format - might be a temporary issue
                        const error = e.nativeEvent?.error;
                        if (error && !error.message?.includes('Unknown')) {
                          console.error('Image load error for URL:', profileImageUrl);
                        }
                      }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: themeColors.primary.DEFAULT }]}>
                      <Text style={[styles.avatarText, { color: themeColors.primary.foreground }]}>{getUserInitials()}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.avatarOverlay, { backgroundColor: themeColors.primary.DEFAULT, borderColor: themeColors.background }]}
                  onPress={handleUploadPhoto}
                  activeOpacity={0.8}
                >
                  <View style={styles.avatarOverlayContent}>
                    <Upload size={20} color={themeColors.primary.foreground} />
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Input
                label="First Name"
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Enter first name"
              />
            </View>

            <View style={styles.formGroup}>
              <Input
                label="Last Name"
                value={lastName}
                onChangeText={setLastName}
                placeholder="Enter last name"
              />
            </View>

            <View style={styles.formGroup}>
              <Input
                label="Phone Number"
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter phone number"
                keyboardType="phone-pad"
              />
            </View>

            <Button
              title="Save Changes"
              onPress={handleSaveProfile}
              variant="primary"
              loading={updateMutation.isPending}
              style={styles.saveButton}
            />
          </Card>

          {/* Skills */}
          <Card style={styles.card}>
            <View style={[styles.cardHeader, { borderBottomColor: themeColors.border.light }]}>
              <View>
                <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Skills</Text>
                <Text style={[styles.cardSubtitle, { color: themeColors.text.secondary }]}>Add your professional skills</Text>
              </View>
            </View>

            <View style={styles.inputRow}>
              <Input
                value={newSkill}
                onChangeText={setNewSkill}
                placeholder="Add a skill..."
                style={styles.flexInput}
                onSubmitEditing={handleAddSkill}
              />
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: themeColors.primary.DEFAULT }]}
                onPress={handleAddSkill}
                activeOpacity={0.7}
              >
                <Plus size={20} color={themeColors.primary.foreground} />
              </TouchableOpacity>
            </View>

            {skills.length > 0 && (
              <View style={styles.tagsContainer}>
                {skills.map((skill, index) => (
                  <View key={index} style={[
                    styles.tag,
                    {
                      backgroundColor: themeColors.primary.light,
                      borderColor: themeColors.primary.DEFAULT + '30'
                    }
                  ]}>
                    <Text style={[styles.tagText, { color: themeColors.text.primary }]}>{skill}</Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveSkill(skill)}
                      style={styles.tagRemove}
                    >
                      <X size={14} color={themeColors.text.secondary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <Button
              title="Save Changes"
              onPress={handleSaveProfile}
              variant="primary"
              loading={updateMutation.isPending}
              style={styles.saveButton}
            />
          </Card>

          {/* Qualifications */}
          <Card style={styles.card}>
            <View style={[styles.cardHeader, { borderBottomColor: themeColors.border.light }]}>
              <View>
                <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Qualifications</Text>
                <Text style={[styles.cardSubtitle, { color: themeColors.text.secondary }]}>Add your qualifications and certifications</Text>
              </View>
            </View>

            <View style={styles.inputRow}>
              <Input
                value={newQualification}
                onChangeText={setNewQualification}
                placeholder="Add a qualification..."
                style={styles.flexInput}
                onSubmitEditing={handleAddQualification}
              />
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: themeColors.primary.DEFAULT }]}
                onPress={handleAddQualification}
                activeOpacity={0.7}
              >
                <Plus size={20} color={themeColors.primary.foreground} />
              </TouchableOpacity>
            </View>

            {qualifications.length > 0 && (
              <View style={styles.tagsContainer}>
                {qualifications.map((qual, index) => (
                  <View key={index} style={[
                    styles.tag,
                    {
                      backgroundColor: themeColors.primary.light,
                      borderColor: themeColors.primary.DEFAULT + '30'
                    }
                  ]}>
                    <Text style={[styles.tagText, { color: themeColors.text.primary }]}>{qual}</Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveQualification(qual)}
                      style={styles.tagRemove}
                    >
                      <X size={14} color={themeColors.text.secondary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <Button
              title="Save Changes"
              onPress={handleSaveProfile}
              variant="primary"
              loading={updateMutation.isPending}
              style={styles.saveButton}
            />
          </Card>

          {/* Documents */}
          <Card style={styles.card}>
            <View style={[styles.cardHeader, { borderBottomColor: themeColors.border.light }]}>
              <View>
                <View style={styles.cardTitleRow}>
                  <View style={styles.cardTitleContainer}>
                    <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Documents</Text>
                    <Text style={[styles.cardSubtitle, { color: themeColors.text.secondary }]}>Upload and manage your professional documents</Text>
                  </View>
                  <Button
                    title="Upload"
                    onPress={handleUploadDocument}
                    variant="primary"
                    size="sm"
                    icon={<Upload size={16} color={themeColors.primary.foreground} />}
                    style={styles.uploadDocumentButton}
                  />
                </View>
              </View>
            </View>

            {documentsLoading ? (
              <LoadingSpinner />
            ) : documents.length === 0 ? (
              <View style={styles.emptyState}>
                <FileText size={48} color={themeColors.text.muted} />
                <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>No documents uploaded yet</Text>
              </View>
            ) : (
              <View style={styles.documentsList}>
                {documents.map((doc) => (
                  <View key={doc.id} style={[
                    styles.documentItem,
                    {
                      backgroundColor: themeColors.card.DEFAULT,
                      borderColor: themeColors.border.light
                    }
                  ]}>
                    <TouchableOpacity
                      style={styles.documentInfo}
                      onPress={() => handleViewDocument(doc)}
                      activeOpacity={0.7}
                    >
                      <FileText size={20} color={themeColors.primary.DEFAULT} />
                      <View style={styles.documentDetails}>
                        <Text style={[styles.documentName, { color: themeColors.text.primary }]}>{doc.documentName}</Text>
                        <Text style={[styles.documentType, { color: themeColors.text.secondary }]}>
                          {DOCUMENT_TYPES.find((t) => t.value === doc.documentType)?.label || doc.documentType}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteDocument(doc.id, doc.documentName)}
                      style={styles.deleteButton}
                    >
                      <Trash2 size={18} color={themeColors.destructive.DEFAULT} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Appearance Settings */}
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Appearance</Text>
                <Text style={[styles.cardSubtitle, { color: themeColors.text.secondary }]}>Choose your preferred theme</Text>
              </View>
            </View>

            <View style={styles.themeOptions}>
              <TouchableOpacity
                style={[
                  styles.themeOption,
                  themeMode === 'light' && styles.themeOptionSelected,
                  {
                    backgroundColor: themeMode === 'light' ? themeColors.primary.light : themeColors.card.DEFAULT,
                    borderColor: themeMode === 'light' ? themeColors.primary.DEFAULT : themeColors.border.DEFAULT,
                  }
                ]}
                onPress={() => setThemeMode('light')}
                activeOpacity={0.7}
              >
                <Sun size={24} color={themeMode === 'light' ? themeColors.primary.DEFAULT : themeColors.text.secondary} />
                <Text style={[
                  styles.themeOptionText,
                  { color: themeMode === 'light' ? themeColors.primary.DEFAULT : themeColors.text.primary }
                ]}>
                  Light
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.themeOption,
                  themeMode === 'dark' && styles.themeOptionSelected,
                  {
                    backgroundColor: themeMode === 'dark' ? themeColors.primary.light : themeColors.card.DEFAULT,
                    borderColor: themeMode === 'dark' ? themeColors.primary.DEFAULT : themeColors.border.DEFAULT,
                  }
                ]}
                onPress={() => setThemeMode('dark')}
                activeOpacity={0.7}
              >
                <Moon size={24} color={themeMode === 'dark' ? themeColors.primary.DEFAULT : themeColors.text.secondary} />
                <Text style={[
                  styles.themeOptionText,
                  { color: themeMode === 'dark' ? themeColors.primary.DEFAULT : themeColors.text.primary }
                ]}>
                  Dark
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.themeOption,
                  themeMode === 'auto' && styles.themeOptionSelected,
                  {
                    backgroundColor: themeMode === 'auto' ? themeColors.primary.light : themeColors.card.DEFAULT,
                    borderColor: themeMode === 'auto' ? themeColors.primary.DEFAULT : themeColors.border.DEFAULT,
                  }
                ]}
                onPress={() => setThemeMode('auto')}
                activeOpacity={0.7}
              >
                <Monitor size={24} color={themeMode === 'auto' ? themeColors.primary.DEFAULT : themeColors.text.secondary} />
                <Text style={[
                  styles.themeOptionText,
                  { color: themeMode === 'auto' ? themeColors.primary.DEFAULT : themeColors.text.primary }
                ]}>
                  System
                </Text>
              </TouchableOpacity>
            </View>
          </Card>

          {/* Biometric Authentication */}
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Biometric Authentication</Text>
                <Text style={[styles.cardSubtitle, { color: themeColors.text.secondary }]}>
                  Use {biometricType || 'biometric'} to login quickly
                </Text>
              </View>
            </View>

            <View style={styles.biometricContainer}>
              <View style={[styles.biometricInfoRow, { borderBottomColor: themeColors.border.light }]}>
                <View style={styles.biometricInfoLeft}>
                  <View style={[styles.biometricIconContainer, { backgroundColor: `${themeColors.primary.DEFAULT}15` }]}>
                    <Fingerprint size={20} color={themeColors.primary.DEFAULT} />
                  </View>
                  <View style={styles.biometricInfoText}>
                    <Text style={[styles.biometricLabel, { color: themeColors.text.primary }]}>Status</Text>
                    <Text style={[styles.biometricValue, { color: themeColors.text.secondary }]}>
                      {biometricStatus}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.biometricToggleRow}>
                <View style={styles.biometricToggleLeft}>
                  <Text style={[styles.biometricToggleLabel, { color: themeColors.text.primary }]}>
                    Enable Biometric Login
                  </Text>
                  <Text style={[styles.biometricToggleDescription, { color: themeColors.text.secondary }]}>
                    Login quickly using {biometricType || 'your device biometric'} instead of entering password
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.biometricToggle,
                    {
                      backgroundColor: biometricEnabled ? themeColors.primary.DEFAULT : themeColors.border.DEFAULT,
                    }
                  ]}
                  onPress={async () => {
                    if (biometricEnabled) {
                      // Disable biometric
                      Alert.alert(
                        'Disable Biometric Login',
                        'Are you sure you want to disable biometric login? Your stored credentials will be cleared.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Disable',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await clearBiometricCredentials();
                                await updateMutation.mutateAsync({ biometricEnabled: false });
                                setBiometricEnabled(false);
                                Alert.alert('Success', 'Biometric login has been disabled');
                              } catch (error: any) {
                                Alert.alert('Error', error.message || 'Failed to disable biometric login');
                              }
                            },
                          },
                        ]
                      );
                    } else {
                      // Enable biometric
                      if (!isBiometricAvailable) {
                        Alert.alert(
                          'Biometric Not Available',
                          'Biometric authentication is not available on this device or not enrolled. Please set up biometric authentication in your device settings.',
                          [{ text: 'OK' }]
                        );
                        return;
                      }

                      // Test biometric authentication first
                      const result = await biometricService.authenticateWithBiometric(
                        'Authenticate to enable biometric login'
                      );

                      if (!result.success) {
                        Alert.alert(
                          'Authentication Failed',
                          result.error || 'Biometric authentication failed. Please try again.',
                          [{ text: 'OK' }]
                        );
                        return;
                      }

                      // Get stored email (from last login)
                      const storedEmail = await getStoredEmail();
                      if (!storedEmail) {
                        Alert.alert(
                          'No Email Found',
                          'Please login with email and password first, then enable biometric login.',
                          [{ text: 'OK' }]
                        );
                        return;
                      }

                      // Show password input modal
                      setBiometricPassword('');
                      setShowPasswordModal(true);
                    }
                  }}
                  disabled={!isBiometricAvailable || updateMutation.isPending}
                >
                  <View
                    style={[
                      styles.biometricToggleThumb,
                      {
                        transform: [{ translateX: biometricEnabled ? 20 : 0 }],
                        backgroundColor: themeColors.background,
                      }
                    ]}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </Card>

          {/* Account Information */}
          <Card style={styles.card}>
            <View style={[styles.cardHeader, { borderBottomColor: themeColors.border.light }]}>
              <View>
                <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Account Information</Text>
                <Text style={[styles.cardSubtitle, { color: themeColors.text.secondary }]}>These details cannot be changed from this page</Text>
              </View>
            </View>

            <View style={styles.infoContainer}>
              <View style={[styles.infoRow, { borderBottomColor: themeColors.border.light }]}>
                <View style={styles.infoLeft}>
                  <View style={[styles.infoIconContainer, { backgroundColor: `${themeColors.primary.DEFAULT} 15` }]}>
                    <Mail size={18} color={themeColors.primary.DEFAULT} />
                  </View>
                  <View style={styles.infoTextContainer}>
                    <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>Email</Text>
                    <Text style={[styles.infoValue, { color: themeColors.text.primary }]} numberOfLines={1}>
                      {displayUser?.email || 'N/A'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[styles.infoRow, { borderBottomColor: themeColors.border.light }]}>
                <View style={styles.infoLeft}>
                  <View style={[styles.infoIconContainer, { backgroundColor: `${themeColors.primary.DEFAULT} 15` }]}>
                    <UserIcon size={18} color={themeColors.primary.DEFAULT} />
                  </View>
                  <View style={styles.infoTextContainer}>
                    <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>Username</Text>
                    <Text style={[styles.infoValue, { color: themeColors.text.primary }]} numberOfLines={1}>
                      {displayUser?.username || 'N/A'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.infoRow}>
                <View style={styles.infoLeft}>
                  <View style={[styles.infoIconContainer, { backgroundColor: `${themeColors.primary.DEFAULT} 15` }]}>
                    <Shield size={18} color={themeColors.primary.DEFAULT} />
                  </View>
                  <View style={styles.infoTextContainer}>
                    <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>Role</Text>
                    <Text style={[styles.infoValue, { color: themeColors.text.primary }]}>
                      {displayUser?.role === 'owner'
                        ? 'Owner'
                        : displayUser?.role === 'clerk'
                          ? 'Clerk'
                          : displayUser?.role === 'compliance'
                            ? 'Compliance'
                            : displayUser?.role || 'N/A'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </Card>

          {/* Sign Out Button */}
          <TouchableOpacity
            style={[
              styles.logoutButton,
              {
                backgroundColor: themeColors.destructive.DEFAULT,
                borderColor: themeColors.destructive.DEFAULT,
                opacity: isOnline ? 1 : 0.5,
              }
            ]}
            onPress={() => {
              if (!isOnline) {
                Alert.alert(
                  'Offline',
                  'You cannot sign out while offline. Please connect to the internet and try again.'
                );
                return;
              }
              logout();
            }}
            disabled={!isOnline}
            activeOpacity={0.8}
          >
            <View style={styles.logoutButtonContent}>
              <LogOut size={20} color="#ffffff" />
              <Text style={styles.logoutButtonText}>
                {isOnline ? 'Sign Out' : 'Sign Out (Online only)'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Biometric Password Modal */}
          <Modal
            visible={showPasswordModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {
              setShowPasswordModal(false);
              setBiometricPassword('');
            }}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: themeColors.card.DEFAULT, borderColor: themeColors.border.DEFAULT }]}>
                <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
                  <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Enter Password</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowPasswordModal(false);
                      setBiometricPassword('');
                    }}
                    style={[styles.modalCloseButton, { backgroundColor: themeColors.card.DEFAULT }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modalClose, { color: themeColors.text.secondary }]}>✕</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.modalBody}>
                  <Text style={[styles.modalSubtitle, { color: themeColors.text.secondary }]}>
                    Enter your password to enable biometric login:
                  </Text>
                  <Input
                    label="Password"
                    value={biometricPassword}
                    onChangeText={setBiometricPassword}
                    placeholder="Enter your password"
                    secureTextEntry
                    autoFocus
                  />
                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalButtonCancel, { borderColor: themeColors.border.DEFAULT }]}
                      onPress={() => {
                        setShowPasswordModal(false);
                        setBiometricPassword('');
                      }}
                    >
                      <Text style={[styles.modalButtonText, { color: themeColors.text.secondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalButtonPrimary, { backgroundColor: themeColors.primary.DEFAULT }]}
                      onPress={async () => {
                        if (!biometricPassword || biometricPassword.length < 6) {
                          Alert.alert('Error', 'Password must be at least 6 characters');
                          return;
                        }

                        try {
                          const storedEmail = await getStoredEmail();
                          if (!storedEmail) {
                            Alert.alert('Error', 'Email not found');
                            setShowPasswordModal(false);
                            return;
                          }

                          // Store credentials WITHOUT requiring authentication again
                          // (user already authenticated with biometric before entering password)
                          // skipAuth=true prevents the second biometric prompt when storing
                          await storeBiometricCredentials(storedEmail, biometricPassword, true);
                          
                          // Update profile - ensure biometricEnabled is explicitly set to true
                          // Use a small delay to ensure credentials are stored first
                          await new Promise<void>((resolve) => setTimeout(() => resolve(), 100));
                          
                          // Ensure the update data is properly formatted
                          const updateData: UpdateProfileData = { 
                            biometricEnabled: true 
                          };
                          console.log('[ProfileScreen] Updating profile with:', JSON.stringify(updateData));
                          
                          // Verify the data before sending
                          if (!updateData.biometricEnabled) {
                            throw new Error('Invalid update data: biometricEnabled is not set');
                          }
                          
                          await updateMutation.mutateAsync(updateData);
                          console.log('[ProfileScreen] Profile update successful');
                          
                          setBiometricEnabled(true);
                          setShowPasswordModal(false);
                          setBiometricPassword('');
                          Alert.alert('Success', 'Biometric login has been enabled');
                        } catch (error: any) {
                          console.error('[ProfileScreen] Error enabling biometric:', error);
                          const errorMessage = error?.message || error?.response?.data?.message || 'Failed to enable biometric login';
                          Alert.alert('Error', errorMessage);
                          // Don't clear the modal on error so user can try again
                        }
                      }}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <ActivityIndicator color={themeColors.primary.foreground} />
                      ) : (
                        <Text style={[styles.modalButtonText, { color: themeColors.primary.foreground }]}>Enable</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </Modal>

          {/* Document Form Modal */}
          <Modal
            visible={showDocumentForm}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowDocumentForm(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[
                styles.modalContent,
                {
                  backgroundColor: themeColors.background,
                  paddingBottom: Math.max(insets.bottom || 0, spacing[4])
                }
              ]}>
                <View style={[styles.modalHeader, { borderBottomColor: themeColors.border.light }]}>
                  <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Add Document</Text>
                  <TouchableOpacity
                    onPress={() => setShowDocumentForm(false)}
                    style={[styles.modalCloseButton, { backgroundColor: themeColors.card.DEFAULT }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modalClose, { color: themeColors.text.secondary }]}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.modalBody}>
                  <View style={styles.formGroup}>
                    <Text style={[styles.label, { color: themeColors.text.primary }]}>Document Name *</Text>
                    <Input
                      value={documentName}
                      onChangeText={setDocumentName}
                      placeholder="Enter document name"
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Document Type *</Text>
                    <FlatList
                      data={DOCUMENT_TYPES}
                      keyExtractor={(item) => item.value}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={[
                            styles.modalItem,
                            {
                              backgroundColor: documentType === item.value ? themeColors.primary.light : themeColors.card.DEFAULT,
                              borderColor: documentType === item.value ? themeColors.primary.DEFAULT : themeColors.border.light
                            },
                            documentType === item.value && { borderWidth: 2 }
                          ]}
                          onPress={() => setDocumentType(item.value)}
                        >
                          <Text
                            style={[
                              styles.modalItemText,
                              { color: documentType === item.value ? themeColors.primary.DEFAULT : themeColors.text.primary }
                            ]}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>

                  <Button
                    title="Save Document"
                    onPress={handleSaveDocument}
                    variant="primary"
                    loading={createDocumentMutation.isPending}
                    style={styles.modalSaveButton}
                  />
                </View>
              </View>
            </View>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing[4],
  },
  pageHeader: {
    marginBottom: spacing[6],
    paddingBottom: spacing[4],
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  headerText: {
    flex: 1,
  },
  pageTitle: {
    fontSize: typography.fontSize['3xl'] || 28,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing[1],
  },
  pageSubtitle: {
    fontSize: typography.fontSize.base,
    lineHeight: 20,
  },
  card: {
    marginBottom: spacing[5],
    ...shadows.sm,
  },
  cardHeader: {
    marginBottom: spacing[5],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
  },
  cardHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  cardTitleContainer: {
    flex: 1,
    marginRight: spacing[2],
  },
  cardTitle: {
    fontSize: typography.fontSize.xl || 20,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing[1],
    letterSpacing: 0.2,
  },
  cardSubtitle: {
    fontSize: typography.fontSize.sm,
    lineHeight: 18,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing[5],
    paddingVertical: spacing[2],
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: spacing[3],
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: colors.primary.DEFAULT + '40',
    ...shadows.md,
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.background,
    ...shadows.sm,
  },
  avatarOverlayContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
  },
  uploadButton: {
    marginTop: spacing[2],
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.xl || 16,
    ...shadows.md,
  },
  formGroup: {
    marginBottom: spacing[4],
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  flexInput: {
    flex: 1,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.xs,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    gap: spacing[2],
    borderWidth: 1,
    borderColor: colors.primary.DEFAULT + '30',
    ...shadows.xs,
  },
  tagText: {
    fontSize: typography.fontSize.sm,
  },
  tagRemove: {
    padding: spacing[1],
  },
  saveButton: {
    marginTop: spacing[4],
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg || 12,
    minWidth: 140,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[12],
    paddingHorizontal: spacing[4],
  },
  emptyText: {
    fontSize: typography.fontSize.base,
    marginTop: spacing[3],
    fontWeight: typography.fontWeight.medium,
  },
  documentsList: {
    gap: spacing[2],
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[4],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
    marginBottom: spacing[2],
    ...shadows.xs,
  },
  documentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingVertical: spacing[1],
    paddingRight: spacing[2],
    gap: spacing[3],
  },
  documentDetails: {
    flex: 1,
  },
  documentName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[1],
  },
  documentType: {
    fontSize: typography.fontSize.sm,
  },
  deleteButton: {
    padding: spacing[2],
  },
  infoContainer: {
    gap: spacing[1],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[2],
    borderBottomWidth: 1,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing[3],
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoTextContainer: {
    flex: 1,
    gap: spacing[1],
  },
  infoLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  logoutButton: {
    marginTop: spacing[4],
    marginBottom: spacing[4],
    width: '100%',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    ...shadows.md,
  },
  logoutButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  logoutButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '85%',
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
    paddingBottom: spacing[4],
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: typography.fontSize.xl || 20,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.3,
  },
  modalClose: {
    fontSize: typography.fontSize.xl || 20,
    fontWeight: typography.fontWeight.bold,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card?.DEFAULT || '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    gap: spacing[4],
  },
  modalSubtitle: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing[2],
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalButtonCancel: {
    borderWidth: 1,
  },
  modalButtonPrimary: {
    // backgroundColor set dynamically
  },
  modalButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  modalItem: {
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    marginBottom: spacing[2],
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  modalItemSelected: {
    borderColor: colors.primary.DEFAULT,
    borderWidth: 2,
  },
  modalItemText: {
    fontSize: typography.fontSize.base,
  },
  modalItemTextSelected: {
    fontWeight: typography.fontWeight.medium,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[2],
  },
  uploadDocumentButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.xl || 16,
    ...shadows.md,
    minWidth: 100,
  },
  modalSaveButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg || 12,
    minWidth: 140,
    marginTop: spacing[2],
  },
  themeOptions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    ...shadows.xs,
  },
  themeOptionSelected: {
    ...shadows.sm,
  },
  themeOptionText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  biometricContainer: {
    paddingVertical: spacing[2],
  },
  biometricInfoRow: {
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
  },
  biometricInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  biometricIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  biometricInfoText: {
    flex: 1,
  },
  biometricLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing[1],
  },
  biometricValue: {
    fontSize: typography.fontSize.sm,
  },
  biometricToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[4],
  },
  biometricToggleLeft: {
    flex: 1,
    marginRight: spacing[4],
  },
  biometricToggleLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing[1],
  },
  biometricToggleDescription: {
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
  biometricToggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    padding: 2,
    justifyContent: 'center',
  },
  biometricToggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    ...shadows.sm,
  },
});
