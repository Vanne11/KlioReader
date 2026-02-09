import { create } from 'zustand';
import type { Note, Bookmark } from '@/types';

interface NotesState {
  readerNotes: Note[];
  readerBookmarks: Bookmark[];
  newNoteContent: string;
  newNoteColor: string;

  setReaderNotes: (notes: Note[] | ((prev: Note[]) => Note[])) => void;
  setReaderBookmarks: (bookmarks: Bookmark[] | ((prev: Bookmark[]) => Bookmark[])) => void;
  setNewNoteContent: (content: string) => void;
  setNewNoteColor: (color: string) => void;
}

export const useNotesStore = create<NotesState>()((set) => ({
  readerNotes: [],
  readerBookmarks: [],
  newNoteContent: '',
  newNoteColor: '#ffeb3b',

  setReaderNotes: (notesOrFn) => set((s) => ({
    readerNotes: typeof notesOrFn === 'function' ? notesOrFn(s.readerNotes) : notesOrFn,
  })),
  setReaderBookmarks: (bookmarksOrFn) => set((s) => ({
    readerBookmarks: typeof bookmarksOrFn === 'function' ? bookmarksOrFn(s.readerBookmarks) : bookmarksOrFn,
  })),
  setNewNoteContent: (content) => set({ newNoteContent: content }),
  setNewNoteColor: (color) => set({ newNoteColor: color }),
}));
