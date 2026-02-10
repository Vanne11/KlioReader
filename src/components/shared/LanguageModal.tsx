import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useI18nStore, detectLocale, useT } from '@/i18n';
import type { Locale } from '@/i18n';
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useLibraryStore } from '@/stores/libraryStore';
import { useLibrary } from '@/hooks/useLibrary';

export function LanguageModal() {
  const hasLocale = localStorage.getItem('klioLocale') !== null;
  const onboardingDone = localStorage.getItem('klioOnboardingDone') === 'true';

  const { setLocale } = useI18nStore();
  const { t } = useT();
  const detected = detectLocale();

  const [step, setStep] = useState<1 | 2>(1);
  const [done, setDone] = useState(hasLocale || onboardingDone);
  const [isMobile, setIsMobile] = useState(false);
  const [defaultPath, setDefaultPath] = useState<string | null>(null);

  const libraryPath = useLibraryStore(s => s.libraryPath);
  const { setLibraryPath } = useLibraryStore();
  const { scanLibrary } = useLibrary();

  useEffect(() => {
    invoke<boolean>("is_mobile_platform").then(m => setIsMobile(m)).catch(() => {});
    invoke<string>("get_default_library_path").then(p => setDefaultPath(p)).catch(() => {});
  }, []);

  if (done) return null;

  const chooseLanguage = (locale: Locale) => {
    setLocale(locale);
    if (isMobile) {
      finish();
    } else {
      setStep(2);
    }
  };

  const finish = () => {
    localStorage.setItem('klioOnboardingDone', 'true');
    setDone(true);
  };

  const useDefaultFolder = () => {
    finish();
  };

  const chooseFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      setLibraryPath(selected);
      localStorage.setItem("libraryPath", selected);
      scanLibrary(selected);
      finish();
    }
  };

  const displayPath = libraryPath || defaultPath;

  if (step === 1) {
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
                onClick={() => chooseLanguage('es')}
              >
                <span className="text-2xl">🇪🇸</span>
                <span className="text-sm font-bold">Español</span>
              </button>
              <button
                className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border transition-all hover:scale-105 ${detected === 'en' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'}`}
                onClick={() => chooseLanguage('en')}
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

  // Step 2: Library folder selection (desktop only)
  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[420px] bg-[#16161e] border-white/10 text-white" onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
        <div className="flex flex-col items-center text-center py-6 space-y-6">
          <div className="text-4xl">📚</div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold">{t('onboarding.libraryFolder')}</h2>
            <p className="text-xs opacity-60">{t('onboarding.libraryFolderDesc')}</p>
          </div>

          {displayPath && (
            <div className="w-full bg-white/5 rounded-lg p-3 text-left">
              <p className="text-[10px] uppercase tracking-wider opacity-40 mb-1">{t('onboarding.defaultFolder')}</p>
              <p className="text-xs font-mono opacity-80 break-all">{displayPath}</p>
            </div>
          )}

          <div className="flex flex-col gap-2 w-full">
            <button
              className="w-full py-3 px-4 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-all"
              onClick={useDefaultFolder}
            >
              {t('onboarding.useDefault')}
            </button>
            <button
              className="w-full py-3 px-4 rounded-xl border border-white/10 text-sm opacity-70 hover:opacity-100 hover:bg-white/5 transition-all"
              onClick={chooseFolder}
            >
              {t('onboarding.chooseAnother')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
