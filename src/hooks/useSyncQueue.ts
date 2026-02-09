import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useCloudBooks } from './useCloudBooks';
import * as syncQueue from '@/lib/syncQueue';

export function useSyncQueue() {
  const authUser = useAuthStore(s => s.authUser);
  const { setQueueCount, setQueueSummary } = useCloudStore();
  const { loadCloudBooks } = useCloudBooks();

  useEffect(() => {
    if (!authUser) {
      syncQueue.stopProcessing();
      return;
    }
    syncQueue.setBooksRef(() => useLibraryStore.getState().books);
    syncQueue.setOnUploadComplete(() => loadCloudBooks());
    syncQueue.setOnQueueChange((count, summary) => { setQueueCount(count); setQueueSummary(summary); });
    syncQueue.startProcessing();
    return () => syncQueue.stopProcessing();
  }, [authUser]);
}
