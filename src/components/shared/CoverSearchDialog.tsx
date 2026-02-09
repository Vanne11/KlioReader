import { useState, useRef } from 'react';
import { Search, Upload, Loader2, ImageOff } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { searchOpenLibraryCovers, imageUrlToBase64, fileToBase64 } from '@/lib/imageUtils';
import type { CoverSearchResult } from '@/lib/imageUtils';

interface CoverSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (base64: string) => void;
  initialQuery?: string;
}

export function CoverSearchDialog({ open, onOpenChange, onSelect, initialQuery = '' }: CoverSearchDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CoverSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    setResults([]);
    try {
      const res = await searchOpenLibraryCovers(query);
      setResults(res);
      if (res.length === 0) setError('No se encontraron portadas');
    } catch {
      setError('Error al buscar. Intenta de nuevo.');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectCover = async (cover: CoverSearchResult) => {
    setDownloading(cover.coverId);
    try {
      const base64 = await imageUrlToBase64(cover.coverUrlL);
      onSelect(base64);
      onOpenChange(false);
    } catch {
      setError('Error al descargar la imagen');
    } finally {
      setDownloading(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      onSelect(base64);
      onOpenChange(false);
    } catch {
      setError('Error al procesar la imagen');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-[#16161e] border-white/10 text-white max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>Buscar portada</DialogTitle></DialogHeader>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Buscar en Open Library..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:border-primary outline-none"
            />
          </div>
          <Button onClick={handleSearch} disabled={searching || !query.trim()} className="gap-1.5 font-bold">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0 max-h-[50vh]">
          {error && (
            <div className="text-center py-8 opacity-50">
              <ImageOff className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-1">
              {results.map(cover => (
                <button
                  key={cover.coverId}
                  className="group relative aspect-[2/3] rounded-lg overflow-hidden border border-white/10 hover:border-primary/50 transition-all hover:scale-[1.03] bg-black/40"
                  onClick={() => handleSelectCover(cover)}
                  disabled={downloading !== null}
                >
                  <img
                    src={cover.coverUrlM}
                    alt={cover.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {downloading === cover.coverId && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[9px] font-bold line-clamp-2 leading-tight">{cover.title}</p>
                    <p className="text-[8px] opacity-60 line-clamp-1">{cover.author}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!searching && results.length === 0 && !error && (
            <div className="text-center py-12 opacity-30">
              <Search className="w-10 h-10 mx-auto mb-3" />
              <p className="text-sm">Busca una portada por título o saga</p>
            </div>
          )}
        </ScrollArea>

        <div className="flex gap-2 pt-2 border-t border-white/5">
          <Button variant="outline" className="flex-1 gap-1.5 border-white/10" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4" /> Subir imagen
          </Button>
          <Button variant="outline" className="flex-1 border-white/10" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
