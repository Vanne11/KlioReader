import { TooltipProvider } from "@/components/ui/tooltip";
import { useReaderStore } from '@/stores/readerStore';
import { useUIStore } from '@/stores/uiStore';
import { usePersistence } from '@/hooks/usePersistence';
import { useSyncQueue } from '@/hooks/useSyncQueue';
import { useGamification } from '@/hooks/useGamification';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePlatform } from '@/hooks/usePlatform';
import { ReaderView } from '@/views/ReaderView';
import { BookDetailView } from '@/views/BookDetailView';
import { LibraryView } from '@/views/LibraryView';
import { CloudView } from '@/views/CloudView';
import { GamificationView } from '@/views/GamificationView';
import { SettingsView } from '@/views/SettingsView';
import { QueueView } from '@/views/QueueView';
import { AppShell } from '@/components/layout/AppShell';
import { TitleBar } from '@/components/layout/TitleBar';
import { AlertModal } from '@/components/shared/AlertModal';
import { BadgeToast } from '@/components/shared/BadgeToast';
import { LanguageModal } from '@/components/shared/LanguageModal';
import "./App.css";

function App() {
  usePersistence();
  useSyncQueue();
  useGamification();
  useIsMobile();

  const { isDesktop } = usePlatform();
  const activeTab = useUIStore(s => s.activeTab);
  const currentBook = useReaderStore(s => s.currentBook);
  const selectedBook = useReaderStore(s => s.selectedBook);
  const isFullscreen = useReaderStore(s => s.isFullscreen);

  const showTitleBar = isDesktop && !isFullscreen;

  if (currentBook) {
    return (
      <div className="flex flex-col h-screen bg-[#0f0f14]">
        {showTitleBar && <TitleBar />}
        <div className="flex-1 overflow-hidden">
          <TooltipProvider>
            <ReaderView />
            <AlertModal />
            <BadgeToast />
            <LanguageModal />
          </TooltipProvider>
        </div>
      </div>
    );
  }

  if (selectedBook) {
    return (
      <div className="flex flex-col h-screen bg-[#0f0f14]">
        {showTitleBar && <TitleBar />}
        <div className="flex-1 overflow-hidden">
          <TooltipProvider>
            <BookDetailView />
            <AlertModal />
            <BadgeToast />
            <LanguageModal />
          </TooltipProvider>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0f0f14]">
      {showTitleBar && <TitleBar />}
      <div className="flex-1 overflow-hidden">
        <TooltipProvider>
          <AppShell>
            {activeTab === 'library' && <LibraryView />}
            {activeTab === 'cloud' && <CloudView />}
            {activeTab === 'gamification' && <GamificationView />}
            {activeTab === 'queue' && <QueueView />}
            {activeTab === 'settings' && <SettingsView />}
          </AppShell>
          <AlertModal />
          <LanguageModal />
        </TooltipProvider>
      </div>
    </div>
  );
}

export default App;
