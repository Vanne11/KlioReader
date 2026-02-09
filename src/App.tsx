import { useState, useEffect, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  BookOpen, Trophy, Library, Flame, X,
  ZoomIn, ZoomOut,
  Scroll as ScrollIcon, Columns2, Square, Maximize, Minimize,
  LayoutGrid, Grid2X2, List, Settings2,
  Cloud, CloudUpload, CloudDownload, LogIn, LogOut, User, Loader2, Server, Trash2, Pencil, FolderOpen,
  Play, ChevronLeft, AlertTriangle, CheckCircle2, Info,
  StickyNote, Bookmark as BookmarkIcon, Plus, MessageSquare,
  Key, Brain, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Document, Page, pdfjs } from 'react-pdf';
import parse, { Element, HTMLReactParserOptions } from 'html-react-parser';
import {
  UserStats, INITIAL_STATS, addXP, updateStreak, statsToApi, statsFromApi,
  BadgeCategory, BadgeWithStatus,
  BADGES, RARITY_CONFIG, CATEGORY_CONFIG,
  calculateLevel, getAllBadgesWithStatus, getUnlockedBadges, getUserTitle, getBadgeImageUrl, xpForNextLevel,
} from "@/lib/gamification";
import * as api from "@/lib/api";
import * as syncQueue from "@/lib/syncQueue";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/** Converts a cover value to a valid image src, handling both raw base64 and full data URIs */
function coverSrc(cover: string | null | undefined): string | undefined {
  if (!cover) return undefined;
  return cover.startsWith('data:') ? cover : `data:image/png;base64,${cover}`;
}

import "./App.css";

interface BookMetadata {
  title: string;
  author: string;
  cover: string | null;
  description: string | null;
  total_chapters: number;
}

interface Book extends BookMetadata {
  id: string;
  progress: number;
  currentChapter: number;
  lastRead: string;
  path: string;
  type: 'epub' | 'pdf';
}

type LibraryView = 'grid-large' | 'grid-mini' | 'grid-card' | 'list-info';
type ReaderTheme = 'dark' | 'sepia' | 'light';
type ReadView = 'scroll' | 'paginated';
type ReaderFont = 'Libre Baskerville' | 'Inter' | 'Merriweather' | 'Literata' | 'OpenDyslexic';
type SettingsTab = 'display' | 'llm' | 'folder';
type LlmProvider = 'groq' | 'google' | 'anthropic' | 'openai' | 'ollama' | 'custom';

const EpubImage = ({ src, bookPath }: { src: string, bookPath: string }) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    async function loadImg() {
      try {
        const cleanPath = src.replace(/^\.\.\//, '').replace(/^\.\//, '');
        const [bytes, mime]: [number[], string] = await invoke("read_epub_resource", { path: bookPath, resourcePath: cleanPath });
        const blob = new Blob([new Uint8Array(bytes)], { type: mime });
        objectUrl = URL.createObjectURL(blob);
        setImgUrl(objectUrl);
      } catch (e) { console.error("Error image", e); }
    }
    if (src && !src.startsWith('data:')) loadImg();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, bookPath]);
  if (!imgUrl) return <div className="h-40 w-full bg-secondary/10 animate-pulse rounded-lg my-4" />;
  return <img src={imgUrl} className="max-w-full h-auto rounded-lg my-4 shadow-md mx-auto block" alt="" />;
};

function App() {
  const [activeTab, setActiveTab] = useState("library");
  const [books, setBooks] = useState<Book[]>([]);
  const [booksLoaded, setBooksLoaded] = useState(false);
  const booksRef = useRef<Book[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [epubContent, setEpubContent] = useState<string>("");
  const [libraryPath, setLibraryPath] = useState<string | null>(localStorage.getItem("libraryPath"));
  
  // CONFIGURACIONES PERSISTENTES
  const [libraryView, setLibraryView] = useState<LibraryView>(() => (localStorage.getItem("libraryView") as LibraryView) || "grid-large");
  const [fontSize, setFontSize] = useState<number>(() => Number(localStorage.getItem("readerFontSize")) || 18);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>(() => (localStorage.getItem("readerTheme") as ReaderTheme) || 'dark');
  const [readView, setReadView] = useState<ReadView>(() => (localStorage.getItem("readView") as ReadView) || 'scroll');
  const [pageColumns, setPageColumns] = useState<1 | 2>(() => (Number(localStorage.getItem("readerPageColumns")) as 1 | 2) || 2);
  const [readerFont, setReaderFont] = useState<ReaderFont>(() => (localStorage.getItem("readerFont") as ReaderFont) || 'Libre Baskerville');
  
  // Auth & Cloud
  const [authUser, setAuthUser] = useState<api.AuthUser | null>(api.getStoredUser);
  const [cloudBooks, setCloudBooks] = useState<api.CloudBook[]>([]);
  const [cloudBooksReady, setCloudBooksReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [editingCloudBook, setEditingCloudBook] = useState<api.CloudBook | null>(null);
  const [editCloudForm, setEditCloudForm] = useState({ title: '', author: '', description: '' });
  const [editingLocalBook, setEditingLocalBook] = useState<Book | null>(null);
  const [editLocalForm, setEditLocalForm] = useState({ title: '', author: '', description: '' });
  const [alertModal, setAlertModal] = useState<{ title: string; message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [downloadingBookId, setDownloadingBookId] = useState<number | null>(null);
  const [queueCount, setQueueCount] = useState(syncQueue.getQueueCount());
  const [queueSummary, setQueueSummary] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profile, setProfile] = useState<api.UserProfile | null>(null);
  const [profileForm, setProfileForm] = useState({ username: '', email: '', password: '' });
  // Notes & Bookmarks in reader
  const [readerNotes, setReaderNotes] = useState<api.Note[]>([]);
  const [readerBookmarks, setReaderBookmarks] = useState<api.Bookmark[]>([]);
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteColor, setNewNoteColor] = useState('#ffeb3b');

  // Badge system
  const [badgeFilter, setBadgeFilter] = useState<'all' | BadgeCategory>('all');
  const [selectedTitleId, setSelectedTitleId] = useState<string | null>(() => localStorage.getItem('klioSelectedTitle'));
  const [selectedBadgeDetail, setSelectedBadgeDetail] = useState<BadgeWithStatus | null>(null);

  // Settings
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('display');
  const [llmProvider, setLlmProvider] = useState<LlmProvider>(() => (localStorage.getItem('klioLlmProvider') as LlmProvider) || 'groq');
  const [llmApiKey, setLlmApiKey] = useState<string>(() => localStorage.getItem('klioLlmApiKey') || '');

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [numPages, setNumPages] = useState<number | null>(null);
  const scale = 1.0;
  const readerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialRenderRef = useRef(true);
  const cloudSyncingRef = useRef(false);

  // Sincronizar estado de pantalla completa
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Paginación intra-capítulo
  const [currentPageInChapter, setCurrentPageInChapter] = useState(0);
  const [totalPagesInChapter, setTotalPagesInChapter] = useState(1);
  const pendingLastPageRef = useRef(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const [pageHeight, setPageHeight] = useState(0);

  // Calcular altura de página (alineada a line-height) y total de páginas
  useEffect(() => {
    if (readView !== 'paginated' || !readerRef.current) {
      setTotalPagesInChapter(1);
      setCurrentPageInChapter(0);
      return;
    }

    const recalc = () => {
      const viewport = readerRef.current;
      const content = contentRef.current;
      if (!viewport || !content) return;

      const rootFs = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const padY = 3 * rootFs * 2; // py-12 = 3rem arriba + 3rem abajo
      const rawHeight = viewport.clientHeight - padY;
      const lineH = fontSize * 1.8;
      const linesPerPage = Math.floor(rawHeight / lineH);
      const pH = linesPerPage * lineH;
      setPageHeight(pH);

      requestAnimationFrame(() => {
        const contentH = content.scrollHeight;
        const pages = Math.max(1, Math.ceil(contentH / pH));
        setTotalPagesInChapter(pages);

        if (pendingLastPageRef.current) {
          pendingLastPageRef.current = false;
          setCurrentPageInChapter(pages - 1);
        } else {
          setCurrentPageInChapter(prev => Math.min(prev, pages - 1));
        }
      });
    };

    recalc();

    const ro = new ResizeObserver(recalc);
    ro.observe(readerRef.current);
    return () => ro.disconnect();
  }, [readView, epubContent, fontSize, readerFont]);

  const [stats, setStats] = useState<UserStats>(() => {
    const saved = localStorage.getItem("userStats");
    if (!saved) return INITIAL_STATS;
    const parsed = JSON.parse(saved);
    // Sanitize: ensure numeric fields are actual numbers (fix PDO string bug)
    const xp = Number(parsed.xp) || 0;
    return {
      xp,
      level: calculateLevel(xp),
      streak: Number(parsed.streak) || 0,
      lastReadDate: parsed.lastReadDate || null,
    };
  });

  // Persistencia
  useEffect(() => { localStorage.setItem("libraryView", libraryView); }, [libraryView]);
  useEffect(() => { localStorage.setItem("readerFontSize", fontSize.toString()); }, [fontSize]);
  useEffect(() => { localStorage.setItem("readerTheme", readerTheme); }, [readerTheme]);
  useEffect(() => { localStorage.setItem("readView", readView); }, [readView]);
  useEffect(() => { localStorage.setItem("readerPageColumns", pageColumns.toString()); }, [pageColumns]);
  useEffect(() => { localStorage.setItem("readerFont", readerFont); }, [readerFont]);
  useEffect(() => { localStorage.setItem("klioLlmProvider", llmProvider); }, [llmProvider]);
  useEffect(() => { localStorage.setItem("klioLlmApiKey", llmApiKey); }, [llmApiKey]);
  useEffect(() => {
    localStorage.setItem("userStats", JSON.stringify(stats));
    if (initialRenderRef.current || cloudSyncingRef.current) return;
    if (api.isLoggedIn()) {
      syncQueue.enqueue('sync_stats', statsToApi(stats));
    }
  }, [stats]);
  useEffect(() => {
    if (selectedTitleId) localStorage.setItem('klioSelectedTitle', selectedTitleId);
    else localStorage.removeItem('klioSelectedTitle');
    if (initialRenderRef.current || cloudSyncingRef.current) return;
    if (api.isLoggedIn()) {
      syncQueue.enqueue('sync_title', { selected_title_id: selectedTitleId });
    }
  }, [selectedTitleId]);

  // Mark initial render as done (after stats/title effects have run once)
  useEffect(() => { initialRenderRef.current = false; }, []);

  // Detectar nuevas insignias
  useEffect(() => {
    const booksForBadges = books.map(b => ({ progress: b.progress }));
    const currentUnlocked = getUnlockedBadges(stats, booksForBadges).map(b => b.id);
    const savedRaw = localStorage.getItem('klioUnlockedBadges');
    const previousIds: string[] = savedRaw ? JSON.parse(savedRaw) : [];
    const newBadges = currentUnlocked.filter(id => !previousIds.includes(id));
    if (newBadges.length > 0 && previousIds.length > 0 && !initialRenderRef.current) {
      const badge = BADGES.find(b => b.id === newBadges[0]);
      if (badge) showAlert('success', '¡Nueva Insignia!', `🏆 ${badge.name} — ${badge.description}`);
    }
    // Merge: never lose previously notified badges (books may load after stats)
    const allKnown = [...new Set([...previousIds, ...currentUnlocked])];
    if (allKnown.length !== previousIds.length) {
      localStorage.setItem('klioUnlockedBadges', JSON.stringify(allKnown));
    }
  }, [stats, books]);

  // ── Sync Queue lifecycle ──
  useEffect(() => {
    if (!authUser) {
      syncQueue.stopProcessing();
      return;
    }
    syncQueue.setBooksRef(() => booksRef.current);
    syncQueue.setOnUploadComplete(() => loadCloudBooks());
    syncQueue.setOnQueueChange((count, summary) => { setQueueCount(count); setQueueSummary(summary); });
    syncQueue.startProcessing();
    return () => syncQueue.stopProcessing();
  }, [authUser]);

  // Auto-enqueue uploads when local books change (e.g. after scan)
  useEffect(() => {
    if (!authUser || !booksLoaded || books.length === 0 || !cloudBooksReady) return;
    autoEnqueueNewBooks(books, cloudBooks);
  }, [books, cloudBooks, booksLoaded, authUser, cloudBooksReady]);

  useEffect(() => {
    if (!booksLoaded) return;
    async function init() {
      let path = libraryPath;
      if (!path) {
        try {
          path = await invoke("get_default_library_path");
          setLibraryPath(path);
          localStorage.setItem("libraryPath", path || "");
        } catch (e) { console.error(e); }
      }
      if (path) scanLibrary(path);
    }
    init();
  }, [booksLoaded]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentBook) return;
      if (e.key === "ArrowRight") changePage(1);
      if (e.key === "ArrowLeft") changePage(-1);
      if (readView === 'scroll' && readerRef.current) {
        if (e.key === "ArrowDown") { e.preventDefault(); readerRef.current.scrollBy({ top: 100, behavior: 'smooth' }); }
        if (e.key === "ArrowUp") { e.preventDefault(); readerRef.current.scrollBy({ top: -100, behavior: 'smooth' }); }
      }
      if (e.key === "f") toggleFullscreen();
      if (e.key === "Escape" && !document.fullscreenElement) setCurrentBook(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentBook, numPages, readView, currentPageInChapter, totalPagesInChapter]);

  useEffect(() => {
    const savedRaw = localStorage.getItem("books_meta_v3");
    if (savedRaw) setBooks(JSON.parse(savedRaw));
    setBooksLoaded(true);
  }, []);

  // Sync booksRef with books state (for use in closures/callbacks)
  useEffect(() => { booksRef.current = books; }, [books]);

  useEffect(() => {
    if (!booksLoaded) return;
    const booksToSave = books.map(({ cover, ...rest }) => ({ ...rest }));
    localStorage.setItem("books_meta_v3", JSON.stringify(booksToSave));
  }, [books, booksLoaded]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

  async function selectLibraryFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      setLibraryPath(selected);
      localStorage.setItem("libraryPath", selected);
      scanLibrary(selected);
    }
  }

  async function scanLibrary(path: string) {
    try {
      const results: [string, BookMetadata][] = await invoke("scan_directory", { dirPath: path });
      const savedRaw = localStorage.getItem("books_meta_v3");
      const progressMap = new Map();
      if (savedRaw) JSON.parse(savedRaw).forEach((b: any) => progressMap.set(b.id, b));
      const scannedBooks: Book[] = results.map(([filePath, meta]) => {
        const saved = progressMap.get(filePath);
        return {
          ...meta,
          id: filePath,
          path: filePath,
          // Preserve local edits over file metadata
          title: saved?.title || meta.title,
          author: saved?.author || meta.author,
          description: saved?.description ?? meta.description ?? null,
          currentChapter: saved?.currentChapter || 0,
          progress: saved?.progress || 0,
          lastRead: saved?.lastRead || "Sin leer",
          type: filePath.toLowerCase().endsWith('pdf') ? 'pdf' as const : 'epub' as const,
        };
      });
      setBooks(scannedBooks);
    } catch (err) { console.error(err); }
  }

  // ── Auth & Cloud functions ──
  async function handleAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      let user: api.AuthUser;
      if (authMode === 'register') {
        user = await api.register(
          form.get('username') as string,
          form.get('email') as string,
          form.get('password') as string
        );
      } else {
        user = await api.login(
          form.get('login') as string,
          form.get('password') as string
        );
      }
      setAuthUser(user);
      loadCloudBooks();
    } catch (err: any) {
      setAuthError(err.message || 'Error de conexión');
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    api.clearAuth();
    setAuthUser(null);
    setCloudBooks([]);
    setCloudBooksReady(false);
  }

  function showAlert(type: 'error' | 'success' | 'info', title: string, message: string) {
    setAlertModal({ title, message, type });
  }

  async function loadCloudBooks() {
    if (!api.isLoggedIn()) return;
    setCloudLoading(true);
    try {
      const [cloudBooksList, cloudStats] = await Promise.all([
        api.listBooks(),
        api.getStats().catch(() => null),
      ]);
      setCloudBooks(cloudBooksList);
      setCloudBooksReady(true);
      // Flag to prevent re-enqueuing cloud data back to queue
      cloudSyncingRef.current = true;
      // Merge cloud stats: use whichever has more XP (conflict resolution)
      if (cloudStats) {
        const remote = statsFromApi(cloudStats);
        // Pre-save server badges to localStorage so the badge useEffect
        // won't re-notify badges earned on other devices
        const booksForBadges = booksRef.current.map((b: any) => ({ progress: b.progress }));
        const remoteBadges = getUnlockedBadges(remote, booksForBadges).map(b => b.id);
        const savedRaw = localStorage.getItem('klioUnlockedBadges');
        const previousIds: string[] = savedRaw ? JSON.parse(savedRaw) : [];
        const merged = [...new Set([...previousIds, ...remoteBadges])];
        localStorage.setItem('klioUnlockedBadges', JSON.stringify(merged));
        setStats(prev => remote.xp >= prev.xp ? remote : prev);
      }
      // Sync selected title from cloud (viene en stats)
      if (cloudStats?.selected_title_id) {
        setSelectedTitleId(cloudStats.selected_title_id);
      }
      // Reset flag after React processes the state updates
      setTimeout(() => { cloudSyncingRef.current = false; }, 0);
      // Auto-upload local books not yet in cloud
      autoEnqueueNewBooks(booksRef.current, cloudBooksList);
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


  async function downloadBookFromCloud(cloudBook: api.CloudBook) {
    if (!libraryPath) {
      showAlert('info', 'Sin carpeta de biblioteca', 'Configura una carpeta de biblioteca local primero');
      return;
    }
    if (downloadingBookId) return;
    setDownloadingBookId(cloudBook.id);
    try {
      const blob = await api.downloadBook(cloudBook.id);
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuffer));
      const savePath = `${libraryPath}/${cloudBook.file_name}`;
      await invoke("save_file_bytes", { path: savePath, bytes });
      scanLibrary(libraryPath);
      showAlert('success', 'Libro descargado', `"${cloudBook.title}" se guardó en tu biblioteca local`);
    } catch (err: any) {
      showAlert('error', 'Error al descargar', err.message || 'No se pudo descargar el libro');
    } finally {
      setDownloadingBookId(null);
    }
  }

  async function deleteCloudBook(id: number) {
    try {
      await api.deleteBook(id);
      setCloudBooks(prev => prev.filter(b => b.id !== id));
      showAlert('success', 'Libro eliminado', 'El libro se eliminó de la nube. El progreso de lectura fue archivado.');
    } catch (err: any) {
      showAlert('error', 'Error al eliminar', err.message || 'No se pudo eliminar el libro');
    }
  }

  function startEditCloudBook(cb: api.CloudBook) {
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

  function startEditLocalBook(book: Book) {
    setEditingLocalBook(book);
    setEditLocalForm({ title: book.title, author: book.author, description: book.description || '' });
  }

  function saveLocalBookEdit() {
    if (!editingLocalBook) return;
    setBooks(prev => prev.map(b =>
      b.id === editingLocalBook.id
        ? { ...b, title: editLocalForm.title, author: editLocalForm.author, description: editLocalForm.description }
        : b
    ));
    setEditingLocalBook(null);
  }

  // ── Profile ──
  async function loadProfile() {
    try {
      const p = await api.getProfile();
      setProfile(p);
      setProfileForm({ username: p.username, email: p.email, password: '' });
      setShowProfile(true);
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo cargar el perfil');
    }
  }

  async function saveProfile() {
    const data: Record<string, string> = {};
    if (profileForm.username && profileForm.username !== profile?.username) data.username = profileForm.username;
    if (profileForm.email && profileForm.email !== profile?.email) data.email = profileForm.email;
    if (profileForm.password) data.password = profileForm.password;
    if (Object.keys(data).length === 0) { setShowProfile(false); return; }
    try {
      await api.updateProfile(data);
      if (data.username || data.email) {
        const updated = { ...authUser!, ...data };
        setAuthUser(updated);
        localStorage.setItem("authUser", JSON.stringify(updated));
      }
      setShowProfile(false);
      showAlert('success', 'Perfil actualizado', 'Tu perfil se actualizó correctamente');
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo actualizar el perfil');
    }
  }

  async function handleDeleteAccount() {
    try {
      await api.deleteAccount();
      api.clearAuth();
      setAuthUser(null);
      setCloudBooks([]);
      setShowDeleteConfirm(false);
      showAlert('success', 'Cuenta eliminada', 'Tu cuenta y todos tus datos fueron eliminados permanentemente');
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo eliminar la cuenta');
    }
  }

  // ── Notes & Bookmarks (cloud books in reader) ──
  function getCloudBookForCurrent(): api.CloudBook | undefined {
    if (!currentBook) return undefined;
    return cloudBooks.find(cb =>
      cb.title.toLowerCase() === currentBook.title.toLowerCase() &&
      cb.author.toLowerCase() === currentBook.author.toLowerCase()
    );
  }

  async function loadReaderNotesAndBookmarks() {
    if (!api.isLoggedIn()) return;
    const cloud = getCloudBookForCurrent();
    if (!cloud) return;
    try {
      const [notes, bookmarks] = await Promise.all([
        api.getNotes(cloud.id),
        api.getBookmarks(cloud.id),
      ]);
      setReaderNotes(notes);
      setReaderBookmarks(bookmarks);
    } catch { /* silent */ }
  }

  async function addReaderNote() {
    if (!currentBook || !newNoteContent.trim()) return;
    const cloud = getCloudBookForCurrent();
    if (!cloud) { showAlert('info', 'Sin conexión', 'Sube este libro a la nube para guardar notas'); return; }
    try {
      const { id } = await api.addNote(cloud.id, {
        chapter_index: currentBook.currentChapter,
        content: newNoteContent.trim(),
        color: newNoteColor,
      });
      setReaderNotes(prev => [...prev, {
        id, book_id: cloud.id, chapter_index: currentBook.currentChapter,
        content: newNoteContent.trim(), highlight_text: null, color: newNoteColor,
        created_at: new Date().toISOString(),
      }]);
      setNewNoteContent('');
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo guardar la nota');
    }
  }

  async function deleteReaderNote(noteId: number) {
    try {
      await api.deleteNote(noteId);
      setReaderNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo eliminar la nota');
    }
  }

  async function addReaderBookmark() {
    if (!currentBook) return;
    const cloud = getCloudBookForCurrent();
    if (!cloud) { showAlert('info', 'Sin conexión', 'Sube este libro a la nube para guardar marcadores'); return; }
    // Check if already bookmarked
    const exists = readerBookmarks.find(b =>
      b.chapter_index === currentBook.currentChapter && b.page_index === currentPageInChapter
    );
    if (exists) {
      await deleteReaderBookmark(exists.id);
      return;
    }
    try {
      const label = `Cap. ${currentBook.currentChapter + 1}` + (readView === 'paginated' ? `, Pág. ${currentPageInChapter + 1}` : '');
      const { id } = await api.addBookmark(cloud.id, {
        chapter_index: currentBook.currentChapter,
        page_index: currentPageInChapter,
        label,
      });
      setReaderBookmarks(prev => [...prev, {
        id, book_id: cloud.id, chapter_index: currentBook.currentChapter,
        page_index: currentPageInChapter, label, created_at: new Date().toISOString(),
      }]);
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo guardar el marcador');
    }
  }

  async function deleteReaderBookmark(bookmarkId: number) {
    try {
      await api.deleteBookmark(bookmarkId);
      setReaderBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo eliminar el marcador');
    }
  }

  useEffect(() => {
    if (authUser) loadCloudBooks();
  }, [authUser]);

  async function readBook(book: Book) {
    setSelectedBook(null);
    setCurrentBook(book);
    setCurrentPageInChapter(0);
    setShowNotesPanel(false);
    setReaderNotes([]);
    setReaderBookmarks([]);
    setStats(prev => updateStreak(prev));
    if (book.type === 'epub') loadEpubChapter(book.path, book.currentChapter);
  }

  // Load notes/bookmarks after currentBook is set
  useEffect(() => {
    if (currentBook && api.isLoggedIn()) loadReaderNotesAndBookmarks();
  }, [currentBook?.title]);

  async function loadEpubChapter(path: string, index: number) {
    try {
      let content: string = await invoke("read_epub_chapter", { path, chapterIndex: index });
      const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      setEpubContent(bodyMatch ? bodyMatch[1] : content.replace(/<\/?(html|head)[^>]*>/gi, ''));
      if (readerRef.current) readerRef.current.scrollTo(0, 0);
    } catch (e) { console.error(e); }
  }

  async function changePage(delta: number) {
    if (!currentBook) return;

    if (readView === 'paginated' && currentBook.type === 'epub') {
      const maxPage = totalPagesInChapter - 1;
      const newPage = currentPageInChapter + delta;

      // Navegar dentro del capítulo — solo cambia índice, el transform hace el resto
      if (newPage >= 0 && newPage <= maxPage) {
        setCurrentPageInChapter(newPage);
        return;
      }

      // Preparar navegación inter-capítulo
      if (delta < 0 && newPage < 0) {
        pendingLastPageRef.current = true;
      } else if (delta > 0 && newPage > maxPage) {
        setCurrentPageInChapter(0);
      }
    }

    // Cambiar de capítulo si no hay más páginas horizontales
    const newIndex = currentBook.currentChapter + delta;
    const total = currentBook.type === 'pdf' ? (numPages || 1) : currentBook.total_chapters;
    if (newIndex < 0 || newIndex >= total) return;

    if (currentBook.type === 'epub') await loadEpubChapter(currentBook.path, newIndex);

    const newProgress = Math.round(((newIndex + 1) / total) * 100);
    const updated = { ...currentBook, currentChapter: newIndex, progress: newProgress, lastRead: "Ahora mismo" };
    setCurrentBook(updated);
    setBooks(prev => prev.map(b => b.id === updated.id ? updated : b));
    if (delta > 0) setStats(prev => addXP(prev, 10));

    // Enqueue progress sync
    if (api.isLoggedIn()) {
      const cloudMatch = cloudBooks.find(cb =>
        cb.title.toLowerCase() === currentBook.title.toLowerCase() &&
        cb.author.toLowerCase() === currentBook.author.toLowerCase()
      );
      syncQueue.enqueue('sync_progress', {
        bookPath: currentBook.path,
        bookTitle: currentBook.title,
        bookAuthor: currentBook.author,
        cloudBookId: cloudMatch?.id || null,
        current_chapter: newIndex,
        current_page: newIndex,
        progress_percent: newProgress,
      });
    }
  }

  const themeClasses = {
    dark: "bg-[#1e1e2e] text-[#cdd6f4]",
    sepia: "bg-[#f4ecd8] text-[#5b4636]",
    light: "bg-white text-gray-900"
  };

  const findSvgImage = (node: any): string | null => {
    if (node instanceof Element) {
      if (node.name === 'image') return node.attribs.href || node.attribs['xlink:href'] || null;
      if (node.children) for (const child of node.children) { const r = findSvgImage(child); if (r) return r; }
    }
    return null;
  };

  const parserOptions: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (domNode instanceof Element) {
        if (domNode.name === 'img') return <EpubImage src={domNode.attribs.src} bookPath={currentBook?.path || ""} />;
        if (domNode.name === 'svg') {
          const imgSrc = findSvgImage(domNode);
          if (imgSrc) return <EpubImage src={imgSrc} bookPath={currentBook?.path || ""} />;
        }
        if (['html', 'body', 'head', 'script', 'style', 'link', 'title'].includes(domNode.name)) return <></>;
      }
    },
  };

  const renderContent = () => {
    if (currentBook) {
      return (
        <div ref={containerRef} className={`flex flex-col h-screen ${themeClasses[readerTheme]} transition-colors duration-300`}>
          <header className="flex items-center justify-between p-3 border-b border-white/10 backdrop-blur-md sticky top-0 z-50">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setCurrentBook(null)}><X className="w-5 h-5" /></Button>
              <div className="max-w-[200px]"><h2 className="text-xs font-bold truncate leading-none mb-1">{currentBook.title}</h2><p className="text-[10px] opacity-50 uppercase">{currentBook.progress}%</p></div>
            </div>
            
            <div className="flex items-center gap-2">
              <Dialog>
                <DialogTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 bg-black/20 rounded-full"><Settings2 className="w-5 h-5" /></Button></DialogTrigger>
                <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
                  <DialogHeader><DialogTitle>Ajustes de Lectura</DialogTitle></DialogHeader>
                  <div className="py-6 space-y-8">
                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase opacity-50 tracking-widest">Modo de Vista</p>
                      <div className="flex gap-2">
                        <Button variant={readView === 'scroll' ? 'default' : 'secondary'} className="flex-1" onClick={() => setReadView('scroll')}><ScrollIcon className="w-4 h-4 mr-2" /> Scroll</Button>
                        <Button variant={readView === 'paginated' ? 'default' : 'secondary'} className="flex-1" onClick={() => setReadView('paginated')}><Columns2 className="w-4 h-4 mr-2" /> Páginas</Button>
                      </div>
                      {readView === 'paginated' && (
                        <div className="flex gap-2 pt-2 border-t border-white/5 mt-2">
                          <Button variant={pageColumns === 1 ? 'outline' : 'ghost'} className="flex-1 text-xs" onClick={() => setPageColumns(1)}><Square className="w-3 h-3 mr-2" /> 1 Columna</Button>
                          <Button variant={pageColumns === 2 ? 'outline' : 'ghost'} className="flex-1 text-xs" onClick={() => setPageColumns(2)}><Columns2 className="w-3 h-3 mr-2" /> 2 Columnas</Button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase opacity-50 tracking-widest">Tipografía</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(['Libre Baskerville', 'Inter', 'Merriweather', 'Literata', 'OpenDyslexic'] as ReaderFont[]).map(font => (
                          <Button key={font} variant={readerFont === font ? 'outline' : 'ghost'} className="justify-start text-[10px] h-8 truncate" onClick={() => setReaderFont(font)} style={{ fontFamily: font }}>{font}</Button>
                        ))}
                      </div>
                      <div className="flex items-center justify-between bg-black/20 p-2 rounded-lg">
                        <Button variant="ghost" size="icon" onClick={() => setFontSize(f => Math.max(12, f-2))}><ZoomOut className="w-4 h-4" /></Button>
                        <span className="text-sm font-mono font-bold">{fontSize}px</span>
                        <Button variant="ghost" size="icon" onClick={() => setFontSize(f => Math.min(36, f+2))}><ZoomIn className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase opacity-50 tracking-widest">Tema</p>
                      <div className="flex gap-2">
                        <Button variant={readerTheme === 'light' ? 'outline' : 'ghost'} className="flex-1 bg-white text-black hover:bg-gray-100" onClick={() => setReaderTheme('light')}>Claro</Button>
                        <Button variant={readerTheme === 'sepia' ? 'outline' : 'ghost'} className="flex-1 bg-[#f4ecd8] text-[#5b4636] hover:bg-[#ebe2cf]" onClick={() => setReaderTheme('sepia')}>Sepia</Button>
                        <Button variant={readerTheme === 'dark' ? 'outline' : 'ghost'} className="flex-1 bg-[#1e1e2e] text-[#cdd6f4] hover:bg-[#252539]" onClick={() => setReaderTheme('dark')}>Oscuro</Button>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              {api.isLoggedIn() && (
                <>
                  <Tooltip><TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className={`h-9 w-9 rounded-full ${showNotesPanel ? 'bg-primary/30 text-primary' : 'bg-black/20'}`} onClick={() => setShowNotesPanel(p => !p)}><StickyNote className="w-5 h-5" /></Button>
                  </TooltipTrigger><TooltipContent>Notas</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className={`h-9 w-9 rounded-full ${readerBookmarks.some(b => b.chapter_index === currentBook.currentChapter && b.page_index === currentPageInChapter) ? 'bg-amber-500/30 text-amber-400' : 'bg-black/20'}`} onClick={addReaderBookmark}><BookmarkIcon className="w-5 h-5" /></Button>
                  </TooltipTrigger><TooltipContent>Marcar página</TooltipContent></Tooltip>
                </>
              )}
              <Separator orientation="vertical" className="h-6 opacity-10 mx-2" />
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => changePage(-1)} disabled={currentBook.currentChapter === 0 && currentPageInChapter === 0}>Anterior</Button>
                <div className="text-[10px] font-bold px-3 py-1 bg-primary/10 rounded">
                  {readView === 'paginated' && currentBook.type === 'epub'
                    ? `Pág ${currentPageInChapter + 1}/${totalPagesInChapter} · Cap ${currentBook.currentChapter + 1}/${currentBook.total_chapters}`
                    : `${currentBook.currentChapter + 1} / ${currentBook.type === 'pdf' ? numPages : currentBook.total_chapters}`}
                </div>
                <Button variant="ghost" size="sm" onClick={() => changePage(1)}>Siguiente</Button>
              </div>
              <Separator orientation="vertical" className="h-6 opacity-10 mx-2" />
              <Button variant="ghost" size="icon" onClick={toggleFullscreen}>{isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}</Button>
            </div>
          </header>

          <div className="flex-1 flex overflow-hidden">
            <div ref={readerRef} className={`flex-1 ${readView === 'paginated' ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden no-scrollbar'}`}>
              {readView === 'paginated' && currentBook.type === 'epub' ? (
                <div className="h-full py-12 px-12">
                  <div className="overflow-hidden" style={{ height: pageHeight > 0 ? `${pageHeight}px` : '100%' }}>
                    <div
                      ref={contentRef}
                      key={currentBook.id + '-' + currentBook.currentChapter + '-' + fontSize}
                      className="mx-auto max-w-2xl font-serif selection:bg-primary/30 break-words"
                      style={{
                        fontSize: `${fontSize}px`,
                        lineHeight: '1.8',
                        fontFamily: readerFont,
                        transform: `translateY(-${currentPageInChapter * pageHeight}px)`,
                        transition: 'transform 0.3s ease',
                      }}
                    >
                      <div className="epub-reader-content">{parse(epubContent, parserOptions)}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  key={currentBook.id + '-' + currentBook.currentChapter + '-' + readView + '-' + fontSize}
                  className="mx-auto py-12 px-12 font-serif selection:bg-primary/30 break-words max-w-2xl"
                  style={{
                    fontSize: `${fontSize}px`,
                    lineHeight: '1.8',
                    fontFamily: readerFont,
                  }}
                >
                  {currentBook.type === 'epub' ? (
                    <div className="epub-reader-content">{parse(epubContent, parserOptions)}</div>
                  ) : (
                    <div className="flex justify-center">
                      <Document file={convertFileSrc(currentBook.path)} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                        <Page pageNumber={currentBook.currentChapter + 1} scale={scale} renderAnnotationLayer={false} renderTextLayer={true} className="shadow-2xl" />
                      </Document>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notes & Bookmarks Side Panel */}
            {showNotesPanel && (
              <aside className="w-80 border-l border-white/10 bg-[#16161e]/90 backdrop-blur-md flex flex-col overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Notas y Marcadores</h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNotesPanel(false)}><X className="w-4 h-4" /></Button>
                </div>

                {/* Add note */}
                <div className="p-4 border-b border-white/10 space-y-2">
                  <textarea
                    value={newNoteContent}
                    onChange={e => setNewNoteContent(e.target.value)}
                    placeholder="Escribe una nota para este capítulo..."
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:border-primary outline-none resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {['#ffeb3b', '#ef5350', '#42a5f5', '#66bb6a', '#ab47bc'].map(c => (
                        <button key={c} className={`w-5 h-5 rounded-full border-2 ${newNoteColor === c ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: c }} onClick={() => setNewNoteColor(c)} />
                      ))}
                    </div>
                    <Button size="sm" className="text-xs h-7" disabled={!newNoteContent.trim()} onClick={addReaderNote}><Plus className="w-3 h-3 mr-1" /> Nota</Button>
                  </div>
                </div>

                {/* List */}
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-3">
                    {/* Bookmarks for this chapter */}
                    {readerBookmarks.filter(b => b.chapter_index === currentBook.currentChapter).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase opacity-40 tracking-widest">Marcadores</p>
                        {readerBookmarks.filter(b => b.chapter_index === currentBook.currentChapter).map(bm => (
                          <div key={bm.id} className="flex items-center gap-2 bg-amber-500/10 rounded-lg px-3 py-2 group">
                            <BookmarkIcon className="w-3 h-3 text-amber-400 shrink-0" />
                            <span className="text-xs flex-1 truncate">{bm.label}</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => deleteReaderBookmark(bm.id)}><X className="w-3 h-3" /></Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Notes for this chapter */}
                    {readerNotes.filter(n => n.chapter_index === currentBook.currentChapter).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase opacity-40 tracking-widest">Notas</p>
                        {readerNotes.filter(n => n.chapter_index === currentBook.currentChapter).map(note => (
                          <div key={note.id} className="rounded-lg px-3 py-2 group relative" style={{ backgroundColor: note.color + '15', borderLeft: `3px solid ${note.color}` }}>
                            {note.highlight_text && <p className="text-[10px] italic opacity-50 mb-1">"{note.highlight_text}"</p>}
                            <p className="text-xs">{note.content}</p>
                            <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => deleteReaderNote(note.id)}><X className="w-3 h-3" /></Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* All bookmarks from other chapters */}
                    {readerBookmarks.filter(b => b.chapter_index !== currentBook.currentChapter).length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <p className="text-[10px] font-bold uppercase opacity-40 tracking-widest">Otros capítulos</p>
                        {readerBookmarks.filter(b => b.chapter_index !== currentBook.currentChapter).map(bm => (
                          <div key={bm.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 group opacity-60">
                            <BookmarkIcon className="w-3 h-3 text-amber-400 shrink-0" />
                            <span className="text-xs flex-1 truncate">{bm.label}</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => deleteReaderBookmark(bm.id)}><X className="w-3 h-3" /></Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {readerNotes.length === 0 && readerBookmarks.length === 0 && (
                      <div className="text-center py-8 opacity-30">
                        <StickyNote className="w-8 h-8 mx-auto mb-2" />
                        <p className="text-xs">Sin notas ni marcadores</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </aside>
            )}
          </div>
        </div>
      );
    }

    if (selectedBook) {
      return (
        <div className="flex flex-col h-screen bg-[#0f0f14] text-white font-sans overflow-hidden relative">
          {/* Background Decor */}
          <div className="absolute inset-0 opacity-20 pointer-events-none overflow-hidden">
             {selectedBook.cover && (
               <img 
                 src={coverSrc(selectedBook.cover)}
                 className="w-full h-full object-cover blur-[100px] scale-150" 
                 alt="" 
               />
             )}
          </div>

          <header className="h-20 border-b border-white/5 flex items-center justify-between px-12 bg-[#16161e]/40 backdrop-blur-xl z-50">
            <Button variant="ghost" onClick={() => setSelectedBook(null)} className="gap-2 hover:bg-white/5 group transition-all">
              <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> 
              <span className="font-bold tracking-tight text-sm">BIBLIOTECA</span>
            </Button>
            
            <div className="flex items-center gap-6">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] font-bold opacity-40 uppercase tracking-[0.2em] mb-0.5">Estado</p>
                <p className="text-xs font-black text-amber-400 uppercase">{selectedBook.progress === 0 ? 'Sin empezar' : `Leído ${selectedBook.progress}%`}</p>
              </div>
              <Button 
                onClick={() => readBook(selectedBook)} 
                className="gap-3 bg-primary hover:bg-primary/90 text-primary-foreground font-black px-10 py-6 rounded-full shadow-[0_10px_30px_rgba(var(--primary),0.3)] hover:scale-105 transition-all active:scale-95"
              >
                <Play className="w-5 h-5 fill-current" /> 
                <span className="tracking-widest uppercase">Leer Libro</span>
              </Button>
            </div>
          </header>
          
          <ScrollArea className="flex-1 z-10">
            <div className="max-w-6xl mx-auto px-12 py-16">
              <div className="flex flex-col lg:flex-row gap-20 items-start">
                {/* Book Cover */}
                <div className="w-full lg:w-[400px] shrink-0 mx-auto lg:mx-0">
                  <div className="relative group">
                    <div className="absolute -inset-4 bg-primary/20 rounded-[2rem] blur-2xl opacity-0 group-hover:opacity-100 transition-duration-700" />
                    <div className="relative aspect-[3/4.5] rounded-2xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] border border-white/10 bg-black/40">
                      {selectedBook.cover ? (
                        <img src={coverSrc(selectedBook.cover)} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" alt={selectedBook.title} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-10">
                          <BookOpen className="w-32 h-32" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-12 space-y-6 bg-white/5 p-8 rounded-2xl border border-white/5 backdrop-blur-md">
                     <div className="flex justify-between items-end">
                       <div className="space-y-1">
                         <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Tu Progreso</p>
                         <p className="text-2xl font-black">{selectedBook.progress}%</p>
                       </div>
                       <Badge variant="outline" className="border-primary/30 text-primary text-[10px] px-3 py-1 font-bold">
                         {selectedBook.type.toUpperCase()}
                       </Badge>
                     </div>
                     <Progress value={selectedBook.progress} className="h-2.5 bg-white/5" indicatorClassName="bg-gradient-to-r from-amber-600 to-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.4)]" />
                     <div className="flex justify-between text-[10px] font-bold opacity-30 uppercase tracking-tighter">
                       <span>{selectedBook.currentChapter} {selectedBook.type === 'pdf' ? 'páginas' : 'capítulos'} leídos</span>
                       <span>{selectedBook.total_chapters} total</span>
                     </div>
                  </div>
                </div>
                
                {/* Book Info */}
                <div className="flex-1 space-y-12">
                  <div className="space-y-4">
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-none px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase">
                      Información del libro
                    </Badge>
                    <h1 className="text-5xl lg:text-7xl font-black leading-[1.1] tracking-tight text-white drop-shadow-2xl">
                      {selectedBook.title}
                    </h1>
                    <div className="flex items-center gap-4 pt-2">
                       <div className="w-12 h-0.5 bg-primary/50" />
                       <p className="text-2xl font-medium italic text-primary/80 tracking-tight">{selectedBook.author}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                     <div className="space-y-1">
                       <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Formato</p>
                       <p className="text-lg font-bold uppercase">{selectedBook.type}</p>
                     </div>
                     <div className="space-y-1">
                       <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Extensión</p>
                       <p className="text-lg font-bold">{selectedBook.total_chapters} {selectedBook.type === 'pdf' ? 'Páginas' : 'Capítulos'}</p>
                     </div>
                     <div className="space-y-1">
                       <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Última vez</p>
                       <p className="text-lg font-bold truncate">{selectedBook.lastRead}</p>
                     </div>
                  </div>

                  <Separator className="opacity-10" />
                  
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <List className="w-5 h-5 text-primary/60" />
                      <h3 className="text-sm font-black uppercase tracking-[0.2em] opacity-50">Sinopsis</h3>
                    </div>
                    {selectedBook.description
                      ? <div className="text-xl leading-[1.8] text-white/70 font-serif max-w-3xl selection:bg-primary/30 [&>p:first-of-type]:first-letter:text-5xl [&>p:first-of-type]:first-letter:font-black [&>p:first-of-type]:first-letter:mr-3 [&>p:first-of-type]:first-letter:float-left [&>p:first-of-type]:first-letter:text-primary [&>p]:mb-4 [&_b]:font-bold [&_i]:italic [&_a]:text-primary [&_a]:underline" dangerouslySetInnerHTML={{ __html: selectedBook.description }} />
                      : <div className="text-xl leading-[1.8] text-white/70 font-serif max-w-3xl selection:bg-primary/30 first-letter:text-5xl first-letter:font-black first-letter:mr-3 first-letter:float-left first-letter:text-primary">No hay una descripción disponible para este libro en sus metadatos. Puedes editar la información del libro para añadir una sinopsis personalizada.</div>
                    }
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      );
    }

    return (
      <div className="flex h-screen bg-[#0f0f14] text-white font-sans overflow-hidden">
        <aside className="w-64 border-r border-white/5 bg-[#16161e] flex flex-col">
          <div className="p-6"><h1 className="text-2xl font-bold text-primary flex items-center gap-2 italic"><BookOpen className="w-7 h-7" /> KlioReader</h1></div>
          <nav className="flex-1 px-4 space-y-1">
            <Button variant={activeTab === "library" ? "secondary" : "ghost"} className="w-full justify-start gap-3" onClick={() => setActiveTab("library")}><Library className="w-5 h-5 text-primary" /> Biblioteca</Button>
            <Button variant={activeTab === "cloud" ? "secondary" : "ghost"} className="w-full justify-start gap-3" onClick={() => setActiveTab("cloud")}><Cloud className="w-5 h-5 text-blue-400" /> Nube</Button>
            <Button variant={activeTab === "gamification" ? "secondary" : "ghost"} className="w-full justify-start gap-3" onClick={() => setActiveTab("gamification")}><Trophy className="w-5 h-5 text-yellow-500" /> Mi Progreso</Button>
            <Button variant={activeTab === "settings" ? "secondary" : "ghost"} className="w-full justify-start gap-3" onClick={() => setActiveTab("settings")}><Settings2 className="w-5 h-5 text-zinc-400" /> Configuración</Button>
          </nav>
          <div className="p-6 mt-auto border-t border-white/5">
            {authUser ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 cursor-pointer hover:opacity-80" onClick={loadProfile}>
                  <User className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold truncate">{authUser.username}</span>
                </div>
                <Button variant="ghost" size="sm" className="w-full justify-start text-xs opacity-50" onClick={handleLogout}><LogOut className="w-3 h-3 mr-2" /> Cerrar Sesión</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full text-xs border-white/10" onClick={() => setActiveTab('cloud')}><LogIn className="w-3 h-3 mr-2" /> Iniciar Sesión</Button>
            )}
            <Separator className="my-3 opacity-10" />
            <div className="space-y-1">
              <Badge variant="outline" className="border-accent text-accent font-bold">Nivel {stats.level}</Badge>
              {(() => {
                const bfb = books.map(b => ({ progress: b.progress }));
                const title = getUserTitle(stats, bfb, selectedTitleId);
                if (!title) return null;
                const rc = RARITY_CONFIG[title.rarity];
                return (
                  <div className="flex items-center gap-1.5">
                    <img src={getBadgeImageUrl(title.id)} alt="" className="w-5 h-5 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span className={`text-[10px] font-bold italic truncate ${rc.text}`}>"{title.name}"</span>
                  </div>
                );
              })()}
            </div>
            <Progress value={((stats.xp % 100) / 100) * 100} className="h-1 mt-2" indicatorClassName="bg-amber-400" />
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden bg-[#16161e]/30">
          {activeTab === 'library' && (
            <>
              <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#16161e]/50 backdrop-blur-md">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-orange-400 font-bold"><Flame className="w-5 h-5 fill-current" /> {stats.streak} Días</div>
                  <Separator orientation="vertical" className="h-6 opacity-10" />
                  <div className="flex items-center bg-black/20 rounded-lg p-1">
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className={`h-8 w-8 ${libraryView === 'grid-large' ? 'bg-white/10 text-primary' : 'opacity-50'}`} onClick={() => setLibraryView('grid-large')}><LayoutGrid className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Cuadrícula Gigante</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className={`h-8 w-8 ${libraryView === 'grid-mini' ? 'bg-white/10 text-primary' : 'opacity-50'}`} onClick={() => setLibraryView('grid-mini')}><Grid2X2 className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Miniaturas</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className={`h-8 w-8 ${libraryView === 'grid-card' ? 'bg-white/10 text-primary' : 'opacity-50'}`} onClick={() => setLibraryView('grid-card')}><Square className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Tarjetas</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className={`h-8 w-8 ${libraryView === 'list-info' ? 'bg-white/10 text-primary' : 'opacity-50'}`} onClick={() => setLibraryView('list-info')}><List className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Lista Detallada</TooltipContent></Tooltip>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {queueCount > 0 && (
                    <Tooltip><TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold bg-amber-400/10 px-2.5 py-1.5 rounded-lg">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{queueSummary || `${queueCount} pendiente(s)`}</span>
                      </div>
                    </TooltipTrigger><TooltipContent>{queueCount} en cola: {queueSummary}</TooltipContent></Tooltip>
                  )}
                  {libraryPath ? (
                    <Tooltip><TooltipTrigger asChild>
                      <Button onClick={selectLibraryFolder} variant="ghost" size="icon" className="h-8 w-8 opacity-50 hover:opacity-100">
                        <FolderOpen className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger><TooltipContent>Cambiar carpeta</TooltipContent></Tooltip>
                  ) : (
                    <Button onClick={selectLibraryFolder} variant="outline" size="sm" className="border-white/10 font-bold tracking-tight">CONFIGURAR CARPETA</Button>
                  )}
                </div>
              </header>
              <ScrollArea className="flex-1 p-12">
                <div className={`
                  ${libraryView === 'grid-large' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-16' : ''}
                  ${libraryView === 'grid-mini' ? 'flex flex-wrap gap-4' : ''}
                  ${libraryView === 'grid-card' ? 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4' : ''}
                  ${libraryView === 'list-info' ? 'space-y-4 max-w-4xl mx-auto' : ''}
                `}>
                  {books.map((book) => (
                    <div key={book.id} className="cursor-pointer group relative">
                      <div onClick={() => setSelectedBook(book)}>
                        {libraryView === 'grid-large' && (
                          <Card className="bg-[#16161e] border-white/5 hover:border-primary/50 transition-all overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col group">
                            <div className="aspect-[2/3] relative overflow-hidden bg-black/60 flex items-center justify-center">
                              {book.cover ? (
                                <>
                                  <img
                                    src={coverSrc(book.cover)}
                                    className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110"
                                    alt=""
                                  />
                                  <img
                                    src={coverSrc(book.cover)}
                                    className="relative z-10 w-full h-full object-contain shadow-2xl transition-transform duration-700 group-hover:scale-105"
                                    alt=""
                                  />
                                </>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center opacity-10">
                                  <BookOpen className="w-24 h-24" />
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
                                <Progress value={book.progress} className="h-1.5 bg-white/20" indicatorClassName="bg-amber-400" />
                                <p className="mt-2 text-[9px] font-black text-amber-400 tracking-tighter">{book.progress}% LEÍDO</p>
                              </div>
                            </div>
                            <div className="p-6 bg-[#1c1c26] border-t border-white/5 relative z-30">
                              <h3 className="text-lg font-black group-hover:text-primary transition-colors line-clamp-2 leading-tight uppercase tracking-tight">{book.title}</h3>
                              <p className="text-xs opacity-40 mt-1 italic font-medium">{book.author}</p>
                            </div>
                          </Card>
                        )}
                        {libraryView === 'grid-mini' && (
                          <div className="w-24 aspect-[2/3] relative rounded-lg overflow-hidden ring-1 ring-white/10 hover:ring-primary transition-all shadow-xl bg-black/60 group flex items-center justify-center">
                            {book.cover ? (
                              <>
                                <img src={coverSrc(book.cover)} className="absolute inset-0 w-full h-full object-cover blur-lg opacity-40 scale-125" alt="" />
                                <img src={coverSrc(book.cover)} className="relative z-10 w-full h-full object-contain group-hover:scale-110 transition-transform duration-500" alt="" />
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center opacity-10">
                                <BookOpen className="w-8 h-8" />
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60 z-20">
                              <div className="h-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" style={{ width: `${book.progress}%` }} />
                            </div>
                          </div>
                        )}
                        {libraryView === 'grid-card' && (
                          <Card className="bg-transparent border-none space-y-2 hover:translate-y-[-4px] transition-all duration-300 group">
                            <div className="aspect-[2/3] relative rounded-lg overflow-hidden shadow-lg border border-white/5 bg-black/60 flex items-center justify-center">
                              {book.cover ? (
                                <>
                                  <img src={coverSrc(book.cover)} className="absolute inset-0 w-full h-full object-cover blur-lg opacity-40 scale-125" alt="" />
                                  <img src={coverSrc(book.cover)} className="relative z-10 w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" alt="" />
                                </>
                              ) : (
                                <div className="w-full h-full bg-white/5 flex items-center justify-center opacity-5">
                                  <BookOpen className="w-10 h-10" />
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40 z-20">
                                <div className="h-full bg-amber-400" style={{ width: `${book.progress}%` }} />
                              </div>
                            </div>
                            <div className="text-[10px] font-black opacity-60 line-clamp-2 uppercase tracking-tight group-hover:opacity-100 transition-opacity leading-tight">{book.title}</div>
                          </Card>
                        )}
                        {libraryView === 'list-info' && (
                          <Card className="flex bg-[#1c1c26]/50 border-white/5 hover:bg-white/10 p-4 gap-6 items-center transition-all group">
                            <div className="w-16 aspect-[2/3] rounded-md bg-[#0f0f14] overflow-hidden shrink-0 border border-white/10 flex items-center justify-center shadow-lg relative">
                              {book.cover ? (
                                <>
                                  <img src={coverSrc(book.cover)} className="absolute inset-0 w-full h-full object-cover blur-md opacity-40 scale-125" alt="" />
                                  <img src={coverSrc(book.cover)} className="relative z-10 w-full h-full object-contain group-hover:scale-110 transition-transform duration-500" alt="" />
                                </>
                              ) : (
                                <BookOpen className="w-6 h-6 opacity-10" />
                              )}
                            </div>
                            <div className="flex-1 space-y-2">
                              <div><h3 className="text-sm font-bold group-hover:text-primary transition-colors line-clamp-1">{book.title}</h3><p className="text-[10px] opacity-50 italic">{book.author}</p></div>
                              <div className="flex items-center gap-4"><div className="flex-1 max-w-[200px]"><Progress value={book.progress} className="h-1 bg-white/5" indicatorClassName="bg-amber-400" /></div><span className="text-[9px] font-bold text-amber-400">{book.progress}%</span><Badge variant="outline" className="text-[8px] h-4 opacity-50">{book.type}</Badge></div>
                            </div>
                            <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20 hover:text-primary" onClick={(e) => { e.stopPropagation(); startEditLocalBook(book); }}><Pencil className="w-4 h-4" /></Button>
                          </Card>
                        )}
                      </div>
                      {libraryView === 'grid-large' && (
                        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="ghost" className="h-8 w-8 bg-black/50 hover:bg-primary/80 rounded-full" onClick={(e) => { e.stopPropagation(); startEditLocalBook(book); }}><Pencil className="w-4 h-4" /></Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Edit Local Book Dialog */}
              <Dialog open={!!editingLocalBook} onOpenChange={(open) => { if (!open) setEditingLocalBook(null); }}>
                <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
                  <DialogHeader><DialogTitle>Editar Libro</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Título</label>
                      <input value={editLocalForm.title} onChange={e => setEditLocalForm(f => ({ ...f, title: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Autor</label>
                      <input value={editLocalForm.author} onChange={e => setEditLocalForm(f => ({ ...f, author: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Descripción</label>
                      <textarea value={editLocalForm.description} onChange={e => setEditLocalForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none resize-y font-sans" placeholder="Sinopsis o descripción..." />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" className="flex-1 border-white/10" onClick={() => setEditingLocalBook(null)}>Cancelar</Button>
                      <Button className="flex-1 font-bold" onClick={saveLocalBookEdit}>Guardar</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}

          {activeTab === 'cloud' && (
            <ScrollArea className="flex-1">
              <div className="max-w-2xl mx-auto p-12 space-y-8">
                {/* Server URL config */}
                <div className="space-y-3">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Server className="w-5 h-5 text-primary" /> Servidor API</h2>
                  <div className="flex gap-2">
                    <input type="url" defaultValue={api.getApiUrl()} id="api-url-input" placeholder="http://tu-servidor.com" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:border-primary outline-none" />
                    <Button variant="outline" size="sm" onClick={() => { const input = document.getElementById('api-url-input') as HTMLInputElement; api.setApiUrl(input.value); }}>Guardar</Button>
                  </div>
                </div>

                <Separator className="opacity-10" />

                {!authUser ? (
                  /* Login / Register form */
                  <div className="space-y-6">
                    <div className="text-center space-y-2">
                      <Cloud className="w-12 h-12 text-blue-400 mx-auto" />
                      <h2 className="text-2xl font-bold">KlioReader Cloud</h2>
                      <p className="text-sm opacity-50">Sincroniza tus libros y progreso entre dispositivos</p>
                    </div>

                    <div className="flex bg-white/5 rounded-lg p-1">
                      <Button variant={authMode === 'login' ? 'secondary' : 'ghost'} className="flex-1 text-sm" onClick={() => setAuthMode('login')}>Iniciar Sesión</Button>
                      <Button variant={authMode === 'register' ? 'secondary' : 'ghost'} className="flex-1 text-sm" onClick={() => setAuthMode('register')}>Registrarse</Button>
                    </div>

                    <form onSubmit={handleAuth} className="space-y-4">
                      {authMode === 'register' && (
                        <input name="username" placeholder="Nombre de usuario" required minLength={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
                      )}
                      <input name={authMode === 'login' ? 'login' : 'email'} type={authMode === 'register' ? 'email' : 'text'} placeholder={authMode === 'register' ? 'Email' : 'Email o usuario'} required className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
                      <input name="password" type="password" placeholder="Contraseña" required minLength={6} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
                      {authError && <p className="text-red-400 text-xs">{authError}</p>}
                      <Button type="submit" className="w-full font-bold" disabled={authLoading}>
                        {authLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
                        {authMode === 'login' ? 'Entrar' : 'Crear Cuenta'}
                      </Button>
                    </form>
                  </div>
                ) : (
                  /* Cloud dashboard */
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-bold flex items-center gap-2"><Cloud className="w-5 h-5 text-blue-400" /> Mis Libros en la Nube</h2>
                        <p className="text-xs opacity-50 mt-1">{cloudBooks.length} libro(s) sincronizado(s)</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={loadCloudBooks} disabled={cloudLoading}>
                        {cloudLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />} Actualizar
                      </Button>
                    </div>

                    {cloudBooks.length === 0 ? (
                      <div className="text-center py-16 opacity-40">
                        <CloudUpload className="w-16 h-16 mx-auto mb-4" />
                        <p className="text-sm">No tienes libros en la nube</p>
                        <p className="text-xs mt-1">Sube libros desde tu biblioteca local con el botón de nube</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {cloudBooks.map(cb => (
                          <Card key={cb.id} className="flex bg-white/5 border-white/5 p-4 gap-4 items-center">
                            <div className="w-12 aspect-[2/3] rounded bg-[#0f0f14] overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                              {cb.cover_base64 ? <img src={coverSrc(cb.cover_base64)} className="w-full h-full object-contain" alt="" /> : <BookOpen className="w-4 h-4 opacity-10" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-bold truncate">{cb.title}</h3>
                              <p className="text-[10px] opacity-50 italic">{cb.author || 'Sin autor'}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <Progress value={cb.progress_percent} className="h-1 flex-1 max-w-[120px] bg-white/5" indicatorClassName="bg-blue-400" />
                                <span className="text-[9px] font-bold text-blue-400">{cb.progress_percent}%</span>
                                <Badge variant="outline" className="text-[8px] h-4 opacity-50">{cb.file_type}</Badge>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Tooltip><TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-primary/20 hover:text-primary" onClick={() => startEditCloudBook(cb)}><Pencil className="w-4 h-4" /></Button>
                              </TooltipTrigger><TooltipContent>Editar</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-green-600/20 hover:text-green-400" disabled={downloadingBookId === cb.id} onClick={() => downloadBookFromCloud(cb)}>
                                  {downloadingBookId === cb.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
                                </Button>
                              </TooltipTrigger><TooltipContent>Descargar a local</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-600/20 hover:text-red-400" onClick={() => deleteCloudBook(cb.id)}><Trash2 className="w-4 h-4" /></Button>
                              </TooltipTrigger><TooltipContent>Eliminar de la nube</TooltipContent></Tooltip>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Edit Cloud Book Dialog */}
                <Dialog open={!!editingCloudBook} onOpenChange={(open) => { if (!open) setEditingCloudBook(null); }}>
                  <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
                    <DialogHeader><DialogTitle>Editar Libro</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Título</label>
                        <input value={editCloudForm.title} onChange={e => setEditCloudForm(f => ({ ...f, title: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Autor</label>
                        <input value={editCloudForm.author} onChange={e => setEditCloudForm(f => ({ ...f, author: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Descripción</label>
                        <textarea value={editCloudForm.description} onChange={e => setEditCloudForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none resize-y font-sans" placeholder="Sinopsis o descripción del libro..." />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" className="flex-1 border-white/10" onClick={() => setEditingCloudBook(null)}>Cancelar</Button>
                        <Button className="flex-1 font-bold" onClick={saveCloudBookEdit}>Guardar</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Profile Dialog */}
                <Dialog open={showProfile} onOpenChange={setShowProfile}>
                  <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
                    <DialogHeader><DialogTitle>Mi Perfil</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                      {profile && (
                        <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                            <User className="w-7 h-7 text-primary" />
                          </div>
                          <div>
                            <p className="font-bold">{profile.username}</p>
                            <p className="text-xs opacity-50">{profile.email}</p>
                            <div className="flex gap-3 mt-1 text-[10px] opacity-40">
                              <span>{profile.total_books} libros</span>
                              <span>{profile.total_notes} notas</span>
                              <span>{profile.total_bookmarks} marcadores</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Usuario</label>
                        <input value={profileForm.username} onChange={e => setProfileForm(f => ({ ...f, username: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Email</label>
                        <input value={profileForm.email} onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))} type="email" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Nueva contraseña (opcional)</label>
                        <input value={profileForm.password} onChange={e => setProfileForm(f => ({ ...f, password: e.target.value }))} type="password" placeholder="Dejar vacío para no cambiar" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" className="flex-1 border-white/10" onClick={() => setShowProfile(false)}>Cancelar</Button>
                        <Button className="flex-1 font-bold" onClick={saveProfile}>Guardar</Button>
                      </div>
                      <Separator className="opacity-10" />
                      <Button variant="ghost" className="w-full text-red-400 hover:bg-red-500/10 text-xs" onClick={() => { setShowProfile(false); setShowDeleteConfirm(true); }}>
                        <Trash2 className="w-3 h-3 mr-2" /> Eliminar mi cuenta permanentemente
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Delete Account Confirmation */}
                <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                  <DialogContent className="sm:max-w-[400px] bg-[#16161e] border-white/10 text-white">
                    <div className="flex flex-col items-center text-center py-6 space-y-4">
                      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                        <AlertTriangle className="w-8 h-8 text-red-400" />
                      </div>
                      <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-red-400">Eliminar cuenta</DialogTitle>
                      </DialogHeader>
                      <p className="text-sm opacity-70">Esta acción es irreversible. Se eliminarán permanentemente todos tus datos: libros, notas, marcadores y progreso de lectura.</p>
                      <div className="flex gap-2 w-full pt-2">
                        <Button variant="outline" className="flex-1 border-white/10" onClick={() => setShowDeleteConfirm(false)}>Cancelar</Button>
                        <Button className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold" onClick={handleDeleteAccount}>Eliminar</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </ScrollArea>
          )}

          {activeTab === 'gamification' && (() => {
            const booksForBadges = books.map(b => ({ progress: b.progress }));
            const allBadges = getAllBadgesWithStatus(stats, booksForBadges);
            const unlockedCount = allBadges.filter(b => b.unlocked).length;
            const userTitle = getUserTitle(stats, booksForBadges, selectedTitleId);
            const nextLevelXp = xpForNextLevel(stats.level);
            const xpProgress = Math.min(100, (stats.xp / nextLevelXp) * 100);
            const filteredBadges = badgeFilter === 'all' ? allBadges : allBadges.filter(b => b.category === badgeFilter);
            const completedBooks = books.filter(b => b.progress >= 100).length;

            return (
              <ScrollArea className="flex-1">
                <div className="max-w-4xl mx-auto p-8 space-y-8">
                  {/* Header: Nivel + Título + XP */}
                  <div className="text-center space-y-4">
                    <div className="flex items-center justify-center gap-4">
                      {userTitle && (
                        <img
                          src={getBadgeImageUrl(userTitle.id)}
                          alt={userTitle.name}
                          className="w-16 h-16 object-contain"
                          onError={e => {
                            const el = e.target as HTMLImageElement;
                            el.style.display = 'none';
                          }}
                        />
                      )}
                      <div>
                        <h2 className="text-3xl font-black">Nivel {stats.level}</h2>
                        {userTitle && (
                          <p className={`text-sm font-bold italic ${RARITY_CONFIG[userTitle.rarity].text}`}>"{userTitle.name}"</p>
                        )}
                      </div>
                    </div>
                    <div className="max-w-md mx-auto space-y-1">
                      <Progress value={xpProgress} className="h-3 bg-white/10" indicatorClassName="bg-gradient-to-r from-amber-600 to-amber-400" />
                      <p className="text-xs opacity-50">{stats.xp} / {nextLevelXp} XP para el siguiente nivel</p>
                    </div>
                  </div>

                  {/* Stat Cards */}
                  <div className="grid grid-cols-4 gap-3">
                    <Card className="bg-white/5 border-white/5 p-4 text-center">
                      <Flame className="w-6 h-6 text-orange-400 mx-auto mb-1" />
                      <div className="text-xl font-black">{stats.streak}</div>
                      <div className="text-[9px] opacity-50 uppercase tracking-widest">Racha</div>
                    </Card>
                    <Card className="bg-white/5 border-white/5 p-4 text-center">
                      <BookOpen className="w-6 h-6 text-primary mx-auto mb-1" />
                      <div className="text-xl font-black">{completedBooks}</div>
                      <div className="text-[9px] opacity-50 uppercase tracking-widest">Leídos</div>
                    </Card>
                    <Card className="bg-white/5 border-white/5 p-4 text-center">
                      <Trophy className="w-6 h-6 text-yellow-500 mx-auto mb-1" />
                      <div className="text-xl font-black">{stats.xp}</div>
                      <div className="text-[9px] opacity-50 uppercase tracking-widest">XP</div>
                    </Card>
                    <Card className="bg-white/5 border-white/5 p-4 text-center">
                      <div className="text-lg mx-auto mb-1">🏅</div>
                      <div className="text-xl font-black">{unlockedCount}/{BADGES.length}</div>
                      <div className="text-[9px] opacity-50 uppercase tracking-widest">Logros</div>
                    </Card>
                  </div>

                  {/* Insignias Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-black uppercase tracking-tight">Insignias</h3>
                      <span className="text-xs opacity-50 font-bold">{unlockedCount}/{BADGES.length}</span>
                    </div>

                    {/* Category Filters */}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={badgeFilter === 'all' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setBadgeFilter('all')}
                      >
                        Todas
                      </Button>
                      {(Object.keys(CATEGORY_CONFIG) as BadgeCategory[]).map(cat => (
                        <Button
                          key={cat}
                          variant={badgeFilter === cat ? 'secondary' : 'ghost'}
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => setBadgeFilter(cat)}
                        >
                          {CATEGORY_CONFIG[cat].emoji} {CATEGORY_CONFIG[cat].label}
                        </Button>
                      ))}
                    </div>

                    {/* Badge Grid */}
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                      {filteredBadges.map(badge => {
                        const rc = RARITY_CONFIG[badge.rarity];
                        return (
                          <button
                            key={badge.id}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all cursor-pointer hover:scale-105 ${
                              badge.unlocked
                                ? `${rc.border} ${rc.bg} shadow-lg ${rc.glow}`
                                : 'border-white/5 bg-white/[0.02] opacity-50'
                            }`}
                            onClick={() => setSelectedBadgeDetail(badge)}
                          >
                            <div className="w-12 h-12 flex items-center justify-center">
                              <img
                                src={getBadgeImageUrl(badge.id)}
                                alt={badge.unlocked ? badge.name : '???'}
                                className={`w-full h-full object-contain ${
                                  badge.unlocked ? '' : 'grayscale opacity-30 blur-[1px]'
                                }`}
                                onError={e => {
                                  const el = e.target as HTMLImageElement;
                                  el.style.display = 'none';
                                  const parent = el.parentElement;
                                  if (parent && !parent.querySelector('.badge-fallback')) {
                                    const fb = document.createElement('span');
                                    fb.className = 'badge-fallback text-2xl';
                                    fb.textContent = badge.unlocked
                                      ? CATEGORY_CONFIG[badge.category].emoji
                                      : '❓';
                                    parent.appendChild(fb);
                                  }
                                }}
                              />
                            </div>
                            <span className={`text-[9px] font-bold text-center leading-tight truncate w-full ${
                              badge.unlocked ? '' : 'opacity-40'
                            }`}>
                              {badge.unlocked ? badge.name : '???'}
                            </span>
                            <span className={`text-[8px] font-bold ${badge.unlocked ? rc.text : 'opacity-30'}`}>
                              ⬥ {RARITY_CONFIG[badge.rarity].label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Badge Detail Dialog */}
                <Dialog open={!!selectedBadgeDetail} onOpenChange={(open) => { if (!open) setSelectedBadgeDetail(null); }}>
                  <DialogContent className="sm:max-w-[380px] bg-[#16161e] border-white/10 text-white">
                    {selectedBadgeDetail && (() => {
                      const rc = RARITY_CONFIG[selectedBadgeDetail.rarity];
                      return (
                        <div className="flex flex-col items-center text-center py-4 space-y-4">
                          <div className={`w-24 h-24 flex items-center justify-center rounded-2xl ${
                            selectedBadgeDetail.unlocked ? `${rc.bg} border-2 ${rc.border}` : 'bg-white/5 border border-white/10'
                          }`}>
                            <img
                              src={getBadgeImageUrl(selectedBadgeDetail.id)}
                              alt={selectedBadgeDetail.name}
                              className={`w-20 h-20 object-contain ${
                                selectedBadgeDetail.unlocked ? '' : 'grayscale opacity-30 blur-[1px]'
                              }`}
                              onError={e => {
                                const el = e.target as HTMLImageElement;
                                el.style.display = 'none';
                                const parent = el.parentElement;
                                if (parent && !parent.querySelector('.badge-fallback')) {
                                  const fb = document.createElement('span');
                                  fb.className = 'badge-fallback text-5xl';
                                  fb.textContent = selectedBadgeDetail.unlocked
                                    ? CATEGORY_CONFIG[selectedBadgeDetail.category].emoji
                                    : '🔒';
                                  parent.appendChild(fb);
                                }
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <h3 className="text-lg font-black">
                              {selectedBadgeDetail.unlocked ? selectedBadgeDetail.name : 'Insignia Bloqueada'}
                            </h3>
                            <Badge className={`${rc.bg} ${rc.text} border ${rc.border} text-[10px]`}>
                              ⬥ {RARITY_CONFIG[selectedBadgeDetail.rarity].label}
                            </Badge>
                          </div>
                          <p className="text-sm opacity-70">
                            {selectedBadgeDetail.unlocked
                              ? selectedBadgeDetail.description
                              : `Pista: ${selectedBadgeDetail.description}`}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] opacity-40">
                            <span>{CATEGORY_CONFIG[selectedBadgeDetail.category].emoji}</span>
                            <span>{CATEGORY_CONFIG[selectedBadgeDetail.category].label}</span>
                          </div>
                          {selectedBadgeDetail.unlocked && (
                            <Button
                              size="sm"
                              className="w-full text-xs font-bold"
                              variant={selectedTitleId === selectedBadgeDetail.id ? 'secondary' : 'default'}
                              onClick={() => {
                                setSelectedTitleId(prev => prev === selectedBadgeDetail.id ? null : selectedBadgeDetail.id);
                                setSelectedBadgeDetail(null);
                              }}
                            >
                              {selectedTitleId === selectedBadgeDetail.id ? '✓ Título Activo' : 'Usar como Título'}
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </DialogContent>
                </Dialog>
              </ScrollArea>
            );
          })()}
        </main>
      </div>
    );
  };

  return (
    <TooltipProvider>
      {renderContent()}
      {/* Modal de alertas global */}
      <Dialog open={!!alertModal} onOpenChange={(open) => { if (!open) setAlertModal(null); }}>
        <DialogContent className="sm:max-w-[400px] bg-[#16161e] border-white/10 text-white">
          <div className="flex flex-col items-center text-center py-6 space-y-4">
            {alertModal?.type === 'error' && <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center"><AlertTriangle className="w-8 h-8 text-red-400" /></div>}
            {alertModal?.type === 'success' && <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center"><CheckCircle2 className="w-8 h-8 text-green-400" /></div>}
            {alertModal?.type === 'info' && <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center"><Info className="w-8 h-8 text-blue-400" /></div>}
            <DialogHeader>
              <DialogTitle className={`text-lg font-bold ${alertModal?.type === 'error' ? 'text-red-400' : alertModal?.type === 'success' ? 'text-green-400' : 'text-blue-400'}`}>
                {alertModal?.title}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm opacity-70 whitespace-pre-line">{alertModal?.message}</p>
            <Button
              className={`w-full mt-2 font-bold ${alertModal?.type === 'error' ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30' : alertModal?.type === 'success' ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30' : ''}`}
              variant={alertModal?.type === 'info' ? 'default' : 'ghost'}
              onClick={() => setAlertModal(null)}
            >
              Aceptar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

export default App;
