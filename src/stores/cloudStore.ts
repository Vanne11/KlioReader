import { create } from 'zustand';
import type { CloudBook } from '@/types';
import type { SyncOp, SyncOpDone } from '@/lib/syncQueue';

interface CloudState {
  cloudBooks: CloudBook[];
  cloudBooksReady: boolean;
  cloudLoading: boolean;
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
  setDownloadingBookId: (id: number | null) => void;
  setQueueCount: (count: number) => void;
  setQueueSummary: (summary: string) => void;
  setQueueItems: (items: SyncOp[]) => void;
  setQueueProcessingId: (id: string | null) => void;
  setQueueHistory: (items: SyncOpDone[]) => void;
  setEditingCloudBook: (book: CloudBook | null) => void;
  setEditCloudForm: (form: { title: string; author: string; description: string }) => void;
  updateEditCloudForm: (patch: Partial<{ title: string; author: string; description: string }>) => void;
}

export const useCloudStore = create<CloudState>()((set) => ({
  cloudBooks: [],
  cloudBooksReady: false,
  cloudLoading: false,
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
  setDownloadingBookId: (id) => set({ downloadingBookId: id }),
  setQueueCount: (count) => set({ queueCount: count }),
  setQueueSummary: (summary) => set({ queueSummary: summary }),
  setQueueItems: (items) => set({ queueItems: items }),
  setQueueProcessingId: (id) => set({ queueProcessingId: id }),
  setQueueHistory: (items) => set({ queueHistory: items }),
  setEditingCloudBook: (book) => set({ editingCloudBook: book }),
  setEditCloudForm: (form) => set({ editCloudForm: form }),
  updateEditCloudForm: (patch) => set((s) => ({ editCloudForm: { ...s.editCloudForm, ...patch } })),
}));
