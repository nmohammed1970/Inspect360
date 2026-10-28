import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { X, Trash2 } from 'lucide-react-native';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import Button from '../ui/Button';
import {
  appendStagedPhoto,
  canCaptureMore,
  confirmLabel,
  newStagedId,
  removeStagedPhoto,
  shouldIgnoreShutter,
  stagedUris,
  type StagedPhoto,
  SHUTTER_DEBOUNCE_MS,
} from './multiPhotoSession';

type Props = {
  visible: boolean;
  maxPhotos: number;
  title?: string;
  onCancel: () => void;
  onConfirm: (uris: string[]) => void;
};

async function deleteUriBestEffort(uri: string) {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // ignore — temp cache cleanup is best-effort
  }
}

export function MultiPhotoCameraModal({
  visible,
  maxPhotos,
  title = 'Take Photos',
  onCancel,
  onConfirm,
}: Props) {
  const theme = useTheme();
  const themeColors = theme?.colors || colors;
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const lastShutterAt = useRef(0);
  const permissionAsked = useRef(false);

  const resetSession = useCallback(() => {
    setStaged([]);
    setCapturing(false);
    setCameraReady(false);
    setReviewOpen(false);
    lastShutterAt.current = 0;
  }, []);

  useEffect(() => {
    if (!visible) {
      resetSession();
      permissionAsked.current = false;
      return;
    }
    if (permission?.granted) return;
    if (permissionAsked.current) return;
    permissionAsked.current = true;
    (async () => {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          'Permission Required',
          'Camera access is required to take photos. Please grant permission in your device settings.',
          [{ text: 'OK', onPress: onCancel }],
        );
      }
    })();
  }, [visible, permission?.granted, requestPermission, onCancel, resetSession]);

  const discardAndClose = useCallback(async () => {
    const uris = stagedUris(staged);
    resetSession();
    onCancel();
    await Promise.all(uris.map(deleteUriBestEffort));
  }, [staged, resetSession, onCancel]);

  const handleCancel = () => {
    if (staged.length === 0) {
      discardAndClose();
      return;
    }
    Alert.alert(
      'Discard photos?',
      `You have ${staged.length} unsaved photo${staged.length === 1 ? '' : 's'}. Discard them?`,
      [
        { text: 'Keep Taking', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => { void discardAndClose(); } },
      ],
    );
  };

  const handleConfirm = () => {
    if (staged.length === 0) return;
    const uris = stagedUris(staged);
    resetSession();
    onConfirm(uris);
  };

  const handleShutter = async () => {
    const now = Date.now();
    if (
      shouldIgnoreShutter({
        capturing,
        lastShutterAt: lastShutterAt.current,
        now,
        debounceMs: SHUTTER_DEBOUNCE_MS,
      })
    ) {
      return;
    }
    if (!canCaptureMore(staged.length, maxPhotos)) {
      Alert.alert('Limit reached', `You can add at most ${maxPhotos} photo${maxPhotos === 1 ? '' : 's'} in this session.`);
      return;
    }
    if (!cameraReady || !cameraRef.current) {
      Alert.alert('Camera Not Ready', 'Please wait a moment and try again.');
      return;
    }

    lastShutterAt.current = now;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        exif: false,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        Alert.alert('Capture Failed', 'No photo was saved. Please try again.');
        return;
      }
      let accepted = false;
      setStaged((prev) => {
        const next = appendStagedPhoto(
          prev,
          { id: newStagedId(), uri: photo.uri },
          maxPhotos,
        );
        accepted = next.length > prev.length;
        return next;
      });
      if (!accepted) {
        await deleteUriBestEffort(photo.uri);
        Alert.alert('Limit reached', `You can add at most ${maxPhotos} photos.`);
      }
    } catch (e: any) {
      console.error('[MultiPhotoCamera] takePicture failed:', e);
      Alert.alert('Capture Failed', e?.message || 'Could not take photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

  const handleRemove = (id: string) => {
    const victim = staged.find((p) => p.id === id);
    setStaged((prev) => removeStagedPhoto(prev, id));
    if (victim) void deleteUriBestEffort(victim.uri);
  };

  const atCap = !canCaptureMore(staged.length, maxPhotos);
  const showCamera = visible && !!permission?.granted;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleCancel}
    >
      <View style={[styles.root, { backgroundColor: '#000' }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleCancel} style={styles.iconBtn} accessibilityLabel="Cancel">
            <X size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.counterPill}>
            <Text style={styles.counterText}>
              {staged.length}/{maxPhotos}
            </Text>
          </View>
        </View>

        <View style={styles.previewWrap}>
          {showCamera ? (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              mode="picture"
              onCameraReady={() => setCameraReady(true)}
            />
          ) : (
            <View style={styles.permissionPlaceholder}>
              {!permission ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.permissionText}>Camera permission is required.</Text>
              )}
            </View>
          )}

          {capturing && (
            <View style={styles.capturingOverlay} pointerEvents="none">
              <ActivityIndicator color="#fff" size="large" />
            </View>
          )}
        </View>

        {staged.length > 0 && (
          <ScrollView
            horizontal
            style={styles.thumbStrip}
            contentContainerStyle={styles.thumbStripContent}
            showsHorizontalScrollIndicator={false}
          >
            {staged.map((p) => (
              <View key={p.id} style={styles.thumbWrap}>
                <TouchableOpacity onPress={() => setReviewOpen(true)} activeOpacity={0.85}>
                  <Image source={{ uri: p.uri }} style={styles.thumb} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.thumbDelete}
                  onPress={() => handleRemove(p.id)}
                  accessibilityLabel="Remove photo"
                >
                  <Trash2 size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.bottomBar}>
          <TouchableOpacity
            onPress={() => staged.length > 0 && setReviewOpen(true)}
            style={styles.reviewBtn}
            disabled={staged.length === 0}
          >
            <Text style={[styles.reviewBtnText, staged.length === 0 && { opacity: 0.4 }]}>
              Review
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.shutter,
              (capturing || atCap || !cameraReady) && styles.shutterDisabled,
            ]}
            onPress={() => { void handleShutter(); }}
            disabled={capturing || atCap || !cameraReady}
            accessibilityLabel="Shutter"
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>

          <View style={styles.confirmSlot}>
            <Button
              title={confirmLabel(staged.length)}
              onPress={handleConfirm}
              disabled={staged.length === 0}
              size="sm"
            />
          </View>
        </View>

        <Modal visible={reviewOpen} animationType="slide" transparent onRequestClose={() => setReviewOpen(false)}>
          <View style={styles.reviewBackdrop}>
            <View style={[styles.reviewSheet, { backgroundColor: themeColors.card?.DEFAULT || colors.card?.DEFAULT || '#fff' }]}>
              <View style={styles.reviewHeader}>
                <Text style={[styles.reviewTitle, { color: themeColors.text?.primary || colors.text.primary }]}>
                  {staged.length} photo{staged.length === 1 ? '' : 's'}
                </Text>
                <TouchableOpacity onPress={() => setReviewOpen(false)}>
                  <Text style={{ color: themeColors.primary?.DEFAULT || colors.primary.DEFAULT, fontWeight: '600' }}>
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.reviewGrid}>
                {staged.map((p) => (
                  <View key={p.id} style={styles.reviewItem}>
                    <Image source={{ uri: p.uri }} style={styles.reviewImage} />
                    <TouchableOpacity
                      style={styles.reviewRemove}
                      onPress={() => handleRemove(p.id)}
                    >
                      <Trash2 size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
              <Text style={[styles.reviewHint, { color: themeColors.text?.secondary || colors.text.secondary }]}>
                Remove unwanted photos, then close to keep capturing or tap Add below.
              </Text>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: spacing[2],
  },
  iconBtn: {
    padding: spacing[2],
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
  },
  counterPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  counterText: {
    color: '#fff',
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  previewWrap: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  permissionPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  permissionText: {
    color: '#fff',
    textAlign: 'center',
  },
  capturingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbStrip: {
    maxHeight: 72,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  thumbStripContent: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: spacing[2],
    alignItems: 'center',
  },
  thumbWrap: {
    width: 56,
    height: 56,
    marginRight: spacing[2],
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: '#333',
  },
  thumbDelete: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.destructive?.DEFAULT || '#ef4444',
    borderRadius: borderRadius.full,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    paddingBottom: Platform.OS === 'ios' ? spacing[8] : spacing[4],
    backgroundColor: '#000',
  },
  reviewBtn: {
    width: 72,
  },
  reviewBtnText: {
    color: '#fff',
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: {
    opacity: 0.4,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  confirmSlot: {
    width: 120,
    alignItems: 'flex-end',
  },
  reviewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reviewSheet: {
    maxHeight: '70%',
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing[4],
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  reviewTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '600',
  },
  reviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  reviewItem: {
    width: '31%',
    aspectRatio: 1,
    position: 'relative',
  },
  reviewImage: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.md,
    backgroundColor: '#ddd',
  },
  reviewRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: borderRadius.full,
    padding: 6,
  },
  reviewHint: {
    marginTop: spacing[3],
    fontSize: typography.fontSize.sm,
  },
});

export default MultiPhotoCameraModal;
