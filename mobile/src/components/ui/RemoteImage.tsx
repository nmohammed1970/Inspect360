import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  ImageProps,
  ImageStyle,
  StyleProp,
  View,
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import {
  IMAGE_LOAD_ERROR_MESSAGE,
  IMAGE_OFFLINE_MESSAGE,
} from '../../../../shared/imageLoadingUx';

const uriCache = new Map<string, string>();

/** Seed the display cache so a just-uploaded server URL shows the local file instantly. */
export function primeRemoteImageCache(serverUrl: string, localFileUri: string): void {
  const resolved = resolveMediaUrl(serverUrl);
  if (!resolved || !localFileUri) return;
  const local =
    localFileUri.startsWith('/') && !localFileUri.startsWith('file://')
      ? `file://${localFileUri}`
      : localFileUri;
  uriCache.set(resolved, local);
}

function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    out += chars[a >> 2];
    out += chars[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? chars[c & 63] : '=';
  }
  return out;
}

function cacheKeyForUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) | 0;
  }
  const extMatch = url.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i);
  const ext = extMatch?.[1]?.toLowerCase() || 'jpg';
  return `gallery_${Math.abs(hash)}.${ext === 'jpeg' ? 'jpg' : ext}`;
}

function isLocalMediaUri(next: string): boolean {
  return (
    next.startsWith('file://') ||
    next.startsWith('content://') ||
    next.includes('offline_images')
  );
}

/**
 * Loads server object images via authenticated `/api/objects/content/...`,
 * caches to disk, and previews with a local file:// URI (reliable on device).
 * Loading tiles show a spinner only (no per-tile network warning text). Retry on failure.
 */
export function RemoteImage({
  uri,
  style,
  compactMessage = true,
  ...rest
}: Omit<ImageProps, 'source'> & {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  /** Smaller copy for error/offline messages on tiles */
  compactMessage?: boolean;
}) {
  const isOnline = useOnlineStatus();
  const resolved = resolveMediaUrl(uri);
  const [displayUri, setDisplayUri] = useState<string | null>(() =>
    resolved && uriCache.has(resolved) ? uriCache.get(resolved)! : null,
  );
  const [loading, setLoading] = useState(!displayUri);
  const [failed, setFailed] = useState(false);
  const [offline, setOffline] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const gen = useRef(0);

  const load = useCallback(async () => {
    const next = resolveMediaUrl(uri);
    if (!next) {
      setDisplayUri(null);
      setLoading(false);
      setFailed(true);
      setOffline(false);
      return;
    }

    if (isLocalMediaUri(next)) {
      setDisplayUri(next.startsWith('/') && !next.startsWith('file://') ? `file://${next}` : next);
      setLoading(false);
      setFailed(false);
      setOffline(false);
      return;
    }

    if (uriCache.has(next)) {
      setDisplayUri(uriCache.get(next)!);
      setLoading(false);
      setFailed(false);
      setOffline(false);
      return;
    }

    if (!isOnline) {
      setDisplayUri(null);
      setLoading(false);
      setFailed(false);
      setOffline(true);
      return;
    }

    const token = ++gen.current;
    setLoading(true);
    setFailed(false);
    setOffline(false);

    try {
      const fileName = cacheKeyForUrl(next);
      const cacheDir = `${FileSystem.cacheDirectory || ''}gallery_thumbs/`;
      const localPath = `${cacheDir}${fileName}`;

      const dirInfo = await FileSystem.getInfoAsync(cacheDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
      }

      const existing = await FileSystem.getInfoAsync(localPath);
      if (existing.exists && (existing as any).size > 0) {
        if (token !== gen.current) return;
        uriCache.set(next, localPath);
        setDisplayUri(localPath);
        setFailed(false);
        setOffline(false);
        return;
      }

      const res = await fetch(next, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'image/*,*/*' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (!bytes.length) throw new Error('Empty image body');
      const base64 = bytesToBase64(bytes);
      await FileSystem.writeAsStringAsync(localPath, base64, {
        encoding: 'base64' as any,
      });
      if (token !== gen.current) return;
      uriCache.set(next, localPath);
      setDisplayUri(localPath);
      setFailed(false);
      setOffline(false);
    } catch (e) {
      console.warn('[RemoteImage] load failed:', resolveMediaUrl(uri), e);
      if (token !== gen.current) return;
      setFailed(true);
      setDisplayUri(null);
      setOffline(false);
    } finally {
      if (token === gen.current) setLoading(false);
    }
  }, [uri, isOnline]);

  useEffect(() => {
    void load();
  }, [load, retryTick]);

  const handleRetry = () => {
    setFailed(false);
    setOffline(false);
    setLoading(true);
    setDisplayUri(null);
    setRetryTick((n) => n + 1);
  };

  const showPlaceholder = loading || failed || offline || !displayUri;

  return (
    <View style={[styles.wrap, style]}>
      {displayUri && !failed ? (
        <Image
          {...rest}
          source={{ uri: displayUri }}
          style={[StyleSheet.absoluteFillObject, style]}
          onLoad={() => setLoading(false)}
          onError={() => {
            setFailed(true);
            setLoading(false);
          }}
        />
      ) : null}
      {showPlaceholder && (
        <View style={styles.placeholder} pointerEvents={failed || offline ? 'auto' : 'none'}>
          {loading && !failed && !offline ? (
            <ActivityIndicator color={colors.primary?.DEFAULT || '#0d9488'} />
          ) : null}
          {offline ? (
            <>
              <Text style={[styles.message, compactMessage && styles.messageCompact]}>
                {IMAGE_OFFLINE_MESSAGE}
              </Text>
              {isOnline ? (
                <TouchableOpacity onPress={handleRetry} accessibilityRole="button" accessibilityLabel="Retry">
                  <Text style={styles.retry}>Retry</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
          {failed && !offline ? (
            <>
              <Text style={[styles.message, compactMessage && styles.messageCompact]}>
                {IMAGE_LOAD_ERROR_MESSAGE}
              </Text>
              <TouchableOpacity onPress={handleRetry} accessibilityRole="button" accessibilityLabel="Retry">
                <Text style={styles.retry}>Retry</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(226,232,240,0.95)',
    paddingHorizontal: spacing[2],
    gap: spacing[2],
  },
  message: {
    marginTop: spacing[1],
    textAlign: 'center',
    color: colors.text?.secondary || '#64748b',
    fontSize: typography.fontSize.xs,
    lineHeight: 16,
    paddingHorizontal: spacing[1],
  },
  messageCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  retry: {
    marginTop: spacing[1],
    color: colors.primary?.DEFAULT || '#0d9488',
    fontWeight: '600',
    fontSize: typography.fontSize.sm,
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
});
