import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Image,
    Dimensions,
    Alert,
    ImageStyle,
    Linking,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import {
    ChevronLeft,
    Calendar,
    MapPin,
    User as UserIcon,
    FileText,
    Camera,
    Printer,
    Share2,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
    Wrench,
    X,
    GitCompare,
    Mic,
    Square,
    Play,
    Sparkles,
    Trash2,
} from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { requestRecordingPermissionsAsync, RecordingPresets, AudioQuality, createAudioPlayer, AudioModule, setAudioModeAsync } from 'expo-audio';
import { format } from 'date-fns';
import { inspectionsService } from '../../services/inspections';
import { inspectionsOffline } from '../../services/offline/inspectionsOffline';
import { getAPI_URL } from '../../services/api';
import type { InspectionsStackParamList } from '../../navigation/types';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { getImageSource, isLocalPath } from '../../services/offline/storage';

const { width } = Dimensions.get('window');

// On iOS, HIGH_QUALITY produces large M4A files that can exceed the 25MB transcription limit.
// Use a smaller preset on iOS only (mono, 22kHz, 64kbps, MIN quality) so upload/transcribe succeed.
// Android keeps HIGH_QUALITY (no server-side conversion, files stay manageable).
const VOICE_RECORDING_PRESET = Platform.OS === 'ios'
  ? {
      ...RecordingPresets.HIGH_QUALITY,
      sampleRate: 22050,
      numberOfChannels: 1,
      bitRate: 64000,
      ios: {
        ...RecordingPresets.HIGH_QUALITY.ios,
        audioQuality: AudioQuality.MIN,
      },
    }
  : RecordingPresets.HIGH_QUALITY;

function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0, b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    out += chars[a >> 2] + chars[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < bytes.length ? chars[c & 63] : '=');
  }
  return out;
}

const InspectionReportScreen = () => {
    const route = useRoute<RouteProp<InspectionsStackParamList, 'InspectionReport'>>();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };

    // Get theme colors with fallback - hooks must be called unconditionally
    const theme = useTheme();
    // Ensure themeColors is always defined - use default colors if theme not available
    const themeColors = (theme && theme.colors) ? theme.colors : colors;

    const { inspectionId } = route.params;
    const { user } = useAuth();
    const isOnline = useOnlineStatus();
    const [expandedPhotos, setExpandedPhotos] = useState<Record<string, boolean>>({});
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    // ---- Voice recording state (per-entry key) - supports multiple recordings ----
    type VoiceState = {
        isRecording: boolean;
        recordingTime: number;
        isTranscribing: boolean;
        transcribingUrl: string | null;
        isUploadingAudio: boolean;
        isPlayingAudio: boolean;
        playingUrl: string | null;
        loadingPlayUrl: string | null;
        audioUrls: string[];
    };
    const [voiceStates, setVoiceStates] = useState<Record<string, VoiceState>>({});
    const recordingRefs = useRef<Record<string, any>>({});
    const soundRefs = useRef<Record<string, any>>({});
    const timerRefs = useRef<Record<string, ReturnType<typeof setInterval> | null>>({});
    const playbackStatusIntervals = useRef<Record<string, ReturnType<typeof setInterval> | null>>({});

    const getVoiceState = useCallback((key: string): VoiceState => {
        return voiceStates[key] || {
            isRecording: false, recordingTime: 0,
            isTranscribing: false, transcribingUrl: null, isUploadingAudio: false, isPlayingAudio: false, playingUrl: null, loadingPlayUrl: null,
            audioUrls: [],
        };
    }, [voiceStates]);

    const setVoiceField = useCallback((key: string, patch: Partial<VoiceState>) => {
        setVoiceStates(prev => ({ ...prev, [key]: { ...(prev[key] || { isRecording: false, recordingTime: 0, isTranscribing: false, transcribingUrl: null, isUploadingAudio: false, isPlayingAudio: false, playingUrl: null, loadingPlayUrl: null, audioUrls: [] }), ...patch } }));
    }, []);

    const getEntryAudioUrls = useCallback((entry: any): string[] => {
        const vj = entry?.valueJson;
        if (vj && typeof vj === 'object' && !Array.isArray(vj)) {
            if (Array.isArray((vj as any).audioUrls)) return (vj as any).audioUrls;
            if ((vj as any).audioUrl) return [(vj as any).audioUrl];
        }
        return [];
    }, []);

    const startRecording = useCallback(async (key: string, existingAudioUrls: string[]) => {
        try {
            const { status } = await requestRecordingPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permission Required', 'Microphone access is needed to record audio.'); return; }
            await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
            const recorder = new AudioModule.AudioRecorder(VOICE_RECORDING_PRESET);
            await recorder.prepareToRecordAsync();
            recorder.record();
            recordingRefs.current[key] = recorder;
            setVoiceField(key, { isRecording: true, recordingTime: 0, audioUrls: existingAudioUrls });
            timerRefs.current[key] = setInterval(() => {
                setVoiceStates(prev => ({
                    ...prev,
                    [key]: { ...(prev[key] || { isRecording: false, recordingTime: 0, isTranscribing: false, transcribingUrl: null, isUploadingAudio: false, isPlayingAudio: false, audioUrls: [] }), recordingTime: ((prev[key]?.recordingTime) || 0) + 1 }
                }));
            }, 1000);
        } catch (e: any) {
            Alert.alert('Recording Failed', e.message || 'Could not start recording.');
        }
    }, [setVoiceField]);

    const stopRecording = useCallback(async (key: string, entryId: string, existingNote: string, existingValueJson: any, currentAudioUrls: string[]) => {
        const recording = recordingRefs.current[key];
        if (!recording) return;
        if (timerRefs.current[key]) { clearInterval(timerRefs.current[key]!); timerRefs.current[key] = null; }
        await recording.stop();
        const uri = recording.uri;
        recordingRefs.current[key] = null;
        setVoiceField(key, { isRecording: false, isPlayingAudio: false });

        if (uri) {
            setVoiceField(key, { isUploadingAudio: true });
            try {
                const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;
                const fileBase64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
                const uploadResp = await fetch(`${getAPI_URL()}/api/objects/upload-audio-base64`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ fileBase64, fileName: 'voice-note.m4a', mimeType: 'audio/mp4' }),
                });
                if (!uploadResp.ok) throw new Error('Upload failed');
                const text = await uploadResp.text();
                let uploadResult: any;
                try {
                  uploadResult = text ? JSON.parse(text) : {};
                } catch {
                  throw new Error(text.startsWith('<') ? 'Server returned an error page. Restart the server and try again.' : 'Invalid server response');
                }
                const uploadedUrl = uploadResult?.url || uploadResult?.objectId;
                if (!uploadedUrl) throw new Error('No URL returned');
                const newUrls = [...currentAudioUrls, uploadedUrl];
                setVoiceField(key, { audioUrls: newUrls, isUploadingAudio: false });
                await saveEntryVoiceDataMobile(entryId, existingNote, newUrls, existingValueJson);
            } catch (e: any) {
                Alert.alert('Upload Failed', e.message || 'Could not save voice note.');
                setVoiceField(key, { isUploadingAudio: false });
            }
        }
    }, [setVoiceField]);

    const transcribeAudio = useCallback(async (key: string, audioUrl: string, entryId: string, existingNote: string, existingValueJson: any, currentAudioUrls: string[]) => {
        setVoiceField(key, { isTranscribing: true, transcribingUrl: audioUrl });
        try {
            const apiUrl = getAPI_URL();
            const audioUrlToFetch = audioUrl.startsWith('http')
                ? audioUrl
                : audioUrl.startsWith('/')
                    ? `${apiUrl}${audioUrl}`
                    : `${apiUrl}/${audioUrl}`;
            // Prefer fetch with credentials so server sends real M4A (not 401 HTML); fallback to FileSystem for iOS
            let audioBase64: string;
            try {
                const res = await fetch(audioUrlToFetch, { credentials: 'include' });
                if (!res.ok) throw new Error(`Download failed: ${res.status}`);
                const arrayBuffer = await res.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                const chunkSize = 8192;
                let binary = '';
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
                    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
                }
                audioBase64 = typeof btoa === 'function' ? btoa(binary) : (() => {
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                    let out = '';
                    for (let i = 0; i < bytes.length; i += 3) {
                        const a = bytes[i] ?? 0, b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
                        out += chars[a >> 2] + chars[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < bytes.length ? chars[c & 63] : '=');
                    }
                    return out;
                })();
            } catch (fetchErr) {
                const tempPath = FileSystem.documentDirectory + `temp-audio-transcribe-${Date.now()}.m4a`;
                const dl = await FileSystem.downloadAsync(audioUrlToFetch, tempPath);
                if (!dl.uri) throw new Error('Download failed');
                const fileUri = dl.uri.startsWith('file://') ? dl.uri : `file://${dl.uri}`;
                audioBase64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
            }
            const resp = await fetch(`${apiUrl}/api/audio/transcribe-base64`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ audioBase64, fileName: 'recording.m4a' }),
            });
            const text = await resp.text();
            let result: any;
            try { result = JSON.parse(text); } catch {
                throw new Error(text.startsWith('<') ? 'Server returned an error page. Please try again or check your connection.' : 'Transcription failed');
            }
            if (!resp.ok) throw new Error(result?.error || result?.message || 'Transcription failed');
            if (result.text) {
                const prefix = 'Inspector Comments: ' + result.text;
                const newNote = existingNote ? `${existingNote}\n\n${prefix}` : prefix;
                await saveEntryVoiceDataMobile(entryId, newNote, currentAudioUrls, existingValueJson);
                Alert.alert('Transcription Complete', 'Voice note converted to text and added to notes.');
            } else { throw new Error('No transcription text received'); }
        } catch (e: any) {
            Alert.alert('Transcription Failed', e.message || 'Could not transcribe audio.');
        } finally {
            setVoiceField(key, { isTranscribing: false, transcribingUrl: null });
        }
    }, [setVoiceField]);

    const playAudio = useCallback(async (key: string, audioUrl: string) => {
        const existing = soundRefs.current[key];
        if (existing && existing.playing && voiceStates[key]?.playingUrl === audioUrl) {
            existing.pause();
            setVoiceField(key, { isPlayingAudio: false, playingUrl: null });
            if (playbackStatusIntervals.current[key]) {
                clearInterval(playbackStatusIntervals.current[key]!);
                playbackStatusIntervals.current[key] = null;
            }
            return;
        }
        // Stop any other playing sound (any entry) so only one plays at a time
        const allKeys = Object.keys(soundRefs.current);
        for (const k of allKeys) {
            const s = soundRefs.current[k];
            if (s) {
                try { s.remove(); } catch { }
                soundRefs.current[k] = null;
            }
            if (playbackStatusIntervals.current[k]) {
                clearInterval(playbackStatusIntervals.current[k]!);
                playbackStatusIntervals.current[k] = null;
            }
        }
        setVoiceStates(prev => {
            const next = { ...prev };
            for (const k of Object.keys(next)) {
                next[k] = { ...(next[k] || {}), isPlayingAudio: false, playingUrl: null, loadingPlayUrl: null };
            }
            next[key] = { ...(next[key] || {}), loadingPlayUrl: audioUrl };
            return next;
        });
        try {
            await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
            let resolvedAudioUri = audioUrl;
            if (!audioUrl.startsWith('http://') && !audioUrl.startsWith('https://')) {
                const apiUrl = getAPI_URL();
                resolvedAudioUri = audioUrl.startsWith('/') ? `${apiUrl}${audioUrl}` : `${apiUrl}/${audioUrl}`;
            }
            // On iOS, AVPlayer does not send cookies for remote URLs, so authenticated audio fails.
            // Download to a temp file with credentials, then play from local URI.
            if (Platform.OS === 'ios' && (resolvedAudioUri.startsWith('http://') || resolvedAudioUri.startsWith('https://'))) {
                const res = await fetch(resolvedAudioUri, { credentials: 'include' });
                if (!res.ok) throw new Error(`Download failed: ${res.status}`);
                const arrayBuffer = await res.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                let binary = '';
                const chunkSize = 8192;
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
                    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
                }
                const base64 = typeof btoa === 'function' ? btoa(binary) : bytesToBase64(bytes);
                const tempPath = FileSystem.documentDirectory + `voice-play-${Date.now()}.m4a`;
                await FileSystem.writeAsStringAsync(tempPath, base64, { encoding: 'base64' as any });
                resolvedAudioUri = tempPath.startsWith('file://') ? tempPath : `file://${tempPath}`;
            }
            const sound = createAudioPlayer({ uri: resolvedAudioUri });
            soundRefs.current[key] = sound;
            sound.play();
            setVoiceField(key, { isPlayingAudio: true, playingUrl: audioUrl, loadingPlayUrl: null });
            const checkStatus = setInterval(() => {
                try {
                    if (sound.currentStatus.didJustFinish) {
                        setVoiceField(key, { isPlayingAudio: false, playingUrl: null });
                        sound.remove();
                        soundRefs.current[key] = null;
                        clearInterval(checkStatus);
                        playbackStatusIntervals.current[key] = null;
                    }
                } catch (err) {
                    clearInterval(checkStatus);
                    playbackStatusIntervals.current[key] = null;
                }
            }, 100);
            playbackStatusIntervals.current[key] = checkStatus;
        } catch (e: any) {
            console.error('[InspectionReport] Error playing audio:', e, { audioUrl });
            Alert.alert('Playback Failed', `Could not play audio: ${e.message || 'Unknown error'}`);
            setVoiceField(key, { isPlayingAudio: false, playingUrl: null, loadingPlayUrl: null });
        }
    }, [setVoiceField, voiceStates]);

    const cancelRecording = useCallback(async (key: string, currentAudioUrls: string[]) => {
        const recording = recordingRefs.current[key];
        if (recording) {
            try { await recording.stop(); } catch { }
            recordingRefs.current[key] = null;
        }
        if (timerRefs.current[key]) { clearInterval(timerRefs.current[key]!); timerRefs.current[key] = null; }
        setVoiceField(key, { isRecording: false, recordingTime: 0, audioUrls: currentAudioUrls, isPlayingAudio: false });
    }, [setVoiceField]);

    const removeAudioUrl = useCallback(async (key: string, urlToRemove: string, entryId: string, existingNote: string, existingValueJson: any, currentAudioUrls: string[], currentPlayingUrl: string | null) => {
        const newUrls = currentAudioUrls.filter(u => u !== urlToRemove);
        setVoiceField(key, { audioUrls: newUrls });
        if (soundRefs.current[key] && currentPlayingUrl === urlToRemove) {
            try { soundRefs.current[key]?.remove(); } catch { }
            soundRefs.current[key] = null;
            setVoiceField(key, { isPlayingAudio: false, playingUrl: null });
        }
        await saveEntryVoiceDataMobile(entryId, existingNote, newUrls, existingValueJson);
    }, [setVoiceField]);

    const saveEntryVoiceDataMobile = async (entryId: string, note: string, audioUrls: string[], existingValueJson: any) => {
        let newValueJson = existingValueJson && typeof existingValueJson === 'object' && !Array.isArray(existingValueJson)
            ? { ...existingValueJson }
            : { value: existingValueJson ?? null };
        if (audioUrls.length > 0) {
            newValueJson.audioUrls = audioUrls;
            newValueJson.audioUrl = audioUrls[0];
        } else {
            delete newValueJson.audioUrls;
            delete newValueJson.audioUrl;
        }
        await fetch(`${getAPI_URL()}/api/inspection-entries/${entryId}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note, valueJson: newValueJson }),
        });
    };

    const { data: inspection, isLoading: isInspectionLoading } = useQuery({
        queryKey: [`/api/inspections/${inspectionId}`, user?.id],
        queryFn: async () => {
            try {
                // Use offline service to support offline access
                const result = await inspectionsOffline.getInspection(inspectionId, isOnline);
                if (!result) {
                    Alert.alert('Inspection not found', 'This inspection is not available.');
                    navigation.goBack();
                    return null as any;
                }
                return result;
            } catch (error: any) {
                // If server says "not found", show error message
                if (error?.status === 404 || String(error?.message || '').toLowerCase().includes('not found')) {
                    Alert.alert('Inspection not found', 'This inspection is not available for your account.');
                    navigation.goBack();
                    return null as any;
                }
                throw error;
            }
        },
        enabled: !!inspectionId,
    });

    const { data: entries = [], isLoading: isEntriesLoading } = useQuery({
        queryKey: [`/api/inspections/${inspectionId}/entries`],
        queryFn: async () => {
            // Use offline service to support offline access
            return await inspectionsOffline.getInspectionEntries(inspectionId, isOnline);
        },
        enabled: !!inspectionId,
    });

    const togglePhotoExpansion = (key: string) => {
        setExpandedPhotos(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleSection = (sectionId: string) => {
        setExpandedSections(prev => ({
            ...prev,
            [sectionId]: !prev[sectionId]
        }));
    };


    const handlePrint = async () => {
        if (!inspection) return;

        setIsGeneratingPDF(true);
        try {
            Alert.alert('Generating PDF', 'Please wait while we create your inspection report...');

            const response = await fetch(`${getAPI_URL()}/api/inspections/${inspectionId}/pdf`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/pdf',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to generate PDF');
            }

            // Get response as arrayBuffer and convert to base64
            const arrayBuffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // Convert Uint8Array to base64 string (React Native compatible)
            // Manual base64 encoding for React Native
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

            // Save to file system
            const propertyName = (inspection.property?.name || inspection.block?.name || 'inspection').replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${propertyName}_report_${new Date().toISOString().split('T')[0]}.pdf`;
            const fileUri = `${FileSystem.documentDirectory}${fileName}`;

            // Use encoding as string literal (FileSystem.EncodingType might not be available)
            await FileSystem.writeAsStringAsync(fileUri, base64, {
                encoding: 'base64' as any,
            });

            // Share the file
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'application/pdf',
                    dialogTitle: 'Save Inspection PDF',
                });
                // PDF sharing dialog will handle user notification
            } else {
                // PDF saved silently without alert
            }
        } catch (error: any) {
            console.error('Error generating PDF:', error);
            Alert.alert('Error', error.message || 'Failed to generate PDF report. Please try again.');
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    const handleOpenMap = async () => {
        if (!propertyOrBlock?.address) {
            Alert.alert('No Address', 'Address is not available for this property.');
            return;
        }

        const address = propertyOrBlock.address;
        // Encode the address for URL
        const encodedAddress = encodeURIComponent(address);

        // Try to open in Google Maps app first, fallback to web
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

        try {
            const canOpen = await Linking.canOpenURL(googleMapsUrl);
            if (canOpen) {
                await Linking.openURL(googleMapsUrl);
            } else {
                Alert.alert('Error', 'Unable to open Google Maps. Please install Google Maps app.');
            }
        } catch (error) {
            console.error('Error opening map:', error);
            Alert.alert('Error', 'Failed to open Google Maps. Please try again.');
        }
    };

    // Helper functions for condition/cleanliness
    const getConditionColor = (condition: string | number | null | undefined): string => {
        if (condition === null || condition === undefined) return '#9ca3af';

        if (typeof condition === 'number') {
            if (condition >= 4) return '#22c55e'; // green
            if (condition === 3) return '#eab308'; // yellow
            if (condition === 2) return '#fbbf24'; // lighter amber-400
            if (condition <= 1) return '#ef4444'; // red
        }

        const conditionStr = String(condition).toLowerCase();
        if (conditionStr === 'new' || conditionStr === 'excellent' || conditionStr === '5') return '#22c55e';
        if (conditionStr === 'good' || conditionStr === '4') return '#22c55e';
        if (conditionStr === 'fair' || conditionStr === '3') return '#eab308';
        if (conditionStr === 'poor' || conditionStr === '2') return '#fbbf24'; // lighter amber-400
        if (conditionStr === 'very poor' || conditionStr === '1') return '#ef4444';
        if (conditionStr === 'missing' || conditionStr === '0') return '#dc2626';
        return '#9ca3af';
    };

    const getCleanlinessColor = (cleanliness: string | number | null | undefined): string => {
        if (cleanliness === null || cleanliness === undefined) return '#9ca3af';

        if (typeof cleanliness === 'number') {
            if (cleanliness >= 4) return '#22c55e';
            if (cleanliness === 3) return '#eab308';
            if (cleanliness === 2) return '#fbbf24'; // lighter amber-400
            if (cleanliness <= 1) return '#ef4444';
        }

        const cleanlinessStr = String(cleanliness).toLowerCase();
        if (cleanlinessStr === 'excellent' || cleanlinessStr === '5') return '#22c55e';
        if (cleanlinessStr === 'good' || cleanlinessStr === '4') return '#22c55e';
        if (cleanlinessStr === 'fair' || cleanlinessStr === '3') return '#eab308';
        if (cleanlinessStr === 'poor' || cleanlinessStr === '2') return '#fbbf24'; // lighter amber-400
        if (cleanlinessStr === 'very poor' || cleanlinessStr === '1') return '#ef4444';
        return '#9ca3af';
    };

    const formatCondition = (condition: string | number | null | undefined): string => {
        if (condition === null || condition === undefined) return '';
        if (typeof condition === 'number') {
            const mapping: Record<number, string> = {
                5: 'Excellent',
                4: 'Good',
                3: 'Fair',
                2: 'Poor',
                1: 'Very Poor',
            };
            return mapping[condition] || String(condition);
        }
        return String(condition);
    };

    const formatCleanliness = (cleanliness: string | number | null | undefined): string => {
        if (cleanliness === null || cleanliness === undefined) return '';
        if (typeof cleanliness === 'number') {
            const mapping: Record<number, string> = {
                5: 'Excellent',
                4: 'Good',
                3: 'Fair',
                2: 'Poor',
                1: 'Very Poor',
            };
            return mapping[cleanliness] || String(cleanliness);
        }
        return String(cleanliness);
    };

    const getConditionScore = (condition: string | number | null | undefined): number | null => {
        if (condition === null || condition === undefined) return null;
        if (typeof condition === 'number') {
            return condition >= 1 && condition <= 5 ? condition : null;
        }
        const conditionStr = String(condition).toLowerCase();
        if (conditionStr === 'new' || conditionStr === 'excellent' || conditionStr === '5') return 5;
        if (conditionStr === 'good' || conditionStr === '4') return 4;
        if (conditionStr === 'fair' || conditionStr === '3') return 3;
        if (conditionStr === 'poor' || conditionStr === '2') return 2;
        if (conditionStr === 'very poor' || conditionStr === '1') return 1;
        return null;
    };

    const getCleanlinessScore = (cleanliness: string | number | null | undefined): number | null => {
        if (cleanliness === null || cleanliness === undefined) return null;
        if (typeof cleanliness === 'number') {
            return cleanliness >= 1 && cleanliness <= 5 ? cleanliness : null;
        }
        const cleanlinessStr = String(cleanliness).toLowerCase();
        if (cleanlinessStr === 'excellent' || cleanlinessStr === '5') return 5;
        if (cleanlinessStr === 'good' || cleanlinessStr === '4') return 4;
        if (cleanlinessStr === 'fair' || cleanlinessStr === '3') return 3;
        if (cleanlinessStr === 'poor' || cleanlinessStr === '2') return 2;
        if (cleanlinessStr === 'very poor' || cleanlinessStr === '1') return 1;
        return null;
    };

    const getEntryValue = (sectionId: string, fieldKey: string, instanceName?: string) => {
        // For repeatable sections, sectionRef includes instance (e.g., "Bedrooms/Bedroom 1")
        const sectionRef = instanceName ? `${sectionId}/${instanceName}` : sectionId;
        return entries.find((e: any) => e.sectionRef === sectionRef && (e.fieldKey === fieldKey || e.fieldKey === fieldKey));
    };

    // Get all instances for a repeatable section
    const getRepeatableInstances = (sectionId: string): string[] => {
        const instanceSet = new Set<string>();
        entries.forEach((entry: any) => {
            if (entry.sectionRef && entry.sectionRef.startsWith(`${sectionId}/`)) {
                const instanceName = entry.sectionRef.split('/')[1];
                if (instanceName) {
                    instanceSet.add(instanceName);
                }
            }
        });
        // Sort instances by number (e.g., "Bedroom 1", "Bedroom 2", ...)
        return Array.from(instanceSet).sort((a, b) => {
            const numA = parseInt(a.match(/\d+$/)?.[0] || '0', 10);
            const numB = parseInt(b.match(/\d+$/)?.[0] || '0', 10);
            return numA - numB;
        });
    };

    if (isInspectionLoading || isEntriesLoading) {
        return <LoadingSpinner />;
    }

    if (!inspection) {
        return (
            <View style={[styles.errorContainer, { backgroundColor: themeColors.background }]}>
                <AlertTriangle size={48} color={themeColors.destructive.DEFAULT} />
                <Text style={[styles.errorText, { color: themeColors.text.primary }]}>Inspection not found</Text>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={[styles.backButtonText, { color: themeColors.primary.DEFAULT }]}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const sections = (inspection.templateSnapshotJson as any)?.sections || [];
    const propertyOrBlock = inspection.property || inspection.block;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
            {/* Header */}
            <View style={[
                styles.header,
                {
                    paddingTop: 0,
                    backgroundColor: themeColors.card.DEFAULT,
                    borderBottomColor: themeColors.border.DEFAULT,
                },
            ]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
                    <ChevronLeft size={24} color={themeColors.text.primary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: themeColors.text.primary }]}>Inspection Report</Text>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        onPress={handlePrint}
                        style={[styles.iconButton, isGeneratingPDF && styles.iconButtonDisabled]}
                        disabled={isGeneratingPDF}
                    >
                        <Share2 size={24} color={isGeneratingPDF ? themeColors.text.muted : themeColors.primary.DEFAULT} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    {
                        paddingTop: spacing[4],
                        paddingBottom: Math.max(insets.bottom + 80, spacing[8])
                    }
                ]}
            >
                {/* Summary Card */}
                <Card style={styles.summaryCard}>
                    <View style={styles.summaryHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.propertyName, { color: themeColors.text.primary }]}>{propertyOrBlock?.name || 'Unknown Property'}</Text>
                            <View style={styles.addressRow}>
                                <MapPin size={14} color={themeColors.text.secondary} />
                                <Text style={[styles.addressText, { color: themeColors.text.secondary }]} numberOfLines={2}>
                                    {propertyOrBlock?.address || 'No address'}
                                </Text>
                            </View>
                        </View>
                        <Badge variant={inspection.status === 'completed' ? 'success' : inspection.status === 'in_progress' ? 'warning' : 'primary'}>
                            {inspection.status.toUpperCase().replace('_', ' ')}
                        </Badge>
                    </View>

                    <View style={[styles.divider, { backgroundColor: themeColors.border.light }]} />

                    <View style={styles.infoGrid}>
                        <View style={styles.infoItem}>
                            <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>Property Address</Text>
                            <View style={styles.infoValueRow}>
                                <MapPin size={16} color={themeColors.primary.DEFAULT} />
                                <Text style={[styles.infoValue, { color: themeColors.text.primary, flex: 1 }]} numberOfLines={2}>
                                    {propertyOrBlock?.address || 'No address'}
                                </Text>
                                {propertyOrBlock?.address && (
                                    <TouchableOpacity
                                        onPress={handleOpenMap}
                                        style={[styles.mapButton, { backgroundColor: themeColors.primary.DEFAULT }]}
                                    >
                                        <Text style={[styles.mapButtonText, { color: themeColors.primary.foreground || '#ffffff' }]}>Map</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                        <View style={styles.infoItem}>
                            <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>Inspector</Text>
                            <View style={styles.infoValueRow}>
                                <UserIcon size={16} color={themeColors.primary.DEFAULT} />
                                <Text style={[styles.infoValue, { color: themeColors.text.primary }]} numberOfLines={1}>
                                    {inspection.clerk?.email || 'Unknown Inspector'}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.infoItem}>
                            <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>Inspection Type</Text>
                            <View style={styles.infoValueRow}>
                                <FileText size={16} color={themeColors.primary.DEFAULT} />
                                <Text style={[styles.infoValue, { color: themeColors.text.primary }]}>
                                    {inspection.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.infoItem}>
                            <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>Inspection Date</Text>
                            <View style={styles.infoValueRow}>
                                <Calendar size={16} color={themeColors.primary.DEFAULT} />
                                <Text style={[styles.infoValue, { color: themeColors.text.primary }]}>
                                    {inspection.completedDate
                                        ? format(new Date(inspection.completedDate), 'MMMM dd, yyyy')
                                        : inspection.scheduledDate
                                            ? format(new Date(inspection.scheduledDate), 'MMMM dd, yyyy')
                                            : 'Not scheduled'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {inspection.notes && (
                        <View style={styles.notesContainer}>
                            <Text style={[styles.infoLabel, { color: themeColors.text.secondary }]}>General Notes</Text>
                            <Text style={[styles.generalNotes, { color: themeColors.text.primary }]}>{inspection.notes}</Text>
                        </View>
                    )}
                </Card>

                {/* Glossary of Terms */}
                <Card style={styles.glossaryCard}>
                    <View style={styles.cardHeader}>
                        <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Glossary of Terms</Text>
                        <Text style={[styles.cardDescription, { color: themeColors.text.secondary }]}>For guidance, please find a glossary of terms used within this report</Text>
                    </View>

                    <View style={styles.glossaryGrid}>
                        {/* Condition Column */}
                        <View style={styles.glossaryColumn}>
                            <Text style={[styles.glossarySectionTitle, { color: themeColors.text.primary, borderBottomColor: themeColors.border.light }]}>Condition</Text>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Very Poor:</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Extensively damaged/faulty. Examples: large stains; upholstery torn; very dirty.</Text>
                            </View>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Poor:</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Extensive signs of wear and tear. Examples: stains/marks/tears/chips.</Text>
                            </View>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Fair:</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Signs of age. Examples: frayed; small light stains/marks; discolouration.</Text>
                            </View>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Good:</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Signs of slight wear. Examples: generally lightly worn.</Text>
                            </View>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Excellent:</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Like new condition with minimal to no signs of wear.</Text>
                            </View>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>New:</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Still in wrapper or with new tags/labels attached. Recently purchased, installed or decorated.</Text>
                            </View>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Missing:</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Item is not present or cannot be located in the property.</Text>
                            </View>
                        </View>

                        {/* Cleanliness Column */}
                        <View style={styles.glossaryColumn}>
                            <Text style={[styles.glossarySectionTitle, { color: themeColors.text.primary, borderBottomColor: themeColors.border.light }]}>Cleanliness</Text>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Very Poor:</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Not cleaned. Requires cleaning to a good or excellent standard.</Text>
                            </View>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Poor:</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Item dusty or dirty. Requires further cleaning to either good or excellent standard.</Text>
                            </View>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Fair:</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Evidence of some cleaning, but signs of dust or marks.</Text>
                            </View>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Good:</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Item cleaned and free of loose dirt.</Text>
                            </View>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Excellent:</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Item immaculate, sparkling and dust free.</Text>
                            </View>
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: themeColors.border.light }]} />

                    {/* Photo Terms and Status Icons */}
                    <View style={styles.photoTermsGrid}>
                        {/* Photo Terms */}
                        <View style={styles.photoTermsColumn}>
                            <Text style={[styles.glossarySectionTitle, { color: themeColors.text.primary, borderBottomColor: themeColors.border.light }]}>Photo Terms</Text>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Captured (external device):</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>The date provided by the image file itself, usually set by the device that captured it.</Text>
                            </View>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Captured (via App):</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>The date a photo was taken within the platform mobile App. This is a more reliable source than the above.</Text>
                            </View>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Captured (certified by inspector):</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>The date a photo was taken according to the inspector (defaulting to the inspection date).</Text>
                            </View>
                            <View style={styles.glossaryItem}>
                                <Text style={[styles.glossaryTerm, { color: themeColors.text.primary }]}>Added:</Text>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>The date on which the photo was added to the platform.</Text>
                            </View>
                        </View>

                        {/* Status Icons */}
                        <View style={styles.photoTermsColumn}>
                            <Text style={[styles.glossarySectionTitle, { color: themeColors.text.primary, borderBottomColor: themeColors.border.light }]}>Status Icons</Text>
                            <View style={styles.statusIconItem}>
                                <View style={[styles.statusIconCircle, { backgroundColor: '#fee2e2' }]}>
                                    <AlertTriangle size={14} color="#dc2626" />
                                </View>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Disagreed by tenant</Text>
                            </View>
                            <View style={styles.statusIconItem}>
                                <View style={[styles.statusIconCircle, { backgroundColor: '#fed7aa' }]}>
                                    <Wrench size={14} color="#ea580c" />
                                </View>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Repair</Text>
                            </View>
                            <View style={styles.statusIconItem}>
                                <View style={[styles.statusIconCircle, { backgroundColor: '#fef3c7' }]}>
                                    <AlertTriangle size={14} color="#d97706" />
                                </View>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Beyond fair wear and tear</Text>
                            </View>
                            <View style={styles.statusIconItem}>
                                <View style={[styles.statusIconCircle, { backgroundColor: '#dbeafe' }]}>
                                    <GitCompare size={14} color="#2563eb" />
                                </View>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Replace</Text>
                            </View>
                            <View style={styles.statusIconItem}>
                                <View style={[styles.statusIconCircle, { backgroundColor: '#fee2e2' }]}>
                                    <X size={14} color="#dc2626" />
                                </View>
                                <Text style={[styles.glossaryDefinition, { color: themeColors.text.secondary }]}>Missing</Text>
                            </View>
                        </View>
                    </View>
                </Card>

                {/* Schedule of Cleanliness and Condition */}
                <Card style={styles.scheduleCard}>
                    <View style={styles.scheduleHeader}>
                        <View style={styles.cameraIconContainer}>
                            <Camera size={24} color={themeColors.primary.DEFAULT} />
                        </View>
                        <Text style={[styles.cardTitle, { color: themeColors.text.primary }]}>Schedule of Cleanliness and Condition</Text>
                    </View>

                    {sections.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={[styles.emptyStateText, { color: themeColors.text.secondary }]}>No inspection template structure available</Text>
                        </View>
                    ) : (
                        <View style={styles.sectionsContainer}>
                            {sections.map((section: any, sectionIdx: number) => {
                                const sectionHasCondition = section.fields.some((f: any) => f.includeCondition);
                                const sectionHasCleanliness = section.fields.some((f: any) => f.includeCleanliness);
                                const isExpanded = expandedSections[section.id] !== false;

                                return (
                                    <View key={section.id} style={styles.sectionContainer}>
                                        {/* Section Header */}
                                        <TouchableOpacity
                                            style={[styles.sectionHeaderRow, { borderBottomColor: themeColors.border.light }]}
                                            onPress={() => toggleSection(section.id)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>{section.title}</Text>
                                                {section.description && (
                                                    <Text style={[styles.sectionDescription, { color: themeColors.text.secondary }]}>{section.description}</Text>
                                                )}
                                            </View>
                                            {isExpanded ? (
                                                <ChevronUp size={20} color={themeColors.text.secondary} />
                                            ) : (
                                                <ChevronDown size={20} color={themeColors.text.secondary} />
                                            )}
                                        </TouchableOpacity>

                                        {isExpanded && (
                                            <View style={[styles.tableContainer, { backgroundColor: themeColors.card.DEFAULT }]}>
                                                {/* Table Header */}
                                                <View style={[styles.tableHeader, { borderBottomColor: themeColors.border.light, backgroundColor: themeColors.card.DEFAULT }]}>
                                                    <View style={[styles.tableHeaderCell, { width: width * 0.25 }]}>
                                                        <Text style={[styles.tableHeaderText, { color: themeColors.text.primary }]} numberOfLines={2}>Room/Space</Text>
                                                    </View>
                                                    <View style={[styles.tableHeaderCell, {
                                                        width: width * (sectionHasCondition && sectionHasCleanliness ? 0.35 : sectionHasCondition || sectionHasCleanliness ? 0.40 : 0.50)
                                                    }]}>
                                                        <Text style={[styles.tableHeaderText, { color: themeColors.text.secondary }]} numberOfLines={2}>Description</Text>
                                                    </View>
                                                    {sectionHasCondition && (
                                                        <View style={[styles.tableHeaderCell, { width: width * 0.15, alignItems: 'center' }]}>
                                                            <Text style={[styles.tableHeaderText, { color: themeColors.text.secondary }]} numberOfLines={2}>Condition</Text>
                                                        </View>
                                                    )}
                                                    {sectionHasCleanliness && (
                                                        <View style={[styles.tableHeaderCell, { width: width * 0.15, alignItems: 'center' }]}>
                                                            <Text style={[styles.tableHeaderText, { color: themeColors.text.secondary }]} numberOfLines={2}>Cleanliness</Text>
                                                        </View>
                                                    )}
                                                    <View style={[styles.tableHeaderCell, { width: width * 0.10, alignItems: 'center' }]}>
                                                        <Text style={[styles.tableHeaderText, { color: themeColors.text.secondary }]} numberOfLines={1}>Photos</Text>
                                                    </View>
                                                </View>

                                                {/* Table Rows */}
                                                {section.repeatable ? (
                                                    // Render repeatable instances
                                                    (() => {
                                                        const instances = getRepeatableInstances(section.id);
                                                        if (instances.length === 0) return null;

                                                        return instances.map((instanceName) => {
                                                            return (
                                                                <View key={instanceName} style={styles.instanceGroup}>
                                                                    <Text style={[styles.instanceTitle, { color: themeColors.primary.DEFAULT, borderBottomColor: themeColors.border.light }]}>
                                                                        {instanceName}
                                                                    </Text>
                                                                    {section.fields.map((field: any, fieldIdx: number) => {
                                                                        const entry = getEntryValue(section.id, field.id || field.key || field.label, instanceName);
                                                                        const entryKey = `${section.id}/${instanceName}-${field.id || field.key || field.label}`;
                                                                        const photoKey = `photos-${entryKey}`;
                                                                        const isPhotoExpanded = expandedPhotos[photoKey];

                                                                        if (!entry) return null;

                                                                        let condition: string | number | null = null;
                                                                        let cleanliness: string | number | null = null;
                                                                        let description = '';

                                                                        if (entry.valueJson) {
                                                                            if (typeof entry.valueJson === 'object' && !Array.isArray(entry.valueJson)) {
                                                                                condition = entry.valueJson.condition || null;
                                                                                cleanliness = entry.valueJson.cleanliness || null;
                                                                                description = entry.valueJson.value || '';
                                                                            } else if (typeof entry.valueJson === 'string') {
                                                                                description = entry.valueJson;
                                                                            }
                                                                        }

                                                                        // Check if this is a signature field (base64 image data)
                                                                        const isSignature = field.type === 'signature' ||
                                                                            (typeof description === 'string' && description.startsWith('data:image'));

                                                                        const photoCount = entry.photos?.length || 0;

                                                                        return (
                                                                            <React.Fragment key={field.id || field.key || field.label}>
                                                                            <View style={[styles.tableRow, { borderBottomColor: themeColors.border.light, backgroundColor: themeColors.card.DEFAULT }]}>
                                                                                <View style={[styles.tableCell, { width: width * 0.25 }]}>
                                                                                    <TouchableOpacity
                                                                                        onPress={() => photoCount > 0 && togglePhotoExpansion(photoKey)}
                                                                                        activeOpacity={photoCount > 0 ? 0.7 : 1}
                                                                                    >
                                                                                        <Text style={[
                                                                                            styles.roomSpaceText,
                                                                                            { color: photoCount > 0 ? themeColors.primary.DEFAULT : themeColors.text.primary },
                                                                                            photoCount > 0 && styles.roomSpaceLink
                                                                                        ]} numberOfLines={2}>
                                                                                            {field.label}
                                                                                        </Text>
                                                                                    </TouchableOpacity>
                                                                                </View>
                                                                                <View style={[styles.tableCell, {
                                                                                    width: width * (sectionHasCondition && sectionHasCleanliness ? 0.35 : sectionHasCondition || sectionHasCleanliness ? 0.40 : 0.50)
                                                                                }]}>
                                                                                    {isSignature && description ? (
                                                                                        <Image
                                                                                            source={{ uri: description }}
                                                                                            style={styles.signatureImage as ImageStyle}
                                                                                            resizeMode="contain"
                                                                                        />
                                                                                    ) : (
                                                                                        <Text style={[styles.descriptionText, { color: themeColors.text.secondary }]} numberOfLines={3}>
                                                                                            {description || entry.note || '-'}
                                                                                        </Text>
                                                                                    )}
                                                                                </View>
                                                                                {sectionHasCondition && (
                                                                                    <View style={[styles.tableCell, { width: width * 0.15, alignItems: 'center', justifyContent: 'center' }]}>
                                                                                        {field.includeCondition && condition !== null && condition !== undefined ? (
                                                                                            <View style={styles.conditionRow}>
                                                                                                <View style={[styles.conditionDot, { backgroundColor: getConditionColor(condition) }]} />
                                                                                                <Text style={[styles.conditionText, { color: themeColors.text.primary }]} numberOfLines={1}>
                                                                                                    {formatCondition(condition)}
                                                                                                </Text>
                                                                                                <Text style={[styles.scoreText, { color: themeColors.text.muted }]}>
                                                                                                    ({getConditionScore(condition)})
                                                                                                </Text>
                                                                                            </View>
                                                                                        ) : (
                                                                                            <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>-</Text>
                                                                                        )}
                                                                                    </View>
                                                                                )}
                                                                                {sectionHasCleanliness && (
                                                                                    <View style={[styles.tableCell, { width: width * 0.15, alignItems: 'center', justifyContent: 'center' }]}>
                                                                                        {field.includeCleanliness && cleanliness !== null && cleanliness !== undefined ? (
                                                                                            <View style={styles.conditionRow}>
                                                                                                <View style={[styles.conditionDot, { backgroundColor: getCleanlinessColor(cleanliness) }]} />
                                                                                                <Text style={[styles.conditionText, { color: themeColors.text.primary }]} numberOfLines={1}>
                                                                                                    {formatCleanliness(cleanliness)}
                                                                                                </Text>
                                                                                                <Text style={[styles.scoreText, { color: themeColors.text.muted }]}>
                                                                                                    ({getCleanlinessScore(cleanliness)})
                                                                                                </Text>
                                                                                            </View>
                                                                                        ) : (
                                                                                            <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>-</Text>
                                                                                        )}
                                                                                    </View>
                                                                                )}
                                                                                <View style={[styles.tableCell, { width: width * 0.10, alignItems: 'center', justifyContent: 'center' }]}>
                                                                                    {photoCount > 0 ? (
                                                                                        <TouchableOpacity
                                                                                            onPress={() => togglePhotoExpansion(photoKey)}
                                                                                            style={styles.photoButton}
                                                                                            activeOpacity={0.7}
                                                                                        >
                                                                                            <Camera size={12} color={themeColors.primary.DEFAULT} />
                                                                                            <Text style={[styles.photoCountText, { color: themeColors.text.primary }]} numberOfLines={1}>
                                                                                                {photoCount}
                                                                                            </Text>
                                                                                        </TouchableOpacity>
                                                                                    ) : (
                                                                                        <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>-</Text>
                                                                                    )}
                                                                                </View>
                                                                            </View>
                                                                            
                                                                            {/* Expanded Photos - Outside tableRow */}
                                                                            {isPhotoExpanded && photoCount > 0 && (
                                                                                <View style={[styles.photoExpansionContainer, { borderTopColor: themeColors.border.light }]}>
                                                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScrollView}>
                                                                                        {entry.photos?.map((photo: string, photoIdx: number) => {
                                                                                            // Handle both local and server images
                                                                                            let photoUrl: string;
                                                                                            if (isLocalPath(photo)) {
                                                                                                // Local offline image - use local path
                                                                                                const imageSource = getImageSource(photo);
                                                                                                photoUrl = imageSource.uri;
                                                                                            } else if (photo.startsWith('http')) {
                                                                                                // Full URL
                                                                                                photoUrl = photo;
                                                                                            } else if (photo.startsWith('/')) {
                                                                                                // Server path
                                                                                                photoUrl = `${getAPI_URL()}${photo}`;
                                                                                            } else {
                                                                                                // Object ID
                                                                                                photoUrl = `${getAPI_URL()}/objects/${photo}`;
                                                                                            }
                                                                                            return (
                                                                                                <Image
                                                                                                    key={photoIdx}
                                                                                                    source={{ uri: photoUrl }}
                                                                                                    style={styles.photoThumbnail as ImageStyle}
                                                                                                />
                                                                                            );
                                                                                        })}
                                                                                    </ScrollView>
                                                                                </View>
                                                                            )}
                                                                            
                                                                            {/* Voice Recording Panel - supports multiple recordings */}
                                                                            {isPhotoExpanded && entry?.id && (() => {
                                                                                const vKey = `voice-${entryKey}`;
                                                                                const vs = getVoiceState(vKey);
                                                                                const displayAudioUrls = vs.audioUrls.length > 0 ? vs.audioUrls : getEntryAudioUrls(entry);
                                                                                return (
                                                                                    <View style={[styles.voiceRecordingContainer, { borderTopColor: themeColors.border.light, backgroundColor: themeColors.card.DEFAULT }]}>
                                                                                        <Text style={[styles.voiceSectionLabel, { color: themeColors.text.secondary }]}>Voice Recording</Text>
                                                                                        <View style={styles.voiceButtonsRow}>
                                                                                            {!vs.isRecording && (
                                                                                                <TouchableOpacity style={[styles.voiceBtn, { backgroundColor: themeColors.primary.DEFAULT, flex: 1 }]} onPress={() => startRecording(vKey, displayAudioUrls)}>
                                                                                                    <Mic size={14} color={themeColors.primary.foreground || '#fff'} />
                                                                                                    <Text style={[styles.voiceBtnText, { color: themeColors.primary.foreground || '#fff' }]}>{displayAudioUrls.length > 0 ? 'Add Recording' : 'Start Recording'}</Text>
                                                                                                </TouchableOpacity>
                                                                                            )}
                                                                                            {vs.isRecording && (
                                                                                                <>
                                                                                                    <TouchableOpacity style={[styles.voiceBtn, { backgroundColor: '#ef4444', opacity: vs.isUploadingAudio ? 0.5 : 1, flex: 1 }]} onPress={() => stopRecording(vKey, entry.id, entry?.note || '', entry?.valueJson, displayAudioUrls)} disabled={vs.isUploadingAudio}>
                                                                                                        <Square size={14} color='#fff' />
                                                                                                        <Text style={[styles.voiceBtnText, { color: '#fff' }]}>{vs.isUploadingAudio ? 'Saving...' : `Stop (${Math.floor(vs.recordingTime / 60)}:${(vs.recordingTime % 60).toString().padStart(2, '0')})`}</Text>
                                                                                                    </TouchableOpacity>
                                                                                                    <TouchableOpacity style={[styles.voiceBtn, { borderWidth: 1, borderColor: themeColors.border.DEFAULT, backgroundColor: 'transparent' }]} onPress={() => cancelRecording(vKey, displayAudioUrls)}>
                                                                                                        <X size={14} color={themeColors.text.primary} />
                                                                                                        <Text style={[styles.voiceBtnText, { color: themeColors.text.primary }]}>Cancel</Text>
                                                                                                    </TouchableOpacity>
                                                                                                </>
                                                                                            )}
                                                                                        </View>
                                                                                        {vs.isRecording && (<View style={styles.recordingIndicatorRow}><View style={styles.recordingDot} /><Text style={{ fontSize: 12, color: themeColors.text.secondary }}>Recording...</Text></View>)}
                                                                                        {displayAudioUrls.length > 0 && !vs.isRecording && (
                                                                                            <View style={{ marginTop: 8, gap: 8 }}>
                                                                                                {[...displayAudioUrls].reverse().map((url, idx) => (
                                                                                                    <View key={`${url}-${idx}`} style={[styles.voiceButtonsRow, { flexWrap: 'wrap' }]}>
                                                                                                        <TouchableOpacity style={[styles.voiceBtn, { borderWidth: 1, borderColor: themeColors.primary.DEFAULT + '60', backgroundColor: themeColors.primary.DEFAULT + '10', flex: 1, opacity: vs.loadingPlayUrl === url ? 0.8 : 1 }]} onPress={() => playAudio(vKey, url)} disabled={vs.loadingPlayUrl === url}>
                                                                                                            {vs.loadingPlayUrl === url ? <ActivityIndicator size="small" color={themeColors.primary.DEFAULT} /> : vs.playingUrl === url && vs.isPlayingAudio ? <Square size={14} color={themeColors.primary.DEFAULT} /> : <Play size={14} color={themeColors.primary.DEFAULT} />}
                                                                                                            <Text style={[styles.voiceBtnText, { color: themeColors.primary.DEFAULT }]}>{vs.loadingPlayUrl === url ? 'Loading...' : vs.playingUrl === url && vs.isPlayingAudio ? 'Pause' : `Play #${idx + 1}`}</Text>
                                                                                                        </TouchableOpacity>
                                                                                                        <TouchableOpacity style={[styles.voiceBtn, { backgroundColor: themeColors.primary.DEFAULT, flex: 1, opacity: vs.transcribingUrl === url ? 0.6 : 1 }]} onPress={() => transcribeAudio(vKey, url, entry.id, entry?.note || '', entry?.valueJson, displayAudioUrls)} disabled={!!vs.transcribingUrl}>
                                                                                                            <Sparkles size={14} color='#fff' />
                                                                                                            <Text style={[styles.voiceBtnText, { color: '#fff' }]}>{vs.transcribingUrl === url ? '...' : 'Transcribe'}</Text>
                                                                                                        </TouchableOpacity>
                                                                                                        <TouchableOpacity style={[styles.voiceBtn, { borderWidth: 1, borderColor: themeColors.destructive.DEFAULT + '60', backgroundColor: 'transparent', flex: 0, minWidth: 44, paddingHorizontal: 12 }]} onPress={() => removeAudioUrl(vKey, url, entry.id, entry?.note || '', entry?.valueJson, displayAudioUrls, vs.playingUrl)}>
                                                                                                            <Trash2 size={16} color={themeColors.destructive.DEFAULT} />
                                                                                                        </TouchableOpacity>
                                                                                                    </View>
                                                                                                ))}
                                                                                            </View>
                                                                                        )}
                                                                                    </View>
                                                                                );
                                                                            })()}
                                                                            </React.Fragment>
                                                                        );
                                                                    })}
                                                                </View>
                                                            );
                                                        });
                                                    })()
                                                ) : (
                                                    // Render normally for non-repeatable sections
                                                    section.fields.map((field: any, fieldIdx: number) => {
                                                        const entry = getEntryValue(section.id, field.id || field.key || field.label);
                                                        const entryKey = `${section.id}-${field.id || field.key || field.label}`;
                                                        const photoKey = `photos-${entryKey}`;
                                                        const isPhotoExpanded = expandedPhotos[photoKey];

                                                        if (!entry) return null;

                                                        let condition: string | number | null = null;
                                                        let cleanliness: string | number | null = null;
                                                        let description = '';

                                                        if (entry.valueJson) {
                                                            if (typeof entry.valueJson === 'object' && !Array.isArray(entry.valueJson)) {
                                                                condition = entry.valueJson.condition || null;
                                                                cleanliness = entry.valueJson.cleanliness || null;
                                                                description = entry.valueJson.value || '';
                                                            } else if (typeof entry.valueJson === 'string') {
                                                                description = entry.valueJson;
                                                            }
                                                        }

                                                        // Check if this is a signature field (base64 image data)
                                                        const isSignature = field.type === 'signature' ||
                                                            (typeof description === 'string' && description.startsWith('data:image'));

                                                        const photoCount = entry.photos?.length || 0;

                                                        return (
                                                            <React.Fragment key={field.id || field.key || field.label}>
                                                            <View style={[styles.tableRow, { borderBottomColor: themeColors.border.light, backgroundColor: themeColors.card.DEFAULT }]}>
                                                                <View style={[styles.tableCell, { width: width * 0.25 }]}>
                                                                    <TouchableOpacity
                                                                        onPress={() => photoCount > 0 && togglePhotoExpansion(photoKey)}
                                                                        activeOpacity={photoCount > 0 ? 0.7 : 1}
                                                                    >
                                                                        <Text style={[
                                                                            styles.roomSpaceText,
                                                                            { color: photoCount > 0 ? themeColors.primary.DEFAULT : themeColors.text.primary },
                                                                            photoCount > 0 && styles.roomSpaceLink
                                                                        ]} numberOfLines={2}>
                                                                            {field.label}
                                                                        </Text>
                                                                    </TouchableOpacity>
                                                                </View>
                                                                <View style={[styles.tableCell, {
                                                                    width: width * (sectionHasCondition && sectionHasCleanliness ? 0.35 : sectionHasCondition || sectionHasCleanliness ? 0.40 : 0.50)
                                                                }]}>
                                                                    {isSignature && description ? (
                                                                        <Image
                                                                            source={{ uri: description }}
                                                                            style={styles.signatureImage as ImageStyle}
                                                                            resizeMode="contain"
                                                                        />
                                                                    ) : (
                                                                        <Text style={[styles.descriptionText, { color: themeColors.text.secondary }]} numberOfLines={3}>
                                                                            {description || entry.note || '-'}
                                                                        </Text>
                                                                    )}
                                                                </View>
                                                                {sectionHasCondition && (
                                                                    <View style={[styles.tableCell, { width: width * 0.15, alignItems: 'center', justifyContent: 'center' }]}>
                                                                        {field.includeCondition && condition !== null && condition !== undefined ? (
                                                                            <View style={styles.conditionRow}>
                                                                                <View style={[styles.conditionDot, { backgroundColor: getConditionColor(condition) }]} />
                                                                                <Text style={[styles.conditionText, { color: themeColors.text.primary }]} numberOfLines={1}>
                                                                                    {formatCondition(condition)}
                                                                                </Text>
                                                                                <Text style={[styles.scoreText, { color: themeColors.text.muted }]}>
                                                                                    ({getConditionScore(condition)})
                                                                                </Text>
                                                                            </View>
                                                                        ) : (
                                                                            <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>-</Text>
                                                                        )}
                                                                    </View>
                                                                )}
                                                                {sectionHasCleanliness && (
                                                                    <View style={[styles.tableCell, { width: width * 0.15, alignItems: 'center', justifyContent: 'center' }]}>
                                                                        {field.includeCleanliness && cleanliness !== null && cleanliness !== undefined ? (
                                                                            <View style={styles.conditionRow}>
                                                                                <View style={[styles.conditionDot, { backgroundColor: getCleanlinessColor(cleanliness) }]} />
                                                                                <Text style={[styles.conditionText, { color: themeColors.text.primary }]} numberOfLines={1}>
                                                                                    {formatCleanliness(cleanliness)}
                                                                                </Text>
                                                                                <Text style={[styles.scoreText, { color: themeColors.text.muted }]}>
                                                                                    ({getCleanlinessScore(cleanliness)})
                                                                                </Text>
                                                                            </View>
                                                                        ) : (
                                                                            <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>-</Text>
                                                                        )}
                                                                    </View>
                                                                )}
                                                                <View style={[styles.tableCell, { width: width * 0.10, alignItems: 'center', justifyContent: 'center' }]}>
                                                                    {photoCount > 0 ? (
                                                                        <TouchableOpacity
                                                                            onPress={() => togglePhotoExpansion(photoKey)}
                                                                            style={styles.photoButton}
                                                                            activeOpacity={0.7}
                                                                        >
                                                                            <Camera size={12} color={themeColors.primary.DEFAULT} />
                                                                            <Text style={[styles.photoCountText, { color: themeColors.text.primary }]} numberOfLines={1}>
                                                                                {photoCount}
                                                                            </Text>
                                                                        </TouchableOpacity>
                                                                    ) : (
                                                                        <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>-</Text>
                                                                    )}
                                                                </View>
                                                            </View>
                                                            
                                                            {/* Expanded Photos - Outside tableRow */}
                                                            {isPhotoExpanded && photoCount > 0 && (
                                                                <View style={[styles.photoExpansionContainer, { borderTopColor: themeColors.border.light }]}>
                                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScrollView}>
                                                                        {entry.photos?.map((photo: string, photoIdx: number) => {
                                                                            // Handle both local and server images
                                                                            let photoUrl: string;
                                                                            if (isLocalPath(photo)) {
                                                                                // Local offline image - use local path
                                                                                const imageSource = getImageSource(photo);
                                                                                photoUrl = imageSource.uri;
                                                                            } else if (photo.startsWith('http')) {
                                                                                // Full URL
                                                                                photoUrl = photo;
                                                                            } else if (photo.startsWith('/')) {
                                                                                // Server path
                                                                                photoUrl = `${getAPI_URL()}${photo}`;
                                                                            } else {
                                                                                // Object ID
                                                                                photoUrl = `${getAPI_URL()}/objects/${photo}`;
                                                                            }
                                                                            return (
                                                                                <Image
                                                                                    key={photoIdx}
                                                                                    source={{ uri: photoUrl }}
                                                                                    style={styles.photoThumbnail as ImageStyle}
                                                                                />
                                                                            );
                                                                        })}
                                                                    </ScrollView>
                                                                </View>
                                                            )}
                                                            
                                                            {/* Voice Recording Panel - supports multiple recordings */}
                                                            {isPhotoExpanded && entry?.id && (() => {
                                                                const vKey = `voice-${entryKey}`;
                                                                const vs = getVoiceState(vKey);
                                                                const displayAudioUrls = vs.audioUrls.length > 0 ? vs.audioUrls : getEntryAudioUrls(entry);
                                                                return (
                                                                    <View style={[styles.voiceRecordingContainer, { borderTopColor: themeColors.border.light, backgroundColor: themeColors.card.DEFAULT }]}>
                                                                        <Text style={[styles.voiceSectionLabel, { color: themeColors.text.secondary }]}>Voice Recording</Text>
                                                                        <View style={styles.voiceButtonsRow}>
                                                                            {!vs.isRecording && (
                                                                                <TouchableOpacity style={[styles.voiceBtn, { backgroundColor: themeColors.primary.DEFAULT, flex: 1 }]} onPress={() => startRecording(vKey, displayAudioUrls)}>
                                                                                    <Mic size={14} color={themeColors.primary.foreground || '#fff'} />
                                                                                    <Text style={[styles.voiceBtnText, { color: themeColors.primary.foreground || '#fff' }]}>{displayAudioUrls.length > 0 ? 'Add Recording' : 'Start Recording'}</Text>
                                                                                </TouchableOpacity>
                                                                            )}
                                                                            {vs.isRecording && (
                                                                                <>
                                                                                    <TouchableOpacity style={[styles.voiceBtn, { backgroundColor: '#ef4444', opacity: vs.isUploadingAudio ? 0.5 : 1, flex: 1 }]} onPress={() => stopRecording(vKey, entry.id, entry?.note || '', entry?.valueJson, displayAudioUrls)} disabled={vs.isUploadingAudio}>
                                                                                        <Square size={14} color='#fff' />
                                                                                        <Text style={[styles.voiceBtnText, { color: '#fff' }]}>{vs.isUploadingAudio ? 'Saving...' : `Stop (${Math.floor(vs.recordingTime / 60)}:${(vs.recordingTime % 60).toString().padStart(2, '0')})`}</Text>
                                                                                    </TouchableOpacity>
                                                                                    <TouchableOpacity style={[styles.voiceBtn, { borderWidth: 1, borderColor: themeColors.border.DEFAULT, backgroundColor: 'transparent' }]} onPress={() => cancelRecording(vKey, displayAudioUrls)}>
                                                                                        <X size={14} color={themeColors.text.primary} />
                                                                                        <Text style={[styles.voiceBtnText, { color: themeColors.text.primary }]}>Cancel</Text>
                                                                                    </TouchableOpacity>
                                                                                </>
                                                                            )}
                                                                        </View>
                                                                        {vs.isRecording && (<View style={styles.recordingIndicatorRow}><View style={styles.recordingDot} /><Text style={{ fontSize: 12, color: themeColors.text.secondary }}>Recording...</Text></View>)}
                                                                        {displayAudioUrls.length > 0 && !vs.isRecording && (
                                                                            <View style={{ marginTop: 8, gap: 8 }}>
                                                                                {[...displayAudioUrls].reverse().map((url, idx) => (
                                                                                    <View key={`${url}-${idx}`} style={[styles.voiceButtonsRow, { flexWrap: 'wrap' }]}>
                                                                                        <TouchableOpacity style={[styles.voiceBtn, { borderWidth: 1, borderColor: themeColors.primary.DEFAULT + '60', backgroundColor: themeColors.primary.DEFAULT + '10', flex: 1, opacity: vs.loadingPlayUrl === url ? 0.8 : 1 }]} onPress={() => playAudio(vKey, url)} disabled={vs.loadingPlayUrl === url}>
                                                                                            {vs.loadingPlayUrl === url ? <ActivityIndicator size="small" color={themeColors.primary.DEFAULT} /> : vs.playingUrl === url && vs.isPlayingAudio ? <Square size={14} color={themeColors.primary.DEFAULT} /> : <Play size={14} color={themeColors.primary.DEFAULT} />}
                                                                                            <Text style={[styles.voiceBtnText, { color: themeColors.primary.DEFAULT }]}>{vs.loadingPlayUrl === url ? 'Loading...' : vs.playingUrl === url && vs.isPlayingAudio ? 'Pause' : `Play #${idx + 1}`}</Text>
                                                                                        </TouchableOpacity>
                                                                                        <TouchableOpacity style={[styles.voiceBtn, { backgroundColor: themeColors.primary.DEFAULT, flex: 1, opacity: vs.transcribingUrl === url ? 0.6 : 1 }]} onPress={() => transcribeAudio(vKey, url, entry.id, entry?.note || '', entry?.valueJson, displayAudioUrls)} disabled={!!vs.transcribingUrl}>
                                                                                            <Sparkles size={14} color='#fff' />
                                                                                            <Text style={[styles.voiceBtnText, { color: '#fff' }]}>{vs.transcribingUrl === url ? '...' : 'Transcribe'}</Text>
                                                                                        </TouchableOpacity>
                                                                                        <TouchableOpacity style={[styles.voiceBtn, { borderWidth: 1, borderColor: themeColors.destructive.DEFAULT + '60', backgroundColor: 'transparent', flex: 0, minWidth: 44, paddingHorizontal: 12 }]} onPress={() => removeAudioUrl(vKey, url, entry.id, entry?.note || '', entry?.valueJson, displayAudioUrls, vs.playingUrl)}>
                                                                                            <Trash2 size={16} color={themeColors.destructive.DEFAULT} />
                                                                                        </TouchableOpacity>
                                                                                    </View>
                                                                                ))}
                                                                            </View>
                                                                        )}
                                                                    </View>
                                                                );
                                                            })()}
                                                            </React.Fragment>
                                                        );
                                                    })
                                                )}
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </Card>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing[3],
        paddingHorizontal: spacing[4],
        borderBottomWidth: 1,
    },
    headerTitle: {
        flex: 1,
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.bold,
        textAlign: 'center',
    },
    iconButton: {
        padding: spacing[2],
    },
    iconButtonDisabled: {
        opacity: 0.5,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
    },
    scrollContent: {
        padding: spacing[4],
        paddingBottom: spacing[8],
    },
    summaryCard: {
        padding: spacing[4],
        marginBottom: spacing[4],
    },
    summaryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing[4],
    },
    propertyName: {
        fontSize: typography.fontSize['2xl'],
        fontWeight: typography.fontWeight.bold,
        marginBottom: spacing[1],
    },
    addressRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing[1],
    },
    addressText: {
        fontSize: typography.fontSize.sm,
        flex: 1,
    },
    divider: {
        height: 1,
        marginVertical: spacing[4],
    },
    infoGrid: {
        gap: spacing[4],
    },
    infoItem: {
        marginBottom: spacing[2],
    },
    infoLabel: {
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.medium,
        textTransform: 'uppercase',
        marginBottom: spacing[1],
    },
    infoValueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
    },
    infoValue: {
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
        flex: 1,
    },
    mapButton: {
        paddingHorizontal: spacing[3],
        paddingVertical: spacing[1],
        borderRadius: borderRadius.md,
        marginLeft: spacing[2],
    },
    mapButtonText: {
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.semibold,
    },
    notesContainer: {
        marginTop: spacing[4],
        padding: spacing[3],
        borderRadius: borderRadius.md,
    },
    generalNotes: {
        fontSize: typography.fontSize.sm,
        lineHeight: 20,
    },
    glossaryCard: {
        padding: spacing[4],
        marginBottom: spacing[4],
    },
    cardHeader: {
        marginBottom: spacing[4],
    },
    cardTitle: {
        fontSize: typography.fontSize['2xl'],
        fontWeight: typography.fontWeight.bold,
        marginBottom: spacing[1],
    },
    cardDescription: {
        fontSize: typography.fontSize.sm,
    },
    glossaryGrid: {
        gap: spacing[4],
    },
    glossaryColumn: {
        gap: spacing[3],
    },
    glossarySectionTitle: {
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.bold,
        borderBottomWidth: 1,
        paddingBottom: spacing[2],
        marginBottom: spacing[2],
    },
    glossaryItem: {
        marginBottom: spacing[2],
    },
    glossaryTerm: {
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.bold,
        marginBottom: spacing[1],
    },
    glossaryDefinition: {
        fontSize: typography.fontSize.sm,
        lineHeight: 18,
    },
    photoTermsGrid: {
        marginTop: spacing[4],
        gap: spacing[4],
    },
    photoTermsColumn: {
        gap: spacing[3],
    },
    statusIconItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        marginBottom: spacing[2],
    },
    statusIconCircle: {
        width: 24,
        height: 24,
        borderRadius: borderRadius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scheduleCard: {
        padding: spacing[4],
        marginBottom: spacing[4],
    },
    scheduleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        marginBottom: spacing[4],
    },
    cameraIconContainer: {
        padding: spacing[2],
        borderRadius: borderRadius.lg,
    },
    sectionsContainer: {
        gap: spacing[4],
    },
    sectionContainer: {
        marginBottom: spacing[2],
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing[3],
        borderBottomWidth: 1,
        marginBottom: spacing[3],
    },
    sectionTitle: {
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.bold,
    },
    sectionDescription: {
        fontSize: typography.fontSize.sm,
        marginTop: spacing[1],
    },
    tableContainer: {
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
    },
    tableHeader: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        paddingVertical: spacing[2],
        paddingHorizontal: spacing[2],
        flexWrap: 'wrap',
    },
    tableHeaderCell: {
        paddingHorizontal: spacing[1],
        minWidth: 60,
    },
    tableHeaderText: {
        fontSize: typography.fontSize.xs - 1,
        fontWeight: typography.fontWeight.medium,
        textTransform: 'uppercase',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        paddingVertical: spacing[2],
        paddingHorizontal: spacing[2],
        flexWrap: 'wrap',
        minHeight: 50,
        backgroundColor: 'transparent', // Will be set dynamically
    },
    tableCell: {
        paddingHorizontal: spacing[1],
        justifyContent: 'center',
        minWidth: 60,
    },
    roomSpaceText: {
        fontSize: typography.fontSize.xs + 1,
        fontWeight: typography.fontWeight.medium,
    },
    roomSpaceLink: {
    },
    descriptionText: {
        fontSize: typography.fontSize.xs - 1,
        lineHeight: (typography.fontSize.xs - 1) * 1.4,
    },
    signatureImage: {
        width: 200,
        height: 80,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    conditionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[0.5],
        flexWrap: 'wrap',
        justifyContent: 'center',
    },
    conditionDot: {
        width: 8,
        height: 8,
        borderRadius: borderRadius.full,
    },
    conditionText: {
        fontSize: typography.fontSize.xs - 2,
        fontWeight: typography.fontWeight.medium,
    },
    scoreText: {
        fontSize: typography.fontSize.xs - 3,
    },
    emptyText: {
        fontSize: typography.fontSize.xs - 2,
    },
    photoButton: {
        flexDirection: 'column',
        alignItems: 'center',
        gap: spacing[0.5],
    },
    photoCountText: {
        fontSize: typography.fontSize.xs - 2,
        fontWeight: typography.fontWeight.medium,
    },
    photoExpansionContainer: {
        flex: 1,
        marginTop: spacing[2],
        paddingTop: spacing[2],
        borderTopWidth: 1,
    },
    photoScrollView: {
        marginTop: spacing[2],
    },
    photoThumbnail: {
        width: 80,
        height: 80,
        borderRadius: borderRadius.md,
        marginRight: spacing[2],
    },
    emptyState: {
        padding: spacing[6],
        alignItems: 'center',
    },
    emptyStateText: {
        fontSize: typography.fontSize.sm,
        textAlign: 'center',
    },
    instanceGroup: {
        marginBottom: spacing[4],
        marginTop: spacing[2],
    },
    instanceTitle: {
        fontSize: typography.fontSize.base,
        fontWeight: typography.fontWeight.bold,
        paddingBottom: spacing[2],
        marginBottom: spacing[2],
        borderBottomWidth: 1,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing[6],
    },
    errorText: {
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.semibold,
        marginTop: spacing[4],
        marginBottom: spacing[6],
    },
    backButton: {
        paddingVertical: spacing[3],
        paddingHorizontal: spacing[6],
        borderRadius: borderRadius.md,
    },
    backButtonText: {
        fontWeight: typography.fontWeight.semibold,
        fontSize: typography.fontSize.sm,
    },
    voiceRecordingContainer: {
        padding: spacing[3],
        borderTopWidth: 1,
        borderRadius: borderRadius.sm,
        marginTop: spacing[2],
    },
    voiceSectionLabel: {
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.bold,
        marginBottom: spacing[2],
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    voiceButtonsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing[2],
        alignItems: 'stretch',
        width: '100%',
    },
    voiceBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing[1.5],
        paddingVertical: spacing[3],
        paddingHorizontal: spacing[3],
        borderRadius: borderRadius.md,
        minHeight: 44,
    },
    voiceBtnText: {
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.medium,
    },
    recordingIndicatorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        marginTop: spacing[2],
    },
    recordingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ef4444',
    },
});

export default InspectionReportScreen;
