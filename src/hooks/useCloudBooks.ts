import { invoke } from "@tauri-apps/api/core";
import * as api from '@/lib/api';
import * as syncQueue from '@/lib/syncQueue';
import { useCloudStore } from '@/stores/cloudStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useGamificationStore } from '@/stores/gamificationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUIStore } from '@/stores/uiStore';
import { statsFromApi, getUnlockedBadges } from '@/lib/gamification';
import type { Book, CloudBook } from '@/types';
import { detectBookType } from '@/lib/constants';

// Ref to prevent re-enqueuing cloud data back to queue
let cloudSyncingRef = false;
export function getCloudSyncingRef() { return cloudSyncingRef; }
export function setCloudSyncingRef(val: boolean) { cloudSyncingRef = val; }

export function useCloudBooks() {
  const {
    cloudBooks, setCloudBooks, setCloudBooksReady, setCloudLoading,
    setDownloadingBookId, downloadingBookId,
    setEditingCloudBook, editCloudForm, editingCloudBook, setEditCloudForm,
  } = useCloudStore();
  const { libraryPath, setBooks } = useLibraryStore();
  const { setStats, setSelectedTitleId, setSocialStats } = useGamificationStore();
  const { showAlert } = useUIStore();
  const { setSettingsTab } = useSettingsStore();

  async function loadCloudBooks() {
    if (!api.isLoggedIn()) return;
    setCloudLoading(true);
    try {
      const [cloudBooksList, cloudStats, socialStatsRaw] = await Promise.all([
        api.listBooks(),
        api.getStats().catch(() => null),
        api.getSocialStats().catch(() => null),
      ]);
      setCloudBooks(cloudBooksList);
      setCloudBooksReady(true);

      cloudSyncingRef = true;
      // Process social stats first so they're available for badge evaluation
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
      setTimeout(() => { cloudSyncingRef = false; }, 0);
      autoEnqueueNewBooks(useLibraryStore.getState().books, cloudBooksList);
    } catch (err: any) {
      showAlert('error', 'Error al cargar libros', err.message || 'No se pudieron cargar los libros de la nube');
    } finally {
      setCloudLoading(false);
    }
  }

  function autoEnqueueNewBooks(localBooks: Book[], cloudBooksList: api.CloudBook[]) {
    for (const local of localBooks) {
      const alreadyInCloud = cloudBooksList.some(cb =>
        cb.title.toLowerCase() === local.title.toLowerCase() &&
        cb.author.toLowerCase() === local.author.toLowerCase()
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
      const results: [string, any][] = await invoke("scan_directory", { dirPath: libraryPath });
      const savedRaw = localStorage.getItem("books_meta_v3");
      const progressMap = new Map();
      if (savedRaw) JSON.parse(savedRaw).forEach((b: any) => progressMap.set(b.id, b));
      const scannedBooks: Book[] = results.map(([filePath, meta]) => {
        const saved = progressMap.get(filePath);
        return {
          ...meta, id: filePath, path: filePath,
          title: saved?.title || meta.title, author: saved?.author || meta.author,
          description: saved?.description ?? meta.description ?? null,
          currentChapter: saved?.currentChapter || 0, progress: saved?.progress || 0,
          lastRead: saved?.lastRead || "Sin leer",
          type: detectBookType(filePath),
        };
      });
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
      setCloudBooks((prev: CloudBook[]) => prev.filter(b => b.id !== id));
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
      setEditingCloudBook(null);
      loadCloudBooks();
    } catch (err: any) {
      showAlert('error', 'Error al editar', err.message || 'No se pudo actualizar el libro');
    }
  }

  return {
    loadCloudBooks, downloadBookFromCloud, deleteCloudBook,
    startEditCloudBook, saveCloudBookEdit, autoEnqueueNewBooks,
  };
}
