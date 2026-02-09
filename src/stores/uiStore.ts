import { create } from 'zustand';

interface AlertModal {
  title: string;
  message: string;
  type: 'error' | 'success' | 'info';
}

interface UIState {
  activeTab: string;
  alertModal: AlertModal | null;

  setActiveTab: (tab: string) => void;
  setAlertModal: (modal: AlertModal | null) => void;
  showAlert: (type: 'error' | 'success' | 'info', title: string, message: string) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  activeTab: 'library',
  alertModal: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setAlertModal: (modal) => set({ alertModal: modal }),
  showAlert: (type, title, message) => set({ alertModal: { title, message, type } }),
}));
