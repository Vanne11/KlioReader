import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { Book, ReaderTheme } from '@/types';

interface ComicReaderProps {
  bookPath: string;
  bookType: Book['type'];
  theme: ReaderTheme;
  initialSection?: number;
  onRelocate?: (detail: { fraction: number; sectionIndex: number; sectionTotal: number }) => void;
  onReady?: (view: any) => void;
}

const THEME_BG: Record<ReaderTheme, string> = {
  dark: '#1e1e2e',
  sepia: '#f4ecd8',
  light: '#ffffff',
};

export function ComicReader({
  bookPath, bookType, theme, initialSection, onRelocate, onReady,
}: ComicReaderProps) {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  const tempDirRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const currentPageRef = useRef(0);
  const onRelocateRef = useRef(onRelocate);
  const onReadyRef = useRef(onReady);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastDoubleTapRef = useRef(0);

  onRelocateRef.current = onRelocate;
  onReadyRef.current = onReady;

  const scrollToPage = useCallback((index: number, smooth = true) => {
    const el = pageRefs.current[index];
    if (el) {
      el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    }
  }, []);

  // Extract pages on mount
  useEffect(() => {
    let cancelled = false;

    async function extract() {
      try {
        setLoading(true);
        setError(null);

        const result: { temp_dir: string; pages: string[] } = await invoke('extract_comic_pages', {
          path: bookPath,
          bookType,
        });

        if (cancelled) {
          invoke('cleanup_comic_temp', { tempDir: result.temp_dir }).catch(() => {});
          return;
        }

        tempDirRef.current = result.temp_dir;
        const urls = result.pages.map(p => convertFileSrc(p));
        setPages(urls);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.toString() || 'Error extrayendo cómic');
          setLoading(false);
        }
      }
    }

    extract();

    return () => {
      cancelled = true;
      if (tempDirRef.current) {
        invoke('cleanup_comic_temp', { tempDir: tempDirRef.current }).catch(() => {});
        tempDirRef.current = null;
      }
    };
  }, [bookPath, bookType]);

  // Set up IntersectionObserver for page tracking
  useEffect(() => {
    if (pages.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const index = Number(entry.target.getAttribute('data-page'));
            if (!isNaN(index) && index !== currentPageRef.current) {
              currentPageRef.current = index;
              onRelocateRef.current?.({
                fraction: (index + 1) / pages.length,
                sectionIndex: index,
                sectionTotal: pages.length,
              });
            }
          }
        }
      },
      {
        root: containerRef.current,
        threshold: 0.5,
      }
    );

    pageRefs.current.forEach((el) => {
      if (el) observerRef.current!.observe(el);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [pages]);

  // Navigate to initial section after pages load
  useEffect(() => {
    if (pages.length === 0) return;

    const section = initialSection ?? 0;
    if (section > 0 && section < pages.length) {
      // Small delay to ensure DOM is rendered
      requestAnimationFrame(() => {
        scrollToPage(section, false);
      });
    }

    // Expose navigation API via onReady
    const comicApi = {
      async next() {
        const next = Math.min(currentPageRef.current + 1, pages.length - 1);
        scrollToPage(next);
      },
      async prev() {
        const prev = Math.max(currentPageRef.current - 1, 0);
        scrollToPage(prev);
      },
      async goTo(index: number) {
        if (index >= 0 && index < pages.length) {
          scrollToPage(index);
        }
      },
    };
    onReadyRef.current?.(comicApi);
  }, [pages, initialSection, scrollToPage]);

  // Double-tap zoom handler
  const handleDoubleTap = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const now = Date.now();
    if (now - lastDoubleTapRef.current < 300) {
      e.preventDefault();
      setZoomed(z => !z);
    }
    lastDoubleTapRef.current = now;
  }, []);

  // Touch navigation for tap zones (left 25% = prev, right 25% = next)
  const handleTouchNav = useCallback((e: React.MouseEvent) => {
    if (zoomed) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = (e.clientX - rect.left) / rect.width;
    if (relX < 0.25) {
      const prev = Math.max(currentPageRef.current - 1, 0);
      scrollToPage(prev);
    } else if (relX > 0.75) {
      const next = Math.min(currentPageRef.current + 1, pages.length - 1);
      scrollToPage(next);
    }
  }, [zoomed, pages.length, scrollToPage]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        const next = Math.min(currentPageRef.current + 1, pages.length - 1);
        scrollToPage(next);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        const prev = Math.max(currentPageRef.current - 1, 0);
        scrollToPage(prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pages.length, scrollToPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: THEME_BG[theme] }}>
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto opacity-50" />
          <p className="text-sm opacity-50">Extrayendo páginas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: THEME_BG[theme] }}>
        <div className="text-center space-y-2">
          <p className="text-sm text-red-400">Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto overflow-x-hidden"
      style={{ background: THEME_BG[theme] }}
      onClick={handleTouchNav}
      onTouchEnd={handleDoubleTap}
    >
      <div
        className="mx-auto"
        style={{
          maxWidth: zoomed ? '200%' : '100%',
          width: zoomed ? '200%' : '100%',
          overflowX: zoomed ? 'auto' : 'hidden',
          transition: 'max-width 0.3s ease, width 0.3s ease',
        }}
      >
        {pages.map((url, i) => (
          <div
            key={i}
            ref={(el) => { pageRefs.current[i] = el; }}
            data-page={i}
            className="w-full"
          >
            <img
              src={url}
              alt={`Página ${i + 1}`}
              loading="lazy"
              className="w-full h-auto block"
              draggable={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
