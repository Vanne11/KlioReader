import { create } from 'zustand';
import type { LocalCollection, CloudCollection, CollectionShare } from '@/types';

const LOCAL_STORAGE_KEY = 'klioLocalCollections';

function loadLocalCollections(): LocalCollection[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCollections(collections: LocalCollection[]) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(collections));
}

interface CollectionsState {
  localCollections: LocalCollection[];
  activeCollectionId: string | null;
  cloudCollections: CloudCollection[];
  pendingCollectionShares: CollectionShare[];
  pendingCollectionSharesCount: number;
  showCreateDialog: boolean;
  editingCollection: LocalCollection | null;
  sharingCollection: CloudCollection | null;

  setLocalCollections: (collections: LocalCollection[] | ((prev: LocalCollection[]) => LocalCollection[])) => void;
  setActiveCollectionId: (id: string | null) => void;
  setCloudCollections: (collections: CloudCollection[] | ((prev: CloudCollection[]) => CloudCollection[])) => void;
  setPendingCollectionShares: (shares: CollectionShare[] | ((prev: CollectionShare[]) => CollectionShare[])) => void;
  setPendingCollectionSharesCount: (count: number | ((prev: number) => number)) => void;
  setShowCreateDialog: (show: boolean) => void;
  setEditingCollection: (collection: LocalCollection | null) => void;
  setSharingCollection: (collection: CloudCollection | null) => void;
}

export const useCollectionsStore = create<CollectionsState>()((set) => ({
  localCollections: loadLocalCollections(),
  activeCollectionId: null,
  cloudCollections: [],
  pendingCollectionShares: [],
  pendingCollectionSharesCount: 0,
  showCreateDialog: false,
  editingCollection: null,
  sharingCollection: null,

  setLocalCollections: (colsOrFn) => set((s) => {
    const newCols = typeof colsOrFn === 'function' ? colsOrFn(s.localCollections) : colsOrFn;
    saveLocalCollections(newCols);
    return { localCollections: newCols };
  }),
  setActiveCollectionId: (id) => set({ activeCollectionId: id }),
  setCloudCollections: (colsOrFn) => set((s) => ({
    cloudCollections: typeof colsOrFn === 'function' ? colsOrFn(s.cloudCollections) : colsOrFn,
  })),
  setPendingCollectionShares: (sharesOrFn) => set((s) => ({
    pendingCollectionShares: typeof sharesOrFn === 'function' ? sharesOrFn(s.pendingCollectionShares) : sharesOrFn,
  })),
  setPendingCollectionSharesCount: (countOrFn) => set((s) => ({
    pendingCollectionSharesCount: typeof countOrFn === 'function' ? countOrFn(s.pendingCollectionSharesCount) : countOrFn,
  })),
  setShowCreateDialog: (show) => set({ showCreateDialog: show }),
  setEditingCollection: (collection) => set({ editingCollection: collection }),
  setSharingCollection: (collection) => set({ sharingCollection: collection }),
}));
