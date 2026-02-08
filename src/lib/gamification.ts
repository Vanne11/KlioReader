export interface UserStats {
  xp: number;
  level: number;
  streak: number;
  lastReadDate: string | null;
  totalBooksRead: number;
  totalMinutesRead: number;
}

export const INITIAL_STATS: UserStats = {
  xp: 0,
  level: 1,
  streak: 0,
  lastReadDate: null,
  totalBooksRead: 0,
  totalMinutesRead: 0,
};

export function calculateLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export function xpForNextLevel(level: number): number {
  return Math.pow(level, 2) * 100;
}

export function updateStreak(stats: UserStats): UserStats {
  const today = new Date().toISOString().split('T')[0];
  const lastDate = stats.lastReadDate;

  if (lastDate === today) return stats;

  let newStreak = stats.streak;
  if (lastDate) {
    const last = new Date(lastDate);
    const current = new Date(today);
    const diffTime = Math.abs(current.getTime() - last.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      newStreak += 1;
    } else if (diffDays > 1) {
      newStreak = 1;
    }
  } else {
    newStreak = 1;
  }

  return { ...stats, streak: newStreak, lastReadDate: today };
}

export function addXP(stats: UserStats, amount: number): UserStats {
  const newXP = stats.xp + amount;
  const newLevel = calculateLevel(newXP);
  return { ...stats, xp: newXP, level: newLevel };
}
