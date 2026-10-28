import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import Card from '../ui/Card';
import Progress from '../ui/Progress';
import Badge from '../ui/Badge';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, spacing } from '../../theme';
import { maintenanceService } from '../../services/maintenance';
import { uploadLocalFile } from '../../services/objectUpload';
import { RemoteImage } from '../ui/RemoteImage';
import {
  computeCompletionChecklistProgress,
  isChecklistItemComplete,
  itemAllowsPhotoEvidence,
  itemRequiresPhotoEvidence,
  normalizeCompletionChecklistItems,
} from '../../../../shared/completionChecklist';

type Props = {
  workOrderId: string;
  readOnly?: boolean;
};

export function WorkOrderCompletionChecklistPanel({ workOrderId, readOnly = false }: Props) {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const queryClient = useQueryClient();
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});

  const queryKey = ['work-order-completion-checklist', workOrderId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => maintenanceService.getWorkOrderCompletionChecklist(workOrderId),
    enabled: !!workOrderId,
  });

  const upsertMutation = useMutation({
    mutationFn: (args: {
      itemId: string;
      valueJson?: unknown;
      photoUrls?: string[];
    }) =>
      maintenanceService.upsertWorkOrderChecklistItem(workOrderId, args.itemId, {
        valueJson: args.valueJson ?? null,
        photoUrls: args.photoUrls,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.message || 'Failed to save checklist step');
    },
  });

  const pickAndUpload = useCallback(
    async (itemId: string, existingUrls: string[]) => {
      if (readOnly) return;
      const choice = await new Promise<'camera' | 'library' | null>((resolve) => {
        Alert.alert('Add photo', 'Choose a source', [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          { text: 'Camera', onPress: () => resolve('camera') },
          { text: 'Library', onPress: () => resolve('library') },
        ]);
      });
      if (!choice) return;

      if (choice === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission needed', 'Camera access is required.');
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission needed', 'Photo library access is required.');
          return;
        }
      }

      const result =
        choice === 'camera'
          ? await ImagePicker.launchCameraAsync({
              quality: 0.8,
              allowsEditing: false,
            })
          : await ImagePicker.launchImageLibraryAsync({
              quality: 0.8,
              allowsMultipleSelection: false,
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
            });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setUploadingItemId(itemId);
      try {
        const uploaded = await uploadLocalFile(result.assets[0].uri, {
          mimeType: result.assets[0].mimeType || 'image/jpeg',
        });
        upsertMutation.mutate({
          itemId,
          photoUrls: [...existingUrls, uploaded],
        });
      } catch (err: any) {
        Alert.alert('Upload failed', err?.message || 'Could not upload photo');
      } finally {
        setUploadingItemId(null);
      }
    },
    [readOnly, upsertMutation],
  );

  if (isLoading) {
    return (
      <Card style={styles.card}>
        <ActivityIndicator color={themeColors.primary.DEFAULT} />
      </Card>
    );
  }

  const rawSnapshot = data?.snapshot;
  if (!rawSnapshot?.items?.length) return null;

  const items = normalizeCompletionChecklistItems(rawSnapshot.items as any);
  const snapshot = { ...rawSnapshot, items };
  const responses = data?.responses ?? [];
  const byItem = new Map(responses.map((r) => [r.itemId, r]));
  const progress =
    data?.progress ?? computeCompletionChecklistProgress(snapshot, responses);
  const pct = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

  return (
    <Card style={[styles.card, { borderColor: themeColors.border.DEFAULT }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: themeColors.text.primary }]}>
            {snapshot.name || 'Completion checklist'}
          </Text>
          <Text style={[styles.subtitle, { color: themeColors.text.secondary }]}>
            Required steps must be finished before marking this work order completed.
          </Text>
        </View>
        <Badge variant={progress.requiredIncomplete > 0 ? 'secondary' : 'default'}>
          {`${progress.completed}/${progress.total}`}
        </Badge>
      </View>
      <Progress value={pct} style={{ marginBottom: spacing[3] }} />

      {items.map((item) => {
        const response = byItem.get(item.id);
        const done = isChecklistItemComplete(item, response);
        const photos = response?.photoUrls || [];
        const showPhoto = itemAllowsPhotoEvidence(item);
        const photoRequired = itemRequiresPhotoEvidence(item) && item.type !== 'photo';

        return (
          <View
            key={item.id}
            style={[
              styles.item,
              {
                borderColor: themeColors.border.DEFAULT,
                backgroundColor: done ? 'rgba(34,197,94,0.08)' : themeColors.card.DEFAULT,
              },
            ]}
          >
            <View style={styles.itemHeader}>
              <Ionicons
                name={done ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={done ? '#16a34a' : themeColors.text.secondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemLabel, { color: themeColors.text.primary }]}>
                  {item.label}
                  {item.required ? ' *' : ''}
                  {photoRequired ? ' (photo required)' : ''}
                </Text>
                {!!item.helpText && (
                  <Text style={[styles.help, { color: themeColors.text.secondary }]}>
                    {item.helpText}
                  </Text>
                )}
              </View>
            </View>

            {item.type === 'checkbox' && (
              <TouchableOpacity
                disabled={readOnly || upsertMutation.isPending}
                onPress={() =>
                  upsertMutation.mutate({
                    itemId: item.id,
                    valueJson: response?.valueJson !== true,
                  })
                }
                style={styles.checkboxRow}
              >
                <Ionicons
                  name={response?.valueJson === true ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={themeColors.primary.DEFAULT}
                />
                <Text style={{ color: themeColors.text.primary, marginLeft: 8 }}>Done</Text>
              </TouchableOpacity>
            )}

            {item.type === 'text' && (
              <TextInput
                editable={!readOnly}
                value={
                  textDrafts[item.id] !== undefined
                    ? textDrafts[item.id]
                    : typeof response?.valueJson === 'string'
                      ? response.valueJson
                      : ''
                }
                onChangeText={(t) => setTextDrafts((prev) => ({ ...prev, [item.id]: t }))}
                onEndEditing={() => {
                  const next = textDrafts[item.id];
                  if (next === undefined) return;
                  const prev =
                    typeof response?.valueJson === 'string' ? response.valueJson : '';
                  if (next !== prev) {
                    upsertMutation.mutate({ itemId: item.id, valueJson: next });
                  }
                }}
                placeholder="Enter answer"
                placeholderTextColor={themeColors.text.secondary}
                style={[
                  styles.textInput,
                  {
                    color: themeColors.text.primary,
                    borderColor: themeColors.border.DEFAULT,
                    backgroundColor: themeColors.card.DEFAULT,
                  },
                ]}
              />
            )}

            {showPhoto && (
              <View style={styles.photoBlock}>
                {photoRequired ? (
                  <Text style={[styles.help, { color: themeColors.text.secondary, marginBottom: 6 }]}>
                    Photo evidence is required for this step.
                  </Text>
                ) : null}
                <View style={styles.photoRow}>
                  {photos.map((url) => (
                    <View key={url} style={styles.photoWrap}>
                      <RemoteImage uri={url} style={styles.photo} resizeMode="cover" />
                      {!readOnly && (
                        <TouchableOpacity
                          style={styles.photoRemove}
                          onPress={() =>
                            upsertMutation.mutate({
                              itemId: item.id,
                              photoUrls: photos.filter((u) => u !== url),
                            })
                          }
                        >
                          <Ionicons name="close-circle" size={20} color="#dc2626" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
                {!readOnly && (
                  <TouchableOpacity
                    onPress={() => void pickAndUpload(item.id, photos)}
                    style={[styles.addPhotoBtn, { borderColor: themeColors.border.DEFAULT }]}
                    disabled={uploadingItemId === item.id}
                  >
                    {uploadingItemId === item.id ? (
                      <ActivityIndicator size="small" color={themeColors.primary.DEFAULT} />
                    ) : (
                      <>
                        <Ionicons name="camera" size={18} color={themeColors.primary.DEFAULT} />
                        <Text style={{ color: themeColors.primary.DEFAULT, marginLeft: 6 }}>
                          {item.type === 'photo' ? 'Add photo' : 'Add photo evidence'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}
    </Card>
  );
}

export function useMobileWorkOrderCompletionChecklist(workOrderId: string | undefined) {
  return useQuery({
    queryKey: ['work-order-completion-checklist', workOrderId],
    queryFn: () => maintenanceService.getWorkOrderCompletionChecklist(workOrderId!),
    enabled: !!workOrderId,
  });
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing[4],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: spacing[2],
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  item: {
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing[3],
    marginBottom: spacing[2],
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  itemLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  help: {
    fontSize: 12,
    marginTop: 2,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[2],
    marginLeft: 26,
  },
  textInput: {
    marginTop: spacing[2],
    marginLeft: 26,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  photoBlock: {
    marginTop: spacing[2],
    marginLeft: 26,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoWrap: {
    position: 'relative',
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
  },
  addPhotoBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
