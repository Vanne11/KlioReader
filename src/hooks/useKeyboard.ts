import { useEffect } from 'react';
import { useReaderStore } from '@/stores/readerStore';
import { useReader } from './useReader';

export function useKeyboard() {
  const currentBook = useReaderStore(s => s.currentBook);
  const readView = useReaderStore(s => s.readView);
  const numPages = useReaderStore(s => s.numPages);
  const currentPageInChapter = useReaderStore(s => s.currentPageInChapter);
  const totalPagesInChapter = useReaderStore(s => s.totalPagesInChapter);
  const { setCurrentBook } = useReaderStore();
  const { changePage, toggleFullscreen, readerRef } = useReader();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentBook) return;
      if (e.key === "ArrowRight") changePage(1);
      if (e.key === "ArrowLeft") changePage(-1);
      if (readView === 'scroll' && readerRef.current) {
        if (e.key === "ArrowDown") { e.preventDefault(); readerRef.current.scrollBy({ top: 100, behavior: 'smooth' }); }
        if (e.key === "ArrowUp") { e.preventDefault(); readerRef.current.scrollBy({ top: -100, behavior: 'smooth' }); }
      }
      if (e.key === "f") toggleFullscreen();
      if (e.key === "Escape" && !document.fullscreenElement) setCurrentBook(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentBook, numPages, readView, currentPageInChapter, totalPagesInChapter]);
}
