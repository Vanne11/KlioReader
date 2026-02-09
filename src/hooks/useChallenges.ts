import * as api from '@/lib/api';
import { useSocialStore } from '@/stores/socialStore';
import { useUIStore } from '@/stores/uiStore';
import type { ChallengeType } from '@/types';

export function useChallenges() {
  const { setChallenges, setPendingChallengesCount } = useSocialStore();
  const { showAlert } = useUIStore();

  async function loadChallenges() {
    try {
      const challenges = await api.listChallenges();
      setChallenges(challenges);
    } catch {}
  }

  async function loadPendingCount() {
    try {
      const count = await api.getPendingChallengesCount();
      setPendingChallengesCount(count);
    } catch {}
  }

  async function createChallenge(bookId: number, data: { challenged_id: number; challenge_type: ChallengeType; target_chapters?: number; target_days?: number }) {
    try {
      await api.createChallenge(bookId, data);
      showAlert('success', 'Reto enviado', 'Se ha enviado el reto al usuario');
      loadChallenges();
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo crear el reto');
    }
  }

  async function handleAcceptChallenge(challengeId: number) {
    try {
      await api.acceptChallenge(challengeId);
      setChallenges(prev => prev.map(c => c.id === challengeId ? { ...c, status: 'active' as const } : c));
      setPendingChallengesCount(Math.max(0, useSocialStore.getState().pendingChallengesCount - 1));
      showAlert('success', 'Reto aceptado', 'Has aceptado el reto');
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo aceptar el reto');
    }
  }

  async function handleRejectChallenge(challengeId: number) {
    try {
      await api.rejectChallenge(challengeId);
      setChallenges(prev => prev.filter(c => c.id !== challengeId));
      setPendingChallengesCount(Math.max(0, useSocialStore.getState().pendingChallengesCount - 1));
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo rechazar el reto');
    }
  }

  async function checkChallengeStatus(challengeId: number) {
    try {
      return await api.getChallengeStatus(challengeId);
    } catch {
      return null;
    }
  }

  return { loadChallenges, loadPendingCount, createChallenge, handleAcceptChallenge, handleRejectChallenge, checkChallengeStatus };
}
