import * as api from '@/lib/api';
import { useReaderStore } from '@/stores/readerStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useNotesStore } from '@/stores/notesStore';
import { useUIStore } from '@/stores/uiStore';

export function useReaderNotes() {
  const { currentBook } = useReaderStore();
  const { cloudBooks } = useCloudStore();
  const { setReaderNotes, setReaderBookmarks, readerBookmarks, newNoteContent, newNoteColor, setNewNoteContent } = useNotesStore();
  const { showAlert } = useUIStore();

  function getCloudBookForCurrent(): api.CloudBook | undefined {
    if (!currentBook) return undefined;
    return cloudBooks.find(cb =>
      cb.title.toLowerCase() === currentBook.title.toLowerCase() &&
      cb.author.toLowerCase() === currentBook.author.toLowerCase()
    );
  }

  async function loadReaderNotesAndBookmarks() {
    if (!api.isLoggedIn()) return;
    const cloud = getCloudBookForCurrent();
    if (!cloud) return;
    try {
      const [notes, bookmarks] = await Promise.all([
        api.getNotes(cloud.id),
        api.getBookmarks(cloud.id),
      ]);
      setReaderNotes(notes);
      setReaderBookmarks(bookmarks);
    } catch { /* silent */ }
  }

  async function addReaderNote() {
    if (!currentBook || !newNoteContent.trim()) return;
    const cloud = getCloudBookForCurrent();
    if (!cloud) { showAlert('info', 'Sin conexión', 'Sube este libro a la nube para guardar notas'); return; }
    try {
      const { id } = await api.addNote(cloud.id, {
        chapter_index: currentBook.currentChapter,
        content: newNoteContent.trim(),
        color: newNoteColor,
      });
      setReaderNotes(prev => [...prev, {
        id, book_id: cloud.id, chapter_index: currentBook.currentChapter,
        content: newNoteContent.trim(), highlight_text: null, color: newNoteColor,
        created_at: new Date().toISOString(),
      }]);
      setNewNoteContent('');
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo guardar la nota');
    }
  }

  async function deleteReaderNote(noteId: number) {
    try {
      await api.deleteNote(noteId);
      setReaderNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo eliminar la nota');
    }
  }

  async function addReaderBookmark() {
    if (!currentBook) return;
    const cloud = getCloudBookForCurrent();
    if (!cloud) { showAlert('info', 'Sin conexión', 'Sube este libro a la nube para guardar marcadores'); return; }
    // For EPUBs, only compare by chapter_index (foliate-js doesn't expose discrete pages)
    const exists = readerBookmarks.find(b =>
      b.chapter_index === currentBook.currentChapter
    );
    if (exists) {
      await deleteReaderBookmark(exists.id);
      return;
    }
    try {
      const label = `Cap. ${currentBook.currentChapter + 1}`;
      const { id } = await api.addBookmark(cloud.id, {
        chapter_index: currentBook.currentChapter,
        page_index: 0,
        label,
      });
      setReaderBookmarks(prev => [...prev, {
        id, book_id: cloud.id, chapter_index: currentBook.currentChapter,
        page_index: 0, label, created_at: new Date().toISOString(),
      }]);
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo guardar el marcador');
    }
  }

  async function deleteReaderBookmark(bookmarkId: number) {
    try {
      await api.deleteBookmark(bookmarkId);
      setReaderBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo eliminar el marcador');
    }
  }

  return { loadReaderNotesAndBookmarks, addReaderNote, deleteReaderNote, addReaderBookmark, deleteReaderBookmark };
}
