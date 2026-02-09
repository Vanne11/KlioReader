import type { UserStorageConfig, ReaderFont } from '@/types';

export const DEFAULT_STORAGE_CONFIG: UserStorageConfig = {
  provider: 's3',
  s3_endpoint: '',
  s3_region: 'us-east-1',
  s3_bucket: '',
  s3_access_key: '',
  s3_secret_key: '',
  webdav_url: '',
  webdav_username: '',
  webdav_password: '',
  gdrive_client_id: '',
  gdrive_client_secret: '',
  path_prefix: 'klioreader/',
  auto_sync_enabled: false,
  auto_sync_interval: 300,
};

export const themeClasses = {
  dark: "bg-[#1e1e2e] text-[#cdd6f4]",
  sepia: "bg-[#f4ecd8] text-[#5b4636]",
  light: "bg-white text-gray-900",
} as const;

export const READER_FONTS: ReaderFont[] = [
  'Libre Baskerville',
  'Inter',
  'Merriweather',
  'Literata',
  'OpenDyslexic',
];

export function loadStorageConfig(): UserStorageConfig {
  try {
    const raw = localStorage.getItem('klioUserStorage');
    return raw ? { ...DEFAULT_STORAGE_CONFIG, ...JSON.parse(raw) } : DEFAULT_STORAGE_CONFIG;
  } catch { return DEFAULT_STORAGE_CONFIG; }
}

export function saveStorageConfig(config: UserStorageConfig) {
  localStorage.setItem('klioUserStorage', JSON.stringify(config));
}

export function buildInvokeConfig(config: UserStorageConfig): { provider: string; [key: string]: string } {
  const base: any = { provider: config.provider };
  switch (config.provider) {
    case 's3':
      base.endpoint = config.s3_endpoint || '';
      base.region = config.s3_region || 'us-east-1';
      base.bucket = config.s3_bucket || '';
      base.access_key = config.s3_access_key || '';
      base.secret_key = config.s3_secret_key || '';
      base.path_prefix = config.path_prefix || 'klioreader/';
      break;
    case 'webdav':
      base.url = config.webdav_url || '';
      base.username = config.webdav_username || '';
      base.password = config.webdav_password || '';
      base.path_prefix = config.path_prefix || '/klioreader/';
      break;
    case 'gdrive':
      base.client_id = config.gdrive_client_id || '';
      base.client_secret = config.gdrive_client_secret || '';
      if (config.gdrive_access_token) base.access_token = config.gdrive_access_token;
      if (config.gdrive_refresh_token) base.refresh_token = config.gdrive_refresh_token;
      break;
  }
  return base;
}
