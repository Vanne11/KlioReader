import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

let cachedIsMobile: boolean | null = null;
let promise: Promise<boolean> | null = null;

function fetchPlatform(): Promise<boolean> {
  if (!promise) {
    promise = invoke<boolean>('is_mobile_platform').catch(() => false);
    promise.then(v => { cachedIsMobile = v; });
  }
  return promise;
}

// Pre-fetch al cargar el módulo
fetchPlatform();

export function usePlatform() {
  const [isMobile, setIsMobile] = useState<boolean | null>(cachedIsMobile);

  useEffect(() => {
    if (cachedIsMobile !== null) {
      setIsMobile(cachedIsMobile);
      return;
    }
    fetchPlatform().then(v => setIsMobile(v));
  }, []);

  return {
    isMobilePlatform: isMobile ?? false,
    isDesktop: isMobile === false,
    isLoading: isMobile === null,
  };
}
