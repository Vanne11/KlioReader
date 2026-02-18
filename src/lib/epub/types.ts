/** Tipos para el lector EPUB propio de KlioReader */

export interface EpubMetadata {
  title: string;
  creator: string;
  language: string;
  identifier: string;
  description?: string;
  publisher?: string;
  date?: string;
  cover?: string; // href del cover image
}

export interface SpineItem {
  id: string;
  href: string;
  mediaType: string;
  /** Contenido HTML/XHTML descomprimido */
  content?: string;
  /** Fracción acumulada de inicio (0-1) para calcular progreso global */
  startFraction: number;
  /** Fracción acumulada de fin (0-1) */
  endFraction: number;
}

export interface TocItem {
  label: string;
  href: string;
  children?: TocItem[];
}

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
}

export interface EpubBook {
  metadata: EpubMetadata;
  spine: SpineItem[];
  toc: TocItem[];
  manifest: Map<string, ManifestItem>;
  /** Mapa de href relativo → blob URL para recursos (imágenes, CSS, fuentes) */
  resources: Map<string, string>;
  /** Si es fixed-layout (pre-paginado) */
  isFixedLayout: boolean;
}

export interface RelocateDetail {
  fraction: number;
  section: { current: number; total: number };
  cfi?: string;
}

export interface LoadDetail {
  doc: Document;
  index: number;
}

export type FlowMode = 'paginated' | 'scrolled';

export interface EpubRendererOptions {
  container: HTMLElement;
  flow: FlowMode;
  maxColumnCount: number;
  onRelocate?: (detail: RelocateDetail) => void;
  onLoad?: (detail: LoadDetail) => void;
}
