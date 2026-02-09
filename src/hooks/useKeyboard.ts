import { useEffect } from 'react';
import { useReaderStore } from '@/stores/readerStore';
import { useReader } from './useReader';

export function useKeyboard() {
  const currentBook = useReaderStore(s => s.currentBook);
  const { setCurrentBook } = useReaderStore();
  const { changePage, toggleFullscreen } = useReader();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentBook) return;
      if (e.key === "ArrowRight") changePage(1);
      if (e.key === "ArrowLeft") changePage(-1);
      if (e.key === "f") toggleFullscreen();
      if (e.key === "Escape" && !document.fullscreenElement) setCurrentBook(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentBook]);
}
