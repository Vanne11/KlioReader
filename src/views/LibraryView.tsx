import {
  BookOpen, Flame, LayoutGrid, Grid2X2, List, Square, Pencil,
  Loader2, FolderOpen, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLibraryStore } from '@/stores/libraryStore';
import { useReaderStore } from '@/stores/readerStore';
import { useGamificationStore } from '@/stores/gamificationStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUIStore } from '@/stores/uiStore';
import { useLibrary } from '@/hooks/useLibrary';
import { coverSrc } from '@/lib/utils';

export function LibraryView() {
  const books = useLibraryStore(s => s.books);
  const libraryPath = useLibraryStore(s => s.libraryPath);
  const libraryView = useLibraryStore(s => s.libraryView);
  const isMobile = useLibraryStore(s => s.isMobile);
  const editingLocalBook = useLibraryStore(s => s.editingLocalBook);
  const editLocalForm = useLibraryStore(s => s.editLocalForm);
  const { setLibraryView, setEditingLocalBook, updateEditLocalForm } = useLibraryStore();

  const { setSelectedBook } = useReaderStore();
  const stats = useGamificationStore(s => s.stats);
  const queueCount = useCloudStore(s => s.queueCount);
  const queueSummary = useCloudStore(s => s.queueSummary);
  const { setActiveTab } = useUIStore();
  const { setSettingsTab } = useSettingsStore();
  const { startEditLocalBook, saveLocalBookEdit } = useLibrary();

  return (
    <>
      <header className="h-14 md:h-16 border-b border-white/5 flex items-center justify-between px-4 md:px-8 bg-[#16161e]/50 backdrop-blur-md">
        <div className="flex items-center gap-2 md:gap-4 pl-10 md:pl-0">
          <div className="flex items-center gap-1.5 md:gap-2 text-orange-400 font-bold"><Flame className="w-4 h-4 md:w-5 md:h-5 fill-current" /> {stats.streak} <span className="hidden md:inline">Días</span></div>
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
        </div>
      </header>
      <ScrollArea className="flex-1 p-4 md:p-12">
        {!libraryPath && books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-6">
            <FolderOpen className="w-16 h-16 opacity-15" />
            <div className="text-center space-y-2">
              <p className="text-lg font-bold opacity-60">{isMobile ? 'Biblioteca vacía' : 'Sin carpeta de biblioteca'}</p>
              <p className="text-sm opacity-30 max-w-md">{isMobile ? 'Descarga libros desde la nube para empezar a leer.' : 'Configura una carpeta donde tengas tus libros (EPUB, PDF) para empezar a leer.'}</p>
            </div>
            {!isMobile && (
              <Button className="gap-2 font-bold" onClick={() => { setActiveTab('settings'); setSettingsTab('folder'); }}>
                <Settings2 className="w-4 h-4" /> Ir a Configuración
              </Button>
            )}
          </div>
        ) : (
          <div className={`
            ${libraryView === 'grid-large' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 md:gap-16' : ''}
            ${libraryView === 'grid-mini' ? 'flex flex-wrap gap-3 md:gap-4' : ''}
            ${libraryView === 'grid-card' ? 'grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4' : ''}
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
                            <img src={coverSrc(book.cover)} className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110" alt="" />
                            <img src={coverSrc(book.cover)} className="relative z-10 w-full h-full object-contain shadow-2xl transition-transform duration-700 group-hover:scale-105" alt="" />
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center opacity-10"><BookOpen className="w-24 h-24" /></div>
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
                        <div className="w-full h-full flex items-center justify-center opacity-10"><BookOpen className="w-8 h-8" /></div>
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
                          <div className="w-full h-full bg-white/5 flex items-center justify-center opacity-5"><BookOpen className="w-10 h-10" /></div>
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
        )}
      </ScrollArea>

      <Dialog open={!!editingLocalBook} onOpenChange={(open) => { if (!open) setEditingLocalBook(null); }}>
        <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
          <DialogHeader><DialogTitle>Editar Libro</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Título</label>
              <input value={editLocalForm.title} onChange={e => updateEditLocalForm({ title: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Autor</label>
              <input value={editLocalForm.author} onChange={e => updateEditLocalForm({ author: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Descripción</label>
              <textarea value={editLocalForm.description} onChange={e => updateEditLocalForm({ description: e.target.value })} rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none resize-y font-sans" placeholder="Sinopsis o descripción..." />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 border-white/10" onClick={() => setEditingLocalBook(null)}>Cancelar</Button>
              <Button className="flex-1 font-bold" onClick={saveLocalBookEdit}>Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
