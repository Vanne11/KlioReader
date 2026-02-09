import { create } from 'zustand';
import type { Book, LibraryView } from '@/types';

interface LibraryState {
  books: Book[];
  booksLoaded: boolean;
  libraryPath: string | null;
  libraryView: LibraryView;
  isMobile: boolean;
  editingLocalBook: Book | null;
  editLocalForm: { title: string; author: string; description: string };

  setBooks: (books: Book[] | ((prev: Book[]) => Book[])) => void;
  setBooksLoaded: (loaded: boolean) => void;
  setLibraryPath: (path: string | null) => void;
  setLibraryView: (view: LibraryView) => void;
  setIsMobile: (mobile: boolean) => void;
  setEditingLocalBook: (book: Book | null) => void;
  setEditLocalForm: (form: { title: string; author: string; description: string }) => void;
  updateEditLocalForm: (patch: Partial<{ title: string; author: string; description: string }>) => void;
}

export const useLibraryStore = create<LibraryState>()((set) => ({
  books: [],
  booksLoaded: false,
  libraryPath: localStorage.getItem("libraryPath"),
  libraryView: (localStorage.getItem("libraryView") as LibraryView) || "grid-large",
  isMobile: false,
  editingLocalBook: null,
  editLocalForm: { title: '', author: '', description: '' },

  setBooks: (booksOrFn) => set((state) => ({
    books: typeof booksOrFn === 'function' ? booksOrFn(state.books) : booksOrFn,
  })),
  setBooksLoaded: (loaded) => set({ booksLoaded: loaded }),
  setLibraryPath: (path) => set({ libraryPath: path }),
  setLibraryView: (view) => set({ libraryView: view }),
  setIsMobile: (mobile) => set({ isMobile: mobile }),
  setEditingLocalBook: (book) => set({ editingLocalBook: book }),
  setEditLocalForm: (form) => set({ editLocalForm: form }),
  updateEditLocalForm: (patch) => set((s) => ({ editLocalForm: { ...s.editLocalForm, ...patch } })),
}));
