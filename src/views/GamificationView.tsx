import { BookOpen, Trophy, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useGamificationStore } from '@/stores/gamificationStore';
import { useLibraryStore } from '@/stores/libraryStore';
import {
  BADGES, RARITY_CONFIG, CATEGORY_CONFIG,
  getAllBadgesWithStatus, getUserTitle, getBadgeImageUrl, xpForNextLevel,
} from '@/lib/gamification';
import type { BadgeCategory } from '@/types';

export function GamificationView() {
  const stats = useGamificationStore(s => s.stats);
  const selectedTitleId = useGamificationStore(s => s.selectedTitleId);
  const badgeFilter = useGamificationStore(s => s.badgeFilter);
  const selectedBadgeDetail = useGamificationStore(s => s.selectedBadgeDetail);
  const { setSelectedTitleId, setBadgeFilter, setSelectedBadgeDetail } = useGamificationStore();
  const socialStats = useGamificationStore(s => s.socialStats);
  const books = useLibraryStore(s => s.books);

  const booksForBadges = books.map(b => ({ progress: b.progress }));
  const allBadges = getAllBadgesWithStatus(stats, booksForBadges, socialStats ?? undefined);
  const unlockedCount = allBadges.filter(b => b.unlocked).length;
  const userTitle = getUserTitle(stats, booksForBadges, selectedTitleId, socialStats ?? undefined);
  const nextLevelXp = xpForNextLevel(stats.level);
  const xpProgress = Math.min(100, (stats.xp / nextLevelXp) * 100);
  const filteredBadges = badgeFilter === 'all' ? allBadges : allBadges.filter(b => b.category === badgeFilter);
  const completedBooks = books.filter(b => b.progress >= 100).length;

  return (
    <ScrollArea className="flex-1">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-4">
            {userTitle && (
              <img src={getBadgeImageUrl(userTitle.id)} alt={userTitle.name} className="w-16 h-16 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <div>
              <h2 className="text-3xl font-black">Nivel {stats.level}</h2>
              {userTitle && <p className={`text-sm font-bold italic ${RARITY_CONFIG[userTitle.rarity].text}`}>"{userTitle.name}"</p>}
            </div>
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <Progress value={xpProgress} className="h-3 bg-white/10" indicatorClassName="bg-gradient-to-r from-amber-600 to-amber-400" />
            <p className="text-xs opacity-50">{stats.xp} / {nextLevelXp} XP para el siguiente nivel</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-white/5 border-white/5 p-4 text-center"><Flame className="w-6 h-6 text-orange-400 mx-auto mb-1" /><div className="text-xl font-black">{stats.streak}</div><div className="text-[9px] opacity-50 uppercase tracking-widest">Racha</div></Card>
          <Card className="bg-white/5 border-white/5 p-4 text-center"><BookOpen className="w-6 h-6 text-primary mx-auto mb-1" /><div className="text-xl font-black">{completedBooks}</div><div className="text-[9px] opacity-50 uppercase tracking-widest">Leídos</div></Card>
          <Card className="bg-white/5 border-white/5 p-4 text-center"><Trophy className="w-6 h-6 text-yellow-500 mx-auto mb-1" /><div className="text-xl font-black">{stats.xp}</div><div className="text-[9px] opacity-50 uppercase tracking-widest">XP</div></Card>
          <Card className="bg-white/5 border-white/5 p-4 text-center"><div className="text-lg mx-auto mb-1">🏅</div><div className="text-xl font-black">{unlockedCount}/{BADGES.length}</div><div className="text-[9px] opacity-50 uppercase tracking-widest">Logros</div></Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black uppercase tracking-tight">Insignias</h3>
            <span className="text-xs opacity-50 font-bold">{unlockedCount}/{BADGES.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={badgeFilter === 'all' ? 'secondary' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setBadgeFilter('all')}>Todas</Button>
            {(Object.keys(CATEGORY_CONFIG) as BadgeCategory[]).map(cat => (
              <Button key={cat} variant={badgeFilter === cat ? 'secondary' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setBadgeFilter(cat)}>
                {CATEGORY_CONFIG[cat].emoji} {CATEGORY_CONFIG[cat].label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {filteredBadges.map(badge => {
              const rc = RARITY_CONFIG[badge.rarity];
              return (
                <button key={badge.id} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all cursor-pointer hover:scale-105 ${badge.unlocked ? `${rc.border} ${rc.bg} shadow-lg ${rc.glow}` : 'border-white/5 bg-white/[0.02] opacity-50'}`} onClick={() => setSelectedBadgeDetail(badge)}>
                  <div className="w-12 h-12 flex items-center justify-center">
                    <img src={getBadgeImageUrl(badge.id)} alt={badge.unlocked ? badge.name : '???'} className={`w-full h-full object-contain ${badge.unlocked ? '' : 'grayscale opacity-30 blur-[1px]'}`} onError={e => { const el = e.target as HTMLImageElement; el.style.display = 'none'; const parent = el.parentElement; if (parent && !parent.querySelector('.badge-fallback')) { const fb = document.createElement('span'); fb.className = 'badge-fallback text-2xl'; fb.textContent = badge.unlocked ? CATEGORY_CONFIG[badge.category].emoji : '❓'; parent.appendChild(fb); } }} />
                  </div>
                  <span className={`text-[9px] font-bold text-center leading-tight truncate w-full ${badge.unlocked ? '' : 'opacity-40'}`}>{badge.unlocked ? badge.name : '???'}</span>
                  <span className={`text-[8px] font-bold ${badge.unlocked ? rc.text : 'opacity-30'}`}>⬥ {RARITY_CONFIG[badge.rarity].label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={!!selectedBadgeDetail} onOpenChange={(open) => { if (!open) setSelectedBadgeDetail(null); }}>
        <DialogContent className="sm:max-w-[380px] bg-[#16161e] border-white/10 text-white">
          {selectedBadgeDetail && (() => {
            const rc = RARITY_CONFIG[selectedBadgeDetail.rarity];
            return (
              <div className="flex flex-col items-center text-center py-4 space-y-4">
                <div className={`w-24 h-24 flex items-center justify-center rounded-2xl ${selectedBadgeDetail.unlocked ? `${rc.bg} border-2 ${rc.border}` : 'bg-white/5 border border-white/10'}`}>
                  <img src={getBadgeImageUrl(selectedBadgeDetail.id)} alt={selectedBadgeDetail.name} className={`w-20 h-20 object-contain ${selectedBadgeDetail.unlocked ? '' : 'grayscale opacity-30 blur-[1px]'}`} onError={e => { const el = e.target as HTMLImageElement; el.style.display = 'none'; const parent = el.parentElement; if (parent && !parent.querySelector('.badge-fallback')) { const fb = document.createElement('span'); fb.className = 'badge-fallback text-5xl'; fb.textContent = selectedBadgeDetail.unlocked ? CATEGORY_CONFIG[selectedBadgeDetail.category].emoji : '🔒'; parent.appendChild(fb); } }} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black">{selectedBadgeDetail.unlocked ? selectedBadgeDetail.name : 'Insignia Bloqueada'}</h3>
                  <Badge className={`${rc.bg} ${rc.text} border ${rc.border} text-[10px]`}>⬥ {RARITY_CONFIG[selectedBadgeDetail.rarity].label}</Badge>
                </div>
                <p className="text-sm opacity-70">{selectedBadgeDetail.unlocked ? selectedBadgeDetail.description : `Pista: ${selectedBadgeDetail.description}`}</p>
                <div className="flex items-center gap-2 text-[10px] opacity-40">
                  <span>{CATEGORY_CONFIG[selectedBadgeDetail.category].emoji}</span>
                  <span>{CATEGORY_CONFIG[selectedBadgeDetail.category].label}</span>
                </div>
                {selectedBadgeDetail.unlocked && (
                  <Button size="sm" className="w-full text-xs font-bold" variant={selectedTitleId === selectedBadgeDetail.id ? 'secondary' : 'default'} onClick={() => { setSelectedTitleId(selectedTitleId === selectedBadgeDetail.id ? null : selectedBadgeDetail.id); setSelectedBadgeDetail(null); }}>
                    {selectedTitleId === selectedBadgeDetail.id ? '✓ Título Activo' : 'Usar como Título'}
                  </Button>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
