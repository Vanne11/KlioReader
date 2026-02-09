import {
  BookOpen, Cloud, CloudUpload, CloudDownload, LogIn, Loader2, Server, Trash2, Pencil,
  User, AlertTriangle, Check, X, Share2, Bell, Send, Search, Users, ChevronDown, ChevronUp,
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
import { useAuth } from '@/hooks/useAuth';
import { useCloudBooks } from '@/hooks/useCloudBooks';
import { useShares } from '@/hooks/useShares';
import { coverSrc, formatBytes } from '@/lib/utils';
import * as api from '@/lib/api';

export function CloudView() {
  const { authUser, authMode, setAuthMode, authError, authLoading, showProfile, setShowProfile, profile, profileForm, showDeleteConfirm, setShowDeleteConfirm } = useAuthStore();
  const { updateProfileForm } = useAuthStore();
  const { cloudBooks, cloudLoading, downloadingBookId, editingCloudBook, editCloudForm } = useCloudStore();
  const { setEditingCloudBook, updateEditCloudForm } = useCloudStore();
  const {
    pendingShares, showInvitations, setShowInvitations, sharingBook, setSharingBook,
    shareSearchQuery, shareSearchResults, shareSearching, shareMessage, setShareMessage,
    shareSending, sharedProgressMap, expandedShareProgress,
  } = useSharesStore();

  const { handleAuth, saveProfile, handleDeleteAccount } = useAuth();
  const { loadCloudBooks, downloadBookFromCloud, deleteCloudBook, startEditCloudBook, saveCloudBookEdit } = useCloudBooks();
  const { handleAcceptShare, handleRejectShare, handleShareSearch, handleSendShare, openShareDialog, toggleShareProgress } = useShares();

  return (
    <ScrollArea className="flex-1">
      <div className="max-w-2xl mx-auto p-4 md:p-12 space-y-8">
        <div className="space-y-3">
          <h2 className="text-lg font-bold flex items-center gap-2"><Server className="w-5 h-5 text-primary" /> Servidor API</h2>
          <div className="flex gap-2">
            <input type="url" defaultValue={api.getApiUrl()} id="api-url-input" placeholder="http://tu-servidor.com" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:border-primary outline-none" />
            <Button variant="outline" size="sm" onClick={() => { const input = document.getElementById('api-url-input') as HTMLInputElement; api.setApiUrl(input.value); }}>Guardar</Button>
          </div>
        </div>
        <Separator className="opacity-10" />

        {!authUser ? (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <Cloud className="w-12 h-12 text-blue-400 mx-auto" />
              <h2 className="text-2xl font-bold">KlioReader Cloud</h2>
              <p className="text-sm opacity-50">Sincroniza tus libros y progreso entre dispositivos</p>
            </div>
            <div className="flex bg-white/5 rounded-lg p-1">
              <Button variant={authMode === 'login' ? 'secondary' : 'ghost'} className="flex-1 text-sm" onClick={() => setAuthMode('login')}>Iniciar Sesión</Button>
              <Button variant={authMode === 'register' ? 'secondary' : 'ghost'} className="flex-1 text-sm" onClick={() => setAuthMode('register')}>Registrarse</Button>
            </div>
            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'register' && <input name="username" placeholder="Nombre de usuario" required minLength={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />}
              <input name={authMode === 'login' ? 'login' : 'email'} type={authMode === 'register' ? 'email' : 'text'} placeholder={authMode === 'register' ? 'Email' : 'Email o usuario'} required className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
              <input name="password" type="password" placeholder="Contraseña" required minLength={6} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" />
              {authError && <p className="text-red-400 text-xs">{authError}</p>}
              <Button type="submit" className="w-full font-bold" disabled={authLoading}>
                {authLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
                {authMode === 'login' ? 'Entrar' : 'Crear Cuenta'}
              </Button>
            </form>
          </div>
        ) : (
          <div className="space-y-8">
            {pendingShares.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Bell className="w-5 h-5 text-amber-400" /> Invitaciones ({pendingShares.length})</h2>
                  <Button variant="ghost" size="sm" onClick={() => setShowInvitations(prev => !prev)} className="text-xs opacity-50">
                    {showInvitations ? <><ChevronUp className="w-3 h-3 mr-1" /> Ocultar</> : <><ChevronDown className="w-3 h-3 mr-1" /> Mostrar</>}
                  </Button>
                </div>
                {showInvitations && pendingShares.map(share => (
                  <Card key={share.id} className="bg-amber-500/5 border-amber-500/20 p-4 space-y-3">
                    <div className="flex gap-4">
                      <div className="w-12 aspect-[2/3] rounded bg-[#0f0f14] overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                        {share.snap_cover_base64 ? <img src={coverSrc(share.snap_cover_base64)} className="w-full h-full object-contain" alt="" /> : <BookOpen className="w-4 h-4 opacity-10" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold truncate">{share.snap_title}</h3>
                        <p className="text-[10px] opacity-50 italic">{share.snap_author || 'Sin autor'}</p>
                        {share.snap_description && <p className="text-[10px] opacity-40 mt-1 line-clamp-2">{share.snap_description}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <User className="w-3 h-3 text-primary" />
                          <span className="text-[10px] font-bold">{share.from_username}</span>
                          <span className="text-[10px] opacity-30">te compartió este libro</span>
                        </div>
                        {share.message && <p className="text-[10px] opacity-60 mt-1 italic bg-white/5 rounded px-2 py-1">"{share.message}"</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold" onClick={() => handleAcceptShare(share.id)}><Check className="w-3 h-3 mr-1" /> Aceptar</Button>
                      <Button size="sm" variant="outline" className="flex-1 border-white/10" onClick={() => handleRejectShare(share.id)}><X className="w-3 h-3 mr-1" /> Rechazar</Button>
                    </div>
                  </Card>
                ))}
                <Separator className="opacity-10" />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2"><Cloud className="w-5 h-5 text-blue-400" /> Mis Libros en la Nube</h2>
                <p className="text-xs opacity-50 mt-1">{cloudBooks.length} libro(s) sincronizado(s)</p>
              </div>
              <Button variant="outline" size="sm" onClick={loadCloudBooks} disabled={cloudLoading}>
                {cloudLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />} Actualizar
              </Button>
            </div>

            {cloudBooks.length === 0 ? (
              <div className="text-center py-16 opacity-40">
                <CloudUpload className="w-16 h-16 mx-auto mb-4" />
                <p className="text-sm">No tienes libros en la nube</p>
                <p className="text-xs mt-1">Sube libros desde tu biblioteca local con el botón de nube</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cloudBooks.map(cb => (
                  <div key={cb.id}>
                    <Card className="flex bg-white/5 border-white/5 p-4 gap-4 items-center">
                      <div className="w-12 aspect-[2/3] rounded bg-[#0f0f14] overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                        {cb.cover_base64 ? <img src={coverSrc(cb.cover_base64)} className="w-full h-full object-contain" alt="" /> : <BookOpen className="w-4 h-4 opacity-10" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold truncate">{cb.title}</h3>
                        <p className="text-[10px] opacity-50 italic">{cb.author || 'Sin autor'}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <Progress value={cb.progress_percent} className="h-1 flex-1 max-w-[120px] bg-white/5" indicatorClassName="bg-blue-400" />
                          <span className="text-[9px] font-bold text-blue-400">{cb.progress_percent}%</span>
                          <Badge variant="outline" className="text-[8px] h-4 opacity-50">{cb.file_type}</Badge>
                          {cb.is_duplicate && <Badge variant="outline" className="text-[8px] h-4 text-amber-400 border-amber-400/40">Duplicado</Badge>}
                          {cb.share_count > 0 && <Badge variant="outline" className="text-[8px] h-4 text-cyan-400 border-cyan-400/40"><Users className="w-2.5 h-2.5 mr-0.5" /> Compartido</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-0.5 md:gap-1 shrink-0">
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 md:h-8 md:w-8 hover:bg-primary/20 hover:text-primary" onClick={() => startEditCloudBook(cb)}><Pencil className="w-3.5 h-3.5 md:w-4 md:h-4" /></Button></TooltipTrigger><TooltipContent>Editar</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 md:h-8 md:w-8 hover:bg-cyan-600/20 hover:text-cyan-400" onClick={() => openShareDialog(cb)}><Share2 className="w-3.5 h-3.5 md:w-4 md:h-4" /></Button></TooltipTrigger><TooltipContent>Compartir</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 md:h-8 md:w-8 hover:bg-green-600/20 hover:text-green-400" disabled={downloadingBookId === cb.id} onClick={() => downloadBookFromCloud(cb)}>
                            {downloadingBookId === cb.id ? <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                          </Button>
                        </TooltipTrigger><TooltipContent>Descargar a local</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 md:h-8 md:w-8 hover:bg-red-600/20 hover:text-red-400" onClick={() => deleteCloudBook(cb.id)}><Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" /></Button></TooltipTrigger><TooltipContent>Eliminar de la nube</TooltipContent></Tooltip>
                      </div>
                    </Card>
                    {cb.share_count > 0 && (
                      <div className="ml-16 mt-1">
                        <button className="text-[10px] text-cyan-400/70 hover:text-cyan-400 flex items-center gap-1" onClick={() => toggleShareProgress(cb.id)}>
                          <Users className="w-3 h-3" />
                          {expandedShareProgress === cb.id ? 'Ocultar progreso' : 'Ver progreso compartido'}
                          {expandedShareProgress === cb.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        {expandedShareProgress === cb.id && sharedProgressMap[cb.id] && (
                          <div className="mt-2 space-y-2">
                            {sharedProgressMap[cb.id].length === 0 ? (
                              <p className="text-[10px] opacity-30">Sin datos de progreso compartido</p>
                            ) : sharedProgressMap[cb.id].map(sp => (
                              <div key={sp.user_id} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
                                <div className="w-6 h-6 rounded-full bg-cyan-400/20 flex items-center justify-center shrink-0"><User className="w-3 h-3 text-cyan-400" /></div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-bold truncate">{sp.username}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Progress value={sp.progress_percent} className="h-1 flex-1 max-w-[80px] bg-white/5" indicatorClassName="bg-cyan-400" />
                                    <span className="text-[9px] font-bold text-cyan-400">{sp.progress_percent}%</span>
                                  </div>
                                </div>
                                {sp.last_read && <span className="text-[9px] opacity-30 shrink-0">{new Date(sp.last_read).toLocaleDateString()}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Edit Cloud Book Dialog */}
        <Dialog open={!!editingCloudBook} onOpenChange={(open) => { if (!open) setEditingCloudBook(null); }}>
          <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
            <DialogHeader><DialogTitle>Editar Libro</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><label className="text-xs font-bold uppercase opacity-50 tracking-widest">Título</label><input value={editCloudForm.title} onChange={e => updateEditCloudForm({ title: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" /></div>
              <div className="space-y-2"><label className="text-xs font-bold uppercase opacity-50 tracking-widest">Autor</label><input value={editCloudForm.author} onChange={e => updateEditCloudForm({ author: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" /></div>
              <div className="space-y-2"><label className="text-xs font-bold uppercase opacity-50 tracking-widest">Descripción</label><textarea value={editCloudForm.description} onChange={e => updateEditCloudForm({ description: e.target.value })} rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none resize-y font-sans" placeholder="Sinopsis o descripción del libro..." /></div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 border-white/10" onClick={() => setEditingCloudBook(null)}>Cancelar</Button>
                <Button className="flex-1 font-bold" onClick={saveCloudBookEdit}>Guardar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Share Book Dialog */}
        <Dialog open={!!sharingBook} onOpenChange={(open) => { if (!open) setSharingBook(null); }}>
          <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Share2 className="w-5 h-5 text-cyan-400" /> Compartir Libro</DialogTitle></DialogHeader>
            {sharingBook && (
              <div className="space-y-4 py-4">
                <div className="flex gap-3 items-center bg-white/5 rounded-lg p-3">
                  <div className="w-10 aspect-[2/3] rounded bg-[#0f0f14] overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                    {sharingBook.cover_base64 ? <img src={coverSrc(sharingBook.cover_base64)} className="w-full h-full object-contain" alt="" /> : <BookOpen className="w-3 h-3 opacity-10" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{sharingBook.title}</p>
                    <p className="text-[10px] opacity-50 italic">{sharingBook.author || 'Sin autor'}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Buscar usuario</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
                    <input value={shareSearchQuery} onChange={e => handleShareSearch(e.target.value)} placeholder="Escribe un nombre de usuario..." className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-3 text-sm focus:border-primary outline-none" />
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
                          {shareSending === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3 mr-1" /> Enviar</>}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {shareSearchQuery.length >= 2 && shareSearchResults.length === 0 && !shareSearching && (
                  <p className="text-[10px] opacity-30 text-center py-2">No se encontraron usuarios</p>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase opacity-50 tracking-widest">Mensaje (opcional)</label>
                  <input value={shareMessage} onChange={e => setShareMessage(e.target.value)} placeholder="Ej: Te recomiendo este libro..." className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" maxLength={200} />
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Profile Dialog */}
        <Dialog open={showProfile} onOpenChange={setShowProfile}>
          <DialogContent className="sm:max-w-[425px] bg-[#16161e] border-white/10 text-white">
            <DialogHeader><DialogTitle>Mi Perfil</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              {profile && (
                <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                  <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center"><User className="w-7 h-7 text-primary" /></div>
                  <div>
                    <p className="font-bold">{profile.username}</p>
                    <p className="text-xs opacity-50">{profile.email}</p>
                    <div className="flex gap-3 mt-1 text-[10px] opacity-40">
                      <span>{profile.total_books} libros</span><span>{profile.total_notes} notas</span><span>{profile.total_bookmarks} marcadores</span>
                    </div>
                  </div>
                </div>
              )}
              {profile && profile.is_subscriber && (
                <div className="space-y-2 pb-4 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase opacity-50 tracking-widest flex items-center gap-1.5"><Cloud className="w-3 h-3" /> Almacenamiento Cloud</span>
                    <span className="text-xs opacity-60">{formatBytes(profile.storage_used)} / {formatBytes(profile.upload_limit)}</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${(profile.storage_used / profile.upload_limit) > 0.9 ? 'bg-red-500' : (profile.storage_used / profile.upload_limit) > 0.7 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, (profile.storage_used / profile.upload_limit) * 100)}%` }} />
                  </div>
                  <p className="text-[10px] opacity-30">{formatBytes(profile.upload_limit - profile.storage_used)} disponibles</p>
                </div>
              )}
              <div className="space-y-2"><label className="text-xs font-bold uppercase opacity-50 tracking-widest">Usuario</label><input value={profileForm.username} onChange={e => updateProfileForm({ username: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" /></div>
              <div className="space-y-2"><label className="text-xs font-bold uppercase opacity-50 tracking-widest">Email</label><input value={profileForm.email} onChange={e => updateProfileForm({ email: e.target.value })} type="email" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" /></div>
              <div className="space-y-2"><label className="text-xs font-bold uppercase opacity-50 tracking-widest">Nueva contraseña (opcional)</label><input value={profileForm.password} onChange={e => updateProfileForm({ password: e.target.value })} type="password" placeholder="Dejar vacío para no cambiar" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-primary outline-none" /></div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 border-white/10" onClick={() => setShowProfile(false)}>Cancelar</Button>
                <Button className="flex-1 font-bold" onClick={saveProfile}>Guardar</Button>
              </div>
              <Separator className="opacity-10" />
              <Button variant="ghost" className="w-full text-red-400 hover:bg-red-500/10 text-xs" onClick={() => { setShowProfile(false); setShowDeleteConfirm(true); }}><Trash2 className="w-3 h-3 mr-2" /> Eliminar mi cuenta permanentemente</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Account Confirmation */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="sm:max-w-[400px] bg-[#16161e] border-white/10 text-white">
            <div className="flex flex-col items-center text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center"><AlertTriangle className="w-8 h-8 text-red-400" /></div>
              <DialogHeader><DialogTitle className="text-lg font-bold text-red-400">Eliminar cuenta</DialogTitle></DialogHeader>
              <p className="text-sm opacity-70">Esta acción es irreversible. Se eliminarán permanentemente todos tus datos: libros, notas, marcadores y progreso de lectura.</p>
              <div className="flex gap-2 w-full pt-2">
                <Button variant="outline" className="flex-1 border-white/10" onClick={() => setShowDeleteConfirm(false)}>Cancelar</Button>
                <Button className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold" onClick={handleDeleteAccount}>Eliminar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ScrollArea>
  );
}
