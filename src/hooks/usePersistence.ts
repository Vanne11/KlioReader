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
import { buildInvokeConfig } from '@/lib/constants';
import type { Book, BookMetadata } from '@/types';

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

  // Sync events listener
  useSyncEvents();

  // Persist reader preferences
  useEffect(() => { localStorage.setItem("libraryView", libraryView); }, [libraryView]);
  useEffect(() => { localStorage.setItem("readerFontSize", fontSize.toString()); }, [fontSize]);
  useEffect(() => { localStorage.setItem("readerTheme", readerTheme); }, [readerTheme]);
  useEffect(() => { localStorage.setItem("readView", readView); }, [readView]);
  useEffect(() => { localStorage.setItem("readerPageColumns", pageColumns.toString()); }, [pageColumns]);
  useEffect(() => { localStorage.setItem("readerFont", readerFont); }, [readerFont]);
  useEffect(() => { localStorage.setItem("klioLlmProvider", llmProvider); }, [llmProvider]);
  useEffect(() => { localStorage.setItem("klioLlmApiKey", llmApiKey); }, [llmApiKey]);

  // Load books from localStorage on mount
  useEffect(() => {
    const savedRaw = localStorage.getItem("books_meta_v3");
    if (savedRaw) setBooks(JSON.parse(savedRaw));
    setBooksLoaded(true);
  }, []);

  // Save books to localStorage
  useEffect(() => {
    if (!booksLoaded) return;
    const booksToSave = books.map(({ cover, ...rest }) => ({ ...rest }));
    localStorage.setItem("books_meta_v3", JSON.stringify(booksToSave));
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
          const results: [string, BookMetadata][] = await invoke("scan_directory", { dirPath: path });
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
              type: filePath.toLowerCase().endsWith('pdf') ? 'pdf' as const : 'epub' as const,
            };
          });
          setBooks(scannedBooks);
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
