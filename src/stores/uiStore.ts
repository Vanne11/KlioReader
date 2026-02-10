import { create } from 'zustand';

interface AlertModal {
  title: string;
  message: string;
  type: 'error' | 'success' | 'info';
}

interface BadgeToast {
  badgeName: string;
  badgeEmoji: string;
}

interface UIState {
  activeTab: string;
  alertModal: AlertModal | null;
  sidebarOpen: boolean;
  badgeToast: BadgeToast | null;

  setActiveTab: (tab: string) => void;
  setAlertModal: (modal: AlertModal | null) => void;
  showAlert: (type: 'error' | 'success' | 'info', title: string, message: string) => void;
  setSidebarOpen: (open: boolean) => void;
  showBadgeToast: (badgeName: string, badgeEmoji: string) => void;
  clearBadgeToast: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  activeTab: 'library',
  alertModal: null,
  sidebarOpen: false,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setAlertModal: (modal) => set({ alertModal: modal }),
  showAlert: (type, title, message) => set({ alertModal: { title, message, type } }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  badgeToast: null,
  showBadgeToast: (badgeName, badgeEmoji) => set({ badgeToast: { badgeName, badgeEmoji } }),
  clearBadgeToast: () => set({ badgeToast: null }),
}));
