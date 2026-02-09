import { useRef } from 'react';
import * as api from '@/lib/api';
import { useSharesStore } from '@/stores/sharesStore';
import { useUIStore } from '@/stores/uiStore';
import { useCloudBooks } from './useCloudBooks';
import type { CloudBook } from '@/types';

export function useShares() {
  const {
    setPendingSharesCount, setPendingShares, setSharingBook,
    setShareSearchQuery, setShareSearchResults, setShareSearching,
    setShareMessage, setShareSending, sharingBook, shareMessage,
    setSharedProgressMap, setExpandedShareProgress, expandedShareProgress,
    sharedProgressMap,
  } = useSharesStore();
  const { showAlert } = useUIStore();
  const { loadCloudBooks } = useCloudBooks();
  const shareSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadPendingSharesCount() {
    if (!api.isLoggedIn()) return;
    try {
      const count = await api.getPendingSharesCount();
      setPendingSharesCount(count);
    } catch {}
  }

  async function loadPendingShares() {
    if (!api.isLoggedIn()) return;
    try {
      const shares = await api.getPendingShares();
      setPendingShares(shares);
      setPendingSharesCount(shares.length);
    } catch {}
  }

  async function handleAcceptShare(shareId: number) {
    try {
      await api.acceptShare(shareId);
      setPendingShares(prev => prev.filter(s => s.id !== shareId));
      setPendingSharesCount(prev => Math.max(0, prev - 1));
      loadCloudBooks();
      showAlert('success', 'Libro aceptado', 'El libro se agregó a tu biblioteca');
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo aceptar la invitación');
    }
  }

  async function handleRejectShare(shareId: number) {
    try {
      await api.rejectShare(shareId);
      setPendingShares(prev => prev.filter(s => s.id !== shareId));
      setPendingSharesCount(prev => Math.max(0, prev - 1));
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo rechazar la invitación');
    }
  }

  function handleShareSearch(query: string) {
    setShareSearchQuery(query);
    if (shareSearchTimeoutRef.current) clearTimeout(shareSearchTimeoutRef.current);
    if (query.length < 2) { setShareSearchResults([]); return; }
    shareSearchTimeoutRef.current = setTimeout(async () => {
      setShareSearching(true);
      try {
        const results = await api.searchUsers(query);
        setShareSearchResults(results);
      } catch {}
      setShareSearching(false);
    }, 300);
  }

  async function handleSendShare(toUserId: number) {
    if (!sharingBook) return;
    setShareSending(toUserId);
    try {
      await api.shareBook(sharingBook.id, toUserId, shareMessage || undefined);
      showAlert('success', 'Libro compartido', 'Se envió la invitación correctamente');
      setShareSearchResults(prev => prev.filter(u => u.id !== toUserId));
      loadCloudBooks();
    } catch (err: any) {
      showAlert('error', 'Error al compartir', err.message || 'No se pudo enviar la invitación');
    }
    setShareSending(null);
  }

  function openShareDialog(cb: CloudBook) {
    setSharingBook(cb);
    setShareSearchQuery('');
    setShareSearchResults([]);
    setShareMessage('');
  }

  async function loadSharedProgress(bookId: number) {
    try {
      const progress = await api.getSharedProgress(bookId);
      setSharedProgressMap(prev => ({ ...prev, [bookId]: progress }));
    } catch {}
  }

  async function loadAllSharedProgress(books: CloudBook[]) {
    const shared = books.filter(b => b.share_count > 0);
    await Promise.all(shared.map(b => loadSharedProgress(b.id)));
  }

  function toggleShareProgress(bookId: number) {
    if (expandedShareProgress === bookId) {
      setExpandedShareProgress(null);
    } else {
      setExpandedShareProgress(bookId);
      if (!sharedProgressMap[bookId]) loadSharedProgress(bookId);
    }
  }

  return {
    loadPendingSharesCount, loadPendingShares,
    handleAcceptShare, handleRejectShare,
    handleShareSearch, handleSendShare, openShareDialog,
    loadSharedProgress, loadAllSharedProgress, toggleShareProgress,
  };
}
