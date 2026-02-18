/**
 * KlioReader EPUB Library
 * Lector EPUB propio sin Web Components, compatible con Android WebView.
 */

export { parseEpub } from './parser';
export { EpubRenderer } from './renderer';
export type {
  EpubBook,
  EpubMetadata,
  SpineItem,
  TocItem,
  ManifestItem,
  FlowMode,
  RelocateDetail,
  LoadDetail,
  EpubRendererOptions,
} from './types';
export type { RendererCallbacks } from './renderer';
