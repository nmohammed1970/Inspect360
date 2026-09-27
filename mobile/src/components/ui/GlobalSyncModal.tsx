import React from 'react';
import SyncProgressModal from './SyncProgressModal';
import { useSync } from '../../contexts/SyncContext';

/** Staff-only offline sync progress. Tenants never see this. */
export default function GlobalSyncModal() {
  const { offlineSyncEnabled, showSyncModal, setShowSyncModal, syncProgress } = useSync();

  if (!offlineSyncEnabled) return null;

  return (
    <SyncProgressModal
      visible={showSyncModal}
      progress={syncProgress}
      onClose={() => setShowSyncModal(false)}
    />
  );
}
