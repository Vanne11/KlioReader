import { create } from 'zustand';
import type { ReadingRace, RaceLeaderboardResponse, ReadingChallenge, SharedNote, SocialStats } from '@/types';

interface SocialState {
  races: ReadingRace[];
  currentLeaderboard: RaceLeaderboardResponse | null;
  challenges: ReadingChallenge[];
  pendingChallengesCount: number;
  socialStats: SocialStats | null;
  sharedNotes: SharedNote[];
  challengeTab: 'pending' | 'active' | 'history';

  setRaces: (races: ReadingRace[]) => void;
  setCurrentLeaderboard: (lb: RaceLeaderboardResponse | null) => void;
  setChallenges: (challenges: ReadingChallenge[] | ((prev: ReadingChallenge[]) => ReadingChallenge[])) => void;
  setPendingChallengesCount: (count: number) => void;
  setSocialStats: (stats: SocialStats | null) => void;
  setSharedNotes: (notes: SharedNote[]) => void;
  setChallengeTab: (tab: 'pending' | 'active' | 'history') => void;
}

export const useSocialStore = create<SocialState>()((set) => ({
  races: [],
  currentLeaderboard: null,
  challenges: [],
  pendingChallengesCount: 0,
  socialStats: null,
  sharedNotes: [],
  challengeTab: 'active',

  setRaces: (races) => set({ races }),
  setCurrentLeaderboard: (lb) => set({ currentLeaderboard: lb }),
  setChallenges: (challengesOrFn) => set((s) => ({
    challenges: typeof challengesOrFn === 'function' ? challengesOrFn(s.challenges) : challengesOrFn,
  })),
  setPendingChallengesCount: (count) => set({ pendingChallengesCount: count }),
  setSocialStats: (stats) => set({ socialStats: stats }),
  setSharedNotes: (notes) => set({ sharedNotes: notes }),
  setChallengeTab: (tab) => set({ challengeTab: tab }),
}));
