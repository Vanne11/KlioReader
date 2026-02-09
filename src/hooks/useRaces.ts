import * as api from '@/lib/api';
import { useSocialStore } from '@/stores/socialStore';
import { useUIStore } from '@/stores/uiStore';

export function useRaces() {
  const { setCurrentLeaderboard } = useSocialStore();
  const { showAlert } = useUIStore();

  async function createRace(bookId: number) {
    try {
      const res = await api.createRace(bookId);
      showAlert('success', 'Carrera creada', 'Se inició una nueva carrera de lectura');
      return res.race_id;
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo crear la carrera');
      return null;
    }
  }

  async function joinRace(raceId: number) {
    try {
      await api.joinRace(raceId);
      showAlert('success', 'Te uniste', 'Te has unido a la carrera');
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo unir a la carrera');
    }
  }

  async function loadLeaderboard(raceId: number) {
    try {
      const data = await api.getRaceLeaderboard(raceId);
      setCurrentLeaderboard(data);
    } catch {}
  }

  async function checkFinish(raceId: number) {
    try {
      const res = await api.finishRace(raceId);
      if (res.is_winner) {
        showAlert('success', '¡Ganaste!', 'Has ganado la carrera de lectura (+100 XP)');
      } else {
        showAlert('success', 'Completado', 'Has terminado la carrera');
      }
      await loadLeaderboard(raceId);
    } catch (err: any) {
      showAlert('error', 'Error', err.message || 'No se pudo finalizar');
    }
  }

  return { createRace, joinRace, loadLeaderboard, checkFinish };
}
