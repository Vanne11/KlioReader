import { create } from 'zustand';
import type { BookShare, CloudBook, SearchUser, SharedUserProgress } from '@/types';

interface SharesState {
  pendingSharesCount: number;
  pendingShares: BookShare[];
  showInvitations: boolean;
  sharingBook: CloudBook | null;
  shareSearchQuery: string;
  shareSearchResults: SearchUser[];
  shareSearching: boolean;
  shareMessage: string;
  shareSending: number | null;
  sharedProgressMap: Record<number, SharedUserProgress[]>;
  expandedShareProgress: number | null;

  setPendingSharesCount: (count: number | ((prev: number) => number)) => void;
  setPendingShares: (shares: BookShare[] | ((prev: BookShare[]) => BookShare[])) => void;
  setShowInvitations: (show: boolean | ((prev: boolean) => boolean)) => void;
  setSharingBook: (book: CloudBook | null) => void;
  setShareSearchQuery: (query: string) => void;
  setShareSearchResults: (results: SearchUser[] | ((prev: SearchUser[]) => SearchUser[])) => void;
  setShareSearching: (searching: boolean) => void;
  setShareMessage: (message: string) => void;
  setShareSending: (userId: number | null) => void;
  setSharedProgressMap: (map: Record<number, SharedUserProgress[]> | ((prev: Record<number, SharedUserProgress[]>) => Record<number, SharedUserProgress[]>)) => void;
  setExpandedShareProgress: (bookId: number | null) => void;
}

export const useSharesStore = create<SharesState>()((set) => ({
  pendingSharesCount: 0,
  pendingShares: [],
  showInvitations: true,
  sharingBook: null,
  shareSearchQuery: '',
  shareSearchResults: [],
  shareSearching: false,
  shareMessage: '',
  shareSending: null,
  sharedProgressMap: {},
  expandedShareProgress: null,

  setPendingSharesCount: (countOrFn) => set((s) => ({
    pendingSharesCount: typeof countOrFn === 'function' ? countOrFn(s.pendingSharesCount) : countOrFn,
  })),
  setPendingShares: (sharesOrFn) => set((s) => ({
    pendingShares: typeof sharesOrFn === 'function' ? sharesOrFn(s.pendingShares) : sharesOrFn,
  })),
  setShowInvitations: (showOrFn) => set((s) => ({
    showInvitations: typeof showOrFn === 'function' ? showOrFn(s.showInvitations) : showOrFn,
  })),
  setSharingBook: (book) => set({ sharingBook: book }),
  setShareSearchQuery: (query) => set({ shareSearchQuery: query }),
  setShareSearchResults: (resultsOrFn) => set((s) => ({
    shareSearchResults: typeof resultsOrFn === 'function' ? resultsOrFn(s.shareSearchResults) : resultsOrFn,
  })),
  setShareSearching: (searching) => set({ shareSearching: searching }),
  setShareMessage: (message) => set({ shareMessage: message }),
  setShareSending: (userId) => set({ shareSending: userId }),
  setSharedProgressMap: (mapOrFn) => set((s) => ({
    sharedProgressMap: typeof mapOrFn === 'function' ? mapOrFn(s.sharedProgressMap) : mapOrFn,
  })),
  setExpandedShareProgress: (bookId) => set({ expandedShareProgress: bookId }),
}));
