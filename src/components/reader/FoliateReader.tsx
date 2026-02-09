import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Book, ReaderTheme, ReaderFont, ReadView } from '@/types';
import { isComicType } from '@/lib/constants';

interface FoliateReaderProps {
  bookPath: string;
  bookType: Book['type'];
  flow: ReadView;
  fontSize: number;
  fontFamily: ReaderFont;
  theme: ReaderTheme;
  pageColumns: 1 | 2;
  initialSection?: number;
  onRelocate?: (detail: { fraction: number; sectionIndex: number; sectionTotal: number; cfi?: string }) => void;
  onReady?: (view: any) => void;
}

const THEME_COLORS: Record<ReaderTheme, { bg: string; fg: string }> = {
  dark: { bg: '#1e1e2e', fg: '#cdd6f4' },
  sepia: { bg: '#f4ecd8', fg: '#5b4636' },
  light: { bg: '#ffffff', fg: '#111827' },
};

function buildCSS(theme: ReaderTheme, fontSize: number, fontFamily: ReaderFont, isComic: boolean): string {
  const { bg, fg } = THEME_COLORS[theme];
  if (isComic) {
    // Comics: solo fondo, sin override de fuente/tamaño (son imágenes)
    return `html, body { background: ${bg} !important; }`;
  }
  return `
    html, body {
      background: ${bg} !important;
      color: ${fg} !important;
      font-family: "${fontFamily}", serif !important;
      font-size: ${fontSize}px !important;
      line-height: 1.8 !important;
    }
    a { color: ${theme === 'dark' ? '#89b4fa' : theme === 'sepia' ? '#8b6914' : '#2563eb'} !important; }
    img, svg, image { max-width: 100% !important; height: auto !important; }
  `;
}

export function FoliateReader({
  bookPath, bookType, flow, fontSize, fontFamily, theme, pageColumns,
  initialSection, onRelocate, onReady,
}: FoliateReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const onRelocateRef = useRef(onRelocate);
  const onReadyRef = useRef(onReady);
  const initialSectionRef = useRef(initialSection);
  const isComic = isComicType(bookType);

  onRelocateRef.current = onRelocate;
  onReadyRef.current = onReady;

  // Open/close the book
  useEffect(() => {
    const container = containerRef.current!;
    if (!containerRef.current) return;

    let cancelled = false;
    let view: any = null;

    async function init() {
      const { View } = await import('foliate-js/view.js');

      if (cancelled) return;

      view = new View();
      view.style.cssText = 'width: 100%; height: 100%; display: block;';
      container.appendChild(view);

      view.addEventListener('relocate', (e: CustomEvent) => {
        const detail = e.detail;
        onRelocateRef.current?.({
          fraction: detail?.fraction ?? 0,
          sectionIndex: detail?.section?.current ?? 0,
          sectionTotal: detail?.section?.total ?? 1,
          cfi: detail?.cfi,
        });
      });

      // Load file bytes — CBR needs conversion to CBZ first
      let fileBytes: number[];
      let fileName: string;

      if (bookType === 'cbr') {
        fileBytes = await invoke('convert_cbr_to_cbz', { path: bookPath });
        // Use .cbz extension so foliate-js detects it correctly
        fileName = (bookPath.split('/').pop() || 'comic').replace(/\.cbr$/i, '.cbz');
      } else {
        fileBytes = await invoke('read_file_bytes', { path: bookPath });
        fileName = bookPath.split('/').pop() || 'book.epub';
      }

      if (cancelled) { view.remove(); return; }

      const blob = new File([new Uint8Array(fileBytes)], fileName);

      await view.open(blob);
      if (cancelled) { view.close(); view.remove(); return; }

      viewRef.current = view;

      // Comics are fixed-layout (pre-paginated) — foliate-js handles this automatically
      // For EPUBs, set renderer attributes
      if (!view.isFixedLayout) {
        view.renderer.setAttribute('flow', flow === 'paginated' ? 'paginated' : 'scrolled');
        view.renderer.setAttribute('max-column-count', String(pageColumns));
      }

      // Apply initial styles
      view.renderer.setStyles(buildCSS(theme, fontSize, fontFamily, isComic));

      // Navigate to saved position
      const section = initialSectionRef.current ?? 0;
      if (section > 0) {
        await view.goTo(section);
      } else {
        await view.init({ showTextStart: true });
      }

      // Register touch/keyboard handlers in iframe on load
      const handleLoad = (e: CustomEvent) => {
        const doc = e.detail?.doc as Document;
        if (!doc) return;
        registerIframeEvents(doc, view);
      };
      view.addEventListener('load', handleLoad);

      // Also register on already-loaded content
      const contents = view.renderer.getContents?.();
      if (contents) {
        for (const { doc } of contents) {
          if (doc) registerIframeEvents(doc, view);
        }
      }

      onReadyRef.current?.(view);
    }

    init().catch(console.error);

    return () => {
      cancelled = true;
      if (view) {
        try { view.close(); } catch {}
        try { view.remove(); } catch {}
      }
      viewRef.current = null;
    };
  }, [bookPath]);

  // Update styles when theme/font/fontSize change
  useEffect(() => {
    const view = viewRef.current;
    if (!view?.renderer) return;
    view.renderer.setStyles(buildCSS(theme, fontSize, fontFamily, isComic));
  }, [theme, fontSize, fontFamily]);

  // Update flow/columns (only for non-fixed-layout books)
  useEffect(() => {
    const view = viewRef.current;
    if (!view?.renderer || view.isFixedLayout) return;
    view.renderer.setAttribute('flow', flow === 'paginated' ? 'paginated' : 'scrolled');
    view.renderer.setAttribute('max-column-count', String(pageColumns));
  }, [flow, pageColumns]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  );
}

function registerIframeEvents(doc: Document, view: any) {
  let startX = 0;
  let startY = 0;
  let startTime = 0;

  const SWIPE_THRESHOLD = 50;
  const TAP_THRESHOLD = 10;
  const TAP_MAX_DURATION = 300;

  doc.addEventListener('touchstart', (e: TouchEvent) => {
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
  }, { passive: true });

  doc.addEventListener('touchend', (e: TouchEvent) => {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const elapsed = Date.now() - startTime;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    const target = e.target as HTMLElement;
    if (target.closest?.('a, button, [role="button"]')) return;

    if (absDx > SWIPE_THRESHOLD && absDx > absDy * 1.5) {
      if (dx < 0) view.next();
      else view.prev();
      return;
    }

    if (elapsed < TAP_MAX_DURATION && absDx < TAP_THRESHOLD && absDy < TAP_THRESHOLD) {
      const vw = doc.documentElement.clientWidth;
      const relX = touch.clientX / vw;
      if (relX < 0.25) view.prev();
      else if (relX > 0.75) view.next();
    }
  }, { passive: true });

  doc.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') view.next();
    if (e.key === 'ArrowLeft') view.prev();
  });
}
