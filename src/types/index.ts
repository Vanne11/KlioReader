export type { AuthUser, CloudBook, SearchUser, BookShare, SharedUserProgress, UserProfile, Note, Bookmark, CheckHashResponse, UploadResponse, ReadingRace, RaceLeaderboardEntry, RaceLeaderboardResponse, ReadingChallenge, ChallengeType, ChallengeStatus, ChallengeStatusResponse, SharedNote, SocialStats } from '@/lib/api';
export type { UserStats, BadgeCategory, BadgeRarity, BadgeWithStatus, BadgeDefinition, BookForBadge, SocialStatsForBadge } from '@/lib/gamification';

export interface BookMetadata {
  title: string;
  author: string;
  cover: string | null;
  description: string | null;
  total_chapters: number;
}

export interface Book extends BookMetadata {
  id: string;
  progress: number;
  currentChapter: number;
  lastRead: string;
  path: string;
  type: 'epub' | 'pdf';
}

export type LibraryView = 'grid-large' | 'grid-mini' | 'grid-card' | 'list-info';
export type ReaderTheme = 'dark' | 'sepia' | 'light';
export type ReadView = 'scroll' | 'paginated';
export type ReaderFont = 'Libre Baskerville' | 'Inter' | 'Merriweather' | 'Literata' | 'OpenDyslexic';
export type SettingsTab = 'display' | 'llm' | 'folder' | 'storage';
export type UserStorageProvider = 's3' | 'webdav' | 'gdrive';
export type LlmProvider = 'groq' | 'google' | 'anthropic' | 'openai' | 'ollama' | 'custom';

export interface UserStorageConfig {
  provider: UserStorageProvider;
  s3_endpoint?: string;
  s3_region?: string;
  s3_bucket?: string;
  s3_access_key?: string;
  s3_secret_key?: string;
  webdav_url?: string;
  webdav_username?: string;
  webdav_password?: string;
  gdrive_client_id?: string;
  gdrive_client_secret?: string;
  gdrive_access_token?: string;
  gdrive_refresh_token?: string;
  path_prefix?: string;
  auto_sync_enabled?: boolean;
  auto_sync_interval?: number;
}

export interface SyncStatus {
  syncing: boolean;
  last_sync: string | null;
  pending_up: number;
  pending_down: number;
  error: string | null;
  auto_sync_enabled: boolean;
  auto_sync_interval_secs: number;
}
