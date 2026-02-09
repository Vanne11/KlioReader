import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useI18nStore, detectLocale } from '@/i18n';
import type { Locale } from '@/i18n';

export function LanguageModal() {
  const hasChosen = localStorage.getItem('klioLocale') !== null;
  const { setLocale } = useI18nStore();
  const detected = detectLocale();

  if (hasChosen) return null;

  const choose = (locale: Locale) => {
    setLocale(locale);
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[360px] bg-[#16161e] border-white/10 text-white" onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
        <div className="flex flex-col items-center text-center py-6 space-y-6">
          <div className="text-4xl">🌐</div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold">Select your language</h2>
            <p className="text-xs opacity-50">Selecciona tu idioma</p>
          </div>
          <div className="flex gap-3 w-full">
            <button
              className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border transition-all hover:scale-105 ${detected === 'es' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'}`}
              onClick={() => choose('es')}
            >
              <span className="text-2xl">🇪🇸</span>
              <span className="text-sm font-bold">Español</span>
            </button>
            <button
              className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border transition-all hover:scale-105 ${detected === 'en' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'}`}
              onClick={() => choose('en')}
            >
              <span className="text-2xl">🇬🇧</span>
              <span className="text-sm font-bold">English</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
