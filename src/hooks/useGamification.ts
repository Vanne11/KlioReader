import { useEffect, useRef } from 'react';
import { useGamificationStore } from '@/stores/gamificationStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { useUIStore } from '@/stores/uiStore';
import { BADGES, getUnlockedBadges, statsToApi } from '@/lib/gamification';
import * as api from '@/lib/api';
import * as syncQueue from '@/lib/syncQueue';
import { getCloudSyncingRef } from './useCloudBooks';

export function useGamification() {
  const stats = useGamificationStore(s => s.stats);
  const selectedTitleId = useGamificationStore(s => s.selectedTitleId);
  const socialStats = useGamificationStore(s => s.socialStats);
  const books = useLibraryStore(s => s.books);
  const { showAlert } = useUIStore();
  const initialRenderRef = useRef(true);

  // Persist stats
  useEffect(() => {
    localStorage.setItem("userStats", JSON.stringify(stats));
    if (initialRenderRef.current || getCloudSyncingRef()) return;
    if (api.isLoggedIn()) {
      syncQueue.enqueue('sync_stats', statsToApi(stats));
    }
  }, [stats]);

  // Persist selected title
  useEffect(() => {
    if (selectedTitleId) localStorage.setItem('klioSelectedTitle', selectedTitleId);
    else localStorage.removeItem('klioSelectedTitle');
    if (initialRenderRef.current || getCloudSyncingRef()) return;
    if (api.isLoggedIn()) {
      syncQueue.enqueue('sync_title', { selected_title_id: selectedTitleId });
    }
  }, [selectedTitleId]);

  // Mark initial render done
  useEffect(() => { initialRenderRef.current = false; }, []);

  // Detect new badges
  useEffect(() => {
    const booksForBadges = books.map(b => ({ progress: b.progress }));
    const currentUnlocked = getUnlockedBadges(stats, booksForBadges, socialStats ?? undefined).map(b => b.id);
    const savedRaw = localStorage.getItem('klioUnlockedBadges');
    const previousIds: string[] = savedRaw ? JSON.parse(savedRaw) : [];
    const newBadges = currentUnlocked.filter(id => !previousIds.includes(id));
    if (newBadges.length > 0 && previousIds.length > 0 && !initialRenderRef.current) {
      const badge = BADGES.find(b => b.id === newBadges[0]);
      if (badge) showAlert('success', '¡Nueva Insignia!', `🏆 ${badge.name} — ${badge.description}`);
    }
    const allKnown = [...new Set([...previousIds, ...currentUnlocked])];
    if (allKnown.length !== previousIds.length) {
      localStorage.setItem('klioUnlockedBadges', JSON.stringify(allKnown));
    }
  }, [stats, books, socialStats]);
}
