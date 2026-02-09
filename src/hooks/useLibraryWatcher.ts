import { useEffect, useRef } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useLibraryStore } from '@/stores/libraryStore';
import { mapScanResults } from './useLibrary';
import { useCollections } from './useCollections';
import type { ScanResult } from '@/types';

export function useLibraryWatcher() {
  const libraryPath = useLibraryStore(s => s.libraryPath);
  const booksLoaded = useLibraryStore(s => s.booksLoaded);
  const scanningRef = useRef(false);
  const { detectSagasFromScan } = useCollections();

  // Iniciar/parar watcher cuando cambia la ruta
  useEffect(() => {
    if (!booksLoaded || !libraryPath) return;

    invoke('start_library_watcher', { path: libraryPath }).catch((e) =>
      console.warn('[watcher] No se pudo iniciar:', e)
    );

    return () => {
      invoke('stop_library_watcher').catch(() => {});
    };
  }, [libraryPath, booksLoaded]);

  // Escuchar evento library-changed y re-escanear
  useEffect(() => {
    if (!booksLoaded || !libraryPath) return;

    const unlisten = listen('library-changed', async () => {
      if (scanningRef.current) return;
      scanningRef.current = true;
      try {
        const results: ScanResult[] = await invoke('scan_directory', { dirPath: libraryPath });
        const scannedBooks = mapScanResults(results);
        useLibraryStore.getState().setBooks(scannedBooks);
        detectSagasFromScan(results);
      } catch (e) {
        console.error('[watcher] Error re-escaneando:', e);
      } finally {
        scanningRef.current = false;
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [libraryPath, booksLoaded]);
}
