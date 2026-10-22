import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  ImageProps,
  ImageStyle,
  StyleProp,
  View,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { colors } from '../../theme';

const uriCache = new Map<string, string>();

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

/**
 * Loads server object images via authenticated `/api/objects/content/...`,
 * caches to disk, and previews with a local file:// URI (reliable on device).
 */
export function RemoteImage({
  uri,
  style,
  ...rest
}: Omit<ImageProps, 'source'> & {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
}) {
  const resolved = resolveMediaUrl(uri);
  const [displayUri, setDisplayUri] = useState<string | null>(() =>
    resolved && uriCache.has(resolved) ? uriCache.get(resolved)! : null,
  );
  const [loading, setLoading] = useState(!displayUri);
  const [failed, setFailed] = useState(false);
  const gen = useRef(0);

  useEffect(() => {
    const next = resolveMediaUrl(uri);
    if (!next) {
      setDisplayUri(null);
      setLoading(false);
      setFailed(true);
      return;
    }
    // Local offline / device files — display directly
    if (
      next.startsWith('file://') ||
      next.startsWith('content://') ||
      next.includes('offline_images')
    ) {
      setDisplayUri(next.startsWith('/') && !next.startsWith('file://') ? `file://${next}` : next);
      setLoading(false);
      setFailed(false);
      return;
    }
    if (uriCache.has(next)) {
      setDisplayUri(uriCache.get(next)!);
      setLoading(false);
      setFailed(false);
      return;
    }

    const token = ++gen.current;
    setLoading(true);
    setFailed(false);

    (async () => {
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
      } catch (e) {
        console.warn('[RemoteImage] load failed:', resolveMediaUrl(uri), e);
        if (token !== gen.current) return;
        setFailed(true);
        setDisplayUri(null);
      } finally {
        if (token === gen.current) setLoading(false);
      }
    })();
  }, [uri]);

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
      {(loading || failed) && (
        <View style={styles.placeholder}>
          {loading && !failed ? (
            <ActivityIndicator color={colors.primary?.DEFAULT || '#0d9488'} />
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
    backgroundColor: '#e2e8f0',
  },
});
