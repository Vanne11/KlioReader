import { useState, useEffect } from 'react';
import { Search, X, ImagePlus } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCollectionsStore } from '@/stores/collectionsStore';
import { useCollections } from '@/hooks/useCollections';
import { CoverSearchDialog } from './CoverSearchDialog';
import { coverSrc } from '@/lib/utils';

export function EditCollectionDialog() {
  const editingCollection = useCollectionsStore(s => s.editingCollection);
  const { setEditingCollection } = useCollectionsStore();
  const { updateLocalCollection } = useCollections();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverBase64, setCoverBase64] = useState<string | null>(null);
  const [showCoverSearch, setShowCoverSearch] = useState(false);

  useEffect(() => {
    if (editingCollection) {
      setName(editingCollection.name);
      setDescription(editingCollection.description || '');
      setCoverBase64(editingCollection.coverBase64);
    }
  }, [editingCollection]);

  const handleSave = () => {
    if (!editingCollection || !name.trim()) return;
    updateLocalCollection(editingCollection.id, {
      name: name.trim(),
      description: description.trim() || null,
      coverBase64,
    });
    setEditingCollection(null);
  };

  const handleClose = () => {
    setEditingCollection(null);
  };

  const displayCover = coverBase64 ? coverSrc(coverBase64) : undefined;

  return (
    <>
      <Dialog open={!!editingCollection} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
          <DialogHeader><DialogTitle>Editar colección</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            {/* Nombre */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Nombre</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none"
              />
            </div>

            {/* Descripción */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Descripción</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none resize-y font-sans"
                placeholder="Descripción breve..."
              />
            </div>

            {/* Portada */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Portada</label>
              {displayCover ? (
                <div className="flex items-start gap-3">
                  <div className="w-16 aspect-[2/3] rounded-lg overflow-hidden border border-white/10 bg-black/40 shrink-0">
                    <img src={displayCover} alt="Portada" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col gap-1.5 pt-1">
                    <Button variant="outline" size="sm" className="text-xs border-white/10 gap-1.5 h-7" onClick={() => setShowCoverSearch(true)}>
                      <Search className="w-3 h-3" /> Cambiar
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 gap-1.5 h-7" onClick={() => setCoverBase64(null)}>
                      <X className="w-3 h-3" /> Quitar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full border-white/10 border-dashed gap-2 h-12 text-xs opacity-60 hover:opacity-100"
                  onClick={() => setShowCoverSearch(true)}
                >
                  <ImagePlus className="w-4 h-4" /> Buscar portada
                </Button>
              )}
            </div>

            {/* Botones */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 border-white/10" onClick={handleClose}>Cancelar</Button>
              <Button className="flex-1 font-bold" disabled={!name.trim()} onClick={handleSave}>Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CoverSearchDialog
        open={showCoverSearch}
        onOpenChange={setShowCoverSearch}
        onSelect={setCoverBase64}
        initialQuery={name}
      />
    </>
  );
}
