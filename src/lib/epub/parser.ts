/**
 * Parser de archivos EPUB para KlioReader.
 * Descomprime el ZIP, parsea container.xml → OPF → spine/manifest/TOC.
 * Soporta EPUB 2 (NCX) y EPUB 3 (nav).
 */

import { unzipSync } from 'fflate';
import type { EpubBook, EpubMetadata, SpineItem, TocItem, ManifestItem } from './types';

/** Parsea un ArrayBuffer de un archivo .epub y retorna un EpubBook */
export async function parseEpub(data: ArrayBuffer): Promise<EpubBook> {
  const files = unzipSync(new Uint8Array(data));

  // Helper: leer un archivo del ZIP como string
  function readText(path: string): string | null {
    // Normalizar: quitar leading slash
    const normalized = path.replace(/^\//, '');
    const entry = files[normalized];
    if (!entry) return null;
    return new TextDecoder().decode(entry);
  }

  // Helper: leer bytes de un archivo
  function readBytes(path: string): Uint8Array | null {
    const normalized = path.replace(/^\//, '');
    return files[normalized] || null;
  }

  // Helper: parsear XML string a Document
  function parseXml(xml: string): Document {
    return new DOMParser().parseFromString(xml, 'application/xml');
  }

  // Helper: resolver path relativo desde un basePath
  function resolvePath(basePath: string, relative: string): string {
    // Quitar fragment (#...)
    const rel = relative.split('#')[0];
    const base = basePath.substring(0, basePath.lastIndexOf('/') + 1);
    const parts = (base + rel).split('/');
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === '..') resolved.pop();
      else if (part !== '.' && part !== '') resolved.push(part);
    }
    return resolved.join('/');
  }

  // 1. Leer META-INF/container.xml para encontrar el OPF
  const containerXml = readText('META-INF/container.xml');
  if (!containerXml) throw new Error('EPUB inválido: falta META-INF/container.xml');

  const containerDoc = parseXml(containerXml);
  const rootfileEl = containerDoc.querySelector('rootfile');
  const opfPath = rootfileEl?.getAttribute('full-path');
  if (!opfPath) throw new Error('EPUB inválido: no se encontró rootfile en container.xml');

  // 2. Leer y parsear el OPF
  const opfXml = readText(opfPath);
  if (!opfXml) throw new Error(`EPUB inválido: no se encontró OPF en ${opfPath}`);

  const opfDoc = parseXml(opfXml);
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

  // 3. Parsear metadata
  const metadata = parseMetadata(opfDoc);

  // 4. Parsear manifest
  const manifest = parseManifest(opfDoc, opfDir);

  // 5. Detectar fixed-layout
  const isFixedLayout = detectFixedLayout(opfDoc);

  // 6. Parsear spine
  const spineItemRefs = parseSpineRefs(opfDoc);
  const spine: SpineItem[] = [];

  for (const ref of spineItemRefs) {
    const item = manifest.get(ref.idref);
    if (!item) continue;
    spine.push({
      id: item.id,
      href: item.href,
      mediaType: item.mediaType,
      startFraction: 0, // se calcula después
      endFraction: 0,
    });
  }

  // Calcular fracciones uniformes por sección (simplificado)
  const total = spine.length;
  for (let i = 0; i < total; i++) {
    spine[i].startFraction = i / total;
    spine[i].endFraction = (i + 1) / total;
  }

  // 7. Crear blob URLs para todos los recursos (imágenes, CSS, fuentes)
  const resources = new Map<string, string>();
  for (const [, item] of manifest) {
    const bytes = readBytes(item.href);
    if (!bytes) continue;
    const blob = new Blob([bytes], { type: item.mediaType });
    resources.set(item.href, URL.createObjectURL(blob));
  }

  // 8. Precargar contenido HTML de cada spine item
  for (const item of spine) {
    const raw = readText(item.href);
    if (!raw) continue;
    // Reescribir URLs de recursos en el HTML
    item.content = rewriteResourceUrls(raw, item.href, resources);
  }

  // 9. Parsear TOC
  const toc = parseToc(opfDoc, manifest, opfDir, readText, parseXml, resolvePath);

  return { metadata, spine, toc, manifest, resources, isFixedLayout };
}

function parseMetadata(opfDoc: Document): EpubMetadata {
  const q = (tag: string) => {
    // Buscar con y sin namespace
    const el = opfDoc.querySelector(`metadata > ${tag}`)
      || opfDoc.querySelector(`metadata > *|${tag}`)
      || opfDoc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', tag)[0];
    return el?.textContent?.trim() || '';
  };

  return {
    title: q('title') || 'Sin título',
    creator: q('creator') || 'Desconocido',
    language: q('language') || 'en',
    identifier: q('identifier') || '',
    description: q('description') || undefined,
    publisher: q('publisher') || undefined,
    date: q('date') || undefined,
  };
}

function parseManifest(opfDoc: Document, opfDir: string): Map<string, ManifestItem> {
  const manifest = new Map<string, ManifestItem>();
  const items = opfDoc.querySelectorAll('manifest > item');

  items.forEach(el => {
    const id = el.getAttribute('id') || '';
    const href = el.getAttribute('href') || '';
    const mediaType = el.getAttribute('media-type') || '';
    if (id && href) {
      manifest.set(id, {
        id,
        href: opfDir + decodeURIComponent(href),
        mediaType,
      });
    }
  });

  return manifest;
}

function detectFixedLayout(opfDoc: Document): boolean {
  // EPUB 3: meta property="rendition:layout"
  const metas = opfDoc.querySelectorAll('metadata > meta');
  for (const meta of metas) {
    const prop = meta.getAttribute('property') || meta.getAttribute('name') || '';
    if (prop.includes('rendition:layout') || prop.includes('fixed-layout')) {
      const val = meta.getAttribute('content') || meta.textContent || '';
      if (val.includes('pre-paginated') || val === 'true') return true;
    }
  }
  return false;
}

function parseSpineRefs(opfDoc: Document): { idref: string; linear: boolean }[] {
  const refs: { idref: string; linear: boolean }[] = [];
  const items = opfDoc.querySelectorAll('spine > itemref');
  items.forEach(el => {
    const idref = el.getAttribute('idref') || '';
    const linear = el.getAttribute('linear') !== 'no';
    if (idref) refs.push({ idref, linear });
  });
  return refs;
}

function parseToc(
  opfDoc: Document,
  manifest: Map<string, ManifestItem>,
  _opfDir: string,
  readText: (path: string) => string | null,
  parseXml: (xml: string) => Document,
  resolvePath: (base: string, rel: string) => string,
): TocItem[] {
  // Intentar EPUB 3 nav primero
  const navItem = findNavItem(opfDoc, manifest);
  if (navItem) {
    const navXml = readText(navItem.href);
    if (navXml) {
      const toc = parseEpub3Nav(parseXml(navXml), navItem.href, resolvePath);
      if (toc.length > 0) return toc;
    }
  }

  // Fallback: EPUB 2 NCX
  const ncxItem = findNcxItem(opfDoc, manifest);
  if (ncxItem) {
    const ncxXml = readText(ncxItem.href);
    if (ncxXml) {
      return parseNcx(parseXml(ncxXml), ncxItem.href, resolvePath);
    }
  }

  return [];
}

function findNavItem(opfDoc: Document, manifest: Map<string, ManifestItem>): ManifestItem | null {
  for (const [, item] of manifest) {
    if (item.mediaType === 'application/xhtml+xml') {
      // Buscar en manifest el item con properties="nav"
      const el = opfDoc.querySelector(`manifest > item[id="${item.id}"]`);
      if (el?.getAttribute('properties')?.includes('nav')) return item;
    }
  }
  return null;
}

function findNcxItem(opfDoc: Document, manifest: Map<string, ManifestItem>): ManifestItem | null {
  // El spine tiene un atributo toc que apunta al NCX
  const spineEl = opfDoc.querySelector('spine');
  const tocId = spineEl?.getAttribute('toc');
  if (tocId && manifest.has(tocId)) return manifest.get(tocId)!;

  // Fallback: buscar por media-type
  for (const [, item] of manifest) {
    if (item.mediaType === 'application/x-dtbncx+xml') return item;
  }
  return null;
}

function parseEpub3Nav(navDoc: Document, navHref: string, resolvePath: (b: string, r: string) => string): TocItem[] {
  // Buscar <nav epub:type="toc"> o <nav>
  const navEl = navDoc.querySelector('nav[*|type="toc"]') || navDoc.querySelector('nav');
  if (!navEl) return [];

  function parseOl(ol: Element): TocItem[] {
    const items: TocItem[] = [];
    for (const li of ol.querySelectorAll(':scope > li')) {
      const a = li.querySelector(':scope > a');
      if (!a) continue;
      const label = a.textContent?.trim() || '';
      const rawHref = a.getAttribute('href') || '';
      const href = resolvePath(navHref, rawHref);

      const childOl = li.querySelector(':scope > ol');
      const children = childOl ? parseOl(childOl) : undefined;

      items.push({ label, href, children });
    }
    return items;
  }

  const ol = navEl.querySelector(':scope > ol');
  return ol ? parseOl(ol) : [];
}

function parseNcx(ncxDoc: Document, ncxHref: string, resolvePath: (b: string, r: string) => string): TocItem[] {
  function parseNavPoints(parent: Element): TocItem[] {
    const items: TocItem[] = [];
    const points = parent.querySelectorAll(':scope > navPoint');
    for (const point of points) {
      const label = point.querySelector('navLabel > text')?.textContent?.trim() || '';
      const rawSrc = point.querySelector('content')?.getAttribute('src') || '';
      const href = resolvePath(ncxHref, rawSrc);
      const children = parseNavPoints(point);
      items.push({ label, href, children: children.length > 0 ? children : undefined });
    }
    return items;
  }

  const navMap = ncxDoc.querySelector('navMap');
  return navMap ? parseNavPoints(navMap) : [];
}

/**
 * Reescribe URLs de recursos (src, href, url()) en el HTML del EPUB
 * para que apunten a blob URLs.
 */
function rewriteResourceUrls(
  html: string,
  itemHref: string,
  resources: Map<string, string>,
): string {
  const itemDir = itemHref.substring(0, itemHref.lastIndexOf('/') + 1);

  // Reescribir atributos src="..." y href="..." (excepto anchors)
  let result = html.replace(
    /((?:src|href|xlink:href)\s*=\s*["'])([^"'#][^"']*)(["'])/gi,
    (match, prefix, url, suffix) => {
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
        return match;
      }
      const resolved = resolvePathSimple(itemDir, url);
      const blobUrl = resources.get(resolved);
      return blobUrl ? prefix + blobUrl + suffix : match;
    },
  );

  // Reescribir url() en CSS inline
  result = result.replace(
    /url\(\s*["']?([^"')#][^"')]*?)["']?\s*\)/gi,
    (match, url) => {
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
        return match;
      }
      const resolved = resolvePathSimple(itemDir, url);
      const blobUrl = resources.get(resolved);
      return blobUrl ? `url("${blobUrl}")` : match;
    },
  );

  return result;
}

function resolvePathSimple(basePath: string, relative: string): string {
  const rel = decodeURIComponent(relative.split('#')[0].split('?')[0]);
  const parts = (basePath + rel).split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  return resolved.join('/');
}
