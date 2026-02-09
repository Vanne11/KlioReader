import { useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSettingsStore } from '@/stores/settingsStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useUIStore } from '@/stores/uiStore';
import { saveStorageConfig, buildInvokeConfig, detectBookType } from '@/lib/constants';
import type { UserStorageConfig, SyncStatus } from '@/types';

export function useStorageSync() {
  const {
    storageConfig, setStorageConfig, setStorageTesting, setStorageTestResult,
    setSyncStatus, setSyncingManual, setGdriveAuthLoading,
  } = useSettingsStore();
  const { libraryPath } = useLibraryStore();
  const { showAlert } = useUIStore();

  function handleStorageConfigChange(patch: Partial<UserStorageConfig>) {
    const next = { ...storageConfig, ...patch };
    setStorageConfig(next);
    saveStorageConfig(next);
    setStorageTestResult(null);
  }

  async function handleTestConnection() {
    setStorageTesting(true);
    setStorageTestResult(null);
    try {
      const cfg = buildInvokeConfig(storageConfig);
      await invoke('user_storage_test_connection', { config: cfg });
      setStorageTestResult({ ok: true, msg: 'Conexión exitosa' });
    } catch (e: any) {
      setStorageTestResult({ ok: false, msg: e?.message || String(e) });
    } finally {
      setStorageTesting(false);
    }
  }

  async function handleConfigureAndSync() {
    if (!libraryPath) {
      showAlert('info', 'Sin carpeta', 'Configura primero una carpeta de biblioteca');
      return;
    }
    try {
      const cfg = buildInvokeConfig(storageConfig);
      await invoke('user_storage_configure', { config: cfg, libraryPath });
    } catch (e: any) {
      showAlert('error', 'Error configurando storage', e?.message || String(e));
    }
  }

  async function handleSyncNow() {
    setSyncingManual(true);
    try {
      await handleConfigureAndSync();
      const report: any = await invoke('user_storage_sync_now');
      const total = (report.uploaded?.length || 0) + (report.downloaded?.length || 0);
      const errors = report.errors?.length || 0;
      if (errors > 0) {
        showAlert('error', 'Sync con errores', `${total} archivos sincronizados, ${errors} error(es): ${report.errors.join(', ')}`);
      } else if (total > 0) {
        showAlert('success', 'Sincronización completa', `${report.uploaded?.length || 0} subidos, ${report.downloaded?.length || 0} descargados`);
      } else {
        showAlert('success', 'Todo sincronizado', 'No hay cambios pendientes');
      }
      const status: SyncStatus = await invoke('user_storage_get_status');
      setSyncStatus(status);
      if (report.downloaded?.length > 0 && libraryPath) {
        // Trigger rescan - import scanLibrary logic
        // Re-scan library directly
        const results: [string, any][] = await invoke("scan_directory", { dirPath: libraryPath });
        const savedRaw2 = localStorage.getItem("books_meta_v3");
        const progressMap2 = new Map();
        if (savedRaw2) JSON.parse(savedRaw2).forEach((b: any) => progressMap2.set(b.id, b));
        const scannedBooks = results.map(([filePath, meta]: [string, any]) => {
          const saved = progressMap2.get(filePath);
          return {
            ...meta, id: filePath, path: filePath,
            title: saved?.title || meta.title, author: saved?.author || meta.author,
            description: saved?.description ?? meta.description ?? null,
            currentChapter: saved?.currentChapter || 0, progress: saved?.progress || 0,
            lastRead: saved?.lastRead || "Sin leer",
            type: detectBookType(filePath),
          };
        });
        useLibraryStore.getState().setBooks(scannedBooks);
      }
    } catch (e: any) {
      showAlert('error', 'Error de sync', e?.message || String(e));
    } finally {
      setSyncingManual(false);
    }
  }

  async function handleToggleAutoSync() {
    const newEnabled = !storageConfig.auto_sync_enabled;
    handleStorageConfigChange({ auto_sync_enabled: newEnabled });
    try {
      if (newEnabled) {
        await handleConfigureAndSync();
        await invoke('user_storage_set_auto_sync_interval', { secs: storageConfig.auto_sync_interval || 300 });
        await invoke('user_storage_start_auto_sync');
      } else {
        await invoke('user_storage_stop_auto_sync');
      }
      const status: SyncStatus = await invoke('user_storage_get_status');
      setSyncStatus(status);
    } catch (e: any) {
      showAlert('error', 'Error auto-sync', e?.message || String(e));
    }
  }

  async function handleGDriveAuth() {
    setGdriveAuthLoading(true);
    try {
      const result: { access_token: string; refresh_token: string | null } = await invoke('gdrive_start_auth', {
        clientId: storageConfig.gdrive_client_id || '',
        clientSecret: storageConfig.gdrive_client_secret || '',
      });
      handleStorageConfigChange({
        gdrive_access_token: result.access_token,
        gdrive_refresh_token: result.refresh_token || undefined,
      });
      setStorageTestResult({ ok: true, msg: 'Google Drive conectado' });
    } catch (e: any) {
      setStorageTestResult({ ok: false, msg: e?.message || String(e) });
    } finally {
      setGdriveAuthLoading(false);
    }
  }

  async function handleAutoSyncIntervalChange(secs: number) {
    handleStorageConfigChange({ auto_sync_interval: secs });
    try {
      await invoke('user_storage_set_auto_sync_interval', { secs });
    } catch {}
  }

  return {
    handleStorageConfigChange, handleTestConnection, handleConfigureAndSync,
    handleSyncNow, handleToggleAutoSync, handleGDriveAuth, handleAutoSyncIntervalChange,
  };
}

// Sync events listener (used in usePersistence)
export function useSyncEvents() {
  const libraryPath = useLibraryStore(s => s.libraryPath);
  const setSyncStatus = useSettingsStore(s => s.setSyncStatus);

  useEffect(() => {
    const unlisten1 = listen('sync-progress', () => {
      setSyncStatus(prev => ({ ...prev, syncing: true }));
    });
    const unlisten2 = listen('sync-complete', async (event: any) => {
      setSyncStatus(prev => ({ ...prev, syncing: false, last_sync: new Date().toISOString() }));
      if (event.payload?.downloaded?.length > 0 && libraryPath) {
        try {
          const results: [string, any][] = await invoke("scan_directory", { dirPath: libraryPath });
          const savedRaw = localStorage.getItem("books_meta_v3");
          const progressMap = new Map();
          if (savedRaw) JSON.parse(savedRaw).forEach((b: any) => progressMap.set(b.id, b));
          const scannedBooks = results.map(([filePath, meta]: [string, any]) => {
            const saved = progressMap.get(filePath);
            return {
              ...meta, id: filePath, path: filePath,
              title: saved?.title || meta.title, author: saved?.author || meta.author,
              description: saved?.description ?? meta.description ?? null,
              currentChapter: saved?.currentChapter || 0, progress: saved?.progress || 0,
              lastRead: saved?.lastRead || "Sin leer",
              type: detectBookType(filePath),
            };
          });
          useLibraryStore.getState().setBooks(scannedBooks);
        } catch {}
      }
    });
    return () => { unlisten1.then(f => f()); unlisten2.then(f => f()); };
  }, [libraryPath]);
}
