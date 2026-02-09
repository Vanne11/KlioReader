import { Trophy, User, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { RaceLeaderboardResponse } from '@/types';

interface Props {
  data: RaceLeaderboardResponse;
  currentUserId: number;
}

export function RaceLeaderboard({ data, currentUserId }: Props) {
  const { race, leaderboard } = data;

  const getMedal = (index: number) => {
    if (index === 0) return <span className="text-yellow-400 text-lg">🥇</span>;
    if (index === 1) return <span className="text-gray-300 text-lg">🥈</span>;
    if (index === 2) return <span className="text-amber-600 text-lg">🥉</span>;
    return <span className="text-[10px] font-bold opacity-40 w-5 text-center">{index + 1}</span>;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-yellow-400" />
          Carrera de Lectura
        </h4>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${race.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/50'}`}>
          {race.status === 'active' ? 'En curso' : 'Finalizada'}
        </span>
      </div>
      <div className="space-y-1.5">
        {leaderboard.map((entry, i) => (
          <div key={entry.user_id} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${entry.user_id === currentUserId ? 'bg-primary/10 border border-primary/20' : 'bg-white/5'}`}>
            {getMedal(i)}
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <User className="w-3 h-3 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold truncate">{entry.username}{entry.user_id === currentUserId ? ' (tú)' : ''}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Progress value={entry.progress_percent} className="h-1 flex-1 max-w-[100px] bg-white/5" indicatorClassName={entry.finished_at ? 'bg-green-400' : 'bg-primary'} />
                <span className="text-[9px] font-bold text-primary">{entry.progress_percent}%</span>
              </div>
            </div>
            {entry.finished_at && <Clock className="w-3 h-3 text-green-400" />}
          </div>
        ))}
      </div>
    </div>
  );
}
