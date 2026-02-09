import { create } from 'zustand';
import type { Book, ReaderTheme, ReadView, ReaderFont } from '@/types';

interface ReaderState {
  currentBook: Book | null;
  selectedBook: Book | null;
  fontSize: number;
  readerTheme: ReaderTheme;
  readView: ReadView;
  pageColumns: 1 | 2;
  readerFont: ReaderFont;
  numPages: number | null;
  isFullscreen: boolean;
  showNotesPanel: boolean;
  foliateView: any | null;
  currentFraction: number;

  setCurrentBook: (book: Book | null) => void;
  setSelectedBook: (book: Book | null) => void;
  setFontSize: (size: number | ((prev: number) => number)) => void;
  setReaderTheme: (theme: ReaderTheme) => void;
  setReadView: (view: ReadView) => void;
  setPageColumns: (columns: 1 | 2) => void;
  setReaderFont: (font: ReaderFont) => void;
  setNumPages: (pages: number | null) => void;
  setIsFullscreen: (fullscreen: boolean) => void;
  setShowNotesPanel: (show: boolean | ((prev: boolean) => boolean)) => void;
  setFoliateView: (view: any | null) => void;
  setCurrentFraction: (fraction: number) => void;
}

export const useReaderStore = create<ReaderState>()((set) => ({
  currentBook: null,
  selectedBook: null,
  fontSize: Number(localStorage.getItem("readerFontSize")) || 18,
  readerTheme: (localStorage.getItem("readerTheme") as ReaderTheme) || 'dark',
  readView: (localStorage.getItem("readView") as ReadView) || 'scroll',
  pageColumns: (Number(localStorage.getItem("readerPageColumns")) as 1 | 2) || 2,
  readerFont: (localStorage.getItem("readerFont") as ReaderFont) || 'Libre Baskerville',
  numPages: null,
  isFullscreen: false,
  showNotesPanel: false,
  foliateView: null,
  currentFraction: 0,

  setCurrentBook: (book) => set({ currentBook: book }),
  setSelectedBook: (book) => set({ selectedBook: book }),
  setFontSize: (sizeOrFn) => set((s) => ({
    fontSize: typeof sizeOrFn === 'function' ? sizeOrFn(s.fontSize) : sizeOrFn,
  })),
  setReaderTheme: (theme) => set({ readerTheme: theme }),
  setReadView: (view) => set({ readView: view }),
  setPageColumns: (columns) => set({ pageColumns: columns }),
  setReaderFont: (font) => set({ readerFont: font }),
  setNumPages: (pages) => set({ numPages: pages }),
  setIsFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),
  setShowNotesPanel: (showOrFn) => set((s) => ({
    showNotesPanel: typeof showOrFn === 'function' ? showOrFn(s.showNotesPanel) : showOrFn,
  })),
  setFoliateView: (view) => set({ foliateView: view }),
  setCurrentFraction: (fraction) => set({ currentFraction: fraction }),
}));
