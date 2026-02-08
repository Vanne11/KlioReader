import { useState, useEffect, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  BookOpen, Trophy, Library, Flame, X,
  ZoomIn, ZoomOut,
  Scroll as ScrollIcon, Columns2, Square, Maximize, Minimize,
  LayoutGrid, Grid2X2, List, Settings2,
  Cloud, CloudUpload, CloudDownload, LogIn, LogOut, User, Loader2, Server, Trash2, Pencil
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
import { UserStats, INITIAL_STATS, addXP, updateStreak } from "@/lib/gamification";
import * as api from "@/lib/api";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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

const EpubImage = ({ src, bookPath }: { src: string, bookPath: string }) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    async function loadImg() {
      try {
        const cleanPath = src.split('/').pop() || src;
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
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
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
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [editingCloudBook, setEditingCloudBook] = useState<api.CloudBook | null>(null);
  const [editCloudForm, setEditCloudForm] = useState({ title: '', author: '', description: '' });
  const [editingLocalBook, setEditingLocalBook] = useState<Book | null>(null);
  const [editLocalForm, setEditLocalForm] = useState({ title: '', author: '', description: '' });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [numPages, setNumPages] = useState<number | null>(null);
  const scale = 1.0;
  const readerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    return saved ? JSON.parse(saved) : INITIAL_STATS;
  });

  // Persistencia
  useEffect(() => { localStorage.setItem("libraryView", libraryView); }, [libraryView]);
  useEffect(() => { localStorage.setItem("readerFontSize", fontSize.toString()); }, [fontSize]);
  useEffect(() => { localStorage.setItem("readerTheme", readerTheme); }, [readerTheme]);
  useEffect(() => { localStorage.setItem("readView", readView); }, [readView]);
  useEffect(() => { localStorage.setItem("readerPageColumns", pageColumns.toString()); }, [pageColumns]);
  useEffect(() => { localStorage.setItem("readerFont", readerFont); }, [readerFont]);
  useEffect(() => { localStorage.setItem("userStats", JSON.stringify(stats)); }, [stats]);

  useEffect(() => {
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
  }, []);

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
  }, []);

  useEffect(() => {
    const booksToSave = books.map(({ cover, ...rest }) => ({ ...rest }));
    localStorage.setItem("books_meta_v3", JSON.stringify(booksToSave));
  }, [books]);

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
  }

  async function loadCloudBooks() {
    if (!api.isLoggedIn()) return;
    setCloudLoading(true);
    try {
      const books = await api.listBooks();
      setCloudBooks(books);
    } catch (err) {
      console.error("Error loading cloud books:", err);
    } finally {
      setCloudLoading(false);
    }
  }

  async function uploadBookToCloud(book: Book) {
    if (!api.isLoggedIn()) return;
    try {
      const bytes: number[] = await invoke("read_file_bytes", { path: book.path });
      const blob = new Blob([new Uint8Array(bytes)], {
        type: book.type === 'pdf' ? 'application/pdf' : 'application/epub+zip'
      });
      const fileName = book.path.split('/').pop() || 'book';
      const file = new File([blob], fileName, { type: blob.type });
      await api.uploadBook(file, {
        title: book.title,
        author: book.author,
        total_chapters: book.total_chapters,
        cover_base64: book.cover || undefined,
        description: book.description || undefined,
      });
      loadCloudBooks();
    } catch (err) {
      console.error("Error uploading:", err);
    }
  }

  async function downloadBookFromCloud(cloudBook: api.CloudBook) {
    if (!libraryPath) return;
    try {
      const blob = await api.downloadBook(cloudBook.id);
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuffer));
      const savePath = `${libraryPath}/${cloudBook.file_name}`;
      await invoke("save_file_bytes", { path: savePath, bytes });
      scanLibrary(libraryPath);
    } catch (err) {
      console.error("Error downloading:", err);
    }
  }

  async function deleteCloudBook(id: number) {
    try {
      await api.deleteBook(id);
      setCloudBooks(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      console.error("Error deleting:", err);
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
    } catch (err) {
      console.error("Error updating book:", err);
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

  useEffect(() => {
    if (authUser) loadCloudBooks();
  }, [authUser]);

  async function readBook(book: Book) {
    setCurrentBook(book);
    setCurrentPageInChapter(0);
    setStats(prev => updateStreak(prev));
    if (book.type === 'epub') loadEpubChapter(book.path, book.currentChapter);
  }

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
  }

  const themeClasses = {
    dark: "bg-[#1e1e2e] text-[#cdd6f4]",
    sepia: "bg-[#f4ecd8] text-[#5b4636]",
    light: "bg-white text-gray-900"
  };

  const parserOptions: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (domNode instanceof Element) {
        if (domNode.name === 'img') return <EpubImage src={domNode.attribs.src} bookPath={currentBook?.path || ""} />;
        if (['html', 'body', 'head', 'script', 'style', 'link'].includes(domNode.name)) return <></>;
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
          </nav>
          <div className="p-6 mt-auto border-t border-white/5">
            {authUser ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold truncate">{authUser.username}</span>
                </div>
                <Button variant="ghost" size="sm" className="w-full justify-start text-xs opacity-50" onClick={handleLogout}><LogOut className="w-3 h-3 mr-2" /> Cerrar Sesión</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full text-xs border-white/10" onClick={() => setActiveTab('cloud')}><LogIn className="w-3 h-3 mr-2" /> Iniciar Sesión</Button>
            )}
            <Separator className="my-3 opacity-10" />
            <Badge variant="outline" className="mb-2 border-accent text-accent font-bold">Nivel {stats.level}</Badge>
            <Progress value={((stats.xp % 100) / 100) * 100} className="h-1" indicatorClassName="bg-amber-400" />
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
                <Button onClick={selectLibraryFolder} variant="outline" size="sm" className="border-white/10 font-bold tracking-tight">{libraryPath ? 'SINCRONIZAR' : 'CONFIGURAR'}</Button>
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
                      <div onClick={() => readBook(book)}>
                        {libraryView === 'grid-large' && (
                          <Card className="bg-[#16161e] border-white/5 hover:border-primary/50 transition-all overflow-hidden shadow-[0_35px_60px_-15px_rgba(0,0,0,0.6)] flex flex-col">
                            <div className="aspect-[3/4] relative overflow-hidden bg-black/40">
                              {book.cover ? <img src={`data:image/png;base64,${book.cover}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="" /> : <div className="w-full h-full flex items-center justify-center opacity-10"><BookOpen className="w-24 h-24" /></div>}
                              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/60 to-transparent">
                                <Progress value={book.progress} className="h-3 bg-white/10" indicatorClassName="bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
                                <div className="mt-2 flex justify-between items-center font-black text-[9px] text-amber-400 tracking-tighter"><span>{book.progress}% COMPLETADO</span><Badge className="bg-primary/20 text-primary border-none text-[8px]">{book.type}</Badge></div>
                              </div>
                            </div>
                            <div className="p-8 bg-[#1c1c26] border-t border-white/5"><h3 className="text-xl font-black group-hover:text-primary transition-colors line-clamp-2 leading-tight">{book.title}</h3><p className="text-sm opacity-40 mt-2 italic">{book.author}</p></div>
                          </Card>
                        )}
                        {libraryView === 'grid-mini' && (
                          <div className="w-24 aspect-[2/3] relative rounded-md overflow-hidden hover:ring-2 ring-primary transition-all shadow-lg bg-black/20">
                            {book.cover ? <img src={`data:image/png;base64,${book.cover}`} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-white/5 flex items-center justify-center opacity-10"><BookOpen className="w-6 h-6" /></div>}
                            <div className="absolute bottom-0 left-0 right-0 h-1"><Progress value={book.progress} className="h-full rounded-none bg-black/50" indicatorClassName="bg-amber-400" /></div>
                          </div>
                        )}
                        {libraryView === 'grid-card' && (
                          <Card className="bg-transparent border-none space-y-2 hover:scale-105 transition-transform">
                            <div className="aspect-[2/3] relative rounded-md overflow-hidden shadow-md bg-black/20">
                              {book.cover ? <img src={`data:image/png;base64,${book.cover}`} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-white/5" />}
                              <div className="absolute bottom-0 left-0 right-0 h-1"><Progress value={book.progress} className="h-full rounded-none bg-black/50" indicatorClassName="bg-amber-400" /></div>
                            </div>
                            <div className="text-[10px] font-medium opacity-80 line-clamp-2">{book.title}</div>
                          </Card>
                        )}
                        {libraryView === 'list-info' && (
                          <Card className="flex bg-white/5 border-white/5 hover:bg-white/10 p-4 gap-6 items-center">
                            <div className="w-16 aspect-[2/3] rounded bg-[#0f0f14] overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">{book.cover ? <img src={`data:image/png;base64,${book.cover}`} className="w-full h-full object-contain" alt="" /> : <BookOpen className="w-6 h-6 opacity-10" />}</div>
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
                          {authUser && <Button size="icon" variant="ghost" className="h-8 w-8 bg-black/50 hover:bg-blue-600 rounded-full" onClick={(e) => { e.stopPropagation(); uploadBookToCloud(book); }}><CloudUpload className="w-4 h-4" /></Button>}
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
                              {cb.cover_base64 ? <img src={`data:image/png;base64,${cb.cover_base64}`} className="w-full h-full object-contain" alt="" /> : <BookOpen className="w-4 h-4 opacity-10" />}
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
                                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-green-600/20 hover:text-green-400" onClick={() => downloadBookFromCloud(cb)}><CloudDownload className="w-4 h-4" /></Button>
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
              </div>
            </ScrollArea>
          )}

          {activeTab === 'gamification' && (
            <ScrollArea className="flex-1 p-12">
              <div className="max-w-2xl mx-auto space-y-8">
                <div className="text-center space-y-4">
                  <Trophy className="w-16 h-16 text-yellow-500 mx-auto" />
                  <h2 className="text-3xl font-black">Nivel {stats.level}</h2>
                  <Progress value={((stats.xp % 100) / 100) * 100} className="h-3 max-w-md mx-auto bg-white/10" indicatorClassName="bg-amber-400" />
                  <p className="text-sm opacity-50">{stats.xp % 100} / 100 XP para el siguiente nivel</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Card className="bg-white/5 border-white/5 p-6 text-center">
                    <Flame className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                    <div className="text-2xl font-black">{stats.streak}</div>
                    <div className="text-[10px] opacity-50 uppercase tracking-widest">Racha Días</div>
                  </Card>
                  <Card className="bg-white/5 border-white/5 p-6 text-center">
                    <BookOpen className="w-8 h-8 text-primary mx-auto mb-2" />
                    <div className="text-2xl font-black">{books.filter(b => b.progress > 0).length}</div>
                    <div className="text-[10px] opacity-50 uppercase tracking-widest">Libros Leídos</div>
                  </Card>
                  <Card className="bg-white/5 border-white/5 p-6 text-center">
                    <Trophy className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
                    <div className="text-2xl font-black">{stats.xp}</div>
                    <div className="text-[10px] opacity-50 uppercase tracking-widest">XP Total</div>
                  </Card>
                </div>
              </div>
            </ScrollArea>
          )}
        </main>
      </div>
    );
  };

  return (
    <TooltipProvider>
      {renderContent()}
    </TooltipProvider>
  );
}

export default App;
