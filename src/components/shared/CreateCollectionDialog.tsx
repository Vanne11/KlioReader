import { useState } from 'react';
import { FolderOpen, Layers, Search, X, ImagePlus } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCollectionsStore } from '@/stores/collectionsStore';
import { useCollections } from '@/hooks/useCollections';
import { CoverSearchDialog } from './CoverSearchDialog';
import type { CollectionType } from '@/types';

export function CreateCollectionDialog() {
  const showCreateDialog = useCollectionsStore(s => s.showCreateDialog);
  const { setShowCreateDialog } = useCollectionsStore();
  const { createLocalSaga, createLocalCollection, createCloudCollection } = useCollections();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<CollectionType>('collection');
  const [mode, setMode] = useState<'local' | 'cloud'>('local');
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [coverBase64, setCoverBase64] = useState<string | null>(null);
  const [showCoverSearch, setShowCoverSearch] = useState(false);

  const reset = () => {
    setName('');
    setDescription('');
    setType('collection');
    setMode('local');
    setSelectedBookIds([]);
    setCoverBase64(null);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;

    if (mode === 'local') {
      if (type === 'saga') {
        await createLocalSaga(name.trim(), selectedBookIds);
      } else {
        createLocalCollection(name.trim(), description.trim() || undefined, coverBase64 || undefined);
      }
    } else {
      await createCloudCollection(name.trim(), type, description.trim() || undefined, coverBase64 || undefined);
    }

    reset();
    setShowCreateDialog(false);
  };

  return (
    <>
      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) { reset(); setShowCreateDialog(false); } }}>
        <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
          <DialogHeader><DialogTitle>Crear colección</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            {/* Modo: Local / Nube */}
            <div className="flex bg-white/5 rounded-lg p-1">
              <Button variant={mode === 'local' ? 'secondary' : 'ghost'} className="flex-1 text-xs" onClick={() => setMode('local')}>Local</Button>
              <Button variant={mode === 'cloud' ? 'secondary' : 'ghost'} className="flex-1 text-xs" onClick={() => setMode('cloud')}>Nube</Button>
            </div>

            {/* Tipo: Saga / Colección */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={`p-3 rounded-lg border text-left transition-all ${type === 'saga' ? 'border-primary bg-primary/10' : 'border-white/10 hover:border-white/20'}`}
                  onClick={() => setType('saga')}
                >
                  <FolderOpen className={`w-5 h-5 mb-1 ${type === 'saga' ? 'text-primary' : 'opacity-50'}`} />
                  <p className="text-xs font-bold">Saga</p>
                  <p className="text-[10px] opacity-40 mt-0.5">
                    {mode === 'local' ? 'Crea una carpeta y mueve archivos' : 'Agrupa libros como serie'}
                  </p>
                </button>
                <button
                  className={`p-3 rounded-lg border text-left transition-all ${type === 'collection' ? 'border-primary bg-primary/10' : 'border-white/10 hover:border-white/20'}`}
                  onClick={() => setType('collection')}
                >
                  <Layers className={`w-5 h-5 mb-1 ${type === 'collection' ? 'text-primary' : 'opacity-50'}`} />
                  <p className="text-xs font-bold">Colección</p>
                  <p className="text-[10px] opacity-40 mt-0.5">Agrupamiento virtual, no mueve archivos</p>
                </button>
              </div>
            </div>

            {/* Nombre */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Nombre</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={type === 'saga' ? 'Ej: Harry Potter' : 'Ej: Favoritos'}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none"
              />
            </div>

            {/* Descripción */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Descripción (opcional)</label>
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
              <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Portada (opcional)</label>
              {coverBase64 ? (
                <div className="flex items-start gap-3">
                  <div className="w-16 aspect-[2/3] rounded-lg overflow-hidden border border-white/10 bg-black/40 shrink-0">
                    <img src={coverBase64} alt="Portada" className="w-full h-full object-cover" />
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
              <Button variant="outline" className="flex-1 border-white/10" onClick={() => { reset(); setShowCreateDialog(false); }}>Cancelar</Button>
              <Button className="flex-1 font-bold" disabled={!name.trim()} onClick={handleCreate}>Crear</Button>
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
