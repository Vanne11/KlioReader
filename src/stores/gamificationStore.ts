import { create } from 'zustand';
import type { BadgeCategory, BadgeWithStatus } from '@/types';
import { UserStats, INITIAL_STATS, calculateLevel } from '@/lib/gamification';

interface GamificationState {
  stats: UserStats;
  selectedTitleId: string | null;
  badgeFilter: 'all' | BadgeCategory;
  selectedBadgeDetail: BadgeWithStatus | null;

  setStats: (stats: UserStats | ((prev: UserStats) => UserStats)) => void;
  setSelectedTitleId: (id: string | null) => void;
  setBadgeFilter: (filter: 'all' | BadgeCategory) => void;
  setSelectedBadgeDetail: (badge: BadgeWithStatus | null) => void;
}

function loadStats(): UserStats {
  const saved = localStorage.getItem("userStats");
  if (!saved) return INITIAL_STATS;
  const parsed = JSON.parse(saved);
  const xp = Number(parsed.xp) || 0;
  return {
    xp,
    level: calculateLevel(xp),
    streak: Number(parsed.streak) || 0,
    lastReadDate: parsed.lastReadDate || null,
  };
}

export const useGamificationStore = create<GamificationState>()((set) => ({
  stats: loadStats(),
  selectedTitleId: localStorage.getItem('klioSelectedTitle'),
  badgeFilter: 'all',
  selectedBadgeDetail: null,

  setStats: (statsOrFn) => set((s) => ({
    stats: typeof statsOrFn === 'function' ? statsOrFn(s.stats) : statsOrFn,
  })),
  setSelectedTitleId: (id) => set({ selectedTitleId: id }),
  setBadgeFilter: (filter) => set({ badgeFilter: filter }),
  setSelectedBadgeDetail: (badge) => set({ selectedBadgeDetail: badge }),
}));
