/**
 * Extractor CBR via WASM (node-unrar-js).
 * Se usa solo en Android donde el crate unrar de Rust no compila.
 * En desktop, CBR se extrae via Rust (invoke extract_comic_pages).
 */
import { createExtractorFromData } from 'node-unrar-js';
import { invoke } from '@tauri-apps/api/core';

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.jxl', '.avif'];

function isImageFile(name: string): boolean {
  const lower = name.toLowerCase();
  return IMAGE_EXTS.some(ext => lower.endsWith(ext));
}

let wasmBinaryCache: ArrayBuffer | null = null;

async function loadWasmBinary(): Promise<ArrayBuffer> {
  if (wasmBinaryCache) return wasmBinaryCache;
  // En Tauri/Android el WASM se sirve desde los assets de la app
  const resp = await fetch('/unrar.wasm');
  if (!resp.ok) throw new Error(`No se pudo cargar unrar.wasm: ${resp.status}`);
  wasmBinaryCache = await resp.arrayBuffer();
  return wasmBinaryCache;
}

export interface CbrWasmResult {
  pages: string[]; // blob URLs
}

/**
 * Extrae las páginas de un CBR usando WASM.
 * Lee el archivo via el comando Tauri read_file_bytes y lo procesa en memoria.
 */
export async function extractCbrPagesWasm(filePath: string): Promise<CbrWasmResult> {
  // Leer el archivo CBR como bytes via Rust (funciona en Android, es solo fs::read)
  const fileBytes: number[] = await invoke('read_file_bytes', { path: filePath });
  const data = new Uint8Array(fileBytes).buffer;

  const wasmBinary = await loadWasmBinary();
  const extractor = await createExtractorFromData({ wasmBinary, data });

  const { files } = extractor.extract();

  const entries: { name: string; blob: Blob }[] = [];

  for (const file of files) {
    const name = file.fileHeader.name;
    if (file.fileHeader.flags.directory) continue;
    if (!isImageFile(name)) continue;
    if (!file.extraction) continue;

    const ext = name.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
      svg: 'image/svg+xml', jxl: 'image/jxl', avif: 'image/avif',
    };
    const mime = mimeMap[ext] || 'image/jpeg';
    entries.push({ name, blob: new Blob([file.extraction], { type: mime }) });
  }

  // Sort alfabético (mismo orden que Rust)
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const pages = entries.map(e => URL.createObjectURL(e.blob));
  return { pages };
}

/**
 * Libera los blob URLs creados por extractCbrPagesWasm.
 */
export function cleanupCbrWasmPages(pages: string[]): void {
  for (const url of pages) {
    URL.revokeObjectURL(url);
  }
}
