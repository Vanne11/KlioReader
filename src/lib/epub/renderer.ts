/**
 * Renderer EPUB para KlioReader.
 * Renderiza contenido EPUB en un iframe estándar con paginación CSS columns.
 * Sin Web Components — 100% DOM estándar, compatible con Android WebView.
 */

import type { EpubBook, FlowMode, RelocateDetail, LoadDetail } from './types';

export interface RendererCallbacks {
  onRelocate?: (detail: RelocateDetail) => void;
  onLoad?: (detail: LoadDetail) => void;
}

export class EpubRenderer {
  private container: HTMLElement;
  private iframe: HTMLIFrameElement;
  private book: EpubBook;
  private currentIndex: number = 0;
  private flow: FlowMode = 'paginated';
  private maxColumnCount: number = 1;
  private currentStyles: string = '';
  private callbacks: RendererCallbacks;

  // Paginación
  private currentPage: number = 0;
  private totalPages: number = 1;

  constructor(container: HTMLElement, book: EpubBook, callbacks: RendererCallbacks) {
    this.container = container;
    this.book = book;
    this.callbacks = callbacks;

    // Crear iframe
    this.iframe = document.createElement('iframe');
    this.iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    this.iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
    this.container.appendChild(this.iframe);
  }

  get isFixedLayout(): boolean {
    return this.book.isFixedLayout;
  }

  /** Obtener el Document del iframe */
  getContents(): Array<{ doc: Document; index: number }> {
    const doc = this.iframe.contentDocument;
    if (!doc) return [];
    return [{ doc, index: this.currentIndex }];
  }

  setStyles(css: string): void {
    this.currentStyles = css;
    this.applyStylesToIframe();
  }

  setFlow(flow: FlowMode): void {
    this.flow = flow;
    this.renderCurrentSection();
  }

  setMaxColumnCount(count: number): void {
    this.maxColumnCount = count;
    this.renderCurrentSection();
  }

  /** Ir a una sección por índice */
  async goTo(sectionIndex: number): Promise<void> {
    if (sectionIndex < 0 || sectionIndex >= this.book.spine.length) return;
    this.currentIndex = sectionIndex;
    this.currentPage = 0;
    await this.renderCurrentSection();
  }

  /** Ir al inicio (primera sección, primer contenido) */
  async init(): Promise<void> {
    this.currentIndex = 0;
    this.currentPage = 0;
    await this.renderCurrentSection();
  }

  /** Siguiente página o sección */
  async next(): Promise<void> {
    if (this.flow === 'paginated') {
      if (this.currentPage < this.totalPages - 1) {
        this.currentPage++;
        this.scrollToCurrentPage();
        this.emitRelocate();
        return;
      }
    }
    // Ir a la siguiente sección
    if (this.currentIndex < this.book.spine.length - 1) {
      this.currentIndex++;
      this.currentPage = 0;
      await this.renderCurrentSection();
    }
  }

  /** Página anterior o sección anterior */
  async prev(): Promise<void> {
    if (this.flow === 'paginated') {
      if (this.currentPage > 0) {
        this.currentPage--;
        this.scrollToCurrentPage();
        this.emitRelocate();
        return;
      }
    }
    // Ir a la sección anterior (última página)
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.currentPage = -1; // señal para ir a última página
      await this.renderCurrentSection();
    }
  }

  /** Ir a una fracción global (0-1) */
  async goToFraction(fraction: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, fraction));
    // Encontrar la sección correspondiente
    for (let i = 0; i < this.book.spine.length; i++) {
      const item = this.book.spine[i];
      if (clamped >= item.startFraction && clamped < item.endFraction) {
        this.currentIndex = i;
        // Calcular la página dentro de la sección
        const sectionProgress = (clamped - item.startFraction) / (item.endFraction - item.startFraction);
        await this.renderCurrentSection();
        if (this.flow === 'paginated' && this.totalPages > 1) {
          this.currentPage = Math.floor(sectionProgress * this.totalPages);
          this.scrollToCurrentPage();
        }
        this.emitRelocate();
        return;
      }
    }
    // Si fraction es 1.0, ir al final
    if (this.book.spine.length > 0) {
      this.currentIndex = this.book.spine.length - 1;
      this.currentPage = -1;
      await this.renderCurrentSection();
    }
  }

  /** Destruir el renderer y liberar recursos */
  destroy(): void {
    this.iframe.remove();
    // Revocar blob URLs
    for (const [, url] of this.book.resources) {
      try { URL.revokeObjectURL(url); } catch {}
    }
  }

  // ─── Privados ──────────────────────────────────────────

  private async renderCurrentSection(): Promise<void> {
    const item = this.book.spine[this.currentIndex];
    if (!item?.content) return;

    const doc = this.iframe.contentDocument;
    if (!doc) return;

    // Construir HTML completo para el iframe
    const isPaginated = this.flow === 'paginated';
    const paginationCSS = isPaginated ? this.buildPaginationCSS() : this.buildScrollCSS();

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  /* Reset base */
  * { box-sizing: border-box; }

  /* Paginación / Scroll */
  ${paginationCSS}

  /* Estilos del usuario (tema, fuente, etc.) */
  ${this.currentStyles}
</style>
</head>
<body>
${this.extractBody(item.content)}
</body>
</html>`;

    doc.open();
    doc.write(html);
    doc.close();

    // Esperar a que el iframe renderice
    await this.waitForRender(doc);

    // Calcular paginación
    if (isPaginated) {
      this.calculatePages(doc);
      // Si currentPage es -1, ir a la última
      if (this.currentPage === -1) {
        this.currentPage = Math.max(0, this.totalPages - 1);
      }
      this.scrollToCurrentPage();
    } else {
      this.totalPages = 1;
      this.currentPage = 0;
    }

    // Emitir eventos
    this.callbacks.onLoad?.({ doc, index: this.currentIndex });
    this.emitRelocate();
  }

  private buildPaginationCSS(): string {
    return `
      html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        overflow: hidden;
      }
      body {
        column-fill: auto;
        column-gap: 40px;
        column-width: calc(${100 / this.maxColumnCount}% - ${(this.maxColumnCount - 1) * 40 / this.maxColumnCount}px);
        height: 100%;
        padding: 20px 30px;
        overflow: hidden;
      }
      img, svg, video {
        max-width: 100% !important;
        max-height: 90vh !important;
        height: auto !important;
        break-inside: avoid;
      }
      p, div, h1, h2, h3, h4, h5, h6, blockquote, pre, table, figure {
        break-inside: avoid-column;
      }
    `;
  }

  private buildScrollCSS(): string {
    return `
      html, body {
        margin: 0;
        padding: 20px 30px;
        min-height: 100%;
      }
      img, svg, video {
        max-width: 100% !important;
        height: auto !important;
      }
    `;
  }

  private extractBody(html: string): string {
    // Extraer el contenido entre <body> y </body>
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) return bodyMatch[1];

    // Si no tiene body tags, buscar contenido después de </head> o el HTML completo
    const headEnd = html.indexOf('</head>');
    if (headEnd !== -1) {
      const afterHead = html.substring(headEnd + 7);
      // Quitar tags html/body envolventes si existen
      return afterHead.replace(/<\/?(?:html|body)[^>]*>/gi, '');
    }

    // Extraer CSS de <style> y <link> del head y agregarlo al body
    const styles = this.extractHeadStyles(html);
    const bodyContent = html.replace(/<\/?(?:html|head|body|!DOCTYPE)[^>]*>/gi, '')
      .replace(/<meta[^>]*>/gi, '')
      .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');

    return styles + bodyContent;
  }

  private extractHeadStyles(html: string): string {
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    if (!headMatch) return '';

    const head = headMatch[1];
    const styles: string[] = [];

    // Extraer <style> tags
    const styleMatches = head.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    for (const m of styleMatches) {
      styles.push(`<style>${m[1]}</style>`);
    }

    // Extraer <link rel="stylesheet"> tags
    const linkMatches = head.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi);
    for (const m of linkMatches) {
      styles.push(m[0]);
    }

    return styles.join('\n');
  }

  private waitForRender(doc: Document): Promise<void> {
    return new Promise(resolve => {
      // Esperar a que las imágenes carguen o timeout
      const images = doc.querySelectorAll('img');
      if (images.length === 0) {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        return;
      }

      let loaded = 0;
      const total = images.length;
      const check = () => {
        loaded++;
        if (loaded >= total) {
          requestAnimationFrame(() => resolve());
        }
      };

      const timeout = setTimeout(() => resolve(), 2000);

      images.forEach(img => {
        if (img.complete) {
          check();
        } else {
          img.addEventListener('load', check, { once: true });
          img.addEventListener('error', check, { once: true });
        }
      });

      // Cleanup timeout si se resuelve antes
      const origResolve = resolve;
      resolve = () => {
        clearTimeout(timeout);
        origResolve();
      };
    });
  }

  private calculatePages(doc: Document): void {
    const body = doc.body;
    if (!body) {
      this.totalPages = 1;
      return;
    }
    const containerWidth = this.iframe.clientWidth;
    if (containerWidth <= 0) {
      this.totalPages = 1;
      return;
    }
    // scrollWidth del body nos da el ancho total del contenido en columnas
    const scrollWidth = body.scrollWidth;
    this.totalPages = Math.max(1, Math.ceil(scrollWidth / containerWidth));
  }

  private scrollToCurrentPage(): void {
    const doc = this.iframe.contentDocument;
    if (!doc?.body) return;

    const containerWidth = this.iframe.clientWidth;
    const scrollLeft = this.currentPage * containerWidth;

    doc.documentElement.scrollLeft = scrollLeft;
    doc.body.scrollLeft = scrollLeft;
  }

  private emitRelocate(): void {
    const spineItem = this.book.spine[this.currentIndex];
    if (!spineItem) return;

    // Fracción global: combinación de sección + página dentro de la sección
    let pageFraction = 0;
    if (this.totalPages > 1) {
      pageFraction = this.currentPage / this.totalPages;
    }
    const sectionRange = spineItem.endFraction - spineItem.startFraction;
    const fraction = spineItem.startFraction + (pageFraction * sectionRange);

    this.callbacks.onRelocate?.({
      fraction: Math.min(1, Math.max(0, fraction)),
      section: {
        current: this.currentIndex,
        total: this.book.spine.length,
      },
    });
  }

  private applyStylesToIframe(): void {
    const doc = this.iframe.contentDocument;
    if (!doc) return;

    // Buscar o crear un <style id="klio-theme">
    let styleEl = doc.getElementById('klio-theme') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = 'klio-theme';
      (doc.head || doc.documentElement).appendChild(styleEl);
    }
    styleEl.textContent = this.currentStyles;
  }
}
