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

  /** Generar un CFI para la posición actual visible */
  getCFI(): string {
    // Formato: epubcfi(/6/{spineStep}[{spineId}]!/{bodyPath},{startOffset})
    // Simplificado pero compatible: /6/{spinePos}!/{bodyPath}/~{page}
    const spinePos = (this.currentIndex + 1) * 2; // EPUB CFI usa pasos pares
    const spineId = this.book.spine[this.currentIndex]?.id || '';
    const doc = this.iframe.contentDocument;

    let bodyPath = '/4'; // <body> es normalmente el 4to hijo de <html>
    let charOffset = '';

    if (doc?.body) {
      // Encontrar el primer nodo de texto visible en la página actual
      const node = this.findFirstVisibleTextNode(doc);
      if (node) {
        bodyPath = this.buildNodePath(node, doc.body);
        charOffset = ':0';
      }
    }

    const idPart = spineId ? `[${spineId}]` : '';
    return `epubcfi(/6/${spinePos}${idPart}!${bodyPath}${charOffset})`;
  }

  /** Navegar a una posición CFI */
  async goToCFI(cfi: string): Promise<void> {
    const parsed = this.parseCFI(cfi);
    if (!parsed) return;

    // Navegar a la sección del spine
    await this.goTo(parsed.spineIndex);

    // Si hay un path dentro del documento, intentar scrollear al elemento
    if (parsed.elementId) {
      const doc = this.iframe.contentDocument;
      if (doc) {
        const el = doc.getElementById(parsed.elementId);
        if (el) {
          if (this.flow === 'paginated') {
            // Calcular en qué página está el elemento
            const rect = el.getBoundingClientRect();
            const containerWidth = this.iframe.clientWidth;
            if (containerWidth > 0) {
              const scrollLeft = doc.documentElement.scrollLeft || doc.body.scrollLeft;
              this.currentPage = Math.floor((scrollLeft + rect.left) / containerWidth);
              this.scrollToCurrentPage();
              this.emitRelocate();
            }
          } else {
            el.scrollIntoView({ behavior: 'instant' });
          }
        }
      }
    } else if (parsed.pageEstimate >= 0 && this.flow === 'paginated') {
      // Estimar página a partir del bodyPath
      this.currentPage = Math.min(parsed.pageEstimate, this.totalPages - 1);
      this.scrollToCurrentPage();
      this.emitRelocate();
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
    // Siempre extraer los estilos del <head> (CSS propio del EPUB)
    const headStyles = this.extractHeadStyles(html);

    // Extraer el contenido entre <body> y </body>
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) return headStyles + bodyMatch[1];

    // Si no tiene body tags, buscar contenido después de </head>
    const headEnd = html.indexOf('</head>');
    if (headEnd !== -1) {
      const afterHead = html.substring(headEnd + 7);
      return headStyles + afterHead.replace(/<\/?(?:html|body)[^>]*>/gi, '');
    }

    // Último fallback: limpiar todo el HTML
    const bodyContent = html.replace(/<\/?(?:html|head|body|!DOCTYPE)[^>]*>/gi, '')
      .replace(/<meta[^>]*>/gi, '')
      .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');

    return headStyles + bodyContent;
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

    // Generar CFI para la posición actual
    let cfi: string | undefined;
    try {
      cfi = this.getCFI();
    } catch {
      // Si falla generar CFI, no bloquear la navegación
    }

    this.callbacks.onRelocate?.({
      fraction: Math.min(1, Math.max(0, fraction)),
      section: {
        current: this.currentIndex,
        total: this.book.spine.length,
      },
      cfi,
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

  // ─── CFI helpers ──────────────────────────────────────

  /** Encontrar el primer nodo de texto visible en la página actual */
  private findFirstVisibleTextNode(doc: Document): Text | null {
    const containerWidth = this.iframe.clientWidth;
    const scrollLeft = doc.documentElement.scrollLeft || doc.body?.scrollLeft || 0;
    const viewStart = scrollLeft;
    const viewEnd = scrollLeft + containerWidth;

    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.textContent?.trim()) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const range = doc.createRange();
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      for (const rect of rects) {
        const absLeft = rect.left + scrollLeft;
        if (absLeft >= viewStart && absLeft < viewEnd) {
          return node;
        }
      }
    }
    return null;
  }

  /** Construir un path CFI desde un nodo hasta el body */
  private buildNodePath(node: Node, root: Node): string {
    const steps: string[] = [];
    let current: Node | null = node;

    while (current && current !== root) {
      const parent: Node | null = current.parentNode;
      if (!parent) break;

      let index = 0;
      for (const child of Array.from(parent.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) index += 2;
        if (child === current) break;
      }
      // Nodos de texto usan paso impar
      if (current.nodeType === Node.TEXT_NODE) {
        steps.unshift(`/${index + 1}`);
      } else {
        const el = current as Element;
        const id = el.id ? `[${el.id}]` : '';
        steps.unshift(`/${index}${id}`);
      }
      current = parent;
    }

    return '/4' + steps.join(''); // /4 = body
  }

  /** Parsear un CFI y extraer spine index + info de navegación */
  private parseCFI(cfi: string): { spineIndex: number; elementId?: string; pageEstimate: number } | null {
    // Formato: epubcfi(/6/{spineStep}[id]!/{path}:offset)
    const match = cfi.match(/epubcfi\(\/6\/(\d+)(?:\[([^\]]*)\])?(?:!(.+))?\)/);
    if (!match) return null;

    const spineStep = parseInt(match[1], 10);
    const spineIndex = Math.max(0, (spineStep / 2) - 1);
    const idFromSpine = match[2] || undefined;
    const innerPath = match[3] || '';

    // Intentar extraer un ID de elemento del path interno
    let elementId: string | undefined;
    const idMatch = innerPath.match(/\[([^\]]+)\]/);
    if (idMatch) elementId = idMatch[1];

    // Si no hay ID, buscar por spine id
    if (!elementId && idFromSpine) {
      // Verificar que el spineIndex coincida
      const item = this.book.spine[spineIndex];
      if (item && item.id !== idFromSpine) {
        // Buscar por ID del spine
        const idx = this.book.spine.findIndex(s => s.id === idFromSpine);
        if (idx >= 0) return { spineIndex: idx, elementId, pageEstimate: 0 };
      }
    }

    // Estimar página basado en los steps del path (heurística simple)
    const pathSteps = innerPath.match(/\/\d+/g) || [];
    const pageEstimate = pathSteps.length > 2 ? Math.floor(parseInt(pathSteps[1]?.replace('/', '') || '0', 10) / 4) : 0;

    return { spineIndex, elementId, pageEstimate };
  }
}
