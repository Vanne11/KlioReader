import {
  BookOpen, Eye, Brain, FolderOpen, HardDrive, Library,
  LayoutGrid, Grid2X2, List, Square,
  Scroll as ScrollIcon, Columns2, ZoomIn, ZoomOut,
  Key, Info, Loader2, Wifi, RefreshCw, AlertTriangle, Check, LogIn, Crown, Cloud, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLibraryStore } from '@/stores/libraryStore';
import { useReaderStore } from '@/stores/readerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useLibrary } from '@/hooks/useLibrary';
import { useAuth } from '@/hooks/useAuth';
import { useStorageSync } from '@/hooks/useStorageSync';
import { READER_FONTS } from '@/lib/constants';
import { formatBytes } from '@/lib/utils';
import { useT, useI18nStore } from '@/i18n';

import type { LlmProvider, UserStorageProvider } from '@/types';

export function SettingsView() {
  const { locale, setLocale } = useI18nStore();
  const { t } = useT();

  const books = useLibraryStore(s => s.books);
  const libraryPath = useLibraryStore(s => s.libraryPath);
  const libraryView = useLibraryStore(s => s.libraryView);
  const isMobile = useLibraryStore(s => s.isMobile);
  const { setLibraryView } = useLibraryStore();

  const fontSize = useReaderStore(s => s.fontSize);
  const readerTheme = useReaderStore(s => s.readerTheme);
  const readView = useReaderStore(s => s.readView);
  const pageColumns = useReaderStore(s => s.pageColumns);
  const readerFont = useReaderStore(s => s.readerFont);
  const { setFontSize, setReaderTheme, setReadView, setPageColumns, setReaderFont } = useReaderStore();

  const {
    settingsTab, setSettingsTab, llmProvider, setLlmProvider, llmApiKey, setLlmApiKey,
    storageConfig, storageTesting, storageTestResult,
    syncStatus, syncingManual, gdriveAuthLoading, storageConfigured,
  } = useSettingsStore();

  const authUser = useAuthStore(s => s.authUser);
  const cloudBooks = useCloudStore(s => s.cloudBooks);
  const profile = useAuthStore(s => s.profile);

  const { selectLibraryFolder } = useLibrary();
  const { loadProfile } = useAuth();
  const {
    handleStorageConfigChange, handleTestConnection,
    handleSyncNow, handleToggleAutoSync, handleGDriveAuth, handleAutoSyncIntervalChange,
  } = useStorageSync();

  const isStorageConfigured = storageConfigured();

  return (
    <ScrollArea className="flex-1">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <h2 className="text-2xl font-black tracking-tight">{t('settings.title')}</h2>
        <div className="flex bg-white/5 rounded-lg p-1 w-full md:w-fit overflow-x-auto no-scrollbar">
          <Button variant={settingsTab === 'display' ? 'secondary' : 'ghost'} size="sm" className="text-xs gap-1.5 md:gap-2 shrink-0" onClick={() => setSettingsTab('display')}><Eye className="w-4 h-4" /> <span className="hidden md:inline">{t('settings.display')}</span></Button>
          <Button variant={settingsTab === 'llm' ? 'secondary' : 'ghost'} size="sm" className="text-xs gap-1.5 md:gap-2 shrink-0" onClick={() => setSettingsTab('llm')}><Brain className="w-4 h-4" /> <span className="hidden md:inline">{t('settings.llm')}</span></Button>
          <Button variant={settingsTab === 'folder' ? 'secondary' : 'ghost'} size="sm" className="text-xs gap-1.5 md:gap-2 shrink-0" onClick={() => setSettingsTab('folder')}><FolderOpen className="w-4 h-4" /> <span className="hidden md:inline">{t('settings.folder')}</span></Button>
          <Button variant={settingsTab === 'storage' ? 'secondary' : 'ghost'} size="sm" className="text-xs gap-1.5 md:gap-2 shrink-0" onClick={() => setSettingsTab('storage')}><HardDrive className="w-4 h-4" /> <span className="hidden md:inline">{t('settings.storage')}</span></Button>
        </div>

        {settingsTab === 'display' && (
          <div className="space-y-8">
            <Card className="bg-white/5 border-white/5 p-6 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-widest opacity-50 flex items-center gap-2"><Globe className="w-4 h-4" /> {t('settings.language')}</h3>
              <p className="text-xs opacity-40">{t('settings.languageDesc')}</p>
              <div className="flex gap-2">
                <Button variant={locale === 'es' ? 'default' : 'secondary'} size="sm" className="flex-1 text-xs gap-2" onClick={() => setLocale('es')}>🇪🇸 Español</Button>
                <Button variant={locale === 'en' ? 'default' : 'secondary'} size="sm" className="flex-1 text-xs gap-2" onClick={() => setLocale('en')}>🇬🇧 English</Button>
              </div>
            </Card>
            <Card className="bg-white/5 border-white/5 p-6 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-widest opacity-50 flex items-center gap-2"><LayoutGrid className="w-4 h-4" /> {t('settings.libraryView')}</h3>
              <div className="flex gap-2">
                <Button variant={libraryView === 'grid-large' ? 'default' : 'secondary'} size="sm" className="flex-1 text-xs gap-2" onClick={() => setLibraryView('grid-large')}><LayoutGrid className="w-4 h-4" /> {t('settings.large')}</Button>
                <Button variant={libraryView === 'grid-mini' ? 'default' : 'secondary'} size="sm" className="flex-1 text-xs gap-2" onClick={() => setLibraryView('grid-mini')}><Grid2X2 className="w-4 h-4" /> {t('settings.mini')}</Button>
                <Button variant={libraryView === 'grid-card' ? 'default' : 'secondary'} size="sm" className="flex-1 text-xs gap-2" onClick={() => setLibraryView('grid-card')}><Square className="w-4 h-4" /> {t('settings.cards')}</Button>
                <Button variant={libraryView === 'list-info' ? 'default' : 'secondary'} size="sm" className="flex-1 text-xs gap-2" onClick={() => setLibraryView('list-info')}><List className="w-4 h-4" /> {t('settings.list')}</Button>
              </div>
            </Card>
            <Card className="bg-white/5 border-white/5 p-6 space-y-6">
              <h3 className="text-sm font-bold uppercase tracking-widest opacity-50 flex items-center gap-2"><BookOpen className="w-4 h-4" /> {t('settings.readerView')}</h3>
              <div className="space-y-3">
                <p className="text-xs font-bold opacity-40 uppercase tracking-widest">{t('settings.viewMode')}</p>
                <div className="flex gap-2">
                  <Button variant={readView === 'scroll' ? 'default' : 'secondary'} className="flex-1" size="sm" onClick={() => setReadView('scroll')}><ScrollIcon className="w-4 h-4 mr-2" /> {t('settings.scroll')}</Button>
                  <Button variant={readView === 'paginated' ? 'default' : 'secondary'} className="flex-1" size="sm" onClick={() => setReadView('paginated')}><Columns2 className="w-4 h-4 mr-2" /> {t('settings.pages')}</Button>
                </div>
                {readView === 'paginated' && (
                  <div className="flex gap-2 pt-2 border-t border-white/5 mt-2">
                    <Button variant={pageColumns === 1 ? 'outline' : 'ghost'} className="flex-1 text-xs" size="sm" onClick={() => setPageColumns(1)}><Square className="w-3 h-3 mr-2" /> {t('settings.oneColumn')}</Button>
                    <Button variant={pageColumns === 2 ? 'outline' : 'ghost'} className="flex-1 text-xs" size="sm" onClick={() => setPageColumns(2)}><Columns2 className="w-3 h-3 mr-2" /> {t('settings.twoColumns')}</Button>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <p className="text-xs font-bold opacity-40 uppercase tracking-widest">{t('settings.typography')}</p>
                <div className="grid grid-cols-3 gap-2">
                  {READER_FONTS.map(font => (
                    <Button key={font} variant={readerFont === font ? 'outline' : 'ghost'} className="justify-start text-[11px] h-9 truncate" size="sm" onClick={() => setReaderFont(font)} style={{ fontFamily: font }}>{font}</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-bold opacity-40 uppercase tracking-widest">{t('settings.fontSize')}</p>
                <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg max-w-xs">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFontSize(f => Math.max(12, f-2))}><ZoomOut className="w-4 h-4" /></Button>
                  <span className="text-sm font-mono font-bold">{fontSize}px</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFontSize(f => Math.min(36, f+2))}><ZoomIn className="w-4 h-4" /></Button>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-bold opacity-40 uppercase tracking-widest">{t('settings.readerTheme')}</p>
                <div className="flex gap-2 max-w-xs">
                  <Button variant={readerTheme === 'light' ? 'outline' : 'ghost'} className="flex-1 bg-white text-black hover:bg-gray-100" size="sm" onClick={() => setReaderTheme('light')}>{t('settings.light')}</Button>
                  <Button variant={readerTheme === 'sepia' ? 'outline' : 'ghost'} className="flex-1 bg-[#f4ecd8] text-[#5b4636] hover:bg-[#ebe2cf]" size="sm" onClick={() => setReaderTheme('sepia')}>{t('settings.sepia')}</Button>
                  <Button variant={readerTheme === 'dark' ? 'outline' : 'ghost'} className="flex-1 bg-[#1e1e2e] text-[#cdd6f4] hover:bg-[#252539]" size="sm" onClick={() => setReaderTheme('dark')}>{t('settings.dark')}</Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {settingsTab === 'llm' && (
          <div className="space-y-6">
            <Card className="bg-white/5 border-white/5 p-6 space-y-6">
              <div><h3 className="text-sm font-bold uppercase tracking-widest opacity-50 flex items-center gap-2"><Brain className="w-4 h-4" /> {t('settings.llmProvider')}</h3><p className="text-xs opacity-40 mt-1">{t('settings.llmDesc')}</p></div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                {([
                  { id: 'groq' as LlmProvider, name: 'Groq', desc: t('settings.llmFast') },
                  { id: 'google' as LlmProvider, name: 'Google (Gemini)', desc: t('settings.llmModels') },
                  { id: 'anthropic' as LlmProvider, name: 'Anthropic', desc: t('settings.llmClaude') },
                  { id: 'openai' as LlmProvider, name: 'OpenAI', desc: t('settings.llmGpt') },
                  { id: 'ollama' as LlmProvider, name: 'Ollama', desc: t('settings.llmLocal') },
                  { id: 'custom' as LlmProvider, name: t('settings.llmCustom'), desc: t('settings.llmCustomDesc') },
                ]).map(p => (
                  <button key={p.id} className={`p-4 rounded-xl border text-left transition-all ${llmProvider === p.id ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'}`} onClick={() => setLlmProvider(p.id)}>
                    <p className="text-sm font-bold">{p.name}</p><p className="text-[10px] opacity-50 mt-0.5">{p.desc}</p>
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-xs font-bold opacity-40 uppercase tracking-widest flex items-center gap-2"><Key className="w-3 h-3" /> {t('settings.apiKey')}</p>
                <input type="password" value={llmApiKey} onChange={e => setLlmApiKey(e.target.value)} placeholder={llmProvider === 'ollama' ? t('settings.noApiKey') : t('settings.enterApiKey')} disabled={llmProvider === 'ollama'} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none disabled:opacity-30 disabled:cursor-not-allowed" />
                <p className="text-[10px] opacity-30 flex items-center gap-1"><Info className="w-3 h-3" /> {t('settings.apiKeySafe')}</p>
              </div>
            </Card>
          </div>
        )}

        {settingsTab === 'folder' && (
          <div className="space-y-6">
            <Card className="bg-white/5 border-white/5 p-6 space-y-5">
              <h3 className="text-sm font-bold uppercase tracking-widest opacity-50 flex items-center gap-2"><FolderOpen className="w-4 h-4" /> {t('settings.libraryFolder')}</h3>
              {libraryPath ? (
                <div className="space-y-4">
                  <div className="bg-black/20 rounded-lg p-4 space-y-2">
                    <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">{t('settings.currentPath')}</p>
                    <p className="text-sm font-mono break-all opacity-80">{libraryPath}</p>
                    {isMobile && <p className="text-[10px] opacity-30">{t('settings.autoConfigured')}</p>}
                  </div>
                  <div className="flex items-center gap-4"><div className="flex items-center gap-2 text-xs opacity-60"><Library className="w-4 h-4 text-primary" /><span className="font-bold">{t('settings.booksFound', { count: books.length })}</span></div></div>
                  {!isMobile && <Button variant="outline" size="sm" className="border-white/10 gap-2" onClick={selectLibraryFolder}><FolderOpen className="w-4 h-4" /> {t('settings.changeFolder')}</Button>}
                </div>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <FolderOpen className="w-12 h-12 mx-auto opacity-20" />
                  <div><p className="text-sm font-bold opacity-60">{t('settings.noFolder')}</p><p className="text-xs opacity-30 mt-1">{isMobile ? t('settings.noFolderDescMobile') : t('settings.noFolderDesc')}</p></div>
                  {!isMobile && <Button className="gap-2 font-bold" onClick={selectLibraryFolder}><FolderOpen className="w-4 h-4" /> {t('settings.selectFolder')}</Button>}
                </div>
              )}
            </Card>
          </div>
        )}

        {settingsTab === 'storage' && (
          <div className="space-y-6">
            {authUser && profile?.is_subscriber ? (
              <Card className="bg-white/5 border-white/5 p-6 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center"><Crown className="w-6 h-6 text-amber-400" /></div>
                  <div><h3 className="text-sm font-bold">{t('settings.klioCloud')}</h3><p className="text-xs opacity-40">{t('settings.klioCloudDesc')}</p></div>
                </div>
                {profile ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('settings.storageLabel')}</span>
                      <span className="text-sm font-bold">{formatBytes(profile.storage_used)} <span className="opacity-40 font-normal">/ {formatBytes(profile.upload_limit)}</span></span>
                    </div>
                    <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${(profile.storage_used / profile.upload_limit) > 0.9 ? 'bg-red-500' : (profile.storage_used / profile.upload_limit) > 0.7 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, (profile.storage_used / profile.upload_limit) * 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] opacity-40"><span>{t('settings.used', { percent: Math.round((profile.storage_used / profile.upload_limit) * 100) })}</span><span>{t('settings.available', { size: formatBytes(profile.upload_limit - profile.storage_used) })}</span></div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="border-white/10 gap-2" onClick={() => loadProfile(false)}><Loader2 className="w-4 h-4" /> {t('settings.loadStorageData')}</Button>
                )}
                <Separator className="opacity-10" />
                <div className="flex items-center gap-3 text-[10px] opacity-30"><Cloud className="w-4 h-4 flex-shrink-0" /><span>{t('settings.cloudBooksCount', { count: cloudBooks.length })}</span></div>
              </Card>
            ) : (
              <>
                <Card className="bg-white/5 border-white/5 p-6 space-y-6">
                  <div><h3 className="text-sm font-bold uppercase tracking-widest opacity-50 flex items-center gap-2"><HardDrive className="w-4 h-4" /> {t('settings.storageProvider')}</h3><p className="text-xs opacity-40 mt-1">{t('settings.storageProviderDesc')}</p></div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3">
                    {([
                      { id: 's3' as UserStorageProvider, name: 'S3-Compatible', desc: t('settings.s3Desc') },
                      { id: 'webdav' as UserStorageProvider, name: 'WebDAV', desc: t('settings.webdavDesc') },
                      { id: 'gdrive' as UserStorageProvider, name: 'Google Drive', desc: t('settings.gdriveDesc') },
                    ]).map(p => (
                      <button key={p.id} className={`p-4 rounded-xl border text-left transition-all ${storageConfig.provider === p.id ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'}`} onClick={() => handleStorageConfigChange({ provider: p.id })}>
                        <p className="text-sm font-bold">{p.name}</p><p className="text-[10px] opacity-50 mt-0.5">{p.desc}</p>
                      </button>
                    ))}
                  </div>

                  {storageConfig.provider === 's3' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div><label className="text-[10px] font-bold opacity-40 uppercase">{t('settings.s3Endpoint')}</label><input value={storageConfig.s3_endpoint || ''} onChange={e => handleStorageConfigChange({ s3_endpoint: e.target.value })} placeholder="https://s3.us-west-000.backblazeb2.com" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none mt-1" /></div>
                        <div><label className="text-[10px] font-bold opacity-40 uppercase">{t('settings.s3Region')}</label><input value={storageConfig.s3_region || ''} onChange={e => handleStorageConfigChange({ s3_region: e.target.value })} placeholder="us-east-1" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none mt-1" /></div>
                      </div>
                      <div><label className="text-[10px] font-bold opacity-40 uppercase">{t('settings.s3Bucket')}</label><input value={storageConfig.s3_bucket || ''} onChange={e => handleStorageConfigChange({ s3_bucket: e.target.value })} placeholder="mi-bucket" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none mt-1" /></div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div><label className="text-[10px] font-bold opacity-40 uppercase">{t('settings.s3AccessKey')}</label><input value={storageConfig.s3_access_key || ''} onChange={e => handleStorageConfigChange({ s3_access_key: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none mt-1 font-mono" /></div>
                        <div><label className="text-[10px] font-bold opacity-40 uppercase">{t('settings.s3SecretKey')}</label><input type="password" value={storageConfig.s3_secret_key || ''} onChange={e => handleStorageConfigChange({ s3_secret_key: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none mt-1 font-mono" /></div>
                      </div>
                    </div>
                  )}

                  {storageConfig.provider === 'webdav' && (
                    <div className="space-y-3">
                      <div><label className="text-[10px] font-bold opacity-40 uppercase">{t('settings.webdavUrl')}</label><input value={storageConfig.webdav_url || ''} onChange={e => handleStorageConfigChange({ webdav_url: e.target.value })} placeholder="https://mi-nextcloud.com/remote.php/dav/files/usuario" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none mt-1" /></div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div><label className="text-[10px] font-bold opacity-40 uppercase">{t('settings.webdavUser')}</label><input value={storageConfig.webdav_username || ''} onChange={e => handleStorageConfigChange({ webdav_username: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none mt-1" /></div>
                        <div><label className="text-[10px] font-bold opacity-40 uppercase">{t('settings.webdavPassword')}</label><input type="password" value={storageConfig.webdav_password || ''} onChange={e => handleStorageConfigChange({ webdav_password: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none mt-1" /></div>
                      </div>
                    </div>
                  )}

                  {storageConfig.provider === 'gdrive' && (
                    <div className="space-y-3">
                      <div><label className="text-[10px] font-bold opacity-40 uppercase">{t('settings.gdriveClientId')}</label><input value={storageConfig.gdrive_client_id || ''} onChange={e => handleStorageConfigChange({ gdrive_client_id: e.target.value })} placeholder="xxxx.apps.googleusercontent.com" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none mt-1" /></div>
                      <div><label className="text-[10px] font-bold opacity-40 uppercase">{t('settings.gdriveClientSecret')}</label><input type="password" value={storageConfig.gdrive_client_secret || ''} onChange={e => handleStorageConfigChange({ gdrive_client_secret: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none mt-1 font-mono" /></div>
                      <div className="flex items-center gap-3">
                        <Button onClick={handleGDriveAuth} disabled={gdriveAuthLoading || !storageConfig.gdrive_client_id || !storageConfig.gdrive_client_secret} className="gap-2">
                          {gdriveAuthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                          {storageConfig.gdrive_refresh_token ? t('settings.gdriveReconnect') : t('settings.gdriveConnect')}
                        </Button>
                        {storageConfig.gdrive_refresh_token && <span className="text-xs text-green-400 flex items-center gap-1"><Check className="w-3 h-3" /> {t('settings.gdriveConnected')}</span>}
                      </div>
                      <p className="text-[10px] opacity-30 flex items-center gap-1"><Info className="w-3 h-3" /> {t('settings.gdriveHelp')}</p>
                    </div>
                  )}

                  {storageConfig.provider !== 'gdrive' && (
                    <div><label className="text-[10px] font-bold opacity-40 uppercase">{t('settings.pathPrefix')}</label><input value={storageConfig.path_prefix || ''} onChange={e => handleStorageConfigChange({ path_prefix: e.target.value })} placeholder="klioreader/" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none mt-1 font-mono" /></div>
                  )}

                  <p className="text-[10px] opacity-30 flex items-center gap-1"><Info className="w-3 h-3" /> {t('settings.credentialsSafe')}</p>
                </Card>

                <Card className="bg-white/5 border-white/5 p-6 space-y-5">
                  <h3 className="text-sm font-bold uppercase tracking-widest opacity-50 flex items-center gap-2"><RefreshCw className="w-4 h-4" /> {t('settings.sync')}</h3>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" className="border-white/10 gap-2" onClick={handleTestConnection} disabled={storageTesting || !isStorageConfigured}>
                      {storageTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />} {t('settings.testConnection')}
                    </Button>
                    {storageTestResult && (
                      <span className={`text-xs flex items-center gap-1 ${storageTestResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {storageTestResult.ok ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />} {storageTestResult.msg}
                      </span>
                    )}
                  </div>
                  <Separator className="opacity-10" />
                  <div className="flex items-center gap-3">
                    <Button onClick={handleSyncNow} disabled={syncingManual || !isStorageConfigured} className="gap-2">
                      {syncingManual ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} {t('settings.syncNow')}
                    </Button>
                    {syncStatus.last_sync && <span className="text-xs opacity-40">{t('settings.lastSync', { date: new Date(syncStatus.last_sync).toLocaleString() })}</span>}
                  </div>
                  <Separator className="opacity-10" />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div><p className="text-sm font-bold">{t('settings.autoSync')}</p><p className="text-[10px] opacity-40">{t('settings.autoSyncDesc')}</p></div>
                      <button onClick={handleToggleAutoSync} disabled={!isStorageConfigured} className={`relative w-11 h-6 rounded-full transition-colors ${storageConfig.auto_sync_enabled ? 'bg-primary' : 'bg-white/10'} ${!isStorageConfigured ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${storageConfig.auto_sync_enabled ? 'translate-x-5' : ''}`} />
                      </button>
                    </div>
                    {storageConfig.auto_sync_enabled && (
                      <div>
                        <label className="text-[10px] font-bold opacity-40 uppercase">{t('settings.interval')}</label>
                        <div className="flex gap-2 mt-1">
                          {[{ label: '1 min', secs: 60 }, { label: '5 min', secs: 300 }, { label: '15 min', secs: 900 }, { label: '30 min', secs: 1800 }].map(opt => (
                            <Button key={opt.secs} variant={(storageConfig.auto_sync_interval || 300) === opt.secs ? 'default' : 'secondary'} size="sm" className="text-xs" onClick={() => handleAutoSyncIntervalChange(opt.secs)}>{opt.label}</Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {syncStatus.error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3"><p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {syncStatus.error}</p></div>
                  )}
                </Card>
              </>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
