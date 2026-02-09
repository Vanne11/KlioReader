// KlioReader Sync Queue — Cola offline para sincronización automática
import * as api from "./api";
import { invoke } from "@tauri-apps/api/core";

const STORAGE_KEY = "klio_sync_queue";
const MAX_RETRIES = 5;
const PROCESS_INTERVAL = 5_000; // 5s

export type SyncOpType = "upload_book" | "sync_progress" | "sync_stats" | "sync_title";

export interface SyncOp {
  id: string;
  type: SyncOpType;
  payload: any;
  retries: number;
  createdAt: number;
}

// ── Callback para refrescar cloudBooks después de un upload ──
let _onUploadComplete: (() => void) | null = null;
export function setOnUploadComplete(cb: () => void) { _onUploadComplete = cb; }

// ── Callback para obtener books actuales (evita closures stale) ──
let _getBooksRef: (() => any[]) | null = null;
export function setBooksRef(cb: () => any[]) { _getBooksRef = cb; }

// ── Callback para notificar cambios en la cola ──
let _onQueueChange: ((count: number, summary: string) => void) | null = null;
export function setOnQueueChange(cb: (count: number, summary: string) => void) { _onQueueChange = cb; }

// ── Persistencia ──
function loadQueue(): SyncOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveQueue(queue: SyncOp[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  const labels: Record<SyncOpType, string> = {
    upload_book: 'Subiendo libro',
    sync_progress: 'Sincronizando progreso',
    sync_stats: 'Sincronizando estadísticas',
    sync_title: 'Sincronizando título',
  };
  const summary = queue.length > 0 ? labels[queue[0].type] || 'Sincronizando...' : '';
  _onQueueChange?.(queue.length, summary);
}

// ── Deduplicación ──
function deduplicate(queue: SyncOp[], op: SyncOp): SyncOp[] {
  switch (op.type) {
    case "sync_progress":
      // Reemplaza sync_progress anterior del mismo libro (por path)
      return queue.filter(q =>
        !(q.type === "sync_progress" && q.payload.bookPath === op.payload.bookPath)
      );
    case "sync_stats":
      // Solo mantiene el último sync_stats
      return queue.filter(q => q.type !== "sync_stats");
    case "sync_title":
      // Solo mantiene el último sync_title
      return queue.filter(q => q.type !== "sync_title");
    case "upload_book":
      // No duplicar upload del mismo path
      return queue.filter(q =>
        !(q.type === "upload_book" && q.payload.bookPath === op.payload.bookPath)
      );
    default:
      return queue;
  }
}

// ── API pública ──
export function enqueue(type: SyncOpType, payload: any) {
  const op: SyncOp = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    retries: 0,
    createdAt: Date.now(),
  };
  let queue = loadQueue();
  queue = deduplicate(queue, op);
  queue.push(op);
  saveQueue(queue);
  // Procesar inmediatamente en vez de esperar el próximo tick
  if (_intervalId) processQueue();
}

export function getQueueCount(): number {
  return loadQueue().length;
}

export function getQueueSummary(): string {
  const queue = loadQueue();
  if (queue.length === 0) return '';
  const labels: Record<SyncOpType, string> = {
    upload_book: 'Subiendo libro',
    sync_progress: 'Sincronizando progreso',
    sync_stats: 'Sincronizando estadísticas',
    sync_title: 'Sincronizando título',
  };
  // Show the first (currently processing) operation
  return labels[queue[0].type] || 'Sincronizando...';
}

// ── Procesamiento ──
let _processing = false;

async function processOne(op: SyncOp): Promise<boolean> {
  switch (op.type) {
    case "sync_progress": {
      const { cloudBookId, current_chapter, current_page, progress_percent } = op.payload;
      // Si tenemos cloudBookId directo, usarlo
      if (cloudBookId) {
        await api.syncProgress(cloudBookId, { current_chapter, current_page, progress_percent });
        return true;
      }
      // Si no, buscar por título+autor en cloudBooks
      // (no podemos acceder a cloudBooks desde aquí, así que buscamos por listBooks)
      const { bookTitle, bookAuthor } = op.payload;
      if (!bookTitle) return true; // Descartar si no hay info
      const cloudBooks = await api.listBooks();
      const match = cloudBooks.find(cb =>
        cb.title.toLowerCase() === bookTitle.toLowerCase() &&
        cb.author.toLowerCase() === bookAuthor.toLowerCase()
      );
      if (match) {
        await api.syncProgress(match.id, { current_chapter, current_page, progress_percent });
      }
      return true;
    }

    case "sync_stats": {
      await api.syncStats(op.payload);
      return true;
    }

    case "sync_title": {
      await api.updateProfile({ selected_title_id: op.payload.selected_title_id });
      return true;
    }

    case "upload_book": {
      const { bookPath, title, author, total_chapters, description, fileType } = op.payload;
      // Leer metadata fresca del libro (no guardamos cover en la cola)
      let cover: string | undefined;
      try {
        if (_getBooksRef) {
          const currentBooks = _getBooksRef();
          const localBook = currentBooks.find((b: any) => b.path === bookPath);
          if (localBook?.cover) cover = localBook.cover;
        }
      } catch { /* sin cover */ }

      // Leer archivo
      const bytes: number[] = await invoke("read_file_bytes", { path: bookPath });
      const mimeMap: Record<string, string> = { pdf: 'application/pdf', epub: 'application/epub+zip', cbr: 'application/x-cbr', cbz: 'application/x-cbz' };
      const mimeType = mimeMap[fileType] || 'application/octet-stream';
      const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
      const fileName = bookPath.split('/').pop() || 'book';
      const file = new File([blob], fileName, { type: mimeType });
      await api.uploadBook(file, {
        title,
        author,
        total_chapters,
        cover_base64: cover,
        description: description || undefined,
      });
      _onUploadComplete?.();
      return true;
    }

    default:
      return true; // Op desconocida, descartar
  }
}

export async function processQueue() {
  if (_processing) return;
  if (!api.isLoggedIn()) return;

  _processing = true;
  try {
    let queue = loadQueue();
    if (queue.length === 0) return;

    // Procesar todos los items pendientes
    const snapshot = [...queue];
    for (const op of snapshot) {
      console.log(`[SyncQueue] Procesando: ${op.type}`, op.payload.bookPath || op.payload.bookTitle || '');
      try {
        const ok = await processOne(op);
        if (ok) {
          console.log(`[SyncQueue] ✓ ${op.type} completado`);
          queue = loadQueue();
          queue = queue.filter(q => q.id !== op.id);
          saveQueue(queue);
        }
      } catch (err: any) {
        console.warn(`[SyncQueue] Error procesando ${op.type} (intento ${op.retries + 1}/${MAX_RETRIES}):`, err?.message || err, '\nPayload:', JSON.stringify(op.payload).substring(0, 200));
        queue = loadQueue();
        const idx = queue.findIndex(q => q.id === op.id);
        if (idx !== -1) {
          queue[idx].retries++;
          if (queue[idx].retries >= MAX_RETRIES) {
            console.warn(`[SyncQueue] Descartando ${op.type} tras ${MAX_RETRIES} reintentos`);
            queue.splice(idx, 1);
          }
          saveQueue(queue);
        }
        // Si falla una operación de red, no seguir intentando las demás
        break;
      }
    }
  } finally {
    _processing = false;
  }
}

// ── Timer ──
let _intervalId: ReturnType<typeof setInterval> | null = null;

export function startProcessing() {
  if (_intervalId) return;
  // Procesar inmediatamente
  processQueue();
  _intervalId = setInterval(processQueue, PROCESS_INTERVAL);
}

export function stopProcessing() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}
