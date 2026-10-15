import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ImagePlus, Trash2, Check } from 'lucide-react-native';
import {
  inspectionGalleryService,
  type GalleryImage,
  type PhotoDestination,
} from '../../services/inspectionGallery';
import { uploadLocalFile } from '../../services/objectUpload';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, spacing, typography, borderRadius } from '../../theme';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { RemoteImage } from '../ui/RemoteImage';
import {
  GALLERY_FIELD_PHOTO_MAX,
  GALLERY_REGISTER_BATCH_MAX,
  GALLERY_UPLOAD_SELECT_MAX,
} from '../../../../shared/inspectionGallery';

type FilterKey = 'all' | 'unassigned' | 'assigned';

type Props = {
  inspectionId: string;
  canEdit?: boolean;
  onEntriesChanged?: () => void;
};

export function InspectionGalleryPanel({
  inspectionId,
  canEdit = true,
  onEntriesChanged,
}: Props) {
  const theme = useTheme();
  const themeColors = theme?.colors || colors;
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const galleryQuery = useQuery({
    queryKey: ['gallery', inspectionId],
    queryFn: () => inspectionGalleryService.list(inspectionId),
    enabled: !!inspectionId && isOnline,
  });

  const destinationsQuery = useQuery({
    queryKey: ['gallery-destinations', inspectionId],
    queryFn: () => inspectionGalleryService.destinations(inspectionId),
    enabled: !!inspectionId && isOnline && assignOpen,
  });

  const images = galleryQuery.data?.images || [];
  const destinations = destinationsQuery.data?.destinations || [];

  const filtered = useMemo(() => {
    if (filter === 'unassigned') return images.filter((i) => i.assignments.length === 0);
    if (filter === 'assigned') return images.filter((i) => i.assignments.length > 0);
    return images;
  }, [images, filter]);

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['gallery', inspectionId] });
    await queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}/entries`] });
    onEntriesChanged?.();
  }, [inspectionId, onEntriesChanged, queryClient]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const uploadUris = async (uris: string[]) => {
    if (!uris.length) return;
    if (uris.length > GALLERY_UPLOAD_SELECT_MAX) {
      Alert.alert(
        'Too many photos',
        `You can select at most ${GALLERY_UPLOAD_SELECT_MAX} photos at a time.`,
      );
      return;
    }
    setUploading(true);
    setUploadProgress(`Uploading 0/${uris.length}…`);
    try {
      const registered: Array<{ objectUrl: string; fileName?: string; mimeType?: string }> = [];
      for (let i = 0; i < uris.length; i++) {
        setUploadProgress(`Uploading ${i + 1}/${uris.length}…`);
        const objectUrl = await uploadLocalFile(uris[i], { mimeType: 'image/jpeg' });
        registered.push({
          objectUrl,
          fileName: `gallery_${Date.now()}_${i}.jpg`,
          mimeType: 'image/jpeg',
        });
      }
      if (registered.length) {
        setUploadProgress('Saving to gallery…');
        for (let i = 0; i < registered.length; i += GALLERY_REGISTER_BATCH_MAX) {
          await inspectionGalleryService.register(
            inspectionId,
            registered.slice(i, i + GALLERY_REGISTER_BATCH_MAX),
          );
        }
        await invalidate();
      }
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.message || 'Could not upload photos');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handlePickLibrary = async () => {
    if (!canEdit) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission Required', 'Photo library access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: GALLERY_UPLOAD_SELECT_MAX,
      exif: false,
    });
    if (result.canceled || !result.assets?.length) return;
    await uploadUris(result.assets.map((a) => a.uri));
  };

  const handleTakePhoto = async () => {
    if (!canEdit) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission Required', 'Camera access is required.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      exif: false,
    });
    if (result.canceled || !result.assets?.length) return;
    await uploadUris(result.assets.map((a) => a.uri));
  };

  const handleAssign = async (dest: PhotoDestination) => {
    if (!selected.size) return;
    if (selected.size > GALLERY_FIELD_PHOTO_MAX) {
      Alert.alert(
        'Too many photos',
        `A field can have at most ${GALLERY_FIELD_PHOTO_MAX} photos. Deselect some and try again.`,
      );
      return;
    }
    setBusy(true);
    try {
      await inspectionGalleryService.assign(
        inspectionId,
        Array.from(selected),
        dest.sectionRef,
        dest.fieldKey,
      );
      setSelected(new Set());
      setAssignOpen(false);
      await invalidate();
    } catch (e: any) {
      Alert.alert('Assign Failed', e?.message || 'Could not assign photos');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = () => {
    if (!selected.size) return;
    Alert.alert(
      'Delete Photos',
      `Remove ${selected.size} photo(s) from the gallery and all field assignments?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await inspectionGalleryService.delete(inspectionId, Array.from(selected));
              setSelected(new Set());
              await invalidate();
            } catch (e: any) {
              Alert.alert('Delete Failed', e?.message || 'Could not delete photos');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const badgeLabel = (image: GalleryImage) => {
    if (!image.assignments.length) return 'Not assigned';
    const first = image.assignments[0].label;
    const extra = image.assignments.length - 1;
    return extra > 0 ? `${first} (+${extra})` : first;
  };

  if (!isOnline) {
    return (
      <View style={[styles.centered, { padding: spacing[6] }]}>
        <Text style={{ color: themeColors.text.secondary, textAlign: 'center' }}>
          Gallery requires an internet connection. Photos added offline will sync into the gallery when you reconnect.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        {(['all', 'unassigned', 'assigned'] as FilterKey[]).map((key) => (
          <TouchableOpacity
            key={key}
            onPress={() => setFilter(key)}
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  filter === key ? themeColors.primary.DEFAULT : themeColors.card.DEFAULT,
                borderColor: themeColors.border.DEFAULT,
              },
            ]}
          >
            <Text
              style={{
                color: filter === key ? themeColors.primary.foreground || '#fff' : themeColors.text.primary,
                fontSize: typography.fontSize.xs,
                textTransform: 'capitalize',
              }}
            >
              {key}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {canEdit && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: themeColors.primary.DEFAULT }]}
            onPress={handleTakePhoto}
            disabled={uploading || busy}
          >
            <Camera size={16} color={themeColors.primary.foreground || '#fff'} />
            <Text style={[styles.actionBtnText, { color: themeColors.primary.foreground || '#fff' }]}>
              Camera
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: themeColors.secondary?.DEFAULT || themeColors.muted?.DEFAULT || '#64748b' }]}
            onPress={handlePickLibrary}
            disabled={uploading || busy}
          >
            <ImagePlus size={16} color="#fff" />
            <Text style={[styles.actionBtnText, { color: '#fff' }]}>Upload</Text>
          </TouchableOpacity>
        </View>
      )}

      {selected.size > 0 && canEdit && (
        <View style={[styles.selectionBar, { backgroundColor: themeColors.muted?.DEFAULT || themeColors.card.DEFAULT }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: themeColors.text.primary }}>{selected.size} selected</Text>
            {selected.size > GALLERY_FIELD_PHOTO_MAX && (
              <Text style={{ color: themeColors.destructive.DEFAULT, fontSize: 11, marginTop: 2 }}>
                Max {GALLERY_FIELD_PHOTO_MAX} per field — deselect to Assign
              </Text>
            )}
          </View>
          <View style={styles.selAction}>
            <TouchableOpacity
              onPress={() => {
                if (selected.size > GALLERY_FIELD_PHOTO_MAX) return;
                setAssignOpen(true);
              }}
              disabled={busy || selected.size > GALLERY_FIELD_PHOTO_MAX}
              style={{ marginRight: spacing[3] }}
            >
              <Text style={{ color: themeColors.primary.DEFAULT, fontWeight: '600' }}>Assign</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} disabled={busy} style={{ marginRight: spacing[3] }}>
              <Trash2 size={18} color={themeColors.destructive.DEFAULT} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSelected(new Set())}>
              <Text style={{ color: themeColors.text.secondary }}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {(galleryQuery.isLoading || uploading || busy) && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={themeColors.primary.DEFAULT} />
          <Text style={{ color: themeColors.text.secondary, marginLeft: 8 }}>
            {uploading
              ? uploadProgress || 'Uploading…'
              : busy
                ? 'Working…'
                : 'Loading gallery…'}
          </Text>
        </View>
      )}

      {galleryQuery.isError && (
        <View style={styles.centered}>
          <Text style={{ color: themeColors.destructive.DEFAULT }}>Unable to load gallery.</Text>
          <Button title="Retry" onPress={() => galleryQuery.refetch()} variant="outline" />
        </View>
      )}

      {!galleryQuery.isLoading && !galleryQuery.isError && filtered.length === 0 && (
        <View style={styles.centered}>
          <Text style={{ color: themeColors.text.secondary, textAlign: 'center' }}>
            No photos yet. Use Camera or Upload to add images to this inspection gallery.
          </Text>
        </View>
      )}

      {/* Plain flex grid — avoids VirtualizedList nested in FormScreen ScrollView */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {filtered.map((item) => {
          const isSelected = selected.has(item.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.tile,
                {
                  borderColor: isSelected ? themeColors.primary.DEFAULT : themeColors.border.DEFAULT,
                  backgroundColor: themeColors.card.DEFAULT,
                },
              ]}
              onPress={() => (canEdit ? toggleSelect(item.id) : undefined)}
              activeOpacity={0.85}
            >
              <RemoteImage uri={item.objectUrl} style={styles.tileImage} resizeMode="cover" />
              <View style={styles.tileBadge}>
                <Badge variant={item.assignments.length ? 'default' : 'secondary'} size="sm">
                  {badgeLabel(item)}
                </Badge>
              </View>
              {isSelected && (
                <View style={[styles.checkMark, { backgroundColor: themeColors.primary.DEFAULT }]}>
                  <Check size={14} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={assignOpen} transparent animationType="slide" onRequestClose={() => setAssignOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.card.DEFAULT }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Assign to field</Text>
            {destinationsQuery.isLoading && <ActivityIndicator color={themeColors.primary.DEFAULT} />}
            <ScrollView style={{ maxHeight: 360 }}>
              {destinations.map((dest) => (
                <TouchableOpacity
                  key={`${dest.sectionRef}-${dest.fieldKey}`}
                  style={[styles.destRow, { borderColor: themeColors.border.DEFAULT }]}
                  onPress={() => handleAssign(dest)}
                  disabled={busy}
                >
                  <Text style={{ color: themeColors.text.primary, fontWeight: '600' }}>
                    {dest.sectionLabel}
                  </Text>
                  <Text style={{ color: themeColors.text.secondary }}>{dest.fieldLabel}</Text>
                </TouchableOpacity>
              ))}
              {!destinationsQuery.isLoading && destinations.length === 0 && (
                <Text style={{ color: themeColors.text.secondary, textAlign: 'center', padding: spacing[4] }}>
                  No photo fields available in this template.
                </Text>
              )}
            </ScrollView>
            <Button title="Cancel" onPress={() => setAssignOpen(false)} variant="outline" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: spacing[4] },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  filterChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full || 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md || 8,
  },
  actionBtnText: { fontWeight: '600', fontSize: typography.fontSize.sm },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing[3],
    padding: spacing[2],
    borderRadius: borderRadius.md || 8,
    marginBottom: spacing[2],
  },
  selAction: { flexDirection: 'row', alignItems: 'center' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2] },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    paddingBottom: spacing[8],
  },
  tile: {
    width: '48%',
    flexGrow: 1,
    maxWidth: '48%',
    borderWidth: 2,
    borderRadius: borderRadius.md || 8,
    overflow: 'hidden',
  },
  tileImage: { width: '100%', aspectRatio: 1, backgroundColor: '#e2e8f0' },
  tileBadge: { padding: spacing[1] },
  checkMark: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing[4],
    gap: spacing[3],
    maxHeight: '80%',
  },
  modalTitle: { fontSize: typography.fontSize.lg, fontWeight: '700' },
  destRow: {
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
});
