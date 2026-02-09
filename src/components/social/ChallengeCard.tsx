import { Swords, Check, X, Clock, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ReadingChallenge } from '@/types';

interface Props {
  challenge: ReadingChallenge;
  currentUserId: number;
  onAccept?: (id: number) => void;
  onReject?: (id: number) => void;
  onViewStatus?: (id: number) => void;
}

export function ChallengeCard({ challenge, currentUserId, onAccept, onReject, onViewStatus }: Props) {
  const isChallenger = challenge.challenger_id === currentUserId;
  const opponentName = isChallenger ? challenge.challenged_username : challenge.challenger_username;
  const typeLabel = challenge.challenge_type === 'chapters_in_days'
    ? `${challenge.target_chapters} capítulos en ${challenge.target_days} días`
    : `Terminar en ${challenge.target_days} días`;

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-500/20 text-amber-400',
    active: 'bg-green-500/20 text-green-400',
    completed: 'bg-blue-500/20 text-blue-400',
    expired: 'bg-red-500/20 text-red-400',
    rejected: 'bg-white/10 text-white/30',
  };

  const statusLabels: Record<string, string> = {
    pending: 'Pendiente',
    active: 'Activo',
    completed: 'Completado',
    expired: 'Expirado',
    rejected: 'Rechazado',
  };

  const daysLeft = challenge.deadline
    ? Math.max(0, Math.ceil((new Date(challenge.deadline).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <div className="bg-white/5 rounded-lg p-3 space-y-2 border border-white/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold">vs {opponentName || 'Usuario'}</span>
        </div>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusColors[challenge.status] || 'bg-white/10 text-white/50'}`}>
          {statusLabels[challenge.status] || challenge.status}
        </span>
      </div>
      <p className="text-[10px] opacity-50">{typeLabel}</p>
      {challenge.status === 'active' && daysLeft !== null && (
        <div className="flex items-center gap-1 text-[10px] opacity-40">
          <Clock className="w-3 h-3" /> {daysLeft} día(s) restante(s)
        </div>
      )}
      {challenge.winner_user_id && (
        <div className="flex items-center gap-1 text-[10px] text-yellow-400">
          <Trophy className="w-3 h-3" /> Ganador: {challenge.winner_user_id === currentUserId ? '¡Tú!' : opponentName}
        </div>
      )}
      {challenge.status === 'pending' && !isChallenger && onAccept && onReject && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => onAccept(challenge.id)}><Check className="w-3 h-3 mr-1" /> Aceptar</Button>
          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs border-white/10" onClick={() => onReject(challenge.id)}><X className="w-3 h-3 mr-1" /> Rechazar</Button>
        </div>
      )}
      {challenge.status === 'active' && onViewStatus && (
        <Button size="sm" variant="outline" className="w-full h-7 text-xs border-white/10" onClick={() => onViewStatus(challenge.id)}>Ver progreso</Button>
      )}
    </div>
  );
}
