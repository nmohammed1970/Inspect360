import assert from 'node:assert/strict';
import {
  buildUploadDirectUrl,
  mergeGalleryImages,
  isLocalGalleryImageId,
  localIdFromGalleryImageId,
} from './galleryOfflineHelpers';

// --- buildUploadDirectUrl ---
assert.equal(
  buildUploadDirectUrl('https://portal.example.com', 'abc-123'),
  'https://portal.example.com/api/objects/upload-direct?objectId=abc-123',
);
assert.equal(
  buildUploadDirectUrl('https://portal.example.com/', 'id with space'),
  'https://portal.example.com/api/objects/upload-direct?objectId=id%20with%20space',
);
assert.throws(() => buildUploadDirectUrl('', 'x'));
assert.throws(() => buildUploadDirectUrl('https://x.com', ''));

// --- isLocalGalleryImageId / localIdFromGalleryImageId ---
assert.equal(isLocalGalleryImageId('local:uuid-1'), true);
assert.equal(isLocalGalleryImageId('server-uuid'), false);
assert.equal(localIdFromGalleryImageId('local:uuid-1'), 'uuid-1');
assert.equal(localIdFromGalleryImageId('server-uuid'), null);

// --- mergeGalleryImages ---
const server = [
  {
    id: 'srv-1',
    objectUrl: '/objects/aaa.jpg',
    fileName: 'a.jpg',
    assignments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const local = [
  {
    id: 'loc-pending',
    localPath: '/data/offline_images/img1.jpg',
    serverUrl: null,
    syncStatus: 'pending' as const,
    createdAt: '2026-01-02T00:00:00.000Z',
    metaJson: JSON.stringify({
      fileName: 'pending.jpg',
      mimeType: 'image/jpeg',
      captureLatitude: 51.5,
      captureLongitude: -0.1,
    }),
  },
  {
    id: 'loc-synced',
    localPath: '/data/offline_images/img2.jpg',
    serverUrl: '/objects/aaa.jpg',
    syncStatus: 'synced' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    metaJson: null,
  },
  {
    id: 'loc-deleted',
    localPath: '/data/offline_images/img3.jpg',
    serverUrl: null,
    syncStatus: 'pending' as const,
    createdAt: '2026-01-03T00:00:00.000Z',
    metaJson: JSON.stringify({ deleted: true }),
  },
  {
    id: 'loc-failed',
    localPath: '/data/offline_images/img4.jpg',
    serverUrl: null,
    syncStatus: 'failed' as const,
    createdAt: '2026-01-04T00:00:00.000Z',
    metaJson: JSON.stringify({ fileName: 'fail.jpg' }),
  },
];

const merged = mergeGalleryImages(server, local);
const ids = merged.map((m) => m.id);

// Server image present
assert.ok(ids.includes('srv-1'));
// Pending local appears as local:id
assert.ok(ids.includes('local:loc-pending'));
assert.ok(ids.includes('local:loc-failed'));
// Synced duplicate of server URL omitted
assert.ok(!ids.includes('local:loc-synced'));
// Tombstoned omitted
assert.ok(!ids.includes('local:loc-deleted'));

const pending = merged.find((m) => m.id === 'local:loc-pending')!;
assert.equal(pending._local?.syncBadge, 'pending');
assert.equal(pending._local?.isLocalPending, true);
assert.equal(pending.objectUrl, '/data/offline_images/img1.jpg');
assert.equal(pending.captureLatitude, 51.5);

const failed = merged.find((m) => m.id === 'local:loc-failed')!;
assert.equal(failed._local?.syncBadge, 'failed');

console.log('galleryOfflineHelpers.test.ts: all assertions passed');
