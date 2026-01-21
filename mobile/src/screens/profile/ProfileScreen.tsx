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
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Upload, Plus, X, FileText, Trash2, User as UserIcon } from 'lucide-react-native';
import { profileService, type UpdateProfileData, type UserDocument } from '../../services/profile';
import { apiRequestJson, API_URL } from '../../services/api';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';

const DOCUMENT_TYPES = [
  { value: 'license', label: 'License' },
  { value: 'certification', label: 'Certification' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other', label: 'Other' },
];

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const queryClient = useQueryClient();
  
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

  // Fetch current user profile
  const { data: profile, isLoading } = useQuery({
    queryKey: ['/api/auth/profile'],
    queryFn: async () => {
      const response = await apiRequestJson<any>('GET', '/api/auth/profile');
      return response;
    },
  });

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
      queryClient.invalidateQueries({ predicate: (query) => 
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
      const uploadUrlResponse = await fetch(`${API_URL}/api/objects/upload`, {
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
      
      try {
        // Parse the upload URL to extract objectId
        let urlToParse = uploadURL;
        // If it's a relative URL, make it absolute for parsing
        if (!urlToParse.startsWith('http://') && !urlToParse.startsWith('https://')) {
          urlToParse = `${API_URL}${urlToParse.startsWith('/') ? '' : '/'}${urlToParse}`;
        }
        
        const urlObj = new URL(urlToParse);
        const objectId = urlObj.searchParams.get('objectId');
        
        if (objectId) {
          // Construct the file URL as /objects/{objectId}
          fileUrl = `/objects/${objectId}`;
        } else {
          // Fallback: try to extract from pathname if objectId not in query
          const pathname = urlObj.pathname;
          if (pathname.includes('/objects/')) {
            const objectsIndex = pathname.indexOf('/objects/');
            fileUrl = pathname.substring(objectsIndex);
          } else {
            throw new Error('Could not extract objectId from upload URL');
          }
        }
      } catch (e) {
        // If URL parsing fails, try manual extraction
        const objectIdMatch = uploadURL.match(/[?&]objectId=([^&]+)/);
        if (objectIdMatch && objectIdMatch[1]) {
          fileUrl = `/objects/${objectIdMatch[1]}`;
        } else {
          console.error('Error extracting file URL from upload URL:', uploadURL, e);
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
      if (DocumentPicker.isCancel(error)) {
        // User canceled, do nothing
        return;
      }
      Alert.alert('Error', error.message || 'Failed to pick document');
    }
  };

  const uploadDocumentFile = async (uri: string, mimeType: string = 'application/octet-stream') => {
    try {
      // Get upload URL
      const uploadUrlResponse = await fetch(`${API_URL}/api/objects/upload`, {
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
      
      try {
        // Parse the upload URL to extract objectId
        let urlToParse = uploadURL;
        // If it's a relative URL, make it absolute for parsing
        if (!urlToParse.startsWith('http://') && !urlToParse.startsWith('https://')) {
          urlToParse = `${API_URL}${urlToParse.startsWith('/') ? '' : '/'}${urlToParse}`;
        }
        
        const urlObj = new URL(urlToParse);
        const objectId = urlObj.searchParams.get('objectId');
        
        if (objectId) {
          // Construct the file URL as /objects/{objectId}
          fileUrl = `/objects/${objectId}`;
        } else {
          // Fallback: try to extract from pathname if objectId not in query
          const pathname = urlObj.pathname;
          if (pathname.includes('/objects/')) {
            const objectsIndex = pathname.indexOf('/objects/');
            fileUrl = pathname.substring(objectsIndex);
          } else {
            throw new Error('Could not extract objectId from upload URL');
          }
        }
      } catch (e) {
        // If URL parsing fails, try manual extraction
        const objectIdMatch = uploadURL.match(/[?&]objectId=([^&]+)/);
        if (objectIdMatch && objectIdMatch[1]) {
          fileUrl = `/objects/${objectIdMatch[1]}`;
        } else {
          console.error('Error extracting file URL from upload URL:', uploadURL, e);
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
      let fullUrl = `${API_URL}${cleanUrl}`;
      
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
    return `${API_URL}${cleanUrl}`;
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { 
          paddingTop: Math.max(insets.top + spacing[4], spacing[8]),
          paddingBottom: Math.max(insets.bottom + 80, spacing[8]) 
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Page Header */}
      <View style={styles.pageHeader}>
        <View style={styles.headerContent}>
          <UserIcon size={28} color={colors.primary.DEFAULT} />
          <View style={styles.headerText}>
            <Text style={styles.pageTitle}>Profile</Text>
            <Text style={styles.pageSubtitle}>Manage your personal information and settings</Text>
          </View>
        </View>
      </View>

      {/* Personal Information */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Personal Information</Text>
            <Text style={styles.cardSubtitle}>Update your profile details below</Text>
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
                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary.DEFAULT }]}>
                  <Text style={styles.avatarText}>{getUserInitials()}</Text>
            </View>
          )}
            </View>
            <TouchableOpacity
              style={styles.avatarOverlay}
              onPress={handleUploadPhoto}
              activeOpacity={0.8}
            >
              <View style={styles.avatarOverlayContent}>
                <Upload size={20} color="#ffffff" />
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
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Skills</Text>
            <Text style={styles.cardSubtitle}>Add your professional skills</Text>
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
            style={styles.addButton}
            onPress={handleAddSkill}
            activeOpacity={0.7}
          >
            <Plus size={20} color={colors.primary.foreground} />
          </TouchableOpacity>
        </View>

        {skills.length > 0 && (
          <View style={styles.tagsContainer}>
            {skills.map((skill, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{skill}</Text>
                <TouchableOpacity
                  onPress={() => handleRemoveSkill(skill)}
                  style={styles.tagRemove}
                >
                  <X size={14} color={colors.text.secondary} />
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
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Qualifications</Text>
            <Text style={styles.cardSubtitle}>Add your qualifications and certifications</Text>
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
            style={styles.addButton}
            onPress={handleAddQualification}
            activeOpacity={0.7}
          >
            <Plus size={20} color={colors.primary.foreground} />
          </TouchableOpacity>
        </View>

        {qualifications.length > 0 && (
          <View style={styles.tagsContainer}>
            {qualifications.map((qual, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{qual}</Text>
                <TouchableOpacity
                  onPress={() => handleRemoveQualification(qual)}
                  style={styles.tagRemove}
                >
                  <X size={14} color={colors.text.secondary} />
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
        <View style={styles.cardHeader}>
          <View>
            <View style={styles.cardTitleRow}>
              <View style={styles.cardTitleContainer}>
                <Text style={styles.cardTitle}>Documents</Text>
                <Text style={styles.cardSubtitle}>Upload and manage your professional documents</Text>
              </View>
              <Button
                title="Upload"
                onPress={handleUploadDocument}
                variant="primary"
                size="sm"
                icon={<Upload size={16} color={colors.primary.foreground || '#ffffff'} />}
                style={styles.uploadDocumentButton}
              />
            </View>
          </View>
        </View>

        {documentsLoading ? (
          <LoadingSpinner />
        ) : documents.length === 0 ? (
          <View style={styles.emptyState}>
            <FileText size={48} color={colors.text.muted} />
            <Text style={styles.emptyText}>No documents uploaded yet</Text>
          </View>
        ) : (
          <View style={styles.documentsList}>
            {documents.map((doc) => (
              <View key={doc.id} style={styles.documentItem}>
                <TouchableOpacity
                  style={styles.documentInfo}
                  onPress={() => handleViewDocument(doc)}
                  activeOpacity={0.7}
                >
                  <FileText size={20} color={colors.primary.DEFAULT} />
                  <View style={styles.documentDetails}>
                    <Text style={styles.documentName}>{doc.documentName}</Text>
                    <Text style={styles.documentType}>
                      {DOCUMENT_TYPES.find((t) => t.value === doc.documentType)?.label || doc.documentType}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteDocument(doc.id, doc.documentName)}
                  style={styles.deleteButton}
                >
                  <Trash2 size={18} color={colors.destructive.DEFAULT} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* Account Information */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Account Information</Text>
            <Text style={styles.cardSubtitle}>These details cannot be changed from this page</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{displayUser?.email || 'N/A'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Username</Text>
          <Text style={styles.infoValue}>{displayUser?.username || 'N/A'}</Text>
        </View>

        <View style={[styles.infoRow, styles.infoRowLast]}>
          <Text style={styles.infoLabel}>Role</Text>
          <Text style={styles.infoValue}>
            {displayUser?.role === 'owner'
              ? 'Owner'
              : displayUser?.role === 'clerk'
              ? 'Clerk'
              : displayUser?.role === 'compliance'
              ? 'Compliance'
              : displayUser?.role || 'N/A'}
          </Text>
        </View>
      </Card>

      {/* Sign Out Button */}
      <Button
        title="Sign Out"
        onPress={logout}
        variant="destructive"
        style={styles.logoutButton}
      />

      {/* Document Form Modal */}
      <Modal
        visible={showDocumentForm}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDocumentForm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom || 0, spacing[4]) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Document</Text>
              <TouchableOpacity 
                onPress={() => setShowDocumentForm(false)}
                style={styles.modalCloseButton}
                activeOpacity={0.7}
              >
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Document Name *</Text>
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
                        documentType === item.value && styles.modalItemSelected,
                      ]}
                      onPress={() => setDocumentType(item.value)}
                    >
                      <Text
                        style={[
                          styles.modalItemText,
                          documentType === item.value && styles.modalItemTextSelected,
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    color: colors.text.primary,
    marginBottom: spacing[1],
  },
  pageSubtitle: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
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
    borderBottomColor: colors.border.light,
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
    color: colors.text.primary,
    marginBottom: spacing[1],
    letterSpacing: 0.2,
  },
  cardSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
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
    backgroundColor: colors.primary.DEFAULT,
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
    color: colors.primary.foreground,
  },
  uploadButton: {
    marginTop: spacing[2],
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.xl || 16,
    backgroundColor: colors.primary.DEFAULT,
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
    backgroundColor: colors.primary.DEFAULT,
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
    backgroundColor: colors.primary.light,
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
    color: colors.text.primary,
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
    color: colors.text.muted,
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
    backgroundColor: colors.card?.DEFAULT || '#fafafa',
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
    color: colors.text.primary,
    marginBottom: spacing[1],
  },
  documentType: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
  },
  deleteButton: {
    padding: spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.secondary,
  },
  infoValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  logoutButton: {
    marginTop: spacing[4],
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg || 12,
    minWidth: 140,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
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
    borderBottomColor: colors.border.light,
  },
  modalTitle: {
    fontSize: typography.fontSize.xl || 20,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  modalClose: {
    fontSize: typography.fontSize.xl || 20,
    color: colors.text.secondary,
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
  modalItem: {
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    marginBottom: spacing[2],
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.card?.DEFAULT || '#fafafa',
  },
  modalItemSelected: {
    backgroundColor: colors.primary.light,
    borderColor: colors.primary.DEFAULT,
    borderWidth: 2,
  },
  modalItemText: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  modalItemTextSelected: {
    color: colors.primary.DEFAULT,
    fontWeight: typography.fontWeight.medium,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  uploadDocumentButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.xl || 16,
    backgroundColor: colors.primary.DEFAULT,
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
});
