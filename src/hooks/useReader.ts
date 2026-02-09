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
    currentBook, setCurrentBook, setSelectedBook,
    numPages, foliateView,
    setShowNotesPanel, setCurrentFraction,
  } = useReaderStore();
  const { setBooks } = useLibraryStore();
  const { cloudBooks } = useCloudStore();
  const { setStats } = useGamificationStore();
  const { setReaderNotes, setReaderBookmarks } = useNotesStore();

  const readerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  async function readBook(book: Book) {
    setSelectedBook(null);
    setCurrentBook(book);
    setShowNotesPanel(false);
    setReaderNotes([]);
    setReaderBookmarks([]);
    setCurrentFraction(0);
    setStats(prev => updateStreak(prev));
  }

  async function changePage(delta: number) {
    if (!currentBook) return;
    const storageConfigured = useSettingsStore.getState().storageConfigured();

    if (currentBook.type !== 'pdf') {
      if (foliateView) {
        if (delta > 0) await foliateView.next();
        else await foliateView.prev();
      }
      return;
    }

    // PDF navigation (unchanged)
    const newIndex = currentBook.currentChapter + delta;
    const total = numPages || 1;
    if (newIndex < 0 || newIndex >= total) return;

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
        page: newIndex,
        percent: newProgress,
      }).catch(() => {});
    }
  }

  function handleRelocate(detail: { fraction: number; sectionIndex: number; sectionTotal: number; cfi?: string }) {
    if (!currentBook || currentBook.type === 'pdf') return;
    const storageConfigured = useSettingsStore.getState().storageConfigured();

    const { fraction, sectionIndex, sectionTotal } = detail;
    const prevChapter = currentBook.currentChapter;
    const newProgress = Math.round(fraction * 100);

    setCurrentFraction(fraction);

    const updated = {
      ...currentBook,
      currentChapter: sectionIndex,
      progress: newProgress,
      total_chapters: sectionTotal,
      lastRead: "Ahora mismo",
    };
    setCurrentBook(updated);
    setBooks((prev: Book[]) => prev.map(b => b.id === updated.id ? updated : b));

    if (sectionIndex > prevChapter) {
      setStats(prev => addXP(prev, 10));
    }

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
        current_chapter: sectionIndex,
        current_page: sectionIndex,
        progress_percent: newProgress,
      });
    }

    if (storageConfigured) {
      const filename = currentBook.path.split('/').pop() || '';
      invoke('user_storage_update_progress', {
        filename,
        chapter: sectionIndex,
        page: 0,
        percent: newProgress,
      }).catch(() => {});
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  }

  return {
    readBook, changePage, handleRelocate, toggleFullscreen,
    readerRef, containerRef,
  };
}
