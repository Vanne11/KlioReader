import { useState, useEffect } from 'react';
import {
  BookOpen, Cloud, CloudUpload, CloudDownload, LogIn, Loader2, Server, Trash2, Pencil,
  User, AlertTriangle, Check, X, Share2, Bell, Send, Search, Users, ChevronDown, ChevronUp,
  Trophy, Swords, Flag, FolderOpen, Layers, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useSharesStore } from '@/stores/sharesStore';
import { useSocialStore } from '@/stores/socialStore';
import { useAuth } from '@/hooks/useAuth';
import { useCloudBooks } from '@/hooks/useCloudBooks';
import { useShares } from '@/hooks/useShares';
import { useRaces } from '@/hooks/useRaces';
import { useChallenges } from '@/hooks/useChallenges';
import { useCollections } from '@/hooks/useCollections';
import { useCollectionsStore } from '@/stores/collectionsStore';
import { RaceLeaderboard } from '@/components/social/RaceLeaderboard';
import { ChallengeCard } from '@/components/social/ChallengeCard';
import { coverSrc, formatBytes } from '@/lib/utils';
import { useT } from '@/i18n';
import * as api from '@/lib/api';

export function CloudView() {
  const { t } = useT();
  const { authUser, authMode, setAuthMode, authError, authLoading, showProfile, setShowProfile, profile, profileForm, showDeleteConfirm, setShowDeleteConfirm } = useAuthStore();
  const { updateProfileForm } = useAuthStore();
  const { cloudBooks, cloudLoading, downloadingBookId, editingCloudBook, editCloudForm } = useCloudStore();
  const { setEditingCloudBook, updateEditCloudForm } = useCloudStore();
  const {
    pendingShares, showInvitations, setShowInvitations, sharingBook, setSharingBook,
    shareSearchQuery, shareSearchResults, shareSearching, shareMessage, setShareMessage,
    shareSending, sharedProgressMap,
  } = useSharesStore();

  const { challenges, pendingChallengesCount: pendingChallenges, currentLeaderboard, challengeTab, setChallengeTab } = useSocialStore();

  const { handleAuth, saveProfile, handleDeleteAccount } = useAuth();
  const { loadCloudBooks, downloadBookFromCloud, deleteCloudBook, startEditCloudBook, saveCloudBookEdit } = useCloudBooks();
  const { loadPendingShares, handleAcceptShare, handleRejectShare, handleShareSearch, handleSendShare, openShareDialog, loadAllSharedProgress } = useShares();
  const { createRace, loadLeaderboard } = useRaces();
  const { loadChallenges, handleAcceptChallenge, handleRejectChallenge, createChallenge, checkChallengeStatus } = useChallenges();
  const {
    loadCloudCollections, createCloudCollection, deleteCloudCollection,
    addBooksToCloudCollection, shareCloudCollection,
    loadPendingCollectionShares, acceptCollectionShare, rejectCollectionShare,
  } = useCollections();
  const cloudCollections = useCollectionsStore(s => s.cloudCollections);
  const pendingCollectionShares = useCollectionsStore(s => s.pendingCollectionShares);
  const { setSharingCollection } = useCollectionsStore();
  const sharingCollection = useCollectionsStore(s => s.sharingCollection);

  const [showChallengeDialog, setShowChallengeDialog] = useState<api.CloudBook | null>(null);
  const [challengeForm, setChallengeForm] = useState({ challenged_id: 0, challenge_type: 'finish_before' as api.ChallengeType, target_days: 7, target_chapters: 5 });
  const [showNewCollectionForm, setShowNewCollectionForm] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionType, setNewCollectionType] = useState<'saga' | 'collection'>('collection');
  const [addingToCollectionId, setAddingToCollectionId] = useState<number | null>(null);
  const [collectionShareSearch, setCollectionShareSearch] = useState('');

  // Auto-refresh al entrar a la pestaña Nube
  useEffect(() => {
    if (authUser) {
      loadCloudBooks();
      loadPendingShares();
      loadChallenges();
      loadCloudCollections();
      loadPendingCollectionShares();
    }
  }, []);

  // Cargar progreso compartido cuando cambian los libros
  useEffect(() => {
    if (cloudBooks.length > 0) loadAllSharedProgress(cloudBooks);
  }, [cloudBooks]);

  return (
    <ScrollArea className="flex-1">
      <div className="max-w-2xl mx-auto p-4 md:p-12 space-y-8">
        <div className="space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2"><Server className="w-5 h-5 text-primary" /> {t('cloud.apiServer')}</h2>
          <div className="flex gap-2">
            <input type="url" defaultValue={api.getApiUrl()} id="api-url-input" placeholder="http://tu-servidor.com" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:border-primary outline-none" />
            <Button variant="outline" size="sm" onClick={() => { const input = document.getElementById('api-url-input') as HTMLInputElement; api.setApiUrl(input.value); }}>{t('app.save')}</Button>
          </div>
        </div>
        <Separator className="opacity-10" />

        {!authUser ? (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <Cloud className="w-12 h-12 text-blue-400 mx-auto" />
              <h2 className="text-2xl font-bold">{t('cloud.cloudTitle')}</h2>
              <p className="text-sm opacity-50">{t('cloud.cloudDesc')}</p>
            </div>
            <div className="flex bg-white/5 rounded-lg p-1">
              <Button variant={authMode === 'login' ? 'secondary' : 'ghost'} className="flex-1 text-sm" onClick={() => setAuthMode('login')}>{t('cloud.login')}</Button>
              <Button variant={authMode === 'register' ? 'secondary' : 'ghost'} className="flex-1 text-sm" onClick={() => setAuthMode('register')}>{t('cloud.register')}</Button>
            </div>
            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'register' && <input name="username" placeholder={t('cloud.username')} required minLength={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />}
              <input name={authMode === 'login' ? 'login' : 'email'} type={authMode === 'register' ? 'email' : 'text'} placeholder={authMode === 'register' ? t('cloud.email') : t('cloud.emailOrUser')} required className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
              <input name="password" type="password" placeholder={t('cloud.password')} required minLength={6} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
              {authError && <p className="text-red-400 text-xs">{authError}</p>}
              <Button type="submit" className="w-full font-bold" disabled={authLoading}>
                {authLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
                {authMode === 'login' ? t('cloud.enter') : t('cloud.createAccount')}
              </Button>
            </form>
          </div>
        ) : (
          <div className="space-y-8">
            {pendingShares.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Bell className="w-5 h-5 text-amber-400" /> {t('cloud.invitations', { count: pendingShares.length })}</h2>
                  <Button variant="ghost" size="sm" onClick={() => setShowInvitations(prev => !prev)} className="text-xs opacity-50">
                    {showInvitations ? <><ChevronUp className="w-3 h-3 mr-1" /> {t('app.hide')}</> : <><ChevronDown className="w-3 h-3 mr-1" /> {t('app.show')}</>}
                  </Button>
                </div>
                {showInvitations && pendingShares.map(share => (
                  <Card key={share.id} className="bg-amber-500/5 border-amber-500/20 p-3 md:p-4 space-y-2 md:space-y-3">
                    <div className="flex gap-3 md:gap-4">
                      <div className="w-10 md:w-12 aspect-[2/3] rounded bg-[#0f0f14] overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                        {share.snap_cover_base64 ? <img src={coverSrc(share.snap_cover_base64)} className="w-full h-full object-contain" alt="" /> : <BookOpen className="w-4 h-4 opacity-10" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold truncate">{share.snap_title}</h3>
                        <p className="text-[10px] opacity-50 italic">{share.snap_author || t('app.noAuthor')}</p>
                        {share.snap_description && <p className="text-[10px] opacity-40 mt-1 line-clamp-2 hidden md:block">{share.snap_description}</p>}
                        <div className="flex items-center gap-1.5 md:gap-2 mt-1.5 md:mt-2 flex-wrap">
                          <User className="w-3 h-3 text-primary" />
                          <span className="text-[10px] font-bold">{share.from_username}</span>
                          <span className="text-[10px] opacity-30 hidden sm:inline">{t('cloud.sharedYouBook')}</span>
                        </div>
                        {share.message && <p className="text-[10px] opacity-60 mt-1 italic bg-white/5 rounded px-2 py-1 line-clamp-1 md:line-clamp-none">"{share.message}"</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold text-xs" onClick={() => handleAcceptShare(share.id)}><Check className="w-3 h-3 mr-1" /> {t('cloud.accept')}</Button>
                      <Button size="sm" variant="outline" className="flex-1 border-white/10 text-xs" onClick={() => handleRejectShare(share.id)}><X className="w-3 h-3 mr-1" /> {t('cloud.reject')}</Button>
                    </div>
                  </Card>
                ))}
                <Separator className="opacity-10" />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2"><Cloud className="w-5 h-5 text-blue-400" /> {t('cloud.myCloudBooks')}</h2>
                <p className="text-xs opacity-50 mt-1">{t('cloud.syncedBooks', { count: cloudBooks.length })}</p>
              </div>
              <Button variant="outline" size="sm" onClick={loadCloudBooks} disabled={cloudLoading}>
                {cloudLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />} {t('app.refresh')}
              </Button>
            </div>

            {cloudBooks.length === 0 ? (
              <div className="text-center py-16 opacity-40">
                <CloudUpload className="w-16 h-16 mx-auto mb-4" />
                <p className="text-sm">{t('cloud.noCloudBooks')}</p>
                <p className="text-xs mt-1">{t('cloud.noCloudBooksDesc')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cloudBooks.map(cb => (
                  <Card key={cb.id} className="bg-white/5 border-white/5 p-3 md:p-4 space-y-0">
                    <div className="flex gap-3 md:gap-4 items-center">
                      <div className="w-10 md:w-12 aspect-[2/3] rounded bg-[#0f0f14] overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                        {cb.cover_base64 ? <img src={coverSrc(cb.cover_base64)} className="w-full h-full object-contain" alt="" /> : <BookOpen className="w-4 h-4 opacity-10" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold truncate">{cb.title}</h3>
                        <p className="text-[10px] opacity-50 italic">{cb.author || t('app.noAuthor')}</p>
                        <div className="flex items-center gap-2 md:gap-3 mt-1 flex-wrap">
                          {!(cb.share_count > 0 && sharedProgressMap[cb.id]?.length > 0) && (
                            <>
                              <Progress value={cb.progress_percent} className="h-1 flex-1 max-w-[100px] md:max-w-[120px] bg-white/5" indicatorClassName="bg-blue-400" />
                              <span className="text-[9px] font-bold text-blue-400">{cb.progress_percent}%</span>
                            </>
                          )}
                          <Badge variant="outline" className="text-[8px] h-4 opacity-50">{cb.file_type}</Badge>
                          {cb.is_duplicate && <Badge variant="outline" className="text-[8px] h-4 text-amber-400 border-amber-400/40">{t('cloud.duplicate')}</Badge>}
                          {cb.share_count > 0 && <Badge variant="outline" className="text-[8px] h-4 text-cyan-400 border-cyan-400/40"><Users className="w-2.5 h-2.5 mr-0.5" /> {t('cloud.shared')}</Badge>}
                        </div>
                      </div>
                      {/* Botones solo en desktop - inline */}
                      <div className="hidden md:flex gap-1 shrink-0">
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-primary/20 hover:text-primary" onClick={() => startEditCloudBook(cb)}><Pencil className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>{t('cloud.editTooltip')}</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-cyan-600/20 hover:text-cyan-400" onClick={() => openShareDialog(cb)}><Share2 className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>{t('cloud.shareTooltip')}</TooltipContent></Tooltip>
                        {cb.share_count > 0 && (
                          <>
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-yellow-600/20 hover:text-yellow-400" onClick={async () => { const raceId = await createRace(cb.id); if (raceId) { loadLeaderboard(raceId); } }}><Flag className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>{t('cloud.startRace')}</TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-purple-600/20 hover:text-purple-400" onClick={() => setShowChallengeDialog(cb)}><Swords className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>{t('cloud.challengeTooltip')}</TooltipContent></Tooltip>
                          </>
                        )}
                        <Tooltip><TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-green-600/20 hover:text-green-400" disabled={downloadingBookId === cb.id} onClick={() => downloadBookFromCloud(cb)}>
                            {downloadingBookId === cb.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
                          </Button>
                        </TooltipTrigger><TooltipContent>{t('cloud.downloadTooltip')}</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-600/20 hover:text-red-400" onClick={() => deleteCloudBook(cb.id)}><Trash2 className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>{t('cloud.deleteTooltip')}</TooltipContent></Tooltip>
                      </div>
                    </div>
                    {/* Botones en mobile - fila compacta debajo */}
                    <div className="flex md:hidden mt-1.5 pt-1.5 border-t border-white/5 justify-between">
                      <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-primary/20 hover:text-primary" onClick={() => startEditCloudBook(cb)}><Pencil className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-cyan-600/20 hover:text-cyan-400" onClick={() => openShareDialog(cb)}><Share2 className="w-3 h-3" /></Button>
                      {cb.share_count > 0 && (
                        <>
                          <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-yellow-600/20 hover:text-yellow-400" onClick={async () => { const raceId = await createRace(cb.id); if (raceId) { loadLeaderboard(raceId); } }}><Flag className="w-3 h-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-purple-600/20 hover:text-purple-400" onClick={() => setShowChallengeDialog(cb)}><Swords className="w-3 h-3" /></Button>
                        </>
                      )}
                      <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-green-600/20 hover:text-green-400" disabled={downloadingBookId === cb.id} onClick={() => downloadBookFromCloud(cb)}>
                        {downloadingBookId === cb.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudDownload className="w-3 h-3" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-red-600/20 hover:text-red-400" onClick={() => deleteCloudBook(cb.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                    {cb.share_count > 0 && sharedProgressMap[cb.id]?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
                        {(() => {
                          const me = { user_id: -1, username: t('cloud.me'), avatar: null, progress_percent: cb.progress_percent, current_chapter: 0, current_page: 0, last_read: null };
                          const allRunners = [me, ...sharedProgressMap[cb.id]].sort((a, b) => b.progress_percent - a.progress_percent);
                          return allRunners.map((sp, idx) => {
                            const isMe = sp.user_id === -1;
                            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
                            const barColor = isMe ? 'bg-primary' : 'bg-cyan-400';
                            const textColor = isMe ? 'text-primary' : 'text-cyan-400';
                            const bgColor = isMe ? 'bg-primary/10 border-primary/20' : 'bg-white/[0.02] border-transparent';
                            return (
                              <div key={sp.user_id} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border ${bgColor} transition-all`}>
                                <span className="text-xs w-5 text-center shrink-0">{medal ?? `${idx + 1}`}</span>
                                <div className={`w-5 h-5 rounded-full ${isMe ? 'bg-primary/20' : 'bg-cyan-400/20'} flex items-center justify-center shrink-0`}>
                                  <User className={`w-2.5 h-2.5 ${textColor}`} />
                                </div>
                                <span className={`text-[10px] font-bold w-16 truncate shrink-0 ${isMe ? 'text-primary' : ''}`}>{sp.username}</span>
                                <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden relative">
                                  <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${sp.progress_percent}%` }} />
                                </div>
                                <span className={`text-[10px] font-bold w-9 text-right shrink-0 ${textColor}`}>{sp.progress_percent}%</span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Collection Shares Pending */}
        {authUser && pendingCollectionShares.length > 0 && (
          <>
            <Separator className="opacity-10" />
            <div className="space-y-3">
              <h2 className="text-lg font-bold flex items-center gap-2"><Bell className="w-5 h-5 text-purple-400" /> Invitaciones de colecciones ({pendingCollectionShares.length})</h2>
              {pendingCollectionShares.map(share => (
                <Card key={share.id} className="bg-purple-500/5 border-purple-500/20 p-3 md:p-4 space-y-2">
                  <div className="flex gap-3 items-center">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${share.snap_type === 'saga' ? 'bg-amber-400/10' : 'bg-blue-400/10'}`}>
                      {share.snap_type === 'saga' ? <FolderOpen className="w-5 h-5 text-amber-400" /> : <Layers className="w-5 h-5 text-blue-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold truncate">{share.snap_name}</h3>
                      <div className="flex items-center gap-2 text-[10px] opacity-50">
                        <User className="w-3 h-3 text-primary" />
                        <span className="font-bold">{share.from_username}</span>
                        <span>· {share.snap_book_count} libros</span>
                      </div>
                      {share.message && <p className="text-[10px] opacity-60 mt-1 italic">"{share.message}"</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold text-xs" onClick={() => acceptCollectionShare(share.id)}><Check className="w-3 h-3 mr-1" /> {t('cloud.accept')}</Button>
                    <Button size="sm" variant="outline" className="flex-1 border-white/10 text-xs" onClick={() => rejectCollectionShare(share.id)}><X className="w-3 h-3 mr-1" /> {t('cloud.reject')}</Button>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Cloud Collections */}
        {authUser && (
          <>
            <Separator className="opacity-10" />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2"><Layers className="w-5 h-5 text-blue-400" /> Colecciones</h2>
                <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setShowNewCollectionForm(v => !v)}>
                  <Plus className="w-3 h-3" /> Nueva
                </Button>
              </div>

              {showNewCollectionForm && (
                <Card className="bg-white/5 border-white/10 p-4 space-y-3">
                  <input
                    value={newCollectionName}
                    onChange={e => setNewCollectionName(e.target.value)}
                    placeholder="Nombre de la colección"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:border-primary outline-none"
                  />
                  <div className="flex gap-2">
                    <Button variant={newCollectionType === 'collection' ? 'secondary' : 'ghost'} className="flex-1 text-xs h-8" onClick={() => setNewCollectionType('collection')}>
                      <Layers className="w-3 h-3 mr-1" /> Colección
                    </Button>
                    <Button variant={newCollectionType === 'saga' ? 'secondary' : 'ghost'} className="flex-1 text-xs h-8" onClick={() => setNewCollectionType('saga')}>
                      <FolderOpen className="w-3 h-3 mr-1" /> Saga
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 border-white/10 text-xs" onClick={() => { setShowNewCollectionForm(false); setNewCollectionName(''); }}>Cancelar</Button>
                    <Button size="sm" className="flex-1 font-bold text-xs" disabled={!newCollectionName.trim()} onClick={async () => {
                      await createCloudCollection(newCollectionName.trim(), newCollectionType);
                      setShowNewCollectionForm(false);
                      setNewCollectionName('');
                    }}>Crear</Button>
                  </div>
                </Card>
              )}

              {cloudCollections.length === 0 && !showNewCollectionForm ? (
                <p className="text-[10px] opacity-30 text-center py-4">No tienes colecciones en la nube</p>
              ) : (
                <div className="space-y-2">
                  {cloudCollections.map(col => (
                    <Card key={col.id} className="bg-white/5 border-white/5 p-3 md:p-4">
                      <div className="flex gap-3 items-center">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${col.type === 'saga' ? 'bg-amber-400/10' : 'bg-blue-400/10'}`}>
                          {col.type === 'saga' ? <FolderOpen className="w-5 h-5 text-amber-400" /> : <Layers className="w-5 h-5 text-blue-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold truncate">{col.name}</h3>
                          <p className="text-[10px] opacity-40">{col.book_count} {col.book_count === 1 ? 'libro' : 'libros'} · {col.type}</p>
                        </div>
                        <div className="flex gap-1">
                          <Tooltip><TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-green-600/20 hover:text-green-400" onClick={() => setAddingToCollectionId(addingToCollectionId === col.id ? null : col.id)}>
                              <Plus className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger><TooltipContent>Agregar libros</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-cyan-600/20 hover:text-cyan-400" onClick={() => setSharingCollection(col)}>
                              <Share2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger><TooltipContent>Compartir colección</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-600/20 hover:text-red-400" onClick={() => deleteCloudCollection(col.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger><TooltipContent>Eliminar</TooltipContent></Tooltip>
                        </div>
                      </div>
                      {/* Panel de agregar libros inline */}
                      {addingToCollectionId === col.id && (
                        <div className="mt-3 pt-3 border-t border-white/5 space-y-1 max-h-40 overflow-y-auto">
                          {cloudBooks.map(cb => (
                            <button
                              key={cb.id}
                              className="flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors text-xs"
                              onClick={async () => { await addBooksToCloudCollection(col.id, [cb.id]); setAddingToCollectionId(null); }}
                            >
                              <div className="w-6 aspect-[2/3] rounded bg-[#0f0f14] overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                                {cb.cover_base64 ? <img src={coverSrc(cb.cover_base64)} className="w-full h-full object-contain" alt="" /> : <BookOpen className="w-2 h-2 opacity-10" />}
                              </div>
                              <span className="truncate">{cb.title}</span>
                              <span className="text-[9px] opacity-30 ml-auto">{cb.author}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Share Collection Dialog */}
        <Dialog open={!!sharingCollection} onOpenChange={(open) => { if (!open) setSharingCollection(null); }}>
          <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Share2 className="w-5 h-5 text-cyan-400" /> Compartir colección</DialogTitle></DialogHeader>
            {sharingCollection && (
              <div className="space-y-4 py-4">
                <div className="flex gap-3 items-center bg-white/5 rounded-lg p-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${sharingCollection.type === 'saga' ? 'bg-amber-400/10' : 'bg-blue-400/10'}`}>
                    {sharingCollection.type === 'saga' ? <FolderOpen className="w-5 h-5 text-amber-400" /> : <Layers className="w-5 h-5 text-blue-400" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{sharingCollection.name}</p>
                    <p className="text-[10px] opacity-50">{sharingCollection.book_count} libros</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('cloud.searchUserLabel')}</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
                    <input value={collectionShareSearch} onChange={e => { setCollectionShareSearch(e.target.value); handleShareSearch(e.target.value); }} placeholder={t('cloud.searchUserPlaceholder')} className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-3 text-sm focus:border-primary outline-none" />
                  </div>
                </div>
                {shareSearchResults.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {shareSearchResults.map(u => (
                      <div key={u.id} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2 hover:bg-white/10 transition-colors">
                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0"><User className="w-3.5 h-3.5 text-primary" /></div>
                        <span className="text-sm font-medium flex-1 truncate">{u.username}</span>
                        <Button size="sm" className="h-7 text-xs px-3" onClick={async () => {
                          await shareCloudCollection(sharingCollection.id, u.id);
                          setSharingCollection(null);
                          setCollectionShareSearch('');
                        }}>
                          <Send className="w-3 h-3 mr-1" /> {t('app.send')}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Challenges Section */}
        {authUser && challenges.length > 0 && (
          <>
            <Separator className="opacity-10" />
            <div className="space-y-3">
              <h2 className="text-lg font-bold flex items-center gap-2"><Swords className="w-5 h-5 text-purple-400" /> {t('cloud.challenges')}</h2>
              <div className="flex bg-white/5 rounded-lg p-1 gap-1">
                {(['pending', 'active', 'history'] as const).map(tab => (
                  <Button key={tab} variant={challengeTab === tab ? 'secondary' : 'ghost'} className="flex-1 text-xs h-7" onClick={() => setChallengeTab(tab)}>
                    {tab === 'pending' ? t('cloud.pendingTab') : tab === 'active' ? t('cloud.activeTab') : t('cloud.historyTab')}
                    {tab === 'pending' && pendingChallenges > 0 && <span className="ml-1 bg-red-500 text-white text-[8px] rounded-full w-4 h-4 flex items-center justify-center">{pendingChallenges}</span>}
                  </Button>
                ))}
              </div>
              <div className="space-y-2">
                {challenges.filter(c =>
                  challengeTab === 'pending' ? c.status === 'pending' :
                  challengeTab === 'active' ? c.status === 'active' :
                  ['completed', 'expired', 'rejected', 'failed'].includes(c.status)
                ).map(c => (
                  <ChallengeCard
                    key={c.id}
                    challenge={c}
                    currentUserId={authUser.id}
                    onAccept={handleAcceptChallenge}
                    onReject={handleRejectChallenge}
                    onViewStatus={checkChallengeStatus}
                  />
                ))}
                {challenges.filter(c =>
                  challengeTab === 'pending' ? c.status === 'pending' :
                  challengeTab === 'active' ? c.status === 'active' :
                  ['completed', 'expired', 'rejected', 'failed'].includes(c.status)
                ).length === 0 && (
                  <p className="text-[10px] opacity-30 text-center py-4">{t('cloud.noChallenges', { tab: challengeTab === 'pending' ? t('cloud.noChallengesPending') : challengeTab === 'active' ? t('cloud.noChallengesActive') : t('cloud.noChallengesHistory') })}</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* Race Leaderboard Dialog */}
        <Dialog open={!!currentLeaderboard} onOpenChange={(open) => { if (!open) useSocialStore.getState().setCurrentLeaderboard(null); }}>
          <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Trophy className="w-5 h-5 text-yellow-400" /> {t('cloud.readingRace')}</DialogTitle></DialogHeader>
            {currentLeaderboard && authUser && (
              <div className="py-4">
                <RaceLeaderboard data={currentLeaderboard} currentUserId={authUser.id} />
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Create Challenge Dialog */}
        <Dialog open={!!showChallengeDialog} onOpenChange={(open) => { if (!open) setShowChallengeDialog(null); }}>
          <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Swords className="w-5 h-5 text-purple-400" /> {t('cloud.createChallenge')}</DialogTitle></DialogHeader>
            {showChallengeDialog && (
              <div className="space-y-4 py-4">
                <p className="text-xs opacity-50">{t('cloud.challengeDesc', { title: showChallengeDialog.title })}</p>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('cloud.searchUser')}</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
                    <input onChange={e => handleShareSearch(e.target.value)} placeholder={t('cloud.userPlaceholder')} className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-3 text-sm focus:border-primary outline-none" />
                  </div>
                </div>
                {shareSearchResults.length > 0 && (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {shareSearchResults.map(u => (
                      <button key={u.id} className={`flex items-center gap-2 w-full rounded-lg px-3 py-2 text-left ${challengeForm.challenged_id === u.id ? 'bg-primary/20 border border-primary/30' : 'bg-white/5 hover:bg-white/10'}`} onClick={() => setChallengeForm(f => ({ ...f, challenged_id: u.id }))}>
                        <User className="w-4 h-4 text-primary" /><span className="text-xs truncate">{u.username}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('cloud.challengeType')}</label>
                  <div className="flex gap-2">
                    <Button variant={challengeForm.challenge_type === 'finish_before' ? 'secondary' : 'ghost'} className="flex-1 text-xs h-8" onClick={() => setChallengeForm(f => ({ ...f, challenge_type: 'finish_before' }))}>{t('cloud.finishFirst')}</Button>
                    <Button variant={challengeForm.challenge_type === 'chapters_in_days' ? 'secondary' : 'ghost'} className="flex-1 text-xs h-8" onClick={() => setChallengeForm(f => ({ ...f, challenge_type: 'chapters_in_days' }))}>{t('cloud.chaptersInDays')}</Button>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="space-y-1 flex-1">
                    <label className="text-[10px] opacity-40">{t('cloud.dayLimit')}</label>
                    <input type="number" min={1} max={90} value={challengeForm.target_days} onChange={e => setChallengeForm(f => ({ ...f, target_days: Number(e.target.value) }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none" />
                  </div>
                  {challengeForm.challenge_type === 'chapters_in_days' && (
                    <div className="space-y-1 flex-1">
                      <label className="text-[10px] opacity-40">{t('cloud.targetChapters')}</label>
                      <input type="number" min={1} value={challengeForm.target_chapters} onChange={e => setChallengeForm(f => ({ ...f, target_chapters: Number(e.target.value) }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none" />
                    </div>
                  )}
                </div>
                <Button className="w-full font-bold" disabled={challengeForm.challenged_id === 0} onClick={() => {
                  createChallenge(showChallengeDialog.id, challengeForm);
                  setShowChallengeDialog(null);
                }}>{t('cloud.sendChallenge')}</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Cloud Book Dialog */}
        <Dialog open={!!editingCloudBook} onOpenChange={(open) => { if (!open) setEditingCloudBook(null); }}>
          <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
            <DialogHeader><DialogTitle>{t('cloud.editBook')}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><label className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('cloud.bookTitle')}</label><input value={editCloudForm.title} onChange={e => updateEditCloudForm({ title: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" /></div>
              <div className="space-y-2"><label className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('cloud.bookAuthor')}</label><input value={editCloudForm.author} onChange={e => updateEditCloudForm({ author: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" /></div>
              <div className="space-y-2"><label className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('cloud.bookDesc')}</label><textarea value={editCloudForm.description} onChange={e => updateEditCloudForm({ description: e.target.value })} rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none resize-y font-sans" placeholder={t('cloud.bookDescPlaceholder')} /></div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 border-white/10" onClick={() => setEditingCloudBook(null)}>{t('app.cancel')}</Button>
                <Button className="flex-1 font-bold" onClick={saveCloudBookEdit}>{t('app.save')}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Share Book Dialog */}
        <Dialog open={!!sharingBook} onOpenChange={(open) => { if (!open) setSharingBook(null); }}>
          <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Share2 className="w-5 h-5 text-cyan-400" /> {t('cloud.shareBook')}</DialogTitle></DialogHeader>
            {sharingBook && (
              <div className="space-y-4 py-4">
                <div className="flex gap-3 items-center bg-white/5 rounded-lg p-3">
                  <div className="w-10 aspect-[2/3] rounded bg-[#0f0f14] overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                    {sharingBook.cover_base64 ? <img src={coverSrc(sharingBook.cover_base64)} className="w-full h-full object-contain" alt="" /> : <BookOpen className="w-3 h-3 opacity-10" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{sharingBook.title}</p>
                    <p className="text-[10px] opacity-50 italic">{sharingBook.author || t('app.noAuthor')}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('cloud.searchUserLabel')}</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
                    <input value={shareSearchQuery} onChange={e => handleShareSearch(e.target.value)} placeholder={t('cloud.searchUserPlaceholder')} className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-3 text-sm focus:border-primary outline-none" />
                    {shareSearching && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 opacity-50" />}
                  </div>
                </div>
                {shareSearchResults.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {shareSearchResults.map(u => (
                      <div key={u.id} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2 hover:bg-white/10 transition-colors">
                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0"><User className="w-3.5 h-3.5 text-primary" /></div>
                        <span className="text-sm font-medium flex-1 truncate">{u.username}</span>
                        <Button size="sm" className="h-7 text-xs px-3" disabled={shareSending === u.id} onClick={() => handleSendShare(u.id)}>
                          {shareSending === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3 mr-1" /> {t('app.send')}</>}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {shareSearchQuery.length >= 2 && shareSearchResults.length === 0 && !shareSearching && (
                  <p className="text-[10px] opacity-30 text-center py-2">{t('cloud.noUsersFound')}</p>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('cloud.message')}</label>
                  <input value={shareMessage} onChange={e => setShareMessage(e.target.value)} placeholder={t('cloud.messagePlaceholder')} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" maxLength={200} />
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Profile Dialog */}
        <Dialog open={showProfile} onOpenChange={setShowProfile}>
          <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
            <DialogHeader><DialogTitle>{t('cloud.myProfile')}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              {profile && (
                <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                  <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center"><User className="w-7 h-7 text-primary" /></div>
                  <div>
                    <p className="font-bold">{profile.username}</p>
                    <p className="text-xs opacity-50">{profile.email}</p>
                    <div className="flex gap-3 mt-1 text-[10px] opacity-40">
                      <span>{profile.total_books} {t('cloud.books')}</span><span>{profile.total_notes} {t('cloud.notesLabel')}</span><span>{profile.total_bookmarks} {t('cloud.bookmarksLabel')}</span>
                    </div>
                  </div>
                </div>
              )}
              {profile && profile.is_subscriber && (
                <div className="space-y-2 pb-4 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase opacity-50 tracking-widest flex items-center gap-1.5"><Cloud className="w-3 h-3" /> {t('cloud.cloudStorage')}</span>
                    <span className="text-xs opacity-60">{formatBytes(profile.storage_used)} / {formatBytes(profile.upload_limit)}</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${(profile.storage_used / profile.upload_limit) > 0.9 ? 'bg-red-500' : (profile.storage_used / profile.upload_limit) > 0.7 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, (profile.storage_used / profile.upload_limit) * 100)}%` }} />
                  </div>
                  <p className="text-[10px] opacity-30">{t('cloud.storageAvailable', { size: formatBytes(profile.upload_limit - profile.storage_used) })}</p>
                </div>
              )}
              <div className="space-y-2"><label className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('cloud.profileUser')}</label><input value={profileForm.username} onChange={e => updateProfileForm({ username: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" /></div>
              <div className="space-y-2"><label className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('cloud.profileEmail')}</label><input value={profileForm.email} onChange={e => updateProfileForm({ email: e.target.value })} type="email" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" /></div>
              <div className="space-y-2"><label className="text-xs font-bold uppercase opacity-50 tracking-widest">{t('cloud.profileNewPassword')}</label><input value={profileForm.password} onChange={e => updateProfileForm({ password: e.target.value })} type="password" placeholder={t('cloud.profilePasswordPlaceholder')} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" /></div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 border-white/10" onClick={() => setShowProfile(false)}>{t('app.cancel')}</Button>
                <Button className="flex-1 font-bold" onClick={saveProfile}>{t('app.save')}</Button>
              </div>
              <Separator className="opacity-10" />
              <Button variant="ghost" className="w-full text-red-400 hover:bg-red-500/10 text-xs" onClick={() => { setShowProfile(false); setShowDeleteConfirm(true); }}><Trash2 className="w-3 h-3 mr-2" /> {t('cloud.deleteAccount')}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Account Confirmation */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="sm:max-w-[400px] bg-[#16161e] border-white/10 text-white">
            <div className="flex flex-col items-center text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center"><AlertTriangle className="w-8 h-8 text-red-400" /></div>
              <DialogHeader><DialogTitle className="text-lg font-bold text-red-400">{t('cloud.deleteAccountTitle')}</DialogTitle></DialogHeader>
              <p className="text-sm opacity-70">{t('cloud.deleteAccountDesc')}</p>
              <div className="flex gap-2 w-full pt-2">
                <Button variant="outline" className="flex-1 border-white/10" onClick={() => setShowDeleteConfirm(false)}>{t('app.cancel')}</Button>
                <Button className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold" onClick={handleDeleteAccount}>{t('app.delete')}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ScrollArea>
  );
}
