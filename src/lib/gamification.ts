export interface UserStats {
  xp: number;
  level: number;
  streak: number;
  lastReadDate: string | null;
}

// ── Badge System ──

export type BadgeRarity = 'bronze' | 'silver' | 'gold' | 'diamond';
export type BadgeCategory = 'reading' | 'consistency' | 'collection' | 'level' | 'explorer' | 'elite';

export interface BookForBadge {
  progress: number;
}

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  condition: (stats: UserStats, books: BookForBadge[]) => boolean;
}

export interface BadgeWithStatus extends BadgeDefinition {
  unlocked: boolean;
}

export const RARITY_CONFIG: Record<BadgeRarity, { label: string; text: string; bg: string; border: string; glow: string }> = {
  bronze:  { label: 'Bronce',   text: 'text-amber-700',  bg: 'bg-amber-700/20',  border: 'border-amber-700/50',  glow: 'shadow-amber-700/20' },
  silver:  { label: 'Plata',    text: 'text-gray-300',   bg: 'bg-gray-300/20',   border: 'border-gray-300/50',   glow: 'shadow-gray-300/30' },
  gold:    { label: 'Oro',      text: 'text-yellow-400', bg: 'bg-yellow-400/20', border: 'border-yellow-400/50', glow: 'shadow-yellow-400/40' },
  diamond: { label: 'Diamante', text: 'text-cyan-300',   bg: 'bg-cyan-300/20',   border: 'border-cyan-300/50',   glow: 'shadow-cyan-300/50' },
};

export const CATEGORY_CONFIG: Record<BadgeCategory, { label: string; emoji: string }> = {
  reading:     { label: 'Lectura',     emoji: '📖' },
  consistency: { label: 'Constancia',  emoji: '🔥' },
  collection:  { label: 'Colección',   emoji: '📦' },
  level:       { label: 'Nivel y XP',  emoji: '⭐' },
  explorer:    { label: 'Explorador',  emoji: '🧭' },
  elite:       { label: 'Élite',       emoji: '🏆' },
};

export const BADGES: BadgeDefinition[] = [
  // ── LECTURA (10) ──
  { id: 'first_page',    name: 'Primera Página',    description: 'Avanza al menos un capítulo en cualquier libro',         category: 'reading', rarity: 'bronze',  condition: (s) => s.xp >= 10 },
  { id: 'half_way',      name: 'A Medio Camino',    description: 'Alcanza el 50% de progreso en algún libro',              category: 'reading', rarity: 'bronze',  condition: (_, b) => b.some(x => x.progress >= 50) },
  { id: 'bookworm',      name: 'Ratón de Biblioteca', description: 'Completa un libro al 100%',                            category: 'reading', rarity: 'bronze',  condition: (_, b) => b.filter(x => x.progress >= 100).length >= 1 },
  { id: 'avid_reader',   name: 'Lector Ávido',      description: 'Completa 3 libros',                                     category: 'reading', rarity: 'silver',  condition: (_, b) => b.filter(x => x.progress >= 100).length >= 3 },
  { id: 'scholar',       name: 'Erudito',           description: 'Completa 5 libros',                                      category: 'reading', rarity: 'silver',  condition: (_, b) => b.filter(x => x.progress >= 100).length >= 5 },
  { id: 'bibliophile',   name: 'Bibliófilo',        description: 'Completa 10 libros',                                     category: 'reading', rarity: 'gold',    condition: (_, b) => b.filter(x => x.progress >= 100).length >= 10 },
  { id: 'sage',          name: 'Sabio',             description: 'Completa 15 libros',                                     category: 'reading', rarity: 'gold',    condition: (_, b) => b.filter(x => x.progress >= 100).length >= 15 },
  { id: 'grand_master',  name: 'Gran Maestro',      description: 'Completa 25 libros',                                     category: 'reading', rarity: 'diamond', condition: (_, b) => b.filter(x => x.progress >= 100).length >= 25 },
  { id: 'literary_god',  name: 'Deidad Literaria',  description: 'Completa 50 libros',                                     category: 'reading', rarity: 'diamond', condition: (_, b) => b.filter(x => x.progress >= 100).length >= 50 },
  { id: 'perfectionist', name: 'Perfeccionista',    description: 'Completa 5 libros al 100%',                              category: 'reading', rarity: 'gold',    condition: (_, b) => b.filter(x => x.progress >= 100).length >= 5 },

  // ── CONSTANCIA (8) ──
  { id: 'first_spark',   name: 'Primera Chispa',    description: 'Mantén una racha de 2 días',                             category: 'consistency', rarity: 'bronze',  condition: (s) => s.streak >= 2 },
  { id: 'warm_up',       name: 'Calentando',        description: 'Mantén una racha de 3 días',                             category: 'consistency', rarity: 'bronze',  condition: (s) => s.streak >= 3 },
  { id: 'on_fire',       name: 'En Llamas',         description: 'Mantén una racha de 7 días',                             category: 'consistency', rarity: 'silver',  condition: (s) => s.streak >= 7 },
  { id: 'burning',       name: 'Ardiente',          description: 'Mantén una racha de 14 días',                            category: 'consistency', rarity: 'silver',  condition: (s) => s.streak >= 14 },
  { id: 'inferno',       name: 'Infierno',          description: 'Mantén una racha de 21 días',                            category: 'consistency', rarity: 'gold',    condition: (s) => s.streak >= 21 },
  { id: 'unbreakable',   name: 'Inquebrantable',    description: 'Mantén una racha de 30 días',                            category: 'consistency', rarity: 'gold',    condition: (s) => s.streak >= 30 },
  { id: 'eternal_flame', name: 'Llama Eterna',      description: 'Mantén una racha de 60 días',                            category: 'consistency', rarity: 'diamond', condition: (s) => s.streak >= 60 },
  { id: 'phoenix',       name: 'Fénix',             description: 'Mantén una racha de 100 días',                           category: 'consistency', rarity: 'diamond', condition: (s) => s.streak >= 100 },

  // ── COLECCIÓN (9) ──
  { id: 'first_book',       name: 'Mi Primer Libro',     description: 'Añade tu primer libro a la biblioteca',             category: 'collection', rarity: 'bronze',  condition: (_, b) => b.length >= 1 },
  { id: 'small_shelf',      name: 'Pequeño Estante',     description: 'Ten 5 libros en tu biblioteca',                     category: 'collection', rarity: 'bronze',  condition: (_, b) => b.length >= 5 },
  { id: 'bookshelf',        name: 'Estantería',          description: 'Ten 10 libros en tu biblioteca',                    category: 'collection', rarity: 'silver',  condition: (_, b) => b.length >= 10 },
  { id: 'personal_library', name: 'Biblioteca Personal', description: 'Ten 20 libros en tu biblioteca',                    category: 'collection', rarity: 'silver',  condition: (_, b) => b.length >= 20 },
  { id: 'book_hoarder',     name: 'Acumulador',          description: 'Ten 35 libros en tu biblioteca',                    category: 'collection', rarity: 'gold',    condition: (_, b) => b.length >= 35 },
  { id: 'grand_library',    name: 'Gran Biblioteca',     description: 'Ten 50 libros en tu biblioteca',                    category: 'collection', rarity: 'gold',    condition: (_, b) => b.length >= 50 },
  { id: 'alexandria',       name: 'Alejandría',          description: 'Ten 100 libros en tu biblioteca',                   category: 'collection', rarity: 'diamond', condition: (_, b) => b.length >= 100 },
  { id: 'multitasker',      name: 'Multitarea',          description: 'Ten 3 libros en progreso simultáneo',               category: 'collection', rarity: 'silver',  condition: (_, b) => b.filter(x => x.progress > 0 && x.progress < 100).length >= 3 },
  { id: 'juggler',          name: 'Malabarista',         description: 'Ten 5 libros en progreso simultáneo',               category: 'collection', rarity: 'gold',    condition: (_, b) => b.filter(x => x.progress > 0 && x.progress < 100).length >= 5 },

  // ── NIVEL Y XP (12) ──
  { id: 'rookie',     name: 'Novato',              description: 'Alcanza el nivel 3',                                     category: 'level', rarity: 'bronze',  condition: (s) => s.level >= 3 },
  { id: 'apprentice', name: 'Aprendiz',            description: 'Alcanza el nivel 5',                                     category: 'level', rarity: 'bronze',  condition: (s) => s.level >= 5 },
  { id: 'adept',      name: 'Adepto',              description: 'Alcanza el nivel 10',                                    category: 'level', rarity: 'silver',  condition: (s) => s.level >= 10 },
  { id: 'expert',     name: 'Experto',             description: 'Alcanza el nivel 15',                                    category: 'level', rarity: 'silver',  condition: (s) => s.level >= 15 },
  { id: 'master',     name: 'Maestro',             description: 'Alcanza el nivel 20',                                    category: 'level', rarity: 'gold',    condition: (s) => s.level >= 20 },
  { id: 'legend',     name: 'Leyenda',             description: 'Alcanza el nivel 30',                                    category: 'level', rarity: 'gold',    condition: (s) => s.level >= 30 },
  { id: 'mythic',     name: 'Mítico',              description: 'Alcanza el nivel 50',                                    category: 'level', rarity: 'diamond', condition: (s) => s.level >= 50 },
  { id: 'xp_500',     name: 'Quinientos',          description: 'Acumula 500 puntos de experiencia',                      category: 'level', rarity: 'bronze',  condition: (s) => s.xp >= 500 },
  { id: 'xp_1000',    name: 'Mil Experiencias',    description: 'Acumula 1000 puntos de experiencia',                     category: 'level', rarity: 'silver',  condition: (s) => s.xp >= 1000 },
  { id: 'xp_2500',    name: 'Tesoro Acumulado',    description: 'Acumula 2500 puntos de experiencia',                     category: 'level', rarity: 'gold',    condition: (s) => s.xp >= 2500 },
  { id: 'xp_5000',    name: 'Trascendencia',       description: 'Acumula 5000 puntos de experiencia',                     category: 'level', rarity: 'gold',    condition: (s) => s.xp >= 5000 },
  { id: 'xp_10000',   name: 'Ascensión',           description: 'Acumula 10000 puntos de experiencia',                    category: 'level', rarity: 'diamond', condition: (s) => s.xp >= 10000 },

  // ── EXPLORADOR (7) ──
  { id: 'curious',    name: 'Curioso',             description: 'Empieza a leer 3 libros',                                category: 'explorer', rarity: 'bronze',  condition: (_, b) => b.filter(x => x.progress > 0).length >= 3 },
  { id: 'explorer',   name: 'Explorador',          description: 'Empieza a leer 7 libros',                                category: 'explorer', rarity: 'silver',  condition: (_, b) => b.filter(x => x.progress > 0).length >= 7 },
  { id: 'adventurer', name: 'Aventurero',          description: 'Empieza a leer 15 libros',                               category: 'explorer', rarity: 'gold',    condition: (_, b) => b.filter(x => x.progress > 0).length >= 15 },
  { id: 'pioneer',    name: 'Pionero',             description: 'Empieza a leer 30 libros',                               category: 'explorer', rarity: 'diamond', condition: (_, b) => b.filter(x => x.progress > 0).length >= 30 },
  { id: 'comeback',   name: 'Regreso Triunfal',    description: 'Vuelve a leer después de un tiempo sin actividad',       category: 'explorer', rarity: 'silver',  condition: (s) => s.streak >= 3 },
  { id: 'night_owl',  name: 'Búho Nocturno',       description: 'Lee después de las 11 de la noche',                      category: 'explorer', rarity: 'silver',  condition: () => new Date().getHours() >= 23 },
  { id: 'early_bird', name: 'Madrugador',          description: 'Lee antes de las 7 de la mañana',                        category: 'explorer', rarity: 'silver',  condition: () => new Date().getHours() < 7 },

  // ── ÉLITE (4) ──
  { id: 'completionist',  name: 'Completista',     description: 'Completa todos los libros de tu biblioteca (mínimo 5)',   category: 'elite', rarity: 'gold',    condition: (_, b) => b.length >= 5 && b.every(x => x.progress >= 100) },
  { id: 'century',        name: 'Centenario',      description: 'Acumula 100,000 puntos de experiencia',                   category: 'elite', rarity: 'diamond', condition: (s) => s.xp >= 100000 },
  { id: 'diamond_reader', name: 'Lector Diamante', description: 'Nivel 50, 25 libros completados y racha de 30 días',     category: 'elite', rarity: 'diamond', condition: (s, b) => s.level >= 50 && b.filter(x => x.progress >= 100).length >= 25 && s.streak >= 30 },
  { id: 'klio_master',    name: 'Maestro de Klio', description: 'Desbloquea al menos 40 insignias',                       category: 'elite', rarity: 'diamond', condition: (s, b) => {
    const otherBadges = BADGES.filter(bd => bd.id !== 'klio_master');
    return otherBadges.filter(bd => bd.condition(s, b)).length >= 40;
  }},
];

const RARITY_ORDER: BadgeRarity[] = ['diamond', 'gold', 'silver', 'bronze'];

/** Insignias desbloqueadas, ordenadas por rareza (diamante primero) */
export function getUnlockedBadges(stats: UserStats, books: BookForBadge[]): BadgeDefinition[] {
  return BADGES
    .filter(b => b.condition(stats, books))
    .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
}

/** Todas las insignias con flag de desbloqueada */
export function getAllBadgesWithStatus(stats: UserStats, books: BookForBadge[]): BadgeWithStatus[] {
  return BADGES.map(b => ({ ...b, unlocked: b.condition(stats, books) }));
}

/** Insignias agrupadas por categoría */
export function getBadgesByCategory(stats: UserStats, books: BookForBadge[]): Record<BadgeCategory, BadgeWithStatus[]> {
  const all = getAllBadgesWithStatus(stats, books);
  const result = {} as Record<BadgeCategory, BadgeWithStatus[]>;
  for (const cat of Object.keys(CATEGORY_CONFIG) as BadgeCategory[]) {
    result[cat] = all.filter(b => b.category === cat);
  }
  return result;
}

/** Título del usuario: insignia seleccionada manualmente o la de mayor rareza */
export function getUserTitle(stats: UserStats, books: BookForBadge[], selectedTitleId?: string | null): BadgeDefinition | null {
  const unlocked = getUnlockedBadges(stats, books);
  if (unlocked.length === 0) return null;
  if (selectedTitleId) {
    const selected = unlocked.find(b => b.id === selectedTitleId);
    if (selected) return selected;
  }
  return unlocked[0]; // ya ordenadas por rareza, la primera es la de mayor rareza
}

/** Path al PNG de la insignia */
export function getBadgeImageUrl(id: string): string {
  return `/badges/${id}.png`;
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

  let newStreak = Number(stats.streak) || 0;
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
  const newXP = Number(stats.xp) + Number(amount);
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
  // PDO/SQLite may return numbers as strings — force coercion
  const xp = Number(apiStats.xp) || 0;
  const streak = Number(apiStats.streak) || 0;
  return {
    xp,
    level: calculateLevel(xp),
    streak,
    lastReadDate: apiStats.last_streak_date,
  };
}
