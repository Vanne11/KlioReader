// KlioReader Sync Queue — Cola offline para sincronización automática
import * as api from "./api";
import { invoke } from "@tauri-apps/api/core";

const STORAGE_KEY = "klio_sync_queue";
const HISTORY_KEY = "klio_sync_history";
const MAX_RETRIES = 5;
const MAX_HISTORY = 30;
const PROCESS_INTERVAL = 5_000; // 5s

export type SyncOpType = "upload_book" | "sync_progress" | "sync_stats" | "sync_title" | "sync_collections";

export interface SyncOp {
  id: string;
  type: SyncOpType;
  payload: any;
  retries: number;
  createdAt: number;
}

export interface SyncOpDone {
  id: string;
  type: SyncOpType;
  payload: any;
  status: 'ok' | 'error';
  message: string;
  finishedAt: number;
}

// ── Callback para refrescar cloudBooks después de un upload ──
let _onUploadComplete: (() => void) | null = null;
export function setOnUploadComplete(cb: () => void) { _onUploadComplete = cb; }

// ── Callback para obtener books actuales (evita closures stale) ──
let _getBooksRef: (() => any[]) | null = null;
export function setBooksRef(cb: () => any[]) { _getBooksRef = cb; }

// ── Callback para notificar cambios en la cola ──
let _onQueueChange: ((count: number, summary: string, items: SyncOp[]) => void) | null = null;
export function setOnQueueChange(cb: (count: number, summary: string, items: SyncOp[]) => void) { _onQueueChange = cb; }

// ── Callback para notificar qué item se está procesando ──
let _onProcessingChange: ((id: string | null) => void) | null = null;
export function setOnProcessingChange(cb: (id: string | null) => void) { _onProcessingChange = cb; }

// ── Callback para notificar cambios en el historial ──
let _onHistoryChange: ((items: SyncOpDone[]) => void) | null = null;
export function setOnHistoryChange(cb: (items: SyncOpDone[]) => void) { _onHistoryChange = cb; }

// ── Historial de operaciones completadas ──
export function loadHistory(): SyncOpDone[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(history: SyncOpDone[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  _onHistoryChange?.(history);
}

function pushHistory(op: SyncOp, status: 'ok' | 'error', message: string) {
  const history = loadHistory();
  history.unshift({
    id: op.id,
    type: op.type,
    payload: op.payload,
    status,
    message,
    finishedAt: Date.now(),
  });
  // Mantener máximo MAX_HISTORY items
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  saveHistory(history);
}

export function clearHistory() {
  saveHistory([]);
}

// ── Mensajes descriptivos para el historial ──
function buildSuccessMessage(op: SyncOp, skipped?: boolean): string {
  const p = op.payload;
  switch (op.type) {
    case 'upload_book': {
      const title = p.title || p.bookPath?.split('/').pop() || '?';
      if (skipped) return `"${title}" ya estaba en la nube`;
      return `"${title}" subido correctamente`;
    }
    case 'sync_progress': {
      const title = p.bookTitle || '?';
      const pct = p.progress_percent != null ? Math.round(p.progress_percent) : null;
      return pct != null ? `"${title}" — progreso actualizado a ${pct}%` : `"${title}" — progreso actualizado`;
    }
    case 'sync_stats': {
      const level = p.level != null ? `Nivel ${p.level}` : null;
      const xp = p.xp != null ? `${p.xp} XP` : null;
      const parts = [level, xp].filter(Boolean).join(', ');
      return parts ? `Estadísticas sincronizadas (${parts})` : 'Estadísticas sincronizadas';
    }
    case 'sync_title':
      return 'Título actualizado';
    case 'sync_collections': {
      const count = p.collectionCount;
      return count != null ? `${count} colecciones sincronizadas` : 'Colecciones sincronizadas';
    }
    default:
      return 'Operación completada';
  }
}

function buildErrorMessage(op: SyncOp, err: any): string {
  const p = op.payload;
  const errMsg = err?.message || String(err);
  switch (op.type) {
    case 'upload_book': {
      const title = p.title || p.bookPath?.split('/').pop() || '?';
      return `Error subiendo "${title}": ${errMsg}`;
    }
    case 'sync_progress': {
      const title = p.bookTitle || '?';
      return `Error sincronizando progreso de "${title}": ${errMsg}`;
    }
    case 'sync_stats':
      return `Error sincronizando estadísticas: ${errMsg}`;
    case 'sync_title':
      return `Error actualizando título: ${errMsg}`;
    case 'sync_collections':
      return `Error sincronizando colecciones: ${errMsg}`;
    default:
      return `Error: ${errMsg}`;
  }
}

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
    sync_collections: 'Sincronizando colecciones',
  };
  const summary = queue.length > 0 ? labels[queue[0].type] || 'Sincronizando...' : '';
  _onQueueChange?.(queue.length, summary, queue);
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
    case "sync_collections":
      // Solo mantener uno
      return queue.filter(q => q.type !== "sync_collections");
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
    sync_collections: 'Sincronizando colecciones',
  };
  // Show the first (currently processing) operation
  return labels[queue[0].type] || 'Sincronizando...';
}

export function getQueue(): SyncOp[] {
  return loadQueue();
}

export function removeFromQueue(id: string) {
  let queue = loadQueue();
  queue = queue.filter(q => q.id !== id);
  saveQueue(queue);
}

export function clearQueue() {
  saveQueue([]);
}

// ── Sync colecciones locales → cloud ──
async function syncLocalCollectionsToCloud() {
  // Leer colecciones locales desde localStorage
  let localCollections: any[] = [];
  try {
    const raw = localStorage.getItem('klioLocalCollections');
    localCollections = raw ? JSON.parse(raw) : [];
  } catch { return; }

  if (localCollections.length === 0) return;

  // Obtener colecciones y libros cloud actuales
  const [cloudCollections, cloudBooks] = await Promise.all([
    api.listCollections(),
    api.listBooks(),
  ]);

  for (const local of localCollections) {
    // Verificar si ya existe una colección cloud con el mismo nombre y tipo
    const existing = cloudCollections.find(
      (c: any) => c.name === local.name && c.type === local.type
    );

    let collectionId: number;

    if (existing) {
      collectionId = existing.id;
    } else {
      // Crear colección cloud
      const res = await api.createCollection({
        name: local.name,
        type: local.type || 'collection',
        description: local.description || undefined,
        cover_base64: local.coverBase64 || undefined,
        sort_order: local.sortOrder || 'manual',
      });
      collectionId = res.id;
    }

    // Resolver book IDs: las colecciones locales usan paths, la nube usa IDs
    const bookIdsToAdd: number[] = [];
    for (const entry of (local.bookEntries || [])) {
      // bookId local es el path del archivo, necesitamos encontrar el cloud book por título
      const fileName = (entry.bookId as string).split('/').pop() || '';
      // Buscar en cloudBooks por file_name o título similar
      const cloudBook = cloudBooks.find((cb: any) => {
        if (cb.file_name === fileName) return true;
        // Fallback: comparar título normalizado
        const localTitle = fileName.replace(/\.[^.]+$/, '').toLowerCase();
        return cb.title.toLowerCase() === localTitle;
      });
      if (cloudBook) {
        bookIdsToAdd.push(cloudBook.id);
      }
    }

    if (bookIdsToAdd.length > 0) {
      // addBooksToCollection usa INSERT OR IGNORE, así que es seguro re-enviar
      await api.addBooksToCollection(collectionId, bookIdsToAdd);
    }
  }

  console.log(`[SyncQueue] Colecciones sincronizadas: ${localCollections.length}`);
}

// ── Procesamiento ──
let _processing = false;

/** Resultado de processOne: ok + si fue skipped (para mensajes diferenciados) */
interface ProcessResult { ok: boolean; skipped?: boolean; }

async function processOne(op: SyncOp): Promise<ProcessResult> {
  switch (op.type) {
    case "sync_progress": {
      const { cloudBookId, current_chapter, current_page, progress_percent } = op.payload;
      // Si tenemos cloudBookId directo, usarlo
      if (cloudBookId) {
        await api.syncProgress(cloudBookId, { current_chapter, current_page, progress_percent });
        return { ok: true };
      }
      // Si no, buscar por título+autor en cloudBooks
      const { bookTitle, bookAuthor } = op.payload;
      if (!bookTitle) return { ok: true }; // Descartar si no hay info
      const cloudBooks = await api.listBooks();
      const match = cloudBooks.find(cb =>
        cb.title.toLowerCase() === bookTitle.toLowerCase() &&
        cb.author.toLowerCase() === bookAuthor.toLowerCase()
      );
      if (match) {
        await api.syncProgress(match.id, { current_chapter, current_page, progress_percent });
      }
      return { ok: true };
    }

    case "sync_stats": {
      await api.syncStats(op.payload);
      return { ok: true };
    }

    case "sync_title": {
      await api.updateProfile({ selected_title_id: op.payload.selected_title_id });
      return { ok: true };
    }

    case "upload_book": {
      const { bookPath, title, author, total_chapters, description, fileType } = op.payload;

      // Si el archivo ya no existe en disco, descartar silenciosamente
      try {
        const exists: boolean = await invoke("file_exists", { path: bookPath });
        if (!exists) {
          console.log(`[SyncQueue] Skip upload: archivo no existe en disco "${bookPath}"`);
          return { ok: true, skipped: true };
        }
      } catch { /* si falla file_exists, continuar e intentar leer */ }

      // Verificación pre-upload: comprobar si el libro ya existe en la nube
      try {
        const cloudBooks = await api.listBooks();
        const normTitle = title.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '');
        const normAuthor = author.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '');
        const alreadyExists = cloudBooks.some((cb: any) => {
          const cbTitle = cb.title.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '');
          const cbAuthor = cb.author.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '');
          return cbTitle === normTitle && cbAuthor === normAuthor;
        });
        if (alreadyExists) {
          console.log(`[SyncQueue] Skip upload: "${title}" ya existe en la nube`);
          return { ok: true, skipped: true };
        }
      } catch { /* si falla la verificación, continuar con el upload normal */ }

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
      return { ok: true };
    }

    case "sync_collections": {
      await syncLocalCollectionsToCloud();
      return { ok: true };
    }

    default:
      return { ok: true }; // Op desconocida, descartar
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
      _onProcessingChange?.(op.id);
      try {
        const result = await processOne(op);
        if (result.ok) {
          console.log(`[SyncQueue] ✓ ${op.type} completado`);
          pushHistory(op, 'ok', buildSuccessMessage(op, result.skipped));
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
            pushHistory(op, 'error', buildErrorMessage(op, err));
            queue.splice(idx, 1);
          }
          saveQueue(queue);
        }
        // Si falla una operación de red, no seguir intentando las demás
        break;
      }
    }
  } finally {
    _onProcessingChange?.(null);
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
