import { TooltipProvider } from "@/components/ui/tooltip";
import { useReaderStore } from '@/stores/readerStore';
import { useUIStore } from '@/stores/uiStore';
import { usePersistence } from '@/hooks/usePersistence';
import { useSyncQueue } from '@/hooks/useSyncQueue';
import { useGamification } from '@/hooks/useGamification';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ReaderView } from '@/views/ReaderView';
import { BookDetailView } from '@/views/BookDetailView';
import { LibraryView } from '@/views/LibraryView';
import { CloudView } from '@/views/CloudView';
import { GamificationView } from '@/views/GamificationView';
import { SettingsView } from '@/views/SettingsView';
import { AppShell } from '@/components/layout/AppShell';
import { AlertModal } from '@/components/shared/AlertModal';
import { LanguageModal } from '@/components/shared/LanguageModal';
import "./App.css";

function App() {
  usePersistence();
  useSyncQueue();
  useGamification();
  useIsMobile();

  const activeTab = useUIStore(s => s.activeTab);
  const currentBook = useReaderStore(s => s.currentBook);
  const selectedBook = useReaderStore(s => s.selectedBook);

  if (currentBook) {
    return (
      <TooltipProvider>
        <ReaderView />
        <AlertModal />
        <LanguageModal />
      </TooltipProvider>
    );
  }

  if (selectedBook) {
    return (
      <TooltipProvider>
        <BookDetailView />
        <AlertModal />
        <LanguageModal />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <AppShell>
        {activeTab === 'library' && <LibraryView />}
        {activeTab === 'cloud' && <CloudView />}
        {activeTab === 'gamification' && <GamificationView />}
        {activeTab === 'settings' && <SettingsView />}
      </AppShell>
      <AlertModal />
      <LanguageModal />
    </TooltipProvider>
  );
}

export default App;
