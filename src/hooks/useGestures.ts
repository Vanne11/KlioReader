import { useEffect, RefObject } from 'react';

interface UseGesturesOptions {
  ref: RefObject<HTMLElement | null>;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  enabled: boolean;
}

export function useGestures({ ref, onSwipeLeft, onSwipeRight, enabled }: UseGesturesOptions) {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;

    const SWIPE_THRESHOLD = 50;
    const TAP_THRESHOLD = 10;
    const TAP_MAX_DURATION = 300;

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
    }

    function onTouchEnd(e: TouchEvent) {
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const elapsed = Date.now() - startTime;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Ignore if interacting with a link or button
      const target = e.target as HTMLElement;
      if (target.closest('a, button, [role="button"]')) return;

      // Swipe detection: horizontal dominant, threshold met
      if (absDx > SWIPE_THRESHOLD && absDx > absDy * 1.5) {
        if (dx < 0) onSwipeLeft();
        else onSwipeRight();
        return;
      }

      // Tap detection: short duration, minimal movement
      if (elapsed < TAP_MAX_DURATION && absDx < TAP_THRESHOLD && absDy < TAP_THRESHOLD) {
        const rect = el!.getBoundingClientRect();
        const relX = (touch.clientX - rect.left) / rect.width;

        if (relX < 0.25) {
          onSwipeRight(); // left zone = previous page
        } else if (relX > 0.75) {
          onSwipeLeft(); // right zone = next page
        }
        // center tap: do nothing (could toggle header later)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [ref, onSwipeLeft, onSwipeRight, enabled]);
}
