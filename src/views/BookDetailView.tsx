import { BookOpen, ChevronLeft, Play, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useReaderStore } from '@/stores/readerStore';
import { useReader } from '@/hooks/useReader';
import { coverSrc } from '@/lib/utils';

export function BookDetailView() {
  const selectedBook = useReaderStore(s => s.selectedBook);
  const { setSelectedBook } = useReaderStore();
  const { readBook } = useReader();

  if (!selectedBook) return null;

  return (
    <div className="flex flex-col h-screen bg-[#0f0f14] text-white font-sans overflow-hidden relative">
      <div className="absolute inset-0 opacity-20 pointer-events-none overflow-hidden">
        {selectedBook.cover && (
          <img src={coverSrc(selectedBook.cover)} className="w-full h-full object-cover blur-[100px] scale-150" alt="" />
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
          <Button onClick={() => readBook(selectedBook)} className="gap-3 bg-primary hover:bg-primary/90 text-primary-foreground font-black px-10 py-6 rounded-full shadow-[0_10px_30px_rgba(var(--primary),0.3)] hover:scale-105 transition-all active:scale-95">
            <Play className="w-5 h-5 fill-current" />
            <span className="tracking-widest uppercase">Leer Libro</span>
          </Button>
        </div>
      </header>
      <ScrollArea className="flex-1 z-10">
        <div className="max-w-6xl mx-auto px-12 py-16">
          <div className="flex flex-col lg:flex-row gap-20 items-start">
            <div className="w-full lg:w-[400px] shrink-0 mx-auto lg:mx-0">
              <div className="relative group">
                <div className="absolute -inset-4 bg-primary/20 rounded-[2rem] blur-2xl opacity-0 group-hover:opacity-100 transition-duration-700" />
                <div className="relative aspect-[3/4.5] rounded-2xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] border border-white/10 bg-black/40">
                  {selectedBook.cover ? (
                    <img src={coverSrc(selectedBook.cover)} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" alt={selectedBook.title} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-10"><BookOpen className="w-32 h-32" /></div>
                  )}
                </div>
              </div>
              <div className="mt-12 space-y-6 bg-white/5 p-8 rounded-2xl border border-white/5 backdrop-blur-md">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Tu Progreso</p>
                    <p className="text-2xl font-black">{selectedBook.progress}%</p>
                  </div>
                  <Badge variant="outline" className="border-primary/30 text-primary text-[10px] px-3 py-1 font-bold">{selectedBook.type.toUpperCase()}</Badge>
                </div>
                <Progress value={selectedBook.progress} className="h-2.5 bg-white/5" indicatorClassName="bg-gradient-to-r from-amber-600 to-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.4)]" />
                <div className="flex justify-between text-[10px] font-bold opacity-30 uppercase tracking-tighter">
                  <span>{selectedBook.currentChapter} {selectedBook.type === 'pdf' ? 'páginas' : 'capítulos'} leídos</span>
                  <span>{selectedBook.total_chapters} total</span>
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-12">
              <div className="space-y-4">
                <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-none px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase">Información del libro</Badge>
                <h1 className="text-5xl lg:text-7xl font-black leading-[1.1] tracking-tight text-white drop-shadow-2xl">{selectedBook.title}</h1>
                <div className="flex items-center gap-4 pt-2">
                  <div className="w-12 h-0.5 bg-primary/50" />
                  <p className="text-2xl font-medium italic text-primary/80 tracking-tight">{selectedBook.author}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                <div className="space-y-1"><p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Formato</p><p className="text-lg font-bold uppercase">{selectedBook.type}</p></div>
                <div className="space-y-1"><p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Extensión</p><p className="text-lg font-bold">{selectedBook.total_chapters} {selectedBook.type === 'pdf' ? 'Páginas' : 'Capítulos'}</p></div>
                <div className="space-y-1"><p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Última vez</p><p className="text-lg font-bold truncate">{selectedBook.lastRead}</p></div>
              </div>
              <Separator className="opacity-10" />
              <div className="space-y-6">
                <div className="flex items-center gap-3"><List className="w-5 h-5 text-primary/60" /><h3 className="text-sm font-black uppercase tracking-[0.2em] opacity-50">Sinopsis</h3></div>
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
