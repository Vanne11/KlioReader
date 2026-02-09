import { invoke } from "@tauri-apps/api/core";
import * as api from '@/lib/api';
import { useCollectionsStore } from '@/stores/collectionsStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useUIStore } from '@/stores/uiStore';
import { mapScanResults } from './useLibrary';
import type { LocalCollection, CollectionBookEntry, ScanResult, CollectionType } from '@/types';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function useCollections() {
  const {
    setLocalCollections, setActiveCollectionId,
    setCloudCollections, setPendingCollectionShares,
    setPendingCollectionSharesCount,
  } = useCollectionsStore();

  const { libraryPath, setBooks } = useLibraryStore();
  const { showAlert } = useUIStore();

  // ── Detección automática de sagas desde subcarpetas ──

  function detectSagasFromScan(results: ScanResult[]) {
    const subfolderMap = new Map<string, ScanResult[]>();
    for (const r of results) {
      if (r.subfolder) {
        const existing = subfolderMap.get(r.subfolder) || [];
        existing.push(r);
        subfolderMap.set(r.subfolder, existing);
      }
    }

    if (subfolderMap.size === 0) return;

    const now = new Date().toISOString();

    setLocalCollections((prev: LocalCollection[]) => {
      const newCols = [...prev];

      for (const [folderName, folderResults] of subfolderMap) {
        // Verificar si ya existe una colección saga con este nombre
        const existing = newCols.find(c => c.type === 'saga' && c.name === folderName);

        // Ordenar por inferred_order si hay
        const sorted = [...folderResults].sort((a, b) => {
          if (a.inferred_order != null && b.inferred_order != null) {
            return a.inferred_order - b.inferred_order;
          }
          if (a.inferred_order != null) return -1;
          if (b.inferred_order != null) return 1;
          return a.path.localeCompare(b.path);
        });

        const bookEntries: CollectionBookEntry[] = sorted.map((r, idx) => ({
          bookId: r.path,
          orderIndex: idx,
          displayName: r.display_name || null,
        }));

        if (existing) {
          // Actualizar libros existentes
          existing.bookEntries = bookEntries;
          existing.updatedAt = now;
        } else {
          // Crear nueva saga automáticamente
          newCols.push({
            id: generateId(),
            name: folderName,
            description: null,
            type: 'saga',
            coverBase64: null,
            sortOrder: 'manual',
            bookEntries,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      // Limpiar sagas que ya no tienen subcarpeta en disco
      for (let i = newCols.length - 1; i >= 0; i--) {
        const col = newCols[i];
        if (col.type === 'saga' && !subfolderMap.has(col.name)) {
          newCols.splice(i, 1);
        }
      }

      return newCols;
    });
  }

  // ── Colecciones locales: Sagas (mueven archivos) ──

  async function createLocalSaga(name: string, bookIds: string[]) {
    if (!libraryPath) return;

    try {
      const folderPath: string = await invoke("create_subfolder", {
        basePath: libraryPath,
        folderName: name,
      });

      for (const bookId of bookIds) {
        await invoke("move_file_to_subfolder", {
          filePath: bookId,
          destFolder: folderPath,
        });
      }

      // Re-escanear para actualizar paths
      const results: ScanResult[] = await invoke("scan_directory", { dirPath: libraryPath });
      const scannedBooks = mapScanResults(results);
      setBooks(scannedBooks);
      detectSagasFromScan(results);

      showAlert('success', 'Saga creada', `La saga "${name}" fue creada con ${bookIds.length} libros`);
    } catch (err: any) {
      showAlert('error', 'Error creando saga', err.message || 'No se pudo crear la saga');
    }
  }

  // ── Colecciones locales: Virtuales (solo metadata) ──

  function createLocalCollection(name: string, description?: string, coverBase64?: string) {
    const now = new Date().toISOString();
    const newCol: LocalCollection = {
      id: generateId(),
      name,
      description: description || null,
      type: 'collection',
      coverBase64: coverBase64 || null,
      sortOrder: 'manual',
      bookEntries: [],
      createdAt: now,
      updatedAt: now,
    };

    setLocalCollections((prev: LocalCollection[]) => [...prev, newCol]);
    showAlert('success', 'Colección creada', `La colección "${name}" fue creada`);
    return newCol;
  }

  function updateLocalCollection(id: string, data: Partial<{ name: string; description: string | null; coverBase64: string | null }>) {
    setLocalCollections((prev: LocalCollection[]) => prev.map(c => {
      if (c.id !== id) return c;
      return {
        ...c,
        ...data,
        updatedAt: new Date().toISOString(),
      };
    }));
    showAlert('success', 'Colección actualizada', 'Los cambios fueron guardados');
  }

  // ── Agregar/quitar libros de colecciones locales ──

  async function addBookToLocalCollection(collectionId: string, bookId: string) {
    const col = useCollectionsStore.getState().localCollections.find(c => c.id === collectionId);
    if (!col) return;

    if (col.type === 'saga' && libraryPath) {
      // Mover archivo a la subcarpeta
      try {
        const folderPath = `${libraryPath}/${col.name}`;
        await invoke("move_file_to_subfolder", { filePath: bookId, destFolder: folderPath });

        // Re-escanear
        const results: ScanResult[] = await invoke("scan_directory", { dirPath: libraryPath });
        const scannedBooks = mapScanResults(results);
        setBooks(scannedBooks);
        detectSagasFromScan(results);
      } catch (err: any) {
        showAlert('error', 'Error', err.message || 'No se pudo mover el archivo');
      }
    } else {
      // Colección virtual: solo agregar referencia
      setLocalCollections((prev: LocalCollection[]) => prev.map(c => {
        if (c.id !== collectionId) return c;
        if (c.bookEntries.some(e => e.bookId === bookId)) return c;
        return {
          ...c,
          bookEntries: [...c.bookEntries, {
            bookId,
            orderIndex: c.bookEntries.length,
            displayName: null,
          }],
          updatedAt: new Date().toISOString(),
        };
      }));
    }
  }

  async function removeBookFromLocalCollection(collectionId: string, bookId: string) {
    const col = useCollectionsStore.getState().localCollections.find(c => c.id === collectionId);
    if (!col) return;

    if (col.type === 'saga' && libraryPath) {
      // Mover archivo a la raíz
      try {
        await invoke("move_file_to_root", { filePath: bookId, libraryPath });

        // Re-escanear
        const results: ScanResult[] = await invoke("scan_directory", { dirPath: libraryPath });
        const scannedBooks = mapScanResults(results);
        setBooks(scannedBooks);
        detectSagasFromScan(results);
      } catch (err: any) {
        showAlert('error', 'Error', err.message || 'No se pudo mover el archivo');
      }
    } else {
      setLocalCollections((prev: LocalCollection[]) => prev.map(c => {
        if (c.id !== collectionId) return c;
        return {
          ...c,
          bookEntries: c.bookEntries.filter(e => e.bookId !== bookId),
          updatedAt: new Date().toISOString(),
        };
      }));
    }
  }

  async function deleteLocalCollection(collectionId: string) {
    const col = useCollectionsStore.getState().localCollections.find(c => c.id === collectionId);
    if (!col) return;

    if (col.type === 'saga' && libraryPath) {
      // Mover todos los archivos a la raíz y luego eliminar la carpeta
      try {
        for (const entry of col.bookEntries) {
          try {
            await invoke("move_file_to_root", { filePath: entry.bookId, libraryPath });
          } catch { /* Ignorar si ya no existe */ }
        }

        // Intentar eliminar la carpeta vacía
        try {
          const folderPath = `${libraryPath}/${col.name}`;
          await invoke("move_file_to_root", { filePath: folderPath, libraryPath }).catch(() => {});
        } catch { /* Puede que no exista o no esté vacía */ }

        // Re-escanear
        const results: ScanResult[] = await invoke("scan_directory", { dirPath: libraryPath });
        const scannedBooks = mapScanResults(results);
        setBooks(scannedBooks);
      } catch (err: any) {
        showAlert('error', 'Error', err.message || 'Error al deshacer la saga');
      }
    }

    setLocalCollections((prev: LocalCollection[]) => prev.filter(c => c.id !== collectionId));
    setActiveCollectionId(null);
    showAlert('success', 'Eliminada', `"${col.name}" fue eliminada`);
  }

  function updateLocalCollectionBookEntry(collectionId: string, bookId: string, displayName: string | null) {
    setLocalCollections((prev: LocalCollection[]) => prev.map(c => {
      if (c.id !== collectionId) return c;
      return {
        ...c,
        bookEntries: c.bookEntries.map(e =>
          e.bookId === bookId ? { ...e, displayName } : e
        ),
        updatedAt: new Date().toISOString(),
      };
    }));
  }

  function reorderLocalCollection(collectionId: string, bookIds: string[]) {
    setLocalCollections((prev: LocalCollection[]) => prev.map(c => {
      if (c.id !== collectionId) return c;
      const reordered = bookIds.map((id, idx) => {
        const existing = c.bookEntries.find(e => e.bookId === id);
        return existing
          ? { ...existing, orderIndex: idx }
          : { bookId: id, orderIndex: idx, displayName: null };
      });
      return { ...c, bookEntries: reordered, updatedAt: new Date().toISOString() };
    }));
  }

  // ── Cloud collections ──

  async function loadCloudCollections() {
    if (!api.isLoggedIn()) return;
    try {
      const cols = await api.listCollections();
      setCloudCollections(cols);
    } catch (err) {
      console.error('Error cargando colecciones cloud:', err);
    }
  }

  async function createCloudCollection(name: string, type: CollectionType, description?: string, coverBase64?: string) {
    try {
      const res = await api.createCollection({ name, type, description, cover_base64: coverBase64 });
      await loadCloudCollections();
      showAlert('success', 'Colección creada', `"${name}" creada en la nube`);
      return res;
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo crear la colección');
    }
  }

  async function updateCloudCollection(id: number, data: Partial<{ name: string; description: string | null; cover_base64: string | null }>) {
    try {
      await api.updateCollection(id, data);
      await loadCloudCollections();
      showAlert('success', 'Colección actualizada', 'Los cambios fueron guardados');
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo actualizar la colección');
    }
  }

  async function deleteCloudCollection(id: number) {
    try {
      await api.deleteCollection(id);
      setCloudCollections((prev) => prev.filter(c => c.id !== id));
      showAlert('success', 'Colección eliminada', 'La colección fue eliminada de la nube');
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo eliminar la colección');
    }
  }

  async function addBooksToCloudCollection(collectionId: number, bookIds: number[]) {
    try {
      const res = await api.addBooksToCollection(collectionId, bookIds);
      await loadCloudCollections();
      return res;
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudieron agregar los libros');
    }
  }

  async function removeBookFromCloudCollection(collectionId: number, bookId: number) {
    try {
      await api.removeBookFromCollection(collectionId, bookId);
      await loadCloudCollections();
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo quitar el libro');
    }
  }

  // ── Compartir colecciones cloud ──

  async function shareCloudCollection(collectionId: number, toUserId: number, message?: string) {
    try {
      const res = await api.shareCollection(collectionId, toUserId, message);
      showAlert('success', 'Colección compartida', 'La invitación fue enviada');
      return res;
    } catch (err: any) {
      showAlert('error', 'Error al compartir', err.message || 'No se pudo compartir la colección');
    }
  }

  async function loadPendingCollectionShares() {
    if (!api.isLoggedIn()) return;
    try {
      const shares = await api.getPendingCollectionShares();
      setPendingCollectionShares(shares);
    } catch (err) {
      console.error('Error cargando invitaciones de colecciones:', err);
    }
  }

  async function loadPendingCollectionSharesCount() {
    if (!api.isLoggedIn()) return;
    try {
      const count = await api.getPendingCollectionSharesCount();
      setPendingCollectionSharesCount(count);
    } catch { /* ignorar */ }
  }

  async function acceptCollectionShare(shareId: number) {
    try {
      const res = await api.acceptCollectionShare(shareId);
      setPendingCollectionShares((prev) => prev.filter(s => s.id !== shareId));
      setPendingCollectionSharesCount((prev) => Math.max(0, prev - 1));
      await loadCloudCollections();
      showAlert('success', 'Colección aceptada', `Se agregó la colección con ${res.books_added} libros`);
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo aceptar la invitación');
    }
  }

  async function rejectCollectionShare(shareId: number) {
    try {
      await api.rejectCollectionShare(shareId);
      setPendingCollectionShares((prev) => prev.filter(s => s.id !== shareId));
      setPendingCollectionSharesCount((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo rechazar la invitación');
    }
  }

  return {
    // Detección
    detectSagasFromScan,
    // Local
    createLocalSaga,
    createLocalCollection,
    updateLocalCollection,
    addBookToLocalCollection,
    removeBookFromLocalCollection,
    deleteLocalCollection,
    updateLocalCollectionBookEntry,
    reorderLocalCollection,
    // Cloud
    loadCloudCollections,
    createCloudCollection,
    updateCloudCollection,
    deleteCloudCollection,
    addBooksToCloudCollection,
    removeBookFromCloudCollection,
    // Sharing
    shareCloudCollection,
    loadPendingCollectionShares,
    loadPendingCollectionSharesCount,
    acceptCollectionShare,
    rejectCollectionShare,
  };
}
