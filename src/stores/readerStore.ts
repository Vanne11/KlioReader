import { create } from 'zustand';
import type { Book, ReaderTheme, ReadView, ReaderFont } from '@/types';

interface ReaderState {
  currentBook: Book | null;
  selectedBook: Book | null;
  epubContent: string;
  fontSize: number;
  readerTheme: ReaderTheme;
  readView: ReadView;
  pageColumns: 1 | 2;
  readerFont: ReaderFont;
  numPages: number | null;
  isFullscreen: boolean;
  currentPageInChapter: number;
  totalPagesInChapter: number;
  pageHeight: number;
  pageWidth: number;
  showNotesPanel: boolean;

  setCurrentBook: (book: Book | null) => void;
  setSelectedBook: (book: Book | null) => void;
  setEpubContent: (content: string) => void;
  setFontSize: (size: number | ((prev: number) => number)) => void;
  setReaderTheme: (theme: ReaderTheme) => void;
  setReadView: (view: ReadView) => void;
  setPageColumns: (columns: 1 | 2) => void;
  setReaderFont: (font: ReaderFont) => void;
  setNumPages: (pages: number | null) => void;
  setIsFullscreen: (fullscreen: boolean) => void;
  setCurrentPageInChapter: (page: number | ((prev: number) => number)) => void;
  setTotalPagesInChapter: (pages: number) => void;
  setPageHeight: (height: number) => void;
  setPageWidth: (width: number) => void;
  setShowNotesPanel: (show: boolean | ((prev: boolean) => boolean)) => void;
}

export const useReaderStore = create<ReaderState>()((set) => ({
  currentBook: null,
  selectedBook: null,
  epubContent: '',
  fontSize: Number(localStorage.getItem("readerFontSize")) || 18,
  readerTheme: (localStorage.getItem("readerTheme") as ReaderTheme) || 'dark',
  readView: (localStorage.getItem("readView") as ReadView) || 'scroll',
  pageColumns: (Number(localStorage.getItem("readerPageColumns")) as 1 | 2) || 2,
  readerFont: (localStorage.getItem("readerFont") as ReaderFont) || 'Libre Baskerville',
  numPages: null,
  isFullscreen: false,
  currentPageInChapter: 0,
  totalPagesInChapter: 1,
  pageHeight: 0,
  pageWidth: 0,
  showNotesPanel: false,

  setCurrentBook: (book) => set({ currentBook: book }),
  setSelectedBook: (book) => set({ selectedBook: book }),
  setEpubContent: (content) => set({ epubContent: content }),
  setFontSize: (sizeOrFn) => set((s) => ({
    fontSize: typeof sizeOrFn === 'function' ? sizeOrFn(s.fontSize) : sizeOrFn,
  })),
  setReaderTheme: (theme) => set({ readerTheme: theme }),
  setReadView: (view) => set({ readView: view }),
  setPageColumns: (columns) => set({ pageColumns: columns }),
  setReaderFont: (font) => set({ readerFont: font }),
  setNumPages: (pages) => set({ numPages: pages }),
  setIsFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),
  setCurrentPageInChapter: (pageOrFn) => set((s) => ({
    currentPageInChapter: typeof pageOrFn === 'function' ? pageOrFn(s.currentPageInChapter) : pageOrFn,
  })),
  setTotalPagesInChapter: (pages) => set({ totalPagesInChapter: pages }),
  setPageHeight: (height) => set({ pageHeight: height }),
  setPageWidth: (width) => set({ pageWidth: width }),
  setShowNotesPanel: (showOrFn) => set((s) => ({
    showNotesPanel: typeof showOrFn === 'function' ? showOrFn(s.showNotesPanel) : showOrFn,
  })),
}));
