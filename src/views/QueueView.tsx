import {
  ListOrdered, CloudUpload, RefreshCw, BarChart3, Tag,
  Layers, CheckCircle2, X, Trash2, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCloudStore } from '@/stores/cloudStore';
import { removeFromQueue, clearQueue } from '@/lib/syncQueue';
import type { SyncOpType } from '@/lib/syncQueue';
import { useT } from '@/i18n';

const TYPE_ICONS: Record<SyncOpType, typeof CloudUpload> = {
  upload_book: CloudUpload,
  sync_progress: RefreshCw,
  sync_stats: BarChart3,
  sync_title: Tag,
  sync_collections: Layers,
};

const TYPE_COLORS: Record<SyncOpType, string> = {
  upload_book: 'text-blue-400',
  sync_progress: 'text-green-400',
  sync_stats: 'text-purple-400',
  sync_title: 'text-amber-400',
  sync_collections: 'text-cyan-400',
};

function getTypeLabel(t: (key: string, vars?: Record<string, string | number>) => string, type: SyncOpType, payload: any): string {
  switch (type) {
    case 'upload_book':
      return t('queue.uploadBook', { title: payload.title || payload.bookPath?.split('/').pop() || '?' });
    case 'sync_progress':
      return t('queue.syncProgress');
    case 'sync_stats':
      return t('queue.syncStats');
    case 'sync_title':
      return t('queue.syncTitle');
    case 'sync_collections':
      return t('queue.syncCollections');
    default:
      return type;
  }
}

function timeAgo(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function QueueView() {
  const { t } = useT();
  const queueItems = useCloudStore(s => s.queueItems);
  const processingId = useCloudStore(s => s.queueProcessingId);

  const handleRemove = (id: string) => {
    removeFromQueue(id);
  };

  const handleClearAll = () => {
    if (confirm(t('queue.clearConfirm'))) {
      clearQueue();
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="max-w-2xl mx-auto p-4 md:p-12 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <ListOrdered className="w-7 h-7 text-orange-400" />
          <h2 className="text-2xl font-bold">{t('queue.title')}</h2>
        </div>

        {queueItems.length === 0 ? (
          /* Cola vacía */
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-500/40" />
            <div>
              <p className="text-lg font-semibold text-white/80">{t('queue.empty')}</p>
              <p className="text-sm text-white/40">{t('queue.emptyDesc')}</p>
            </div>
          </div>
        ) : (
          /* Lista de items */
          <div className="space-y-3">
            {queueItems.map((op) => {
              const Icon = TYPE_ICONS[op.type] || Layers;
              const isProcessing = processingId === op.id;
              return (
                <Card key={op.id} className="p-4 bg-white/[0.03] border-white/5 flex items-center gap-4">
                  {/* Icono */}
                  <div className={`flex-shrink-0 ${TYPE_COLORS[op.type] || 'text-white/50'}`}>
                    {isProcessing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>

                  {/* Descripción */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {getTypeLabel(t, op.type, op.payload)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {isProcessing && (
                        <Badge variant="outline" className="text-[10px] border-blue-500/50 text-blue-400">
                          {t('queue.processing')}
                        </Badge>
                      )}
                      {op.retries > 0 && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-400">
                          {t('queue.retries', { count: op.retries })}
                        </Badge>
                      )}
                      <span className="text-[10px] text-white/30">{timeAgo(op.createdAt)}</span>
                    </div>
                  </div>

                  {/* Botón cancelar */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white/30 hover:text-red-400 flex-shrink-0"
                        onClick={() => handleRemove(op.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('queue.removeTooltip')}</TooltipContent>
                  </Tooltip>
                </Card>
              );
            })}

            {/* Botón vaciar cola */}
            {queueItems.length >= 2 && (
              <div className="pt-4 flex justify-center">
                <Button variant="outline" size="sm" className="text-xs border-white/10 text-red-400 hover:text-red-300" onClick={handleClearAll}>
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  {t('queue.clearAll')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
