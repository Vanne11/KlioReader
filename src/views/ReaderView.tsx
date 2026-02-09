import { useEffect, useMemo, useCallback, useState } from 'react';
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  X, ZoomIn, ZoomOut, Scroll as ScrollIcon, Columns2, Square, Maximize, Minimize,
  Settings2, StickyNote, Bookmark as BookmarkIcon, Plus, MessageSquare,
  ChevronLeft, ChevronRight, Eye, EyeOff, Users2, Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Document, Page, pdfjs } from 'react-pdf';
import { useReaderStore } from '@/stores/readerStore';
import { useNotesStore } from '@/stores/notesStore';
import { useSocialStore } from '@/stores/socialStore';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useReader } from '@/hooks/useReader';
import { useReaderNotes } from '@/hooks/useReaderNotes';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSharedNotes } from '@/hooks/useSharedNotes';
import { useVoiceNotes } from '@/hooks/useVoiceNotes';
import { FoliateReader } from '@/components/reader/FoliateReader';
import { ComicReader } from '@/components/reader/ComicReader';
import { SharedNoteBubble } from '@/components/social/SharedNoteBubble';
import { VoiceNoteRecorder } from '@/components/social/VoiceNoteRecorder';
import { themeClasses, READER_FONTS, isComicType } from '@/lib/constants';
import * as api from '@/lib/api';
import { useT } from '@/i18n';


pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function ReaderView() {
  const { t } = useT();
  const {
    currentBook, setCurrentBook,
    fontSize, setFontSize, readerTheme, setReaderTheme,
    readView, setReadView, pageColumns, setPageColumns,
    readerFont, setReaderFont, numPages, setNumPages,
    isFullscreen,
    showNotesPanel, setShowNotesPanel,
    setFoliateView,
  } = useReaderStore();

  const { readerNotes, readerBookmarks, newNoteContent, setNewNoteContent, newNoteColor, setNewNoteColor } = useNotesStore();
  const { changePage, handleRelocate, toggleFullscreen, readerRef, containerRef } = useReader();
  const { addReaderNote, deleteReaderNote, addReaderBookmark, deleteReaderBookmark, loadReaderNotesAndBookmarks } = useReaderNotes();

  const profile = useAuthStore(s => s.profile);
  const cloudBooks = useCloudStore(s => s.cloudBooks);
  const { sharedNotes } = useSocialStore();
  const { loadSharedNotes, toggleVisibility } = useSharedNotes();
  const voice = useVoiceNotes();
  const [showSharedNotes, setShowSharedNotes] = useState(false);

  const cloudBookId = useMemo(() => {
    if (!currentBook) return undefined;
    const cb = cloudBooks.find(c =>
      c.title.toLowerCase() === currentBook.title.toLowerCase() &&
      c.author.toLowerCase() === currentBook.author.toLowerCase()
    );
    return cb?.id;
  }, [currentBook?.title, currentBook?.author, cloudBooks]);

  useKeyboard();
  const isMobile = useIsMobile();

  // Load notes when book changes
  useEffect(() => {
    if (currentBook && api.isLoggedIn()) loadReaderNotesAndBookmarks();
  }, [currentBook?.title]);

  const onFoliateRelocate = useCallback((detail: { fraction: number; sectionIndex: number; sectionTotal: number; cfi?: string }) => {
    handleRelocate(detail);
  }, [handleRelocate]);

  const onFoliateReady = useCallback((view: any) => {
    setFoliateView(view);
  }, [setFoliateView]);

  // Clear foliate view on unmount or book close
  useEffect(() => {
    if (!currentBook) setFoliateView(null);
  }, [currentBook]);

  if (!currentBook) return null;

  const scale = 1.0;
  const isPdf = currentBook.type === 'pdf';
  const isComic = isComicType(currentBook.type);
  const usesFoliate = !isPdf && !isComic; // only epub uses foliate-js

  return (
    <div ref={containerRef} className={`flex flex-col h-screen ${themeClasses[readerTheme]} transition-colors duration-300`} style={{ paddingTop: 'var(--sat)', paddingBottom: 'var(--sab)' }}>
      <header className="flex items-center justify-between p-2 md:p-3 border-b border-white/10 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-1 md:gap-3">
          <Button variant="ghost" size="icon" onClick={() => setCurrentBook(null)}><X className="w-5 h-5" /></Button>
          <div className="max-w-[120px] md:max-w-[200px]"><h2 className="text-xs font-bold truncate leading-none mb-1">{currentBook.title}</h2><p className="text-[10px] opacity-50 uppercase">{currentBook.progress}%</p></div>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          <Dialog>
            <DialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 md:h-9 md:w-9 bg-black/20 rounded-full"><Settings2 className="w-4 h-4 md:w-5 md:h-5" /></Button></DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
              <DialogHeader><DialogTitle>{t('reader.readingSettings')}</DialogTitle></DialogHeader>
              <div className="py-6 space-y-8">
                {!isComic && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('reader.viewMode')}</p>
                    <div className="flex gap-2">
                      <Button variant={readView === 'scroll' ? 'default' : 'secondary'} className="flex-1" onClick={() => setReadView('scroll')}><ScrollIcon className="w-4 h-4 mr-2" /> {t('reader.scroll')}</Button>
                      <Button variant={readView === 'paginated' ? 'default' : 'secondary'} className="flex-1" onClick={() => setReadView('paginated')}><Columns2 className="w-4 h-4 mr-2" /> {t('reader.paginated')}</Button>
                    </div>
                    {readView === 'paginated' && (
                      <div className="flex gap-2 pt-2 border-t border-white/5 mt-2">
                        <Button variant={pageColumns === 1 ? 'outline' : 'ghost'} className="flex-1 text-xs" onClick={() => setPageColumns(1)}><Square className="w-3 h-3 mr-2" /> {t('reader.oneColumn')}</Button>
                        <Button variant={pageColumns === 2 ? 'outline' : 'ghost'} className="flex-1 text-xs" onClick={() => setPageColumns(2)}><Columns2 className="w-3 h-3 mr-2" /> {t('reader.twoColumns')}</Button>
                      </div>
                    )}
                  </div>
                )}
                {!isComic && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('reader.typography')}</p>
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
                )}
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('reader.theme')}</p>
                  <div className="flex gap-2">
                    <Button variant={readerTheme === 'light' ? 'outline' : 'ghost'} className="flex-1 bg-white text-black hover:bg-gray-100" onClick={() => setReaderTheme('light')}>{t('reader.light')}</Button>
                    <Button variant={readerTheme === 'sepia' ? 'outline' : 'ghost'} className="flex-1 bg-[#f4ecd8] text-[#5b4636] hover:bg-[#ebe2cf]" onClick={() => setReaderTheme('sepia')}>{t('reader.sepia')}</Button>
                    <Button variant={readerTheme === 'dark' ? 'outline' : 'ghost'} className="flex-1 bg-[#1e1e2e] text-[#cdd6f4] hover:bg-[#252539]" onClick={() => setReaderTheme('dark')}>{t('reader.dark')}</Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          {api.isLoggedIn() && (
            <>
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={`h-8 w-8 md:h-9 md:w-9 rounded-full ${showNotesPanel ? 'bg-primary/30 text-primary' : 'bg-black/20'}`} onClick={() => setShowNotesPanel(p => !p)}><StickyNote className="w-4 h-4 md:w-5 md:h-5" /></Button>
              </TooltipTrigger><TooltipContent>{t('reader.notes')}</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={`h-8 w-8 md:h-9 md:w-9 rounded-full ${readerBookmarks.some(b => b.chapter_index === currentBook.currentChapter) ? 'bg-amber-500/30 text-amber-400' : 'bg-black/20'}`} onClick={addReaderBookmark}><BookmarkIcon className="w-4 h-4 md:w-5 md:h-5" /></Button>
              </TooltipTrigger><TooltipContent>{t('reader.bookmarkPage')}</TooltipContent></Tooltip>
            </>
          )}
          <Separator orientation="vertical" className="h-6 opacity-10 mx-1 md:mx-2 hidden md:block" />
          <div className="flex items-center gap-1 md:gap-2">
            <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={() => changePage(-1)} disabled={currentBook.currentChapter === 0 && currentBook.progress === 0}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => changePage(-1)} disabled={currentBook.currentChapter === 0 && currentBook.progress === 0}>{t('reader.previous')}</Button>
            <div className="text-[9px] md:text-[10px] font-bold px-2 md:px-3 py-1 bg-primary/10 rounded whitespace-nowrap">
              {isPdf
                ? `${currentBook.currentChapter + 1} / ${numPages}`
                : isComic
                  ? `${currentBook.currentChapter + 1} / ${currentBook.total_chapters}`
                  : `${currentBook.progress}% · ${t('reader.chapter')} ${currentBook.currentChapter + 1}/${currentBook.total_chapters}`}
            </div>
            <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={() => changePage(1)}><ChevronRight className="w-4 h-4" /></Button>
            <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={() => changePage(1)}>{t('reader.next')}</Button>
          </div>
          <Separator orientation="vertical" className="h-6 opacity-10 mx-1 md:mx-2 hidden md:block" />
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={toggleFullscreen}>{isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}</Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div ref={readerRef} className="flex-1 overflow-hidden">
          {isComic ? (
            <ComicReader
              bookPath={currentBook.path}
              bookType={currentBook.type}
              theme={readerTheme}
              initialSection={currentBook.currentChapter}
              onRelocate={onFoliateRelocate}
              onReady={onFoliateReady}
            />
          ) : usesFoliate ? (
            <FoliateReader
              bookPath={currentBook.path}
              bookType={currentBook.type}
              flow={readView}
              fontSize={fontSize}
              fontFamily={readerFont}
              theme={readerTheme}
              pageColumns={pageColumns}
              initialSection={currentBook.currentChapter}
              onRelocate={onFoliateRelocate}
              onReady={onFoliateReady}
            />
          ) : (
            <div
              key={currentBook.id + '-' + currentBook.currentChapter + '-' + readView + '-' + fontSize}
              className="mx-auto py-6 px-4 md:py-12 md:px-12 font-serif selection:bg-primary/30 break-words max-w-full md:max-w-2xl overflow-y-auto h-full"
              style={{ fontSize: `${fontSize}px`, lineHeight: '1.8', fontFamily: readerFont }}
            >
              <div className="flex justify-center">
                <Document file={convertFileSrc(currentBook.path)} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                  <Page pageNumber={currentBook.currentChapter + 1} scale={scale} renderAnnotationLayer={false} renderTextLayer={true} className="shadow-2xl" />
                </Document>
              </div>
            </div>
          )}
        </div>

        {showNotesPanel && (
          <aside className={`${isMobile ? 'fixed inset-0 z-50' : 'w-80'} border-l border-white/10 bg-[#16161e]/95 backdrop-blur-md flex flex-col overflow-hidden`} style={isMobile ? { paddingTop: 'var(--sat)', paddingBottom: 'var(--sab)' } : undefined}>
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button className={`text-xs font-bold px-2 py-1 rounded ${!showSharedNotes ? 'bg-primary/20 text-primary' : 'opacity-50'}`} onClick={() => setShowSharedNotes(false)}>
                  <MessageSquare className="w-3.5 h-3.5 inline mr-1" />{t('reader.myNotes')}
                </button>
                <button className={`text-xs font-bold px-2 py-1 rounded ${showSharedNotes ? 'bg-cyan-400/20 text-cyan-400' : 'opacity-50'}`} onClick={() => { setShowSharedNotes(true); if (cloudBookId) loadSharedNotes(cloudBookId); }}>
                  <Users2 className="w-3.5 h-3.5 inline mr-1" />{t('reader.fromOthers')}
                </button>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNotesPanel(false)}><X className="w-4 h-4" /></Button>
            </div>

            {!showSharedNotes ? (
              <>
                <div className="p-4 border-b border-white/10 space-y-2">
                  <textarea value={newNoteContent} onChange={e => setNewNoteContent(e.target.value)} placeholder={t('reader.notePlaceholder')} rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:border-primary outline-none resize-none" />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {['#ffeb3b', '#ef5350', '#42a5f5', '#66bb6a', '#ab47bc'].map(c => (
                        <button key={c} className={`w-5 h-5 rounded-full border-2 ${newNoteColor === c ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: c }} onClick={() => setNewNoteColor(c)} />
                      ))}
                    </div>
                    <Button size="sm" className="text-xs h-7" disabled={!newNoteContent.trim()} onClick={addReaderNote}><Plus className="w-3 h-3 mr-1" /> {t('reader.note')}</Button>
                  </div>
                  {profile?.is_subscriber ? (
                    <VoiceNoteRecorder
                      isRecording={voice.isRecording}
                      recordingTime={voice.recordingTime}
                      audioUrl={voice.audioUrl}
                      isPlaying={voice.isPlaying}
                      onStart={voice.startRecording}
                      onStop={voice.stopRecording}
                      onDiscard={voice.discardRecording}
                      onPlay={voice.playPreview}
                      onStopPlay={voice.stopPreview}
                      onUpload={() => cloudBookId && voice.uploadVoice(cloudBookId, currentBook.currentChapter)}
                    />
                  ) : null}
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-3">
                    {readerBookmarks.filter(b => b.chapter_index === currentBook.currentChapter).length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase opacity-40 tracking-widest">{t('reader.bookmarks')}</p>
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
                        <p className="text-[10px] font-bold uppercase opacity-40 tracking-widest">{t('reader.notes')}</p>
                        {readerNotes.filter(n => n.chapter_index === currentBook.currentChapter).map(note => (
                          <div key={note.id} className="rounded-lg px-3 py-2 group relative" style={{ backgroundColor: note.color + '15', borderLeft: `3px solid ${note.color}` }}>
                            {note.highlight_text && <p className="text-[10px] italic opacity-50 mb-1">"{note.highlight_text}"</p>}
                            <p className="text-xs">{note.content}</p>
                            {note.audio_duration && (
                              <div className="flex items-center gap-1 mt-1 text-[10px] opacity-50"><Volume2 className="w-3 h-3" /> {note.audio_duration}s</div>
                            )}
                            <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100">
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => toggleVisibility(note.id)} title={note.is_shared ? t('reader.makePrivate') : t('reader.shareNote')}>
                                {note.is_shared ? <Eye className="w-3 h-3 text-cyan-400" /> : <EyeOff className="w-3 h-3" />}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deleteReaderNote(note.id)}><X className="w-3 h-3" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {readerBookmarks.filter(b => b.chapter_index !== currentBook.currentChapter).length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <p className="text-[10px] font-bold uppercase opacity-40 tracking-widest">{t('reader.otherChapters')}</p>
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
                        <p className="text-xs">{t('reader.noNotesOrBookmarks')}</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  <p className="text-[10px] font-bold uppercase opacity-40 tracking-widest">{t('reader.sharedNotes', { chapter: currentBook.currentChapter + 1 })}</p>
                  {sharedNotes.filter(n => n.chapter_index === currentBook.currentChapter).length > 0 ? (
                    sharedNotes.filter(n => n.chapter_index === currentBook.currentChapter).map(note => (
                      <SharedNoteBubble key={note.id} note={note} />
                    ))
                  ) : (
                    <div className="text-center py-8 opacity-30">
                      <Users2 className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-xs">{t('reader.noSharedNotes')}</p>
                    </div>
                  )}
                  {sharedNotes.filter(n => n.chapter_index !== currentBook.currentChapter).length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <p className="text-[10px] font-bold uppercase opacity-40 tracking-widest">{t('reader.otherChapters')}</p>
                      {sharedNotes.filter(n => n.chapter_index !== currentBook.currentChapter).map(note => (
                        <SharedNoteBubble key={note.id} note={note} />
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
