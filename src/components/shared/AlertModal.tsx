import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUIStore } from '@/stores/uiStore';

export function AlertModal() {
  const alertModal = useUIStore(s => s.alertModal);
  const setAlertModal = useUIStore(s => s.setAlertModal);

  return (
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
  );
}
