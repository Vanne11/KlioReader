import {
  BookOpen, Flame, LayoutGrid, Grid2X2, List, Square, Pencil,
  Loader2, FolderOpen, Settings2, Layers, Plus, ArrowLeft, Trash2,
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
import { useCollectionsStore } from '@/stores/collectionsStore';
import { useLibrary } from '@/hooks/useLibrary';
import { useCollections } from '@/hooks/useCollections';
import { coverSrc, getCollectionCoverSrc } from '@/lib/utils';
import { useT } from '@/i18n';
import { CreateCollectionDialog } from '@/components/shared/CreateCollectionDialog';
import { EditCollectionDialog } from '@/components/shared/EditCollectionDialog';
import type { Book, LocalCollection } from '@/types';

function BookCard({ book, libraryView, onOpen, onEdit, t }: {
  book: Book; libraryView: string; onOpen: () => void; onEdit: () => void; t: (key: string, params?: any) => string;
}) {
  return (
    <div className="cursor-pointer group relative">
      <div onClick={onOpen}>
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
                <p className="mt-2 text-[9px] font-black text-amber-400 tracking-tighter">{book.progress}% {t('library.read')}</p>
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
            <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20 hover:text-primary" onClick={(e) => { e.stopPropagation(); onEdit(); }}><Pencil className="w-4 h-4" /></Button>
          </Card>
        )}
      </div>
      {libraryView === 'grid-large' && (
        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="icon" variant="ghost" className="h-8 w-8 bg-black/50 hover:bg-primary/80 rounded-full" onClick={(e) => { e.stopPropagation(); onEdit(); }}><Pencil className="w-4 h-4" /></Button>
        </div>
      )}
    </div>
  );
}

function CollectionCard({ collection, coverUrl, onClick, onEdit }: {
  collection: LocalCollection; coverUrl?: string; onClick: () => void; onEdit: () => void;
}) {
  const isSaga = collection.type === 'saga';
  const Icon = isSaga ? FolderOpen : Layers;
  const iconColor = isSaga ? 'text-amber-400' : 'text-blue-400';
  const count = collection.bookEntries.length;
  const label = `${count} ${count === 1 ? 'libro' : 'libros'}${isSaga ? ' · Saga' : ''}`;

  return (
    <Card
      className="bg-[#16161e] border-white/5 hover:border-primary/50 cursor-pointer transition-all overflow-hidden hover:translate-y-[-2px] group relative"
      onClick={onClick}
    >
      {coverUrl ? (
        <div className="flex flex-col">
          <div className="aspect-[3/2] relative overflow-hidden bg-black/60">
            <img src={coverUrl} className="absolute inset-0 w-full h-full object-cover blur-xl opacity-50 scale-125" alt="" />
            <img src={coverUrl} className="relative z-10 w-full h-full object-contain" alt="" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-20" />
            <div className="absolute bottom-2 left-3 right-3 z-30">
              <h3 className="text-sm font-black truncate leading-tight">{collection.name}</h3>
              <p className="text-[10px] opacity-50">{label}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className={`p-4 ${isSaga ? 'bg-gradient-to-br from-amber-400/10 to-transparent' : 'bg-gradient-to-br from-blue-400/10 to-transparent'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl ${isSaga ? 'bg-amber-400/15' : 'bg-blue-400/15'} flex items-center justify-center`}>
              <Icon className={`w-6 h-6 ${iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold truncate">{collection.name}</h3>
              <p className="text-[10px] opacity-40">{label}</p>
            </div>
          </div>
        </div>
      )}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-40">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 bg-black/60 hover:bg-primary/80 rounded-full"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </div>
    </Card>
  );
}

export function LibraryView() {
  const { t } = useT();
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

  const localCollections = useCollectionsStore(s => s.localCollections);
  const activeCollectionId = useCollectionsStore(s => s.activeCollectionId);
  const { setActiveCollectionId, setShowCreateDialog, setEditingCollection } = useCollectionsStore();
  const { deleteLocalCollection } = useCollections();

  const activeCollection = activeCollectionId
    ? localCollections.find(c => c.id === activeCollectionId)
    : null;

  // Libros a mostrar: si hay colección activa, solo sus libros; sino libros sin subfolder
  const displayBooks = activeCollection
    ? activeCollection.bookEntries
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(entry => books.find(b => b.id === entry.bookId))
        .filter((b): b is Book => !!b)
    : books.filter(b => !b.subfolder);

  const hasCollections = localCollections.length > 0;

  return (
    <>
      <header className="h-14 md:h-16 border-b border-white/5 flex items-center justify-between px-4 md:px-8 bg-[#16161e]/50 backdrop-blur-md">
        <div className="flex items-center gap-2 md:gap-4 pl-10 md:pl-0">
          {activeCollection ? (
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setActiveCollectionId(null)}>
              <ArrowLeft className="w-4 h-4" /> Biblioteca
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-1.5 md:gap-2 text-orange-400 font-bold"><Flame className="w-4 h-4 md:w-5 md:h-5 fill-current" /> {stats.streak} <span className="hidden md:inline">{t('library.days')}</span></div>
              <Separator orientation="vertical" className="h-6 opacity-10" />
            </>
          )}
          <div className="flex items-center bg-black/20 rounded-lg p-1">
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className={`h-8 w-8 ${libraryView === 'grid-large' ? 'bg-white/10 text-primary' : 'opacity-50'}`} onClick={() => setLibraryView('grid-large')}><LayoutGrid className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>{t('library.gridLarge')}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className={`h-8 w-8 ${libraryView === 'grid-mini' ? 'bg-white/10 text-primary' : 'opacity-50'}`} onClick={() => setLibraryView('grid-mini')}><Grid2X2 className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>{t('library.gridMini')}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className={`h-8 w-8 ${libraryView === 'grid-card' ? 'bg-white/10 text-primary' : 'opacity-50'}`} onClick={() => setLibraryView('grid-card')}><Square className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>{t('library.gridCard')}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className={`h-8 w-8 ${libraryView === 'list-info' ? 'bg-white/10 text-primary' : 'opacity-50'}`} onClick={() => setLibraryView('list-info')}><List className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>{t('library.listInfo')}</TooltipContent></Tooltip>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {queueCount > 0 && (
            <Tooltip><TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold bg-amber-400/10 px-2.5 py-1.5 rounded-lg">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{queueSummary || t('library.pending', { count: queueCount })}</span>
              </div>
            </TooltipTrigger><TooltipContent>{t('library.inQueue', { count: queueCount, summary: queueSummary })}</TooltipContent></Tooltip>
          )}
          {!activeCollection && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/20 hover:text-primary" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Crear colección</TooltipContent>
            </Tooltip>
          )}
          {activeCollection && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/20 hover:text-primary" onClick={() => setEditingCollection(activeCollection)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Editar colección</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-600/20 hover:text-red-400" onClick={() => deleteLocalCollection(activeCollection.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Eliminar colección</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </header>
      <ScrollArea className="flex-1 p-4 md:p-12">
        {!libraryPath && books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-6">
            <FolderOpen className="w-16 h-16 opacity-15" />
            <div className="text-center space-y-2">
              <p className="text-lg font-bold opacity-60">{isMobile ? t('library.emptyTitle') : t('library.emptyTitleDesktop')}</p>
              <p className="text-sm opacity-30 max-w-md">{isMobile ? t('library.emptyDesc') : t('library.emptyDescDesktop')}</p>
            </div>
            {!isMobile && (
              <Button className="gap-2 font-bold" onClick={() => { setActiveTab('settings'); setSettingsTab('folder'); }}>
                <Settings2 className="w-4 h-4" /> {t('library.goToSettings')}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Breadcrumb si hay colección activa */}
            {activeCollection && (
              <div className="flex items-center gap-2 text-sm">
                <button className="opacity-50 hover:opacity-100 transition-opacity" onClick={() => setActiveCollectionId(null)}>Biblioteca</button>
                <span className="opacity-30">/</span>
                <span className="font-bold flex items-center gap-1.5">
                  {activeCollection.type === 'saga' ? <FolderOpen className="w-4 h-4 text-amber-400" /> : <Layers className="w-4 h-4 text-blue-400" />}
                  {activeCollection.name}
                </span>
                {activeCollection.description && (
                  <span className="text-xs opacity-30 ml-2">— {activeCollection.description}</span>
                )}
              </div>
            )}

            {/* Colecciones (solo cuando no hay colección activa) */}
            {!activeCollection && hasCollections && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {localCollections.map(col => (
                    <CollectionCard
                      key={col.id}
                      collection={col}
                      coverUrl={getCollectionCoverSrc(col, books)}
                      onClick={() => setActiveCollectionId(col.id)}
                      onEdit={() => setEditingCollection(col)}
                    />
                  ))}
                </div>
                {displayBooks.length > 0 && <Separator className="opacity-10" />}
              </div>
            )}

            {/* Grid de libros */}
            {displayBooks.length > 0 && (
              <div className={`
                ${libraryView === 'grid-large' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 md:gap-16' : ''}
                ${libraryView === 'grid-mini' ? 'flex flex-wrap gap-3 md:gap-4' : ''}
                ${libraryView === 'grid-card' ? 'grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-4' : ''}
                ${libraryView === 'list-info' ? 'space-y-4 max-w-4xl mx-auto' : ''}
              `}>
                {displayBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    libraryView={libraryView}
                    onOpen={() => setSelectedBook(book)}
                    onEdit={() => startEditLocalBook(book)}
                    t={t}
                  />
                ))}
              </div>
            )}

            {displayBooks.length === 0 && activeCollection && (
              <div className="text-center py-16 opacity-40">
                <BookOpen className="w-12 h-12 mx-auto mb-3" />
                <p className="text-sm">Esta colección está vacía</p>
                <p className="text-xs mt-1">Agrega libros arrastrándolos o desde el menú contextual</p>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <Dialog open={!!editingLocalBook} onOpenChange={(open) => { if (!open) setEditingLocalBook(null); }}>
        <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
          <DialogHeader><DialogTitle>{t('library.editBook')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('library.title')}</label>
              <input value={editLocalForm.title} onChange={e => updateEditLocalForm({ title: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('library.author')}</label>
              <input value={editLocalForm.author} onChange={e => updateEditLocalForm({ author: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('library.description')}</label>
              <textarea value={editLocalForm.description} onChange={e => updateEditLocalForm({ description: e.target.value })} rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none resize-y font-sans" placeholder={t('library.descPlaceholder')} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 border-white/10" onClick={() => setEditingLocalBook(null)}>{t('app.cancel')}</Button>
              <Button className="flex-1 font-bold" onClick={saveLocalBookEdit}>{t('app.save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CreateCollectionDialog />
      <EditCollectionDialog />
    </>
  );
}
