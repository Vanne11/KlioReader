import { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sidebar } from './Sidebar';
import { useUIStore } from '@/stores/uiStore';
import { useIsMobile } from '@/hooks/useIsMobile';

export function AppShell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const sidebarOpen = useUIStore(s => s.sidebarOpen);
  const setSidebarOpen = useUIStore(s => s.setSidebarOpen);

  return (
    <div className="flex h-screen bg-[#0f0f14] text-white font-sans overflow-hidden">
      {isMobile ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="fixed top-3 left-3 z-40 h-10 w-10 bg-[#16161e]/80 backdrop-blur-md border border-white/10 shadow-lg"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          {sidebarOpen && (
            <>
              <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setSidebarOpen(false)} />
              <div className="fixed inset-y-0 left-0 z-50 w-64">
                <Sidebar onClose={() => setSidebarOpen(false)} />
              </div>
            </>
          )}
        </>
      ) : (
        <Sidebar />
      )}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#16161e]/30">
        {children}
      </main>
    </div>
  );
}
