import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, Copy, X } from 'lucide-react';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  return (
    <div className="h-8 flex items-center justify-between bg-[#0f0f14] border-b border-white/5 select-none shrink-0">
      <div
        className="flex-1 h-full flex items-center px-3 cursor-default"
        data-tauri-drag-region
        onDoubleClick={() => appWindow.toggleMaximize()}
      >
        <span className="text-[11px] font-semibold text-white/50 pointer-events-none" data-tauri-drag-region>
          KlioReader
        </span>
      </div>
      <div className="flex h-full">
        <button
          onClick={() => appWindow.minimize()}
          className="h-full w-11 flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="h-full w-11 flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-colors"
        >
          {isMaximized ? <Copy className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => appWindow.close()}
          className="h-full w-11 flex items-center justify-center text-white/50 hover:bg-red-600 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
