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
import { Camera, ImagePlus, Trash2, Check, Calendar, User, CloudOff, AlertCircle } from 'lucide-react-native';
import {
  inspectionGalleryService,
  type GalleryImage,
  type PhotoDestination,
} from '../../services/inspectionGallery';
import { uploadLocalFile } from '../../services/objectUpload';
import { captureDeviceGps } from '../../services/captureDeviceGps';
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
import {
  listLocalGalleryImages,
  getLocalImageById,
  addToSyncQueue,
  updateLocalImageMeta,
  parseLocalImageMeta,
} from '../../services/offline/database';
import { storeGalleryImageLocally, deleteLocalImageFile } from '../../services/offline/storage';
import {
  mergeGalleryImages,
  isLocalGalleryImageId,
  localIdFromGalleryImageId,
  type MergedGalleryImage,
} from '../../services/offline/galleryOfflineHelpers';
import { getLocalGalleryDestinations } from '../../services/offline/galleryDestinations';
import { triggerSync } from '../../services/offline/backgroundSync';
import { MultiPhotoCameraModal } from '../camera/MultiPhotoCameraModal';
import { galleryCameraSessionMax } from '../camera/multiPhotoSession';

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
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [showMultiCamera, setShowMultiCamera] = useState(false);
  const [localTick, setLocalTick] = useState(0);

  const bumpLocal = useCallback(() => setLocalTick((t) => t + 1), []);

  const serverGalleryQuery = useQuery({
    queryKey: ['gallery', inspectionId],
    queryFn: () => inspectionGalleryService.list(inspectionId),
    enabled: !!inspectionId && isOnline,
    retry: false,
  });

  const localGalleryQuery = useQuery({
    queryKey: ['gallery-local', inspectionId, localTick],
    queryFn: () => listLocalGalleryImages(inspectionId),
    enabled: !!inspectionId,
  });

  const destinationsQuery = useQuery({
    queryKey: ['gallery-destinations', inspectionId, isOnline],
    queryFn: async () => {
      if (isOnline) {
        try {
          return await inspectionGalleryService.destinations(inspectionId);
        } catch {
          // fall through to local
        }
      }
      const destinations = await getLocalGalleryDestinations(inspectionId);
      return { destinations };
    },
    enabled: !!inspectionId && assignOpen,
  });

  const images: MergedGalleryImage[] = useMemo(() => {
    const server = serverGalleryQuery.data?.images || [];
    const local = localGalleryQuery.data || [];
    return mergeGalleryImages(server, local);
  }, [serverGalleryQuery.data?.images, localGalleryQuery.data]);

  const destinations = destinationsQuery.data?.destinations || [];

  const filtered = useMemo(() => {
    if (filter === 'unassigned') return images.filter((i) => i.assignments.length === 0);
    if (filter === 'assigned') return images.filter((i) => i.assignments.length > 0);
    return images;
  }, [images, filter]);

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['gallery', inspectionId] });
    await queryClient.invalidateQueries({ queryKey: ['gallery-local', inspectionId] });
    await queryClient.invalidateQueries({ queryKey: [`/api/inspections/${inspectionId}/entries`] });
    bumpLocal();
    onEntriesChanged?.();
  }, [inspectionId, onEntriesChanged, queryClient, bumpLocal]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
    setUploadProgress(`Saving 0/${uris.length}…`);
    try {
      let gps: { latitude: number; longitude: number } | null = null;
      try {
        gps = await captureDeviceGps();
      } catch {
        gps = null;
      }

      const stored: Array<{ localPath: string; id: string }> = [];
      for (let i = 0; i < uris.length; i++) {
        setUploadProgress(`Saving ${i + 1}/${uris.length}…`);
        const result = await storeGalleryImageLocally(uris[i], inspectionId, {
          fileName: `gallery_${Date.now()}_${i}.jpg`,
          mimeType: 'image/jpeg',
          captureLatitude: gps?.latitude ?? null,
          captureLongitude: gps?.longitude ?? null,
        });
        stored.push(result);
      }
      await invalidate();

      if (isOnline && stored.length) {
        setUploadProgress(`Uploading 0/${stored.length}…`);
        const registered: Array<{
          objectUrl: string;
          fileName?: string;
          mimeType?: string;
          captureLatitude?: number | null;
          captureLongitude?: number | null;
        }> = [];

        for (let i = 0; i < stored.length; i++) {
          setUploadProgress(`Uploading ${i + 1}/${stored.length}…`);
          const row = stored[i];
          try {
            const objectUrl = await uploadLocalFile(row.localPath, {
              mimeType: 'image/jpeg',
              objectId: row.id,
            });
            const meta = parseLocalImageMeta(
              (await getLocalImageById(row.id))?.metaJson,
            );
            registered.push({
              objectUrl,
              fileName: meta.fileName || `gallery_${row.id}.jpg`,
              mimeType: 'image/jpeg',
              captureLatitude: meta.captureLatitude ?? null,
              captureLongitude: meta.captureLongitude ?? null,
            });
            const { updateLocalImage } = await import('../../services/offline/database');
            await updateLocalImage(row.localPath, {
              serverUrl: objectUrl,
              syncStatus: 'pending',
            });
          } catch (e: any) {
            console.warn('[Gallery] Immediate upload failed, will sync later:', e?.message);
          }
        }

        if (registered.length) {
          setUploadProgress('Saving to gallery…');
          const { updateLocalImage } = await import('../../services/offline/database');
          for (let i = 0; i < registered.length; i += GALLERY_REGISTER_BATCH_MAX) {
            const chunk = registered.slice(i, i + GALLERY_REGISTER_BATCH_MAX);
            try {
              const result = await inspectionGalleryService.register(
                inspectionId,
                chunk,
                null,
                gps,
              );
              const byUrl = new Map((result.images || []).map((ri) => [ri.objectUrl, ri.id]));
              for (const s of stored) {
                const local = await getLocalImageById(s.id);
                if (!local?.serverUrl) continue;
                if (!chunk.some((c) => c.objectUrl === local.serverUrl)) continue;
                await updateLocalImage(s.localPath, {
                  serverUrl: local.serverUrl,
                  syncStatus: 'synced',
                });
                await updateLocalImageMeta(s.localPath, {
                  serverGalleryImageId: byUrl.get(local.serverUrl) || null,
                });
              }
            } catch (e: any) {
              console.warn('[Gallery] Register failed, queued for sync:', e?.message);
              await addToSyncQueue({
                operation: 'gallery_register',
                entityType: 'gallery',
                entityId: `${inspectionId}:batch:${Date.now()}`,
                data: JSON.stringify({
                  inspectionId,
                  images: chunk,
                  assign: null,
                }),
                retryCount: 0,
                lastError: e?.message || null,
              });
            }
          }
        } else {
          triggerSync().catch(() => {});
        }
        await invalidate();
      }
    } catch (e: any) {
      Alert.alert('Save Failed', e?.message || 'Could not save photos locally');
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

  const handleTakePhoto = () => {
    if (!canEdit) return;
    setShowMultiCamera(true);
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
      const ids = Array.from(selected);
      const localIds = ids.filter(isLocalGalleryImageId);
      const serverIds = ids.filter((id) => !isLocalGalleryImageId(id));

      for (const lid of localIds) {
        const realId = localIdFromGalleryImageId(lid);
        if (!realId) continue;
        const row = await getLocalImageById(realId);
        if (!row) continue;
        await updateLocalImageMeta(row.localPath, {
          pendingAssign: { sectionRef: dest.sectionRef, fieldKey: dest.fieldKey },
        });
        if (row.serverUrl) {
          await addToSyncQueue({
            operation: 'gallery_assign',
            entityType: 'gallery',
            entityId: `${inspectionId}:${row.serverUrl}:${dest.sectionRef}:${dest.fieldKey}`,
            data: JSON.stringify({
              inspectionId,
              objectUrls: [row.serverUrl],
              imageIds: [],
              sectionRef: dest.sectionRef,
              fieldKey: dest.fieldKey,
            }),
            retryCount: 0,
            lastError: null,
          });
        }
      }

      if (serverIds.length) {
        if (isOnline) {
          await inspectionGalleryService.assign(
            inspectionId,
            serverIds,
            dest.sectionRef,
            dest.fieldKey,
          );
        } else {
          await addToSyncQueue({
            operation: 'gallery_assign',
            entityType: 'gallery',
            entityId: `${inspectionId}:assign:${dest.sectionRef}:${dest.fieldKey}:${serverIds.join(',')}`,
            data: JSON.stringify({
              inspectionId,
              imageIds: serverIds,
              sectionRef: dest.sectionRef,
              fieldKey: dest.fieldKey,
            }),
            retryCount: 0,
            lastError: null,
          });
        }
      }

      setSelected(new Set());
      setAssignOpen(false);
      await invalidate();
      if (!isOnline) {
        Alert.alert('Saved offline', 'Assignment will sync when you reconnect.');
      }
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
              const ids = Array.from(selected);
              const localIds = ids.filter(isLocalGalleryImageId);
              const serverIds = ids.filter((id) => !isLocalGalleryImageId(id));

              for (const lid of localIds) {
                const realId = localIdFromGalleryImageId(lid);
                if (!realId) continue;
                const row = await getLocalImageById(realId);
                if (!row) continue;
                if (row.syncStatus !== 'synced' || !row.serverUrl) {
                  await deleteLocalImageFile(row.localPath);
                } else {
                  await updateLocalImageMeta(row.localPath, { deleted: true });
                  await addToSyncQueue({
                    operation: 'gallery_delete',
                    entityType: 'gallery',
                    entityId: `${inspectionId}:del:${row.serverUrl}`,
                    data: JSON.stringify({
                      inspectionId,
                      objectUrls: [row.serverUrl],
                      imageIds: [],
                    }),
                    retryCount: 0,
                    lastError: null,
                  });
                  await deleteLocalImageFile(row.localPath);
                }
              }

              if (serverIds.length) {
                if (isOnline) {
                  await inspectionGalleryService.delete(inspectionId, serverIds);
                } else {
                  await addToSyncQueue({
                    operation: 'gallery_delete',
                    entityType: 'gallery',
                    entityId: `${inspectionId}:del:${serverIds.join(',')}`,
                    data: JSON.stringify({
                      inspectionId,
                      imageIds: serverIds,
                    }),
                    retryCount: 0,
                    lastError: null,
                  });
                }
              }

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

  const badgeLabel = (image: GalleryImage | MergedGalleryImage) => {
    if (!image.assignments.length) return 'Not assigned';
    const first = image.assignments[0].label;
    const extra = image.assignments.length - 1;
    return extra > 0 ? `${first} (+${extra})` : first;
  };

  const formatGalleryDateTime = (iso: string | null | undefined) => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  };

  const syncBadge = (image: MergedGalleryImage) => {
    if (!image._local?.isLocalPending) return null;
    const status = image._local.syncBadge;
    if (status === 'failed') {
      return (
        <View style={[styles.syncChip, { backgroundColor: 'rgba(220,38,38,0.9)' }]}>
          <AlertCircle size={10} color="#fff" />
          <Text style={styles.syncChipText}>Failed</Text>
        </View>
      );
    }
    return (
      <View style={[styles.syncChip, { backgroundColor: 'rgba(15,23,42,0.75)' }]}>
        <CloudOff size={10} color="#fff" />
        <Text style={styles.syncChipText}>Pending</Text>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {!isOnline && (
        <View style={[styles.offlineBanner, { backgroundColor: themeColors.muted?.DEFAULT || '#f1f5f9' }]}>
          <CloudOff size={14} color={themeColors.warning || '#d97706'} />
          <Text style={{ color: themeColors.text.secondary, flex: 1, fontSize: 12, marginLeft: 6 }}>
            Offline — photos are saved on this device and will upload when you reconnect.
          </Text>
        </View>
      )}

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

      {(uploading || busy || (isOnline && serverGalleryQuery.isLoading && !localGalleryQuery.data?.length)) && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={themeColors.primary.DEFAULT} />
          <Text style={{ color: themeColors.text.secondary, marginLeft: 8 }}>
            {uploading
              ? uploadProgress || 'Saving…'
              : busy
                ? 'Working…'
                : 'Loading gallery…'}
          </Text>
        </View>
      )}

      {isOnline && serverGalleryQuery.isError && images.length === 0 && (
        <View style={styles.centered}>
          <Text style={{ color: themeColors.destructive.DEFAULT }}>Unable to load gallery.</Text>
          <Button title="Retry" onPress={() => serverGalleryQuery.refetch()} variant="outline" />
        </View>
      )}

      {!uploading && filtered.length === 0 && (
        <View style={styles.centered}>
          <Text style={{ color: themeColors.text.secondary, textAlign: 'center' }}>
            No photos yet. Use Camera or Upload to add images to this inspection gallery.
          </Text>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {filtered.map((item) => {
          const isSelected = selected.has(item.id);
          const capturedAtLabel = formatGalleryDateTime(item.createdAt);
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
              {syncBadge(item)}
              <View style={styles.tileBadge}>
                <Badge variant={item.assignments.length ? 'default' : 'secondary'} size="sm">
                  {badgeLabel(item)}
                </Badge>
                <View style={styles.metaBlock}>
                  {capturedAtLabel ? (
                    <View style={styles.metaRow}>
                      <Calendar size={11} color={themeColors.text.muted || themeColors.text.secondary} />
                      <Text style={[styles.metaText, { color: themeColors.text.secondary }]} numberOfLines={1}>
                        {capturedAtLabel}
                      </Text>
                    </View>
                  ) : null}
                  {item.inspectorName ? (
                    <View style={styles.metaRow}>
                      <User size={11} color={themeColors.text.muted || themeColors.text.secondary} />
                      <Text style={[styles.metaText, { color: themeColors.text.secondary }]} numberOfLines={1}>
                        {item.inspectorName}
                      </Text>
                    </View>
                  ) : null}
                </View>
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

      <MultiPhotoCameraModal
        visible={showMultiCamera}
        maxPhotos={galleryCameraSessionMax()}
        title="Gallery photos"
        onCancel={() => setShowMultiCamera(false)}
        onConfirm={(uris) => {
          setShowMultiCamera(false);
          void uploadUris(uris);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: spacing[4] },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[2],
    borderRadius: borderRadius.md || 8,
    marginBottom: spacing[2],
  },
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
  tileBadge: { padding: spacing[1], gap: 4 },
  metaBlock: { gap: 2, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  metaText: { flex: 1, fontSize: 10, lineHeight: 13 },
  syncChip: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    zIndex: 2,
  },
  syncChipText: { color: '#fff', fontSize: 10, fontWeight: '600' },
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
