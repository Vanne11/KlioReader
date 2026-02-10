import { useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore } from '@/stores/libraryStore';
import { useReaderStore } from '@/stores/readerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useCloudBooks } from './useCloudBooks';
import { useShares } from './useShares';
import { useChallenges } from './useChallenges';
import { useAuth } from './useAuth';
import { useSyncEvents } from './useStorageSync';
import { useLibraryWatcher } from './useLibraryWatcher';
import { buildInvokeConfig } from '@/lib/constants';
import { mapScanResults } from './useLibrary';
import { useCollections } from './useCollections';
import type { ScanResult } from '@/types';

export function usePersistence() {
  const libraryView = useLibraryStore(s => s.libraryView);
  const books = useLibraryStore(s => s.books);
  const booksLoaded = useLibraryStore(s => s.booksLoaded);
  const libraryPath = useLibraryStore(s => s.libraryPath);
  const { setBooks, setBooksLoaded, setIsMobile, setLibraryPath } = useLibraryStore();

  const fontSize = useReaderStore(s => s.fontSize);
  const readerTheme = useReaderStore(s => s.readerTheme);
  const readView = useReaderStore(s => s.readView);
  const pageColumns = useReaderStore(s => s.pageColumns);
  const readerFont = useReaderStore(s => s.readerFont);
  const { setIsFullscreen } = useReaderStore();

  const llmProvider = useSettingsStore(s => s.llmProvider);
  const llmApiKey = useSettingsStore(s => s.llmApiKey);
  const storageConfig = useSettingsStore(s => s.storageConfig);
  const storageConfigured = useSettingsStore(s => s.storageConfigured());

  const authUser = useAuthStore(s => s.authUser);
  const cloudBooks = useCloudStore(s => s.cloudBooks);
  const cloudBooksReady = useCloudStore(s => s.cloudBooksReady);

  const { loadCloudBooks, autoEnqueueNewBooks } = useCloudBooks();
  const { loadPendingSharesCount } = useShares();
  const { loadPendingCount: loadPendingChallengesCount } = useChallenges();
  const { loadProfile } = useAuth();
  const { detectSagasFromScan, loadCloudCollections, loadPendingCollectionSharesCount } = useCollections();

  // Sync events listener
  useSyncEvents();

  // File system watcher
  useLibraryWatcher();

  // Persist reader preferences
  useEffect(() => { localStorage.setItem("libraryView", libraryView); }, [libraryView]);
  useEffect(() => { localStorage.setItem("readerFontSize", fontSize.toString()); }, [fontSize]);
  useEffect(() => { localStorage.setItem("readerTheme", readerTheme); }, [readerTheme]);
  useEffect(() => { localStorage.setItem("readView", readView); }, [readView]);
  useEffect(() => { localStorage.setItem("readerPageColumns", pageColumns.toString()); }, [pageColumns]);
  useEffect(() => { localStorage.setItem("readerFont", readerFont); }, [readerFont]);
  useEffect(() => { localStorage.setItem("klioLlmProvider", llmProvider); }, [llmProvider]);
  useEffect(() => { localStorage.setItem("klioLlmApiKey", llmApiKey); }, [llmApiKey]);

  // Load books from localStorage on mount + sync sagas immediately
  useEffect(() => {
    const savedRaw = localStorage.getItem("books_meta_v3");
    if (savedRaw) {
      const savedBooks = JSON.parse(savedRaw);
      setBooks(savedBooks);
      // Detectar sagas inmediatamente desde los libros guardados
      // para que no haya flash de libros sin agrupar
      const booksWithSubfolder = savedBooks.filter((b: any) => b.subfolder);
      if (booksWithSubfolder.length > 0) {
        detectSagasFromScan(booksWithSubfolder.map((b: any) => ({
          path: b.id || b.path,
          subfolder: b.subfolder,
          inferred_order: b.inferredOrder ?? null,
          display_name: b.displayName ?? null,
          metadata: { title: b.title || '', author: b.author || '' },
        })));
      }
    }
    setBooksLoaded(true);
  }, []);

  // Save books to localStorage (debounced para evitar serializar en cada micro-cambio)
  useEffect(() => {
    if (!booksLoaded) return;
    const timer = setTimeout(() => {
      const booksToSave = books.map(({ cover, ...rest }) => ({ ...rest }));
      localStorage.setItem("books_meta_v3", JSON.stringify(booksToSave));
    }, 300);
    return () => clearTimeout(timer);
  }, [books, booksLoaded]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Init library on mount (detect mobile, set path, scan)
  useEffect(() => {
    if (!booksLoaded) return;
    async function init() {
      try {
        const mobile: boolean = await invoke("is_mobile_platform");
        setIsMobile(mobile);
      } catch {}
      let path = libraryPath;
      if (!path) {
        try {
          path = await invoke("get_default_library_path");
          setLibraryPath(path);
          localStorage.setItem("libraryPath", path || "");
        } catch (e) { console.error(e); }
      }
      if (path) {
        try {
          const results: ScanResult[] = await invoke("scan_directory", { dirPath: path });
          const scannedBooks = mapScanResults(results);
          setBooks(scannedBooks);
          detectSagasFromScan(results);
        } catch (err) { console.error(err); }
      }
    }
    init();
  }, [booksLoaded]);

  // Load cloud books on auth
  useEffect(() => {
    if (authUser) {
      loadCloudBooks();
      loadPendingSharesCount();
      loadPendingChallengesCount();
      loadCloudCollections();
      loadPendingCollectionSharesCount();
    }
  }, [authUser]);

  // Auto-enqueue uploads when local books change
  useEffect(() => {
    if (!authUser || !booksLoaded || books.length === 0 || !cloudBooksReady) return;
    autoEnqueueNewBooks(books, cloudBooks);
  }, [books, cloudBooks, booksLoaded, authUser, cloudBooksReady]);

  // Load profile silently on mount
  useEffect(() => {
    if (authUser) loadProfile(false);
  }, [authUser]);

  // Initialize storage on mount
  useEffect(() => {
    if (storageConfigured && libraryPath) {
      const cfg = buildInvokeConfig(storageConfig);
      invoke('user_storage_configure', { config: cfg, libraryPath }).catch(() => {});
      if (storageConfig.auto_sync_enabled) {
        invoke('user_storage_set_auto_sync_interval', { secs: storageConfig.auto_sync_interval || 300 })
          .then(() => invoke('user_storage_start_auto_sync'))
          .catch(() => {});
      }
    }
  }, []);
}
