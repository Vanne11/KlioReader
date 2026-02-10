import { create } from 'zustand';
import type { CloudBook } from '@/types';
import type { SyncOp, SyncOpDone } from '@/lib/syncQueue';

const CACHE_KEY = 'klioCloudBooksCache';

interface CloudCache {
  hash: string;
  books: CloudBook[];
  timestamp: number;
}

function loadCache(): CloudCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCache(hash: string, books: CloudBook[]) {
  try {
    const cache: CloudCache = { hash, books, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* localStorage full — ignorar */ }
}

function clearCache() {
  localStorage.removeItem(CACHE_KEY);
}

interface CloudState {
  cloudBooks: CloudBook[];
  cloudBooksReady: boolean;
  cloudLoading: boolean;
  cloudDigestHash: string | null;
  downloadingBookId: number | null;
  queueCount: number;
  queueSummary: string;
  queueItems: SyncOp[];
  queueProcessingId: string | null;
  queueHistory: SyncOpDone[];
  editingCloudBook: CloudBook | null;
  editCloudForm: { title: string; author: string; description: string };

  setCloudBooks: (books: CloudBook[] | ((prev: CloudBook[]) => CloudBook[])) => void;
  setCloudBooksReady: (ready: boolean) => void;
  setCloudLoading: (loading: boolean) => void;
  setCloudDigestHash: (hash: string | null) => void;
  setDownloadingBookId: (id: number | null) => void;
  setQueueCount: (count: number) => void;
  setQueueSummary: (summary: string) => void;
  setQueueItems: (items: SyncOp[]) => void;
  setQueueProcessingId: (id: string | null) => void;
  setQueueHistory: (items: SyncOpDone[]) => void;
  setEditingCloudBook: (book: CloudBook | null) => void;
  setEditCloudForm: (form: { title: string; author: string; description: string }) => void;
  updateEditCloudForm: (patch: Partial<{ title: string; author: string; description: string }>) => void;
  // Cache helpers
  persistCache: () => void;
  loadFromCache: () => boolean;
  clearCloudCache: () => void;
}

// Debounce para persistCache — evita serializar cloudBooks múltiples veces seguidas
let _persistTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveCache(hash: string, books: CloudBook[]) {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    saveCache(hash, books);
    _persistTimer = null;
  }, 500);
}

// Cargar caché al inicializar para tener datos inmediatos
const cached = loadCache();

export const useCloudStore = create<CloudState>()((set, get) => ({
  cloudBooks: cached?.books ?? [],
  cloudBooksReady: cached ? true : false,
  cloudLoading: false,
  cloudDigestHash: cached?.hash ?? null,
  downloadingBookId: null,
  queueCount: 0,
  queueSummary: '',
  queueItems: [],
  queueProcessingId: null,
  queueHistory: [],
  editingCloudBook: null,
  editCloudForm: { title: '', author: '', description: '' },

  setCloudBooks: (booksOrFn) => set((s) => ({
    cloudBooks: typeof booksOrFn === 'function' ? booksOrFn(s.cloudBooks) : booksOrFn,
  })),
  setCloudBooksReady: (ready) => set({ cloudBooksReady: ready }),
  setCloudLoading: (loading) => set({ cloudLoading: loading }),
  setCloudDigestHash: (hash) => set({ cloudDigestHash: hash }),
  setDownloadingBookId: (id) => set({ downloadingBookId: id }),
  setQueueCount: (count) => set({ queueCount: count }),
  setQueueSummary: (summary) => set({ queueSummary: summary }),
  setQueueItems: (items) => set({ queueItems: items }),
  setQueueProcessingId: (id) => set({ queueProcessingId: id }),
  setQueueHistory: (items) => set({ queueHistory: items }),
  setEditingCloudBook: (book) => set({ editingCloudBook: book }),
  setEditCloudForm: (form) => set({ editCloudForm: form }),
  updateEditCloudForm: (patch) => set((s) => ({ editCloudForm: { ...s.editCloudForm, ...patch } })),

  persistCache: () => {
    const { cloudDigestHash, cloudBooks } = get();
    if (cloudDigestHash) debouncedSaveCache(cloudDigestHash, cloudBooks);
  },
  loadFromCache: () => {
    const c = loadCache();
    if (!c) return false;
    set({ cloudBooks: c.books, cloudDigestHash: c.hash, cloudBooksReady: true });
    return true;
  },
  clearCloudCache: () => {
    clearCache();
    set({ cloudBooks: [], cloudDigestHash: null, cloudBooksReady: false });
  },
}));
