import { create } from 'zustand';
import type { SettingsTab, LlmProvider, UserStorageConfig, SyncStatus } from '@/types';
import { loadStorageConfig } from '@/lib/constants';

interface SettingsState {
  settingsTab: SettingsTab;
  llmProvider: LlmProvider;
  llmApiKey: string;
  storageConfig: UserStorageConfig;
  storageTesting: boolean;
  storageTestResult: { ok: boolean; msg: string } | null;
  syncStatus: SyncStatus;
  syncingManual: boolean;
  gdriveAuthLoading: boolean;

  setSettingsTab: (tab: SettingsTab) => void;
  setLlmProvider: (provider: LlmProvider) => void;
  setLlmApiKey: (key: string) => void;
  setStorageConfig: (config: UserStorageConfig) => void;
  setStorageTesting: (testing: boolean) => void;
  setStorageTestResult: (result: { ok: boolean; msg: string } | null) => void;
  setSyncStatus: (status: SyncStatus | ((prev: SyncStatus) => SyncStatus)) => void;
  setSyncingManual: (syncing: boolean) => void;
  setGdriveAuthLoading: (loading: boolean) => void;

  storageConfigured: () => boolean;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settingsTab: 'display',
  llmProvider: (localStorage.getItem('klioLlmProvider') as LlmProvider) || 'groq',
  llmApiKey: localStorage.getItem('klioLlmApiKey') || '',
  storageConfig: loadStorageConfig(),
  storageTesting: false,
  storageTestResult: null,
  syncStatus: { syncing: false, last_sync: null, pending_up: 0, pending_down: 0, error: null, auto_sync_enabled: false, auto_sync_interval_secs: 300 },
  syncingManual: false,
  gdriveAuthLoading: false,

  setSettingsTab: (tab) => set({ settingsTab: tab }),
  setLlmProvider: (provider) => set({ llmProvider: provider }),
  setLlmApiKey: (key) => set({ llmApiKey: key }),
  setStorageConfig: (config) => set({ storageConfig: config }),
  setStorageTesting: (testing) => set({ storageTesting: testing }),
  setStorageTestResult: (result) => set({ storageTestResult: result }),
  setSyncStatus: (statusOrFn) => set((s) => ({
    syncStatus: typeof statusOrFn === 'function' ? statusOrFn(s.syncStatus) : statusOrFn,
  })),
  setSyncingManual: (syncing) => set({ syncingManual: syncing }),
  setGdriveAuthLoading: (loading) => set({ gdriveAuthLoading: loading }),

  storageConfigured: () => {
    const c = get().storageConfig;
    switch (c.provider) {
      case 's3': return !!(c.s3_bucket && c.s3_access_key && c.s3_secret_key);
      case 'webdav': return !!(c.webdav_url && c.webdav_username && c.webdav_password);
      case 'gdrive': return !!(c.gdrive_client_id && c.gdrive_refresh_token);
      default: return false;
    }
  },
}));
