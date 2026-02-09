import { useEffect, useMemo } from 'react';
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  X, ZoomIn, ZoomOut, Scroll as ScrollIcon, Columns2, Square, Maximize, Minimize,
  Settings2, StickyNote, Bookmark as BookmarkIcon, Plus, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Document, Page, pdfjs } from 'react-pdf';
import parse, { Element, HTMLReactParserOptions } from 'html-react-parser';
import { useReaderStore } from '@/stores/readerStore';
import { useNotesStore } from '@/stores/notesStore';
import { useReader } from '@/hooks/useReader';
import { useReaderNotes } from '@/hooks/useReaderNotes';
import { useKeyboard } from '@/hooks/useKeyboard';
import { EpubImage } from '@/components/shared/EpubImage';
import { themeClasses, READER_FONTS } from '@/lib/constants';
import * as api from '@/lib/api';


pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function ReaderView() {
  const {
    currentBook, setCurrentBook, epubContent,
    fontSize, setFontSize, readerTheme, setReaderTheme,
    readView, setReadView, pageColumns, setPageColumns,
    readerFont, setReaderFont, numPages, setNumPages,
    isFullscreen, currentPageInChapter, totalPagesInChapter,
    pageHeight, setPageHeight, setCurrentPageInChapter, setTotalPagesInChapter,
    showNotesPanel, setShowNotesPanel,
  } = useReaderStore();

  const { readerNotes, readerBookmarks, newNoteContent, setNewNoteContent, newNoteColor, setNewNoteColor } = useNotesStore();
  const { changePage, toggleFullscreen, readerRef, containerRef, contentRef, pendingLastPageRef } = useReader();
  const { addReaderNote, deleteReaderNote, addReaderBookmark, deleteReaderBookmark, loadReaderNotesAndBookmarks } = useReaderNotes();

  useKeyboard();

  // Load notes when book changes
  useEffect(() => {
    if (currentBook && api.isLoggedIn()) loadReaderNotesAndBookmarks();
  }, [currentBook?.title]);

  // Pagination calculation
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
      const padY = 3 * rootFs * 2;
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

  const findSvgImage = (node: any): string | null => {
    if (node instanceof Element) {
      if (node.name === 'image') return node.attribs.href || node.attribs['xlink:href'] || null;
      if (node.children) for (const child of node.children) { const r = findSvgImage(child); if (r) return r; }
    }
    return null;
  };

  const parserOptions: HTMLReactParserOptions = useMemo(() => ({
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
  }), [currentBook?.path]);

  if (!currentBook) return null;

  const scale = 1.0;

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
                    {READER_FONTS.map(font => (
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
              style={{ fontSize: `${fontSize}px`, lineHeight: '1.8', fontFamily: readerFont }}
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

        {showNotesPanel && (
          <aside className="w-80 border-l border-white/10 bg-[#16161e]/90 backdrop-blur-md flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Notas y Marcadores</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNotesPanel(false)}><X className="w-4 h-4" /></Button>
            </div>
            <div className="p-4 border-b border-white/10 space-y-2">
              <textarea value={newNoteContent} onChange={e => setNewNoteContent(e.target.value)} placeholder="Escribe una nota para este capítulo..." rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:border-primary outline-none resize-none" />
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {['#ffeb3b', '#ef5350', '#42a5f5', '#66bb6a', '#ab47bc'].map(c => (
                    <button key={c} className={`w-5 h-5 rounded-full border-2 ${newNoteColor === c ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: c }} onClick={() => setNewNoteColor(c)} />
                  ))}
                </div>
                <Button size="sm" className="text-xs h-7" disabled={!newNoteContent.trim()} onClick={addReaderNote}><Plus className="w-3 h-3 mr-1" /> Nota</Button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
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
