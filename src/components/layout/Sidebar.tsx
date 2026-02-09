import {
  BookOpen, Trophy, Library, Cloud, Settings2,
  LogIn, LogOut, User, Crown, X,
  RefreshCw, WifiOff, Check, HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useGamificationStore } from '@/stores/gamificationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSharesStore } from '@/stores/sharesStore';
import { useSocialStore } from '@/stores/socialStore';
import { useAuth } from '@/hooks/useAuth';
import { useShares } from '@/hooks/useShares';
import { getUserTitle, getBadgeImageUrl, RARITY_CONFIG } from '@/lib/gamification';

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const { activeTab, setActiveTab } = useUIStore();
  const authUser = useAuthStore(s => s.authUser);
  const profile = useAuthStore(s => s.profile);
  const books = useLibraryStore(s => s.books);
  const stats = useGamificationStore(s => s.stats);
  const selectedTitleId = useGamificationStore(s => s.selectedTitleId);
  const syncStatus = useSettingsStore(s => s.syncStatus);
  const storageConfigured = useSettingsStore(s => s.storageConfigured());
  const { setSettingsTab } = useSettingsStore();
  const pendingSharesCount = useSharesStore(s => s.pendingSharesCount);
  const pendingChallengesCount = useSocialStore(s => s.pendingChallengesCount);
  const socialStats = useGamificationStore(s => s.socialStats);
  const { handleLogout, loadProfile } = useAuth();
  const { loadPendingShares } = useShares();

  const booksForBadges = books.map(b => ({ progress: b.progress }));
  const userTitle = getUserTitle(stats, booksForBadges, selectedTitleId, socialStats ?? undefined);

  const navigate = (tab: string) => {
    setActiveTab(tab);
    onClose?.();
  };

  return (
    <aside className="w-64 border-r border-white/5 bg-[#16161e] flex flex-col h-full">
      <div className="p-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2 italic"><BookOpen className="w-7 h-7" /> KlioReader</h1>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={onClose}><X className="w-5 h-5" /></Button>
        )}
      </div>
      <nav className="flex-1 px-4 space-y-1">
        <Button variant={activeTab === "library" ? "secondary" : "ghost"} className="w-full justify-start gap-3" onClick={() => navigate("library")}><Library className="w-5 h-5 text-primary" /> Biblioteca</Button>
        <Button variant={activeTab === "cloud" ? "secondary" : "ghost"} className="w-full justify-start gap-3 relative" onClick={() => { navigate("cloud"); if (pendingSharesCount > 0) loadPendingShares(); }}>
          <Cloud className="w-5 h-5 text-blue-400" /> Nube
          {(pendingSharesCount + pendingChallengesCount) > 0 && <span className="absolute right-2 top-1/2 -translate-y-1/2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">{pendingSharesCount + pendingChallengesCount}</span>}
        </Button>
        <Button variant={activeTab === "gamification" ? "secondary" : "ghost"} className="w-full justify-start gap-3" onClick={() => navigate("gamification")}><Trophy className="w-5 h-5 text-yellow-500" /> Mi Progreso</Button>
        <Button variant={activeTab === "settings" ? "secondary" : "ghost"} className="w-full justify-start gap-3" onClick={() => navigate("settings")}><Settings2 className="w-5 h-5 text-zinc-400" /> Configuración</Button>
      </nav>
      <div className="p-6 mt-auto border-t border-white/5">
        {authUser ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80" onClick={() => loadProfile()}>
              <User className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold truncate">{authUser.username}</span>
              {profile?.is_subscriber ? (
                <Tooltip><TooltipTrigger asChild><Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" /></TooltipTrigger><TooltipContent>Suscriptor KlioReader Cloud</TooltipContent></Tooltip>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" className="w-full justify-start text-xs opacity-50" onClick={handleLogout}><LogOut className="w-3 h-3 mr-2" /> Cerrar Sesión</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="w-full text-xs border-white/10" onClick={() => navigate('cloud')}><LogIn className="w-3 h-3 mr-2" /> Iniciar Sesión</Button>
        )}
        {storageConfigured && (
          <div className="my-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`flex items-center gap-1.5 text-[10px] w-full px-2 py-1 rounded-md transition-colors ${
                    syncStatus.syncing
                      ? 'text-amber-400 bg-amber-400/10'
                      : syncStatus.error
                      ? 'text-red-400 bg-red-400/10'
                      : syncStatus.last_sync
                      ? 'text-green-400/60 hover:bg-white/5'
                      : 'text-white/30 hover:bg-white/5'
                  }`}
                  onClick={() => { navigate('settings'); setSettingsTab('storage'); }}
                >
                  {syncStatus.syncing ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : syncStatus.error ? (
                    <WifiOff className="w-3 h-3" />
                  ) : syncStatus.last_sync ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <HardDrive className="w-3 h-3" />
                  )}
                  <span className="truncate font-medium">
                    {syncStatus.syncing ? 'Sincronizando...' : syncStatus.error ? 'Error sync' : syncStatus.last_sync ? 'Sync OK' : 'Storage'}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {syncStatus.syncing ? 'Sincronización en curso...' : syncStatus.error ? `Error: ${syncStatus.error}` : syncStatus.last_sync ? `Último sync: ${new Date(syncStatus.last_sync).toLocaleString()}` : 'Storage de usuario configurado'}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        <Separator className="my-3 opacity-10" />
        <div className="space-y-1">
          <Badge variant="outline" className="border-accent text-accent font-bold">Nivel {stats.level}</Badge>
          {userTitle && (() => {
            const rc = RARITY_CONFIG[userTitle.rarity];
            return (
              <div className="flex items-center gap-1.5">
                <img src={getBadgeImageUrl(userTitle.id)} alt="" className="w-5 h-5 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <span className={`text-[10px] font-bold italic truncate ${rc.text}`}>"{userTitle.name}"</span>
              </div>
            );
          })()}
        </div>
        <Progress value={((stats.xp % 100) / 100) * 100} className="h-1 mt-2" indicatorClassName="bg-amber-400" />
      </div>
    </aside>
  );
}
