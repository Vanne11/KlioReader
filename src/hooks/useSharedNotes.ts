import * as api from '@/lib/api';
import { useSocialStore } from '@/stores/socialStore';
import { useNotesStore } from '@/stores/notesStore';

export function useSharedNotes() {
  const { setSharedNotes } = useSocialStore();
  const { setReaderNotes } = useNotesStore();

  async function loadSharedNotes(bookId: number) {
    try {
      const notes = await api.getSharedNotes(bookId);
      setSharedNotes(notes);
    } catch {}
  }

  async function toggleVisibility(noteId: number) {
    try {
      const res = await api.toggleNoteShared(noteId);
      // Update local note state
      setReaderNotes(prev => prev.map(n => n.id === noteId ? { ...n, is_shared: res.is_shared } : n));
      return res.is_shared;
    } catch {
      return null;
    }
  }

  return { loadSharedNotes, toggleVisibility };
}
