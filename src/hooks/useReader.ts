import { useRef } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { useReaderStore } from '@/stores/readerStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useGamificationStore } from '@/stores/gamificationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useNotesStore } from '@/stores/notesStore';
import { addXP, updateStreak } from '@/lib/gamification';
import * as api from '@/lib/api';
import * as syncQueue from '@/lib/syncQueue';
import type { Book } from '@/types';

export function useReader() {
  const {
    currentBook, setCurrentBook, setSelectedBook, setEpubContent,
    readView, setCurrentPageInChapter, numPages,
    currentPageInChapter, totalPagesInChapter,
    setShowNotesPanel,
  } = useReaderStore();
  const { setBooks } = useLibraryStore();
  const { cloudBooks } = useCloudStore();
  const { setStats } = useGamificationStore();
  const { setReaderNotes, setReaderBookmarks } = useNotesStore();

  const pendingLastPageRef = useRef(false);
  const readerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  async function readBook(book: Book) {
    setSelectedBook(null);
    setCurrentBook(book);
    setCurrentPageInChapter(0);
    setShowNotesPanel(false);
    setReaderNotes([]);
    setReaderBookmarks([]);
    setStats(prev => updateStreak(prev));
    if (book.type === 'epub') loadEpubChapter(book.path, book.currentChapter);
  }

  async function loadEpubChapter(path: string, index: number) {
    try {
      let content: string = await invoke("read_epub_chapter", { path, chapterIndex: index });
      const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      setEpubContent(bodyMatch ? bodyMatch[1] : content.replace(/<\/?(html|head)[^>]*>/gi, ''));
      if (readerRef.current) readerRef.current.scrollTo(0, 0);
    } catch (e) { console.error(e); }
  }

  async function changePage(delta: number) {
    if (!currentBook) return;
    const storageConfigured = useSettingsStore.getState().storageConfigured();

    if (readView === 'paginated' && currentBook.type === 'epub') {
      const maxPage = totalPagesInChapter - 1;
      const newPage = currentPageInChapter + delta;

      if (newPage >= 0 && newPage <= maxPage) {
        setCurrentPageInChapter(newPage);
        return;
      }

      if (delta < 0 && newPage < 0) {
        pendingLastPageRef.current = true;
      } else if (delta > 0 && newPage > maxPage) {
        setCurrentPageInChapter(0);
      }
    }

    const newIndex = currentBook.currentChapter + delta;
    const total = currentBook.type === 'pdf' ? (numPages || 1) : currentBook.total_chapters;
    if (newIndex < 0 || newIndex >= total) return;

    if (currentBook.type === 'epub') await loadEpubChapter(currentBook.path, newIndex);

    const newProgress = Math.round(((newIndex + 1) / total) * 100);
    const updated = { ...currentBook, currentChapter: newIndex, progress: newProgress, lastRead: "Ahora mismo" };
    setCurrentBook(updated);
    setBooks((prev: Book[]) => prev.map(b => b.id === updated.id ? updated : b));
    if (delta > 0) setStats(prev => addXP(prev, 10));

    if (api.isLoggedIn()) {
      const cloudMatch = cloudBooks.find(cb =>
        cb.title.toLowerCase() === currentBook.title.toLowerCase() &&
        cb.author.toLowerCase() === currentBook.author.toLowerCase()
      );
      syncQueue.enqueue('sync_progress', {
        bookPath: currentBook.path,
        bookTitle: currentBook.title,
        bookAuthor: currentBook.author,
        cloudBookId: cloudMatch?.id || null,
        current_chapter: newIndex,
        current_page: newIndex,
        progress_percent: newProgress,
      });
    }

    if (storageConfigured) {
      const filename = currentBook.path.split('/').pop() || '';
      invoke('user_storage_update_progress', {
        filename,
        chapter: newIndex,
        page: currentPageInChapter,
        percent: newProgress,
      }).catch(() => {});
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  }

  return {
    readBook, loadEpubChapter, changePage, toggleFullscreen,
    pendingLastPageRef, readerRef, containerRef, contentRef,
  };
}
