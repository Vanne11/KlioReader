import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Book, ReaderTheme, ReaderFont, ReadView } from '@/types';
import { isComicType } from '@/lib/constants';
import { parseEpub, EpubRenderer } from '@/lib/epub';

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
  const rendererRef = useRef<EpubRenderer | null>(null);
  const onRelocateRef = useRef(onRelocate);
  const onReadyRef = useRef(onReady);
  const initialSectionRef = useRef(initialSection);
  const isComic = isComicType(bookType);
  const [error, setError] = useState<string | null>(null);

  onRelocateRef.current = onRelocate;
  onReadyRef.current = onReady;

  // Open/close the book
  useEffect(() => {
    const container = containerRef.current!;
    if (!container) return;

    let cancelled = false;
    let renderer: EpubRenderer | null = null;

    async function init() {
      // Leer archivo como base64 y decodificar a bytes
      const b64: string = await invoke('read_file_base64', { path: bookPath });
      if (cancelled) return;

      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      // Parsear EPUB
      const book = await parseEpub(bytes.buffer);
      if (cancelled) return;

      // Crear renderer
      renderer = new EpubRenderer(container, book, {
        onRelocate: (detail) => {
          onRelocateRef.current?.({
            fraction: detail.fraction,
            sectionIndex: detail.section.current,
            sectionTotal: detail.section.total,
          });
        },
        onLoad: (detail) => {
          registerIframeEvents(detail.doc, renderer!);
        },
      });

      if (cancelled) { renderer.destroy(); return; }

      rendererRef.current = renderer;

      // Configurar flow y columnas
      renderer.setFlow(flow === 'paginated' ? 'paginated' : 'scrolled');
      renderer.setMaxColumnCount(pageColumns);
      renderer.setStyles(buildCSS(theme, fontSize, fontFamily, isComic));

      // Navegar a la posición guardada
      const section = initialSectionRef.current ?? 0;
      if (section > 0) {
        await renderer.goTo(section);
      } else {
        await renderer.init();
      }

      // Crear wrapper compatible con la interfaz que espera ReaderView
      const viewCompat = {
        renderer: {
          setStyles: (css: string) => renderer?.setStyles(css),
          setAttribute: (name: string, value: string) => {
            if (name === 'flow') renderer?.setFlow(value as any);
            if (name === 'max-column-count') renderer?.setMaxColumnCount(Number(value));
          },
          getContents: () => renderer?.getContents() || [],
        },
        isFixedLayout: book.isFixedLayout,
        next: () => renderer?.next(),
        prev: () => renderer?.prev(),
        goTo: (target: number) => renderer?.goTo(target),
        goToFraction: (frac: number) => renderer?.goToFraction(frac),
        close: () => renderer?.destroy(),
      };

      onReadyRef.current?.(viewCompat);
    }

    init().catch(err => {
      console.error('[EpubReader]', err);
      setError(String(err?.message || err));
    });

    return () => {
      cancelled = true;
      if (renderer) {
        try { renderer.destroy(); } catch {}
      }
      rendererRef.current = null;
    };
  }, [bookPath]);

  // Update styles when theme/font/fontSize change
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setStyles(buildCSS(theme, fontSize, fontFamily, isComic));
  }, [theme, fontSize, fontFamily]);

  // Update flow/columns
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setFlow(flow === 'paginated' ? 'paginated' : 'scrolled');
    renderer.setMaxColumnCount(pageColumns);
  }, [flow, pageColumns]);

  if (error) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', opacity: 0.6, maxWidth: '400px' }}>
          <p style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Error al abrir el libro</p>
          <p style={{ fontSize: '11px', wordBreak: 'break-all' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  );
}

function registerIframeEvents(doc: Document, renderer: EpubRenderer) {
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
      if (dx < 0) renderer.next();
      else renderer.prev();
      return;
    }

    if (elapsed < TAP_MAX_DURATION && absDx < TAP_THRESHOLD && absDy < TAP_THRESHOLD) {
      const vw = doc.documentElement.clientWidth;
      const relX = touch.clientX / vw;
      if (relX < 0.25) renderer.prev();
      else if (relX > 0.75) renderer.next();
    }
  }, { passive: true });

  doc.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') renderer.next();
    if (e.key === 'ArrowLeft') renderer.prev();
  });
}
