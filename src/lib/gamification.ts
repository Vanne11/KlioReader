export interface UserStats {
  xp: number;
  level: number;
  streak: number;
  lastReadDate: string | null;
}

export const INITIAL_STATS: UserStats = {
  xp: 0,
  level: 1,
  streak: 0,
  lastReadDate: null,
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

/** Convert local UserStats to API format (snake_case) */
export function statsToApi(stats: UserStats): { xp: number; level: number; streak: number; last_streak_date: string | null } {
  return {
    xp: stats.xp,
    level: stats.level,
    streak: stats.streak,
    last_streak_date: stats.lastReadDate,
  };
}

/** Convert API UserStats (snake_case) to local format (camelCase) */
export function statsFromApi(apiStats: { xp: number; level: number; streak: number; last_streak_date: string | null }): UserStats {
  return {
    xp: apiStats.xp,
    level: calculateLevel(apiStats.xp),
    streak: apiStats.streak,
    lastReadDate: apiStats.last_streak_date,
  };
}
