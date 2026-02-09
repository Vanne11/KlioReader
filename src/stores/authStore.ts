import { create } from 'zustand';
import * as api from '@/lib/api';
import type { AuthUser, UserProfile } from '@/types';

interface AuthState {
  authUser: AuthUser | null;
  authMode: 'login' | 'register';
  authError: string;
  authLoading: boolean;
  showProfile: boolean;
  profile: UserProfile | null;
  profileForm: { username: string; email: string; password: string };
  showDeleteConfirm: boolean;

  setAuthUser: (user: AuthUser | null) => void;
  setAuthMode: (mode: 'login' | 'register') => void;
  setAuthError: (error: string) => void;
  setAuthLoading: (loading: boolean) => void;
  setShowProfile: (show: boolean) => void;
  setProfile: (profile: UserProfile | null) => void;
  setProfileForm: (form: { username: string; email: string; password: string }) => void;
  updateProfileForm: (patch: Partial<{ username: string; email: string; password: string }>) => void;
  setShowDeleteConfirm: (show: boolean) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  authUser: api.getStoredUser(),
  authMode: 'login',
  authError: '',
  authLoading: false,
  showProfile: false,
  profile: null,
  profileForm: { username: '', email: '', password: '' },
  showDeleteConfirm: false,

  setAuthUser: (user) => set({ authUser: user }),
  setAuthMode: (mode) => set({ authMode: mode }),
  setAuthError: (error) => set({ authError: error }),
  setAuthLoading: (loading) => set({ authLoading: loading }),
  setShowProfile: (show) => set({ showProfile: show }),
  setProfile: (profile) => set({ profile }),
  setProfileForm: (form) => set({ profileForm: form }),
  updateProfileForm: (patch) => set((s) => ({ profileForm: { ...s.profileForm, ...patch } })),
  setShowDeleteConfirm: (show) => set({ showDeleteConfirm: show }),
}));
