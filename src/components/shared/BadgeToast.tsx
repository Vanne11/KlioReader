import { useEffect, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useT } from '@/i18n';

export function BadgeToast() {
  const { t } = useT();
  const badgeToast = useUIStore(s => s.badgeToast);
  const clearBadgeToast = useUIStore(s => s.clearBadgeToast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!badgeToast) { setVisible(false); return; }
    // Small delay so the enter animation triggers
    const showTimer = setTimeout(() => setVisible(true), 50);
    const hideTimer = setTimeout(() => setVisible(false), 4000);
    const clearTimer = setTimeout(() => clearBadgeToast(), 4500);
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); clearTimeout(clearTimer); };
  }, [badgeToast]);

  if (!badgeToast) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl
        bg-[#1e1e2e]/90 backdrop-blur-md border border-amber-500/20 shadow-lg shadow-amber-500/5
        transition-all duration-500 ease-out
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
      style={{ pointerEvents: 'none' }}
    >
      <span className="text-2xl">{badgeToast.badgeEmoji}</span>
      <div className="flex flex-col">
        <span className="text-[11px] uppercase tracking-wider text-amber-400/70 font-medium">
          {t('gamification.newBadge')}
        </span>
        <span className="text-sm text-white/90 font-semibold">{badgeToast.badgeName}</span>
      </div>
    </div>
  );
}
