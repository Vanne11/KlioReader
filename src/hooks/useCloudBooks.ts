import { invoke } from "@tauri-apps/api/core";
import * as api from '@/lib/api';
import * as syncQueue from '@/lib/syncQueue';
import { useCloudStore } from '@/stores/cloudStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useGamificationStore } from '@/stores/gamificationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUIStore } from '@/stores/uiStore';
import { statsFromApi, getUnlockedBadges } from '@/lib/gamification';
import { useT } from '@/i18n';
import type { Book, CloudBook, ScanResult } from '@/types';
import { mapScanResults } from './useLibrary';

// Normalización que replica StorageManager::computeBookHash() del backend
function normalizeForComparison(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '');
}

// Ref to prevent re-enqueuing cloud data back to queue
let cloudSyncingRef = false;
export function getCloudSyncingRef() { return cloudSyncingRef; }
export function setCloudSyncingRef(val: boolean) { cloudSyncingRef = val; }

export function useCloudBooks() {
  const { t } = useT();
  const {
    cloudBooks, setCloudBooks, setCloudBooksReady, setCloudLoading,
    setCloudDigestHash, cloudDigestHash,
    setDownloadingBookId, downloadingBookId,
    setEditingCloudBook, editCloudForm, editingCloudBook, setEditCloudForm,
  } = useCloudStore();
  const { libraryPath, setBooks } = useLibraryStore();
  const { setStats, setSelectedTitleId, setSocialStats } = useGamificationStore();
  const { showAlert } = useUIStore();
  const { setSettingsTab } = useSettingsStore();

  async function loadCloudBooks(forceRefresh = false) {
    if (!api.isLoggedIn()) return;

    // Paso 1: Verificar digest — si no cambió nada, usar caché
    if (!forceRefresh) {
      try {
        const digest = await api.getBooksDigest();
        if (digest.hash === cloudDigestHash && cloudBooks.length > 0) {
          // No hay cambios — solo refrescar stats/badges en background
          refreshStatsOnly();
          return;
        }
        // Hash cambió → necesitamos recargar
        setCloudDigestHash(digest.hash);
      } catch {
        // Si falla el digest (servidor viejo?), recargar normal
      }
    }

    setCloudLoading(true);
    try {
      const [cloudBooksList, cloudStats, socialStatsRaw] = await Promise.all([
        api.listBooks(),
        api.getStats().catch(() => null),
        api.getSocialStats().catch(() => null),
      ]);

      // Merge covers: si tenemos portadas en caché, preservarlas
      const cachedCovers = new Map<number, string | null>();
      for (const cb of cloudBooks) {
        if (cb.cover_base64) cachedCovers.set(cb.id, cb.cover_base64);
      }
      for (const book of cloudBooksList) {
        if (!book.cover_base64 && cachedCovers.has(book.id)) {
          book.cover_base64 = cachedCovers.get(book.id)!;
        }
      }

      setCloudBooks(cloudBooksList);
      setCloudBooksReady(true);

      // Guardar nuevo digest y persistir caché
      const newDigest = await api.getBooksDigest().catch(() => null);
      if (newDigest) {
        setCloudDigestHash(newDigest.hash);
      }
      // Persistir en localStorage después de actualizar el hash
      setTimeout(() => useCloudStore.getState().persistCache(), 0);

      cloudSyncingRef = true;
      processStatsAndBadges(cloudStats, socialStatsRaw);
      setTimeout(() => { cloudSyncingRef = false; }, 0);
      autoEnqueueNewBooks(useLibraryStore.getState().books, cloudBooksList);
    } catch (err: any) {
      showAlert('error', 'Error al cargar libros', err.message || 'No se pudieron cargar los libros de la nube');
    } finally {
      setCloudLoading(false);
    }
  }

  // Refrescar solo stats sin recargar libros
  async function refreshStatsOnly() {
    try {
      const [cloudStats, socialStatsRaw] = await Promise.all([
        api.getStats().catch(() => null),
        api.getSocialStats().catch(() => null),
      ]);
      processStatsAndBadges(cloudStats, socialStatsRaw);
      // Aun sin cambios en libros, auto-enqueue si hay libros locales nuevos
      autoEnqueueNewBooks(useLibraryStore.getState().books, cloudBooks);
    } catch {}
  }

  function processStatsAndBadges(cloudStats: api.UserStats | null, socialStatsRaw: api.SocialStats | null) {
    const socialForBadges = socialStatsRaw ? {
      booksShared: Number(socialStatsRaw.books_shared) || 0,
      racesWon: Number(socialStatsRaw.races_won) || 0,
      racesParticipated: Number(socialStatsRaw.races_participated) || 0,
      challengesCompleted: Number(socialStatsRaw.challenges_completed) || 0,
      challengesCreated: Number(socialStatsRaw.challenges_created) || 0,
      sharedNotesCount: Number(socialStatsRaw.shared_notes_count) || 0,
    } : undefined;
    if (socialForBadges) {
      setSocialStats(socialForBadges);
    }
    if (cloudStats) {
      const remote = statsFromApi(cloudStats);
      const currentBooks = useLibraryStore.getState().books;
      const booksForBadges = currentBooks.map((b: any) => ({ progress: b.progress }));
      const remoteBadges = getUnlockedBadges(remote, booksForBadges, socialForBadges).map(b => b.id);
      const savedRaw = localStorage.getItem('klioUnlockedBadges');
      const previousIds: string[] = savedRaw ? JSON.parse(savedRaw) : [];
      const merged = [...new Set([...previousIds, ...remoteBadges])];
      localStorage.setItem('klioUnlockedBadges', JSON.stringify(merged));
      setStats(prev => remote.xp >= prev.xp ? remote : prev);
    }
    if (cloudStats?.selected_title_id) {
      setSelectedTitleId(cloudStats.selected_title_id);
    }
  }

  function autoEnqueueNewBooks(localBooks: Book[], cloudBooksList: api.CloudBook[]) {
    for (const local of localBooks) {
      const localTitle = normalizeForComparison(local.title);
      const localAuthor = normalizeForComparison(local.author);
      const alreadyInCloud = cloudBooksList.some(cb =>
        normalizeForComparison(cb.title) === localTitle &&
        normalizeForComparison(cb.author) === localAuthor
      );
      if (!alreadyInCloud) {
        syncQueue.enqueue('upload_book', {
          bookPath: local.path,
          title: local.title,
          author: local.author,
          total_chapters: local.total_chapters,
          description: local.description || null,
          fileType: local.type,
        });
      }
    }
    // Sincronizar colecciones locales a la nube (se ejecuta al final de la cola)
    syncQueue.enqueue('sync_collections', {});
  }

  async function downloadBookFromCloud(cloudBook: CloudBook) {
    if (!libraryPath) {
      showAlert('info', 'Sin carpeta de biblioteca', 'Configura una carpeta de biblioteca en Configuración → Carpeta de Libros');
      useUIStore.getState().setActiveTab('settings');
      setSettingsTab('folder');
      return;
    }
    if (downloadingBookId) return;
    setDownloadingBookId(cloudBook.id);
    try {
      const savePath = `${libraryPath}/${cloudBook.file_name}`;
      let copiedLocally = false;
      if (cloudBook.stored_file_id != null) {
        const sibling = cloudBooks.find(
          cb => cb.id !== cloudBook.id && cb.stored_file_id === cloudBook.stored_file_id
        );
        if (sibling) {
          const siblingPath = `${libraryPath}/${sibling.file_name}`;
          const siblingExists: boolean = await invoke("file_exists", { path: siblingPath });
          if (siblingExists) {
            await invoke("copy_file", { src: siblingPath, dest: savePath });
            copiedLocally = true;
          }
        }
      }
      if (!copiedLocally) {
        const blob = await api.downloadBook(cloudBook.id);
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = Array.from(new Uint8Array(arrayBuffer));
        await invoke("save_file_bytes", { path: savePath, bytes });
      }
      // Re-scan library directly (can't call hooks outside component)
      const results: ScanResult[] = await invoke("scan_directory", { dirPath: libraryPath });
      const scannedBooks = mapScanResults(results);
      setBooks(scannedBooks);

      showAlert('success', copiedLocally ? 'Libro copiado (duplicado)' : 'Libro descargado',
        copiedLocally
          ? `"${cloudBook.title}" se copió desde un archivo local idéntico`
          : `"${cloudBook.title}" se guardó en tu biblioteca local`
      );
    } catch (err: any) {
      showAlert('error', 'Error al descargar', err.message || 'No se pudo descargar el libro');
    } finally {
      setDownloadingBookId(null);
    }
  }

  async function deleteCloudBook(id: number) {
    try {
      await api.deleteBook(id);
      // Actualizar caché local directamente sin re-fetch
      setCloudBooks((prev: CloudBook[]) => prev.filter(b => b.id !== id));
      setCloudDigestHash(null); // Invalidar digest para que el próximo load recargue
      setTimeout(() => useCloudStore.getState().persistCache(), 0);
      showAlert('success', 'Libro eliminado', 'El libro se eliminó de la nube. El progreso de lectura fue archivado.');
    } catch (err: any) {
      showAlert('error', 'Error al eliminar', err.message || 'No se pudo eliminar el libro');
    }
  }

  function startEditCloudBook(cb: CloudBook) {
    setEditingCloudBook(cb);
    setEditCloudForm({ title: cb.title, author: cb.author, description: cb.description || '' });
  }

  async function saveCloudBookEdit() {
    if (!editingCloudBook) return;
    try {
      await api.updateBook(editingCloudBook.id, editCloudForm);
      // Actualizar caché local directamente
      setCloudBooks((prev: CloudBook[]) => prev.map(b =>
        b.id === editingCloudBook.id
          ? { ...b, title: editCloudForm.title, author: editCloudForm.author, description: editCloudForm.description }
          : b
      ));
      setEditingCloudBook(null);
      setCloudDigestHash(null); // Invalidar digest
      setTimeout(() => useCloudStore.getState().persistCache(), 0);
    } catch (err: any) {
      showAlert('error', 'Error al editar', err.message || 'No se pudo actualizar el libro');
    }
  }

  async function removeCloudDuplicates() {
    try {
      const result = await api.removeDuplicates();
      if (result.removed > 0) {
        await loadCloudBooks(true); // Forzar recarga
        showAlert('success', t('cloud.dedupDoneTitle'), t('cloud.dedupDoneDesc', { count: String(result.removed) }));
      } else {
        showAlert('info', t('cloud.dedupNoneTitle'), t('cloud.dedupNoneDesc'));
      }
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudieron eliminar los duplicados');
    }
  }

  return {
    loadCloudBooks, downloadBookFromCloud, deleteCloudBook,
    startEditCloudBook, saveCloudBookEdit, autoEnqueueNewBooks,
    removeCloudDuplicates,
  };
}
